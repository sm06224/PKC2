/**
 * SqliteContainerStore(P2)── ContainerStore の sqlite 実装。
 *
 * 設計正本: `docs/development/storage-wasm-sqlite-design-2026-07.md`。
 * ハイブリッド配置(§2): **構造データ(entries / revisions / relations /
 * meta / workspace / default pointer)は worker 常駐 sqlite**、**asset の
 * bytes は従来の Blob/asset storage(inner store に委譲)**。
 * これで「JSON をそのままコンテナにする」内部表現(user が再三反対)が
 * 新規保存分から消える ── JSON は交換形式(export)にだけ残る。
 *
 * 書込は **O(変更行)**: store が「最後にこの store と同期した container 参照」
 * (baseline)を保持し、save() は参照 diff → RowOp 列だけを worker へ送る。
 * baseline は load 時にも立つ(DB の行 = load が返した model そのものなので、
 * boot 後の最初の編集からいきなり行 diff になる ── 初回全量 clone なし)。
 *
 * ⚠ 互換(Invariant 5「互換は双方向」):
 *   - 移行(IDB → sqlite)は**非破壊**。旧 IDB record は残す(旧ビルド fallback)
 *   - ただし移行後の編集は sqlite にだけ書かれる = flag を戻すと IDB 側は
 *     **移行時点の古いデータ**に見える(消えてはいない)。P5 の既定化ゲートで
 *     バックアップ ZIP + 明示 UI にする(P2 は opt-in flag のみ)
 */
import type { Container } from '../../../../core/model/container';
import type { AssetMetaIndex } from '../../../../features/asset/asset-meta';
import { base64ToBlob, type ContainerStore, type ContainerSummary, type Workspace } from '../../idb-store';
import type { Revision } from '../../../../core/model/container';
import {
  containerToRows,
  diffContainerToOps,
  rowsToContainer,
  rowToRevision,
  type ContainerRows,
  type RevisionRow,
} from './sqlite-schema';
import type { AssetMetaRow, SqliteInitResult, SqliteRpc } from './sqlite-rpc';

const ACTIVE_WORKSPACE_KEY = '__active_workspace__';
const WORKSPACE_PREFIX = 'workspace:';

export interface SqliteBackendResult {
  store: ContainerStore;
  /** IDB → sqlite の一括移行がこの boot で走ったか。 */
  migrated: boolean;
  /** worker を terminate する(テスト / 明示破棄用)。 */
  dispose: () => void;
}

/**
 * inner(既存 IDB store)を包む sqlite 実装を作る。rpc は init 済みで
 * persistent=true が確認済みであること(呼び元 `createSqliteBackend` が保証)。
 */
export function createSqliteContainerStore(inner: ContainerStore, rpc: SqliteRpc): ContainerStore {
  /** cid → 最後に sqlite と同期した container 参照(参照 diff の基準)。 */
  const baselines = new Map<string, Container>();
  /** cid → この session で persist を確認した asset key(additive 書込の skip 用)。 */
  const persistedAssets = new Map<string, Set<string>>();
  /** 保存の直列化 chain(baseline 更新を原子的に保つ)。 */
  let saveChain: Promise<void> = Promise.resolve();

  function persistedSetFor(cid: string): Set<string> {
    let s = persistedAssets.get(cid);
    if (!s) {
      s = new Set();
      persistedAssets.set(cid, s);
    }
    return s;
  }

  /**
   * assets は additive-only(idb-store と同じ B5 不変条件): container.assets に
   * ある key を書くだけで、**絶対に削除しない**。既に書いた key は skip。
   *
   * P3(#1042 吸収): bytes は **Blob record** として書く(base64 → Blob 変換は
   * 書込時の 1 回だけ。以後の読みは `loadAssetBlob` 経由で heap ±0)。
   * 読み側互換は inner の両読みが保証(loadAsset は Blob record を base64 へ、
   * loadAssetBlob は base64 record を Blob へ変換して返す ── #967)。
   */
  async function writeAssetsAdditive(container: Container): Promise<void> {
    const cid = container.meta.container_id;
    const persisted = persistedSetFor(cid);
    for (const [key, data] of Object.entries(container.assets)) {
      if (persisted.has(key)) continue;
      await inner.saveAssetBlob(cid, key, base64ToBlob(data));
      persisted.add(key);
    }
  }

  async function saveInternal(container: Container, baselineHint: Container | null): Promise<void> {
    const cid = container.meta.container_id;
    const baseline = baselines.get(cid) ?? baselineHint;
    if (baseline) {
      const ops = diffContainerToOps(baseline, container);
      if (ops.length > 0) {
        await rpc.call({ op: 'applyOps', cid, ops, setDefault: true });
      } else {
        // 行の変更なしでも default pointer は動かす(idb save と同じ意味論)。
        await rpc.call({ op: 'setDefaultCid', cid });
      }
    } else {
      await rpc.call({ op: 'saveFull', cid, rows: containerToRows(container), setDefault: true });
    }
    baselines.set(cid, container);
    await writeAssetsAdditive(container);
  }

  function queueSave(container: Container, baselineHint: Container | null): Promise<void> {
    const next = saveChain.then(() => saveInternal(container, baselineHint));
    // chain は失敗しても切らない(次の保存を巻き添えにしない)。
    saveChain = next.catch(() => undefined);
    return next;
  }

  async function loadStructured(cid: string): Promise<Container | null> {
    const rows = await rpc.call<ContainerRows | null>({ op: 'loadContainer', cid });
    if (!rows) return null;
    const container = rowsToContainer(rows);
    // DB の行 = この model。次の保存はここからの参照 diff でよい。
    baselines.set(cid, container);
    return container;
  }

  async function hydrateAssets(container: Container): Promise<Container> {
    const cid = container.meta.container_id;
    const keys = await inner.listAssetKeys(cid);
    const assets: Record<string, string> = {};
    for (const key of keys) {
      const data = await inner.loadAsset(cid, key);
      if (data !== null) assets[key] = data;
    }
    return { ...container, assets };
  }

  async function getDefaultCid(): Promise<string | null> {
    return rpc.call<string | null>({ op: 'getDefaultCid' });
  }

  return {
    save(container: Container): Promise<void> {
      return queueSave(container, null);
    },

    saveDiff(container: Container, previous: Container | null): Promise<void> {
      // 内部 baseline が正(load / save 完了時点の参照)。無いときだけ
      // caller の previous を初期基準に使う。
      return queueSave(container, previous);
    },

    invalidatePersistedAssets(containerId: string): void {
      persistedAssets.delete(containerId);
      inner.invalidatePersistedAssets(containerId);
    },

    async loadDefaultMetaShallow(): Promise<{
      container: Container | null;
      bodiesDeferred: boolean;
      storedInline: boolean;
      revisionsDeferred?: boolean;
    }> {
      const cid = await getDefaultCid();
      if (!cid) return { container: null, bodiesDeferred: false, storedInline: false };
      // P4a(§7-d): boot は revisions を運ばない(COUNT + 要求時読み)。
      // ただし **ゴミ箱 subset(削除済み entry の最新 revision)だけは常駐**させる
      // ── getRestoreCandidates は常時 render 経路にあり、空だとゴミ箱が
      // 消えて見えるため。subset は「削除済み entry 数」オーダーで小さい。
      const rows = await rpc.call<ContainerRows | null>({
        op: 'loadContainer',
        cid,
        skipRevisions: true,
      });
      if (!rows) return { container: null, bodiesDeferred: false, storedInline: false };
      const trashRows = await rpc.call<RevisionRow[]>({ op: 'revsTrashLatest', cid });
      const container = rowsToContainer(rows);
      container.revisions = trashRows.map(rowToRevision);
      // baseline = この部分常駐 container。参照 diff の削除判定は「baseline に
      // あって next に無い key」だけなので、**未読の行が消えることは構造的に
      // 無い**(§7-d の安全条件。test で pin: sqlite-store.test.ts)。
      baselines.set(cid, container);
      // 行 → model → 行 は同一(mapper は決定的)なので storedInline=true:
      // 読んだそのままを書き戻しても diff は 0 行で、1 バイトも書かれない。
      return {
        container,
        bodiesDeferred: false,
        storedInline: true,
        revisionsDeferred: true,
      };
    },

    // ── P4a: revisions の要求時読み ──

    async loadRevisionCounts(cid: string): Promise<Record<string, number>> {
      const rows = await rpc.call<Array<{ entry_lid: string; n: number }>>({
        op: 'revCounts',
        cid,
      });
      const out: Record<string, number> = {};
      for (const r of rows) out[r.entry_lid] = r.n;
      return out;
    },

    async loadRevisionsFor(cid: string, entryLid: string): Promise<Revision[]> {
      const rows = await rpc.call<RevisionRow[]>({ op: 'revsFor', cid, entryLid });
      return rows.map(rowToRevision);
    },

    async loadAllRevisions(cid: string): Promise<Revision[]> {
      const rows = await rpc.call<RevisionRow[]>({ op: 'revsAll', cid });
      return rows.map(rowToRevision);
    },

    noteHydratedRevisions(cid: string, revisions: readonly Revision[]): void {
      const baseline = baselines.get(cid);
      if (!baseline || revisions.length === 0) return;
      const existing = new Set(baseline.revisions.map((r) => r.id));
      const added = revisions.filter((r) => !existing.has(r.id));
      if (added.length === 0) return;
      // reducer の merge と同じ規約(created_at の安定 sort)で並べ、baseline と
      // state の行位置を揃える(ズレは無害な rev-ord op を生むだけだが減らす)。
      const merged = [...baseline.revisions, ...added].sort((a, b) =>
        a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
      );
      baselines.set(cid, { ...baseline, revisions: merged });
    },

    async loadBodies(containerId: string): Promise<Record<string, string>> {
      return rpc.call<Record<string, string>>({ op: 'loadBodies', cid: containerId });
    },

    async loadBodiesFor(
      containerId: string,
      lids: readonly string[],
    ): Promise<Record<string, string>> {
      return rpc.call<Record<string, string>>({
        op: 'loadBodies',
        cid: containerId,
        lids: [...lids],
      });
    },

    async load(containerId: string): Promise<Container | null> {
      const c = await loadStructured(containerId);
      return c ? hydrateAssets(c) : null;
    },

    async loadDefault(): Promise<Container | null> {
      const cid = await getDefaultCid();
      if (!cid) return null;
      const c = await loadStructured(cid);
      return c ? hydrateAssets(c) : null;
    },

    loadShallow(containerId: string): Promise<Container | null> {
      return loadStructured(containerId);
    },

    async loadDefaultShallow(): Promise<Container | null> {
      const cid = await getDefaultCid();
      return cid ? loadStructured(cid) : null;
    },

    async delete(containerId: string): Promise<void> {
      await rpc.call({ op: 'deleteContainer', cid: containerId });
      baselines.delete(containerId);
      persistedAssets.delete(containerId);
      // 明示の「コンテナ削除」なので旧 IDB 側の record + assets も消す
      // (併存期間の非破壊原則は**移行**に対する規律であって、user の
      // 削除操作まで旧側に残す意味ではない)。
      await inner.delete(containerId);
    },

    async clearAll(): Promise<void> {
      await rpc.call({ op: 'clearAll' });
      baselines.clear();
      persistedAssets.clear();
      await inner.clearAll();
    },

    async listContainers(): Promise<ContainerSummary[]> {
      const rows = await rpc.call<ContainerSummary[]>({ op: 'listContainers' });
      // idb-store と同じ順序契約: title(case-insensitive)→ id。
      return [...rows].sort(
        (a, b) =>
          a.title.toLowerCase().localeCompare(b.title.toLowerCase()) || a.id.localeCompare(b.id),
      );
    },

    async setDefaultContainer(containerId: string): Promise<void> {
      await rpc.call({ op: 'setDefaultCid', cid: containerId });
    },

    async listWorkspaces(): Promise<Workspace[]> {
      const rows = await rpc.call<Array<{ k: string; v: string }>>({
        op: 'kvList',
        prefix: WORKSPACE_PREFIX,
      });
      const out: Workspace[] = [];
      for (const { v } of rows) {
        try {
          const w = JSON.parse(v) as Workspace;
          if (w && typeof w.id === 'string' && typeof w.name === 'string') out.push(w);
        } catch {
          /* 壊れた record は一覧から黙って除外(idb 側の isWorkspace ガードと同じ姿勢) */
        }
      }
      out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      return out;
    },

    async loadWorkspace(id: string): Promise<Workspace | null> {
      const v = await rpc.call<string | null>({ op: 'kvGet', k: WORKSPACE_PREFIX + id });
      if (v === null) return null;
      try {
        return JSON.parse(v) as Workspace;
      } catch {
        return null;
      }
    },

    async saveWorkspace(workspace: Workspace): Promise<void> {
      await rpc.call({
        op: 'kvSet',
        k: WORKSPACE_PREFIX + workspace.id,
        v: JSON.stringify(workspace),
      });
    },

    async deleteWorkspace(id: string): Promise<void> {
      await rpc.call({ op: 'kvDelete', k: WORKSPACE_PREFIX + id });
    },

    async getActiveWorkspaceId(): Promise<string | null> {
      return rpc.call<string | null>({ op: 'kvGet', k: ACTIVE_WORKSPACE_KEY });
    },

    async setActiveWorkspaceId(id: string): Promise<void> {
      await rpc.call({ op: 'kvSet', k: ACTIVE_WORKSPACE_KEY, v: id });
    },

    // ── asset 面は inner に委譲(bytes は Blob/asset storage が本業 ── §2)──

    async saveAsset(cid: string, key: string, data: string): Promise<void> {
      // P3: 明示の base64 書込も Blob record へ(読み側は inner の両読みで互換)。
      await inner.saveAssetBlob(cid, key, base64ToBlob(data));
      persistedSetFor(cid).add(key);
    },

    loadAsset(cid: string, key: string): Promise<string | null> {
      return inner.loadAsset(cid, key);
    },

    async deleteAsset(cid: string, key: string): Promise<void> {
      await inner.deleteAsset(cid, key);
      persistedAssets.get(cid)?.delete(key);
    },

    listAssetKeys(cid: string): Promise<string[]> {
      return inner.listAssetKeys(cid);
    },

    async saveAssetBlob(cid: string, key: string, data: Blob): Promise<void> {
      await inner.saveAssetBlob(cid, key, data);
      persistedSetFor(cid).add(key);
    },

    loadAssetBlob(cid: string, key: string): Promise<Blob | null> {
      return inner.loadAssetBlob(cid, key);
    },

    // P3: asset meta 索引は sqlite の assets 表(行)が正本。
    // 行 0 件は「未索引」= null(IDB 時代の「record なし」と同型 ── caller の
    // reconcile は universe が空なら何も書かないので、asset 0 件の container で
    // 走査ループが再発することはない)。
    async loadAssetMeta(cid: string): Promise<AssetMetaIndex | null> {
      const rows = await rpc.call<AssetMetaRow[]>({ op: 'assetMetaGet', cid });
      if (rows.length === 0) return null;
      const index: AssetMetaIndex = {};
      for (const r of rows) index[r.key] = { size: r.size, hash: r.hash };
      return index;
    },

    async saveAssetMeta(cid: string, index: AssetMetaIndex): Promise<void> {
      const rows: AssetMetaRow[] = Object.entries(index).map(([key, m]) => ({
        key,
        size: m.size,
        hash: m.hash,
      }));
      await rpc.call({ op: 'assetMetaSet', cid, rows });
    },

    async purgeAssetsExcept(cid: string, keep: Iterable<string>): Promise<string[]> {
      const deleted = await inner.purgeAssetsExcept(cid, keep);
      const persisted = persistedAssets.get(cid);
      if (persisted) for (const key of deleted) persisted.delete(key);
      return deleted;
    },
  };
}

/**
 * IDB → sqlite の一括移行(**非破壊**: IDB 側は一切消さない)。
 * sqlite が空で IDB に container があるときだけ走る(idempotent)。
 *
 * asset bytes は**コピーしない** ── どちらの形式でも同じ asset storage
 * (inner)を参照するため、構造データの行化だけで移行が完了する。
 */
export async function migrateFromInnerIfEmpty(
  store: ContainerStore,
  inner: ContainerStore,
  rpc: SqliteRpc,
): Promise<boolean> {
  const existing = await rpc.call<ContainerSummary[]>({ op: 'listContainers' });
  if (existing.length > 0) return false; // sqlite 側に既にデータあり
  const summaries = await inner.listContainers();
  if (summaries.length === 0) return false; // 移行元なし(新規環境)

  for (const s of summaries) {
    // loadShallow: assets を heap に載せない(500MB 級で必須)。
    const container = await inner.loadShallow(s.id);
    if (container) await store.save(container);
    // P3: 既存の asset meta 索引(`__assetmeta__:` record)があれば行へ写す。
    // 無ければ何もしない ── 既存 reconcile が 1 回だけ走査して行を書く。
    const meta = await inner.loadAssetMeta(s.id);
    if (meta) await store.saveAssetMeta(s.id, meta);
  }
  // save() は最後に保存した cid へ default を動かすので、正しい既定へ戻す。
  const def = await inner.loadDefaultShallow();
  if (def) await store.setDefaultContainer(def.meta.container_id);

  for (const w of await inner.listWorkspaces()) await store.saveWorkspace(w);
  const activeWs = await inner.getActiveWorkspaceId();
  if (activeWs) await store.setActiveWorkspaceId(activeWs);
  return true;
}

/**
 * 本番の組み立て: worker 起動 → init(SAHPool)→ 不成立なら null
 * (caller は inner をそのまま使う = 安全 fallback)。成立したら
 * store を作り、必要なら IDB からの一括移行を走らせる。
 */
export async function createSqliteBackend(
  inner: ContainerStore,
): Promise<SqliteBackendResult | null> {
  const { createManagedSqliteRpc } = await import('./sqlite-client');
  // 破棄 lifecycle 付き RPC(user 指示 2026-07-27): idle が続けば worker ごと
  // 畳み、次の操作で透過的に作り直す。init は最初の call が面倒を見る。
  const rpc = createManagedSqliteRpc('pkc2-sqlite');
  try {
    const init = await rpc.call<SqliteInitResult>({ op: 'init', dbName: 'pkc2-sqlite' });
    if (!init.persistent) {
      // :memory: に落ちた = 永続化できない。揮発 DB に書き始めるのは
      // データ消失経路(S1〜S4 の教訓)なので、使わずに畳む。
      console.warn('[PKC2] sqlite backend: SAHPool 不成立のため IDB を継続:', init.error);
      rpc.dispose();
      return null;
    }
    const store = createSqliteContainerStore(inner, rpc);
    const migrated = await migrateFromInnerIfEmpty(store, inner, rpc);
    // 一括移行の直後は page cache が膨らんでいる ── 開いたまま解放する。
    if (migrated) await rpc.call({ op: 'shrinkMemory' }).catch(() => undefined);
    // 計器(bench / roundtrip harness が破棄と復帰を観測する導線)。
    (globalThis as unknown as Record<string, unknown>).__pkc2SqliteRpcDebug = {
      restarts: () => rpc.restarts(),
      alive: () => rpc.alive(),
      collapseNow: () => rpc.collapseNow(),
    };
    return { store, migrated, dispose: () => rpc.dispose() };
  } catch (err) {
    console.warn('[PKC2] sqlite backend 初期化失敗 — IDB を継続:', err);
    rpc.dispose();
    return null;
  }
}
