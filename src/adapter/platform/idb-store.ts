import type { Container, Revision } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import type { BatchOp, StorageAdapter } from './storage/storage-adapter';
import { createIDBAdapter } from './storage/idb-adapter';
import { createMemoryAdapter } from './storage/memory-adapter';
import { collectReferencedAssetKeys } from '../../features/asset/asset-scan';
import type { AssetMetaIndex } from '../../features/asset/asset-meta';
import { defineFlag } from '../flags';
import { isBodyPendingGlobal } from './body-working-set';

/**
 * #940 案 A 段階1(2026-07-20 user go「実装を続行しよう」): storage layout v2。
 * ON にすると差分保存(saveDiff)が entry を meta(body 空)と本文
 * (`__body__` record)に分離して書く。読み込みは段階1 では全 body を
 * 復元する(挙動不変)── boot の meta-first 化は段階2、body working-set は
 * 段階3。旧ビルド互換の注意は差分保存と同一(unaware ビルドで storage を
 * 直接開くと本文が空に見える。OFF 保存で v1 へ書き戻る)。
 */
export const lazyEntryBodiesEnabled = defineFlag<boolean>(
  'persistence.lazy_entry_bodies',
  false,
  {
    category: 'perf',
    description:
      '案 A 段階1: entry 本文を別 record に分離する storage layout v2(差分保存 ON が前提)。留意: ON 保存した storage は旧ビルドから本文が見えない(OFF 保存で復帰)',
    tier: 0,
  },
);

/**
 * ContainerStore: high-level facade for Container persistence.
 *
 * Built on top of `StorageAdapter` (see `./storage/storage-adapter.ts`).
 * The adapter layer abstracts the kv backend (IDB today, OPFS in
 * the future, an in-memory map for tests). The facade encodes
 * Container-shape semantics:
 *
 *   - assets are stored separately from the container record so a
 *     loaded entry list does not drag asset blobs through the cold
 *     path
 *   - default-pointer key (`__default__`) tracks the most recently
 *     saved container_id so `loadDefault()` is a single key lookup
 *   - save is **additive-only** for assets: it puts every key in
 *     `container.assets` but NEVER deletes. Deletion of asset bytes is
 *     an explicit, opt-in operation (`purgeAssetsExcept`) so a save
 *     carrying only a partial working-set (memory-reduction #7 / lazy
 *     asset loading) can never wipe the assets it didn't load. See the
 *     `save` / `purgeAssetsExcept` notes below for the B5 invariant.
 *
 * Phase 1 (Issue #36) separated assets from the container record.
 * Phase 2 (PR #180) introduced StorageAdapter and parallelised asset
 * reassembly: the previous loop opened a fresh transaction per asset
 * key, so cold boot scaled with asset count. The new path issues
 * `getAll(range)` once and zips with `getAllKeys(range)` in the same
 * transaction.
 *
 * 段階2 (#868, working-set lazy loading): `save()` dropped its
 * diff-delete. Earlier it removed any IDB asset key absent from
 * `container.assets`, which assumed `container.assets` was always the
 * complete set. Once boot loads only the working-set that assumption
 * becomes false and a debounced save would delete every un-loaded
 * asset — silent, total data loss. Diff-delete is replaced by the
 * explicit `purgeAssetsExcept`, invoked only on orphan-purge.
 */
export interface ContainerStore {
  save(container: Container): Promise<void>;
  /**
   * 差分保存(2026-07、改善バッチ④)。container を **split 形式**
   * (core record = meta + relations + 順序リスト、entry / revision は
   * 個別 record)で保存する。`previous` に「前回この store へ保存した
   * container」を渡すと、参照比較で変更された entry / revision だけを
   * 書く — 編集ごとの書込みコストが container 全体 O(n) から変更分
   * O(1) になる。`previous` が null、または storage 上がまだ split
   * 形式でない場合は全件書込み(+ stale key 掃除)に自動フォールバック
   * するので、呼び出し側はベースの正確性だけ保証すればよい
   * (ベース = 前回の保存が resolve した時点の container 参照)。
   *
   * assets は `save()` と同じ additive-only。旧 `save()` と混在しても
   * 安全:`save()` は inline 形式で上書き + split keys を掃除し、
   * `saveDiff()` は marker が無ければ全件書込みから始める。
   */
  saveDiff(container: Container, previous: Container | null): Promise<void>;
  /**
   * #938 R1: cid の「persist 済み asset」記録を破棄する。
   *
   * save/saveDiff は dirty-tracking により **persist 済みと確認できた
   * asset key を書かない**(key → bytes immutable invariant)。同一 key の
   * bytes を差し替えうる経路(container import / 外部由来の container
   * 差し替え)は、保存前に本メソッドで記録を破棄すること ── 次の保存が
   * 全 asset を書き直す。通常の編集経路では呼ぶ必要はない。
   */
  invalidatePersistedAssets(containerId: string): void;
  /**
   * #940 案 A 段階2: 既定 container を meta だけで読む(layout v2 のとき
   * body record を読まない = entries の body は '')。戻り値
   * `bodiesDeferred` が true のとき、caller は `loadBodies` で本文を
   * background 復元して merge する責務を負う。v1 storage では
   * `loadDefaultShallow` と同一(bodiesDeferred = false)。
   */
  loadDefaultMetaShallow(): Promise<{ container: Container | null; bodiesDeferred: boolean }>;
  /** #940 案 A 段階2: layout v2 の本文 record を一括で読む(lid → body)。 */
  loadBodies(containerId: string): Promise<Record<string, string>>;
  /** #940 案 A 段階3: 指定 lid の本文だけ読む(部分 hydrate)。 */
  loadBodiesFor(containerId: string, lids: readonly string[]): Promise<Record<string, string>>;
  load(containerId: string): Promise<Container | null>;
  loadDefault(): Promise<Container | null>;
  /**
   * 段階3 (#868, working-set lazy loading): load the container record
   * WITHOUT reassembling asset bytes — `assets` comes back as `{}`.
   * Boot uses this so the ≈400MB of base64 never lands in the JS heap
   * at startup; the working-set layer then loads only the assets the
   * current view references (via `loadAsset`) and evicts the rest.
   * The asset bytes still live in the store untouched — use
   * `loadAsset` / `listAssetKeys` to reach them on demand, or
   * `hydrateAllAssets` to materialise the full set (export).
   */
  loadShallow(containerId: string): Promise<Container | null>;
  /** `loadShallow` for the `__default__` container. */
  loadDefaultShallow(): Promise<Container | null>;
  delete(containerId: string): Promise<void>;
  /** Delete all data from all stores (workspace reset). */
  clearAll(): Promise<void>;

  /**
   * Enumerate stored containers (id + title only), for same-origin
   * container switching (#771/#773 MVP). Excludes the `__default__`
   * pointer record. Order: by title (case-insensitive), then id.
   */
  listContainers(): Promise<ContainerSummary[]>;
  /** Set the active (`__default__`) container without rewriting it. */
  setDefaultContainer(containerId: string): Promise<void>;

  // ── Workspace layer (#773) ──
  // Workspaces bundle containers into named workspaces. Persisted as
  // reserved `workspace:<id>` keys in the containers bucket (design §3
  // option B — no new bucket / seam change). `__active_workspace__`
  // points at the active one.
  /** Enumerate stored workspaces (by name, then id). */
  listWorkspaces(): Promise<Workspace[]>;
  /** Load a workspace by id, or `null`. */
  loadWorkspace(id: string): Promise<Workspace | null>;
  /** Create / overwrite a workspace record. */
  saveWorkspace(workspace: Workspace): Promise<void>;
  /** Delete a workspace record (does NOT delete its member containers). */
  deleteWorkspace(id: string): Promise<void>;
  /** Active workspace id (`__active_workspace__`), or `null`. */
  getActiveWorkspaceId(): Promise<string | null>;
  /** Set the active workspace id. */
  setActiveWorkspaceId(id: string): Promise<void>;

  // Per-asset CRUD (Phase 1 contract)
  saveAsset(cid: string, key: string, data: string): Promise<void>;
  loadAsset(cid: string, key: string): Promise<string | null>;
  deleteAsset(cid: string, key: string): Promise<void>;
  listAssetKeys(cid: string): Promise<string[]>;

  /**
   * Load the persisted asset-metadata index (段階4 #868) for `cid`, or
   * null when none has been written yet (legacy data → caller backfills).
   * Stored as a single reserved record in the containers bucket — no
   * schema bump.
   */
  loadAssetMeta(cid: string): Promise<AssetMetaIndex | null>;
  /** Persist the asset-metadata index for `cid` (whole-record write). */
  saveAssetMeta(cid: string, index: AssetMetaIndex): Promise<void>;

  /**
   * Explicit asset purge (段階2 #868). Delete every stored asset for
   * `cid` whose key is NOT in `keep`, and return the keys that were
   * deleted. This is the deliberate counterpart to the now
   * additive-only `save()`: callers (the orphan-purge persistence
   * path) hand in the set of keys to retain, derived from a FULL view
   * of the container (entry references), never from a partial
   * working-set. Scoped to `cid` only — other containers' assets are
   * never touched.
   */
  purgeAssetsExcept(cid: string, keep: Iterable<string>): Promise<string[]>;
}

/** Minimal container descriptor for the switcher list. */
export interface ContainerSummary {
  id: string;
  title: string;
}

/**
 * A workspace bundles containers into a named work area (#773). It
 * **references** containers by id (does not own them); the same
 * container may appear in multiple workspaces.
 */
export interface Workspace {
  id: string;
  name: string;
  containerIds: string[];
  activeContainerId: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_KEY = '__default__';
const WORKSPACE_PREFIX = 'workspace:';
const ACTIVE_WORKSPACE_KEY = '__active_workspace__';
/** Reserved containers-bucket key prefix for the per-cid asset-meta index (段階4). */
const ASSET_META_PREFIX = '__assetmeta__:';
/** 差分保存(split 形式)の per-entry record key prefix。 */
const SPLIT_ENTRY_PREFIX = '__entry__:';
/** 差分保存(split 形式)の per-revision record key prefix。 */
const SPLIT_REV_PREFIX = '__rev__:';
/** #940 案 A 段階1(layout v2): per-entry body record の key prefix。 */
const BODY_PREFIX = '__body__:';

/**
 * split 形式の core record に付く marker。順序リストは
 * `container.entries` / `container.revisions` の配列順を忠実に復元する
 * ため(per-key record は辞書順でしか列挙できない)。旧ビルドはこの
 * field を知らないため split record を読むと entries が空に見える —
 * `persistence.differential_save` flag の説明でユーザーに留意点として
 * 明示している(opt-in・既定 OFF)。
 */
interface SplitMarker {
  entryOrder: string[];
  revOrder: string[];
}
/**
 * #940 案 A 段階1: layout marker。`2` = per-entry record が meta(body 空)
 * になり、本文は `__body__:cid:lid` record に分離されている。旧ビルド互換の
 * 注意は `__pkc_split__` と同一(unaware ビルドで開くと本文が空に見える)。
 * flag OFF 保存で v1(split or inline)へ書き戻して収束する双方向設計。
 */
type StoredContainerRecord = Container & {
  __pkc_split__?: SplitMarker;
  __pkc_layout__?: number;
};

function assetFullKey(cid: string, assetKey: string): string {
  return `${cid}:${assetKey}`;
}

function assetPrefix(cid: string): string {
  return `${cid}:`;
}

function splitEntryKey(cid: string, lid: string): string {
  return `${SPLIT_ENTRY_PREFIX}${cid}:${lid}`;
}
function splitEntryPrefix(cid: string): string {
  return `${SPLIT_ENTRY_PREFIX}${cid}:`;
}
function splitRevKey(cid: string, revId: string): string {
  return `${SPLIT_REV_PREFIX}${cid}:${revId}`;
}
function bodyKey(cid: string, lid: string): string {
  return `${BODY_PREFIX}${cid}:${lid}`;
}
function bodyPrefix(cid: string): string {
  return `${BODY_PREFIX}${cid}:`;
}
function splitRevPrefix(cid: string): string {
  return `${SPLIT_REV_PREFIX}${cid}:`;
}

/**
 * Build a ContainerStore on top of any StorageAdapter.
 *
 * Public adapters live in `./storage/`. This factory is the only
 * place where Container-shape knowledge meets the kv primitive — keep
 * adapters dumb and the facade small.
 */
export interface ContainerStoreOptions {
  /** #940 案 A: 書込 layout の選択(true = v2 meta/body 分離)。既定 = flag。 */
  lazyEntryBodies?: () => boolean;
  /**
   * #940 案 A 段階3: 「この entry の本文は未 hydrate(container 上の '' は
   * 実体ではない)」の判定。true の entry は v2 書込で body record を
   * 書かず、既存 `__body__` record を掃除からも除外する ── 部分 hydrate
   * 状態の full-write が本文を空で上書きする事故の構造的防止。
   */
  isBodyPending?: (cid: string, lid: string) => boolean;
}

export function createContainerStore(
  adapter: StorageAdapter,
  opts?: ContainerStoreOptions,
): ContainerStore {
  const containers = adapter.bucket('containers');
  const assets = adapter.bucket('assets');

  // cid → storage 上の形式(true = split / false = inline)の
  // セッション内 memo。undefined の cid は初回アクセス時に record の
  // marker を読んで判定する。save()/saveDiff() の成功時に更新。
  const splitState = new Map<string, boolean>();
  // #940 案 A: cid → storage 上の layout(1 = 従来 / 2 = meta/body 分離)。
  const layoutState = new Map<string, number>();
  // 案 A 段階1 の書込 layout 選択(既定 = module flag。test は注入)。
  const lazyBodies = opts?.lazyEntryBodies ?? ((): boolean => lazyEntryBodiesEnabled());
  // #940 段階3: pending 判定(既定 = body-working-set の global)。
  const bodyPending = opts?.isBodyPending ?? isBodyPendingGlobal;

  // #938 R1(dirty-tracking): cid → 「store に persist 済みと確認できた
  // asset key」の session 内記録。asset は **key → bytes immutable**(内容が
  // 変われば新 key を mint する)という既存 invariant を前提に、putAssets は
  // 未 persist の key だけ書く。従来は保存のたびに常駐 working-set(最大
  // 48MB)を全 put し直しており、実環境(リアルタイム AV 等)での書込増幅の
  // 本丸だった(refinement-research-2026-07.md §1)。
  //
  // 記録の更新は「store への書込成功」or「store からの読出成功」のみ
  // (推測で足さない = 誤 skip によるデータ損失を構造的に防ぐ)。削除系
  // (purge / deleteAsset / del / clearAll)は記録からも落とす。
  const persistedAssets = new Map<string, Set<string>>();
  function persistedSetFor(cid: string): Set<string> {
    let s = persistedAssets.get(cid);
    if (!s) {
      s = new Set();
      persistedAssets.set(cid, s);
    }
    return s;
  }

  /** container.assets を additive-only で書く(段階2 #868、save/saveDiff 共通)。 */
  async function putAssets(container: Container): Promise<void> {
    // Additive-only (段階2 #868): put assets in `container.assets`,
    // delete nothing. `container.assets` may be a partial working-set
    // (lazy loading) — diff-deleting "keys not present here" would
    // erase every un-loaded asset, i.e. silent data loss. Deletion is
    // the explicit job of `purgeAssetsExcept`.
    //
    // #938 R1: persist 済みの key は skip(bytes immutable invariant)。
    const cid = container.meta.container_id;
    const persisted = persistedSetFor(cid);
    const assetOps: BatchOp[] = [];
    const written: string[] = [];
    for (const [key, data] of Object.entries(container.assets)) {
      if (persisted.has(key)) continue;
      assetOps.push({ kind: 'put', key: assetFullKey(cid, key), value: data });
      written.push(key);
    }
    if (assetOps.length === 0) return;
    await assets.applyBatch(assetOps);
    for (const k of written) persisted.add(k);
  }

  async function save(container: Container): Promise<void> {
    const cid = container.meta.container_id;
    await putAssets(container);

    // Container record sans assets — the assets bucket owns those.
    const stripped: Container = { ...container, assets: {} };
    await containers.applyBatch([
      { kind: 'put', key: cid, value: stripped },
      { kind: 'put', key: DEFAULT_KEY, value: cid },
    ]);

    // 差分保存(split 形式)からの復帰:inline record が正になった時点で
    // 旧 split keys は stale(load は marker の無い record を inline として
    // 読むので放置しても正しさは壊れないが、容量を食い続ける)。掃除は
    // inline record 書込みの後 = どの時点でクラッシュしてもデータ完全。
    // memo 済みで inline と分かっている cid ではスキャンしない。
    if (splitState.get(cid) !== false) {
      const stale = [
        ...(await containers.getKeysByPrefix(splitEntryPrefix(cid))),
        ...(await containers.getKeysByPrefix(splitRevPrefix(cid))),
        // #940 案 A: layout v2 の body record も inline 復帰時に掃除。
        ...(await containers.getKeysByPrefix(bodyPrefix(cid))),
      ];
      if (stale.length > 0) {
        await containers.applyBatch(stale.map((key) => ({ kind: 'delete' as const, key })));
      }
      splitState.set(cid, false);
      layoutState.set(cid, 1);
    }
  }

  async function saveDiff(container: Container, previous: Container | null): Promise<void> {
    const cid = container.meta.container_id;
    await putAssets(container);

    // storage 上がまだ split 形式でなければ previous は使えない
    // (inline record しか無い = per-entry record が存在しない)ので
    // 全件書込みへフォールバック。
    //
    // #940 段階5 の健全性 suite が捕捉した実バグの修正: この判定を
    // session memo に頼ると、**別 store インスタンス**(複数タブ /
    // backend 移行 / flag 切替をまたぐ再構築)が layout を変えた後に
    // stale memo で diff 書込みし、marker と実体が食い違って全 body が
    // 空に見える破壊が起きる。核心判定は毎回 core record を実読する
    // (小 record 1 get / 保存 ── 差分保存の節約に対して無視できる)。
    const rec = (await containers.get(cid)) as StoredContainerRecord | undefined;
    const isSplit = rec?.__pkc_split__ !== undefined;
    const layout = rec?.__pkc_layout__ === 2 ? 2 : 1;
    // #940 案 A 段階1: v2 = meta(body 空)+ __body__ record 分離。
    // diff base は「storage の layout が目標 layout と一致」する時だけ有効
    // ── layout をまたぐ差分は混在 state(body の無い meta が正に見える)
    // を作るため、必ず全件書込みで切り替える。
    const wantV2 = lazyBodies();
    const targetLayout = wantV2 ? 2 : 1;
    const base = isSplit && layout === targetLayout
      && previous && previous.meta.container_id === cid ? previous : null;

    const ops: BatchOp[] = [];
    const deletes: BatchOp[] = [];
    const entryPut = (e: Entry): void => {
      if (wantV2) {
        ops.push({ kind: 'put', key: splitEntryKey(cid, e.lid), value: { ...e, body: '' } });
      } else {
        ops.push({ kind: 'put', key: splitEntryKey(cid, e.lid), value: e });
      }
    };
    if (base) {
      // 参照比較の差分:reducer は immutable update(未変更 entry /
      // revision はオブジェクト参照を保つ)なので、参照が変わったものが
      // 変更点。参照が全部変わる最悪ケースでも全件書込みに退化するだけ
      // (正しさは変わらない)。
      const prevEntries = new Map(base.entries.map((e) => [e.lid, e]));
      for (const e of container.entries) {
        const prev = prevEntries.get(e.lid);
        if (prev !== e) {
          entryPut(e);
          // v2: body は変わった時だけ書く(title 等 meta だけの変更で
          // 本文を再書込しない)。新規 entry(prev 無し)は必ず書く。
          // 段階3: 未 hydrate entry の '' を書かない(防御の二重化)。
          if (wantV2 && (!prev || prev.body !== e.body)
              && !bodyPending(cid, e.lid)) {
            ops.push({ kind: 'put', key: bodyKey(cid, e.lid), value: e.body });
          }
        }
        prevEntries.delete(e.lid);
      }
      for (const lid of prevEntries.keys()) {
        deletes.push({ kind: 'delete', key: splitEntryKey(cid, lid) });
        if (wantV2) deletes.push({ kind: 'delete', key: bodyKey(cid, lid) });
      }
      const prevRevs = new Map(base.revisions.map((r) => [r.id, r]));
      for (const r of container.revisions) {
        if (prevRevs.get(r.id) !== r) ops.push({ kind: 'put', key: splitRevKey(cid, r.id), value: r });
        prevRevs.delete(r.id);
      }
      for (const id of prevRevs.keys()) deletes.push({ kind: 'delete', key: splitRevKey(cid, id) });
    } else {
      // 全件書込み + stale key 掃除。assets と違い entries / revisions は
      // メモリ上で常に完全な集合なので diff-delete は安全(段階2 の
      // additive-only 制約は assets 固有)。layout 切替(v1↔v2)も必ず
      // この経路を通り、非対象 layout の残骸 key も併せて掃除される。
      for (const e of container.entries) {
        entryPut(e);
        if (wantV2) {
          // 段階3: 未 hydrate の entry は body を書かない(既存 record 温存)。
          if (bodyPending(cid, e.lid)) continue;
          ops.push({ kind: 'put', key: bodyKey(cid, e.lid), value: e.body });
        }
      }
      for (const r of container.revisions) ops.push({ kind: 'put', key: splitRevKey(cid, r.id), value: r });
      const live = new Set(ops.map((o) => o.key));
      // 段階3: pending entry の既存 body record は stale 扱いしない。
      if (wantV2) {
        for (const e of container.entries) {
          if (bodyPending(cid, e.lid)) live.add(bodyKey(cid, e.lid));
        }
      }
      for (const k of await containers.getKeysByPrefix(splitEntryPrefix(cid))) {
        if (!live.has(k)) deletes.push({ kind: 'delete', key: k });
      }
      for (const k of await containers.getKeysByPrefix(splitRevPrefix(cid))) {
        if (!live.has(k)) deletes.push({ kind: 'delete', key: k });
      }
      for (const k of await containers.getKeysByPrefix(bodyPrefix(cid))) {
        if (!live.has(k)) deletes.push({ kind: 'delete', key: k });
      }
    }

    const marker: SplitMarker = {
      entryOrder: container.entries.map((e) => e.lid),
      revOrder: container.revisions.map((r) => r.id),
    };
    const core: StoredContainerRecord = {
      ...container,
      entries: [],
      revisions: [],
      assets: {},
      __pkc_split__: marker,
      ...(wantV2 ? { __pkc_layout__: 2 } : {}),
    };
    // 1 バッチ(IDB では単一 tx = 原子的)。順序は puts → core → deletes:
    // FS 系 backend の逐次 best-effort でどこで中断しても、次回の保存
    // (差分 or 全件)で収束する(puts は冪等、deletes は再計算される)。
    await containers.applyBatch([
      ...ops,
      { kind: 'put', key: cid, value: core },
      { kind: 'put', key: DEFAULT_KEY, value: cid },
      ...deletes,
    ]);
    splitState.set(cid, true);
    layoutState.set(cid, targetLayout);
  }

  /**
   * split 形式の record なら per-entry / per-revision record を読んで
   * 配列を復元する。inline(legacy)record はそのまま返す。順序は
   * marker の順序リストが正本。リストに無い stray record(全件書込みの
   * 中断で残った余り)は末尾に付ける — 消すより安全側。
   */
  async function reassembleSplit(
    cid: string,
    record: StoredContainerRecord,
    opts2?: { skipBodies?: boolean },
  ): Promise<Container> {
    const marker = record.__pkc_split__;
    if (!marker) return record;
    const isV2 = record.__pkc_layout__ === 2;
    layoutState.set(cid, isV2 ? 2 : 1);
    const [entryPairs, revPairs, bodyPairs] = await Promise.all([
      containers.getAllByPrefix(splitEntryPrefix(cid)),
      containers.getAllByPrefix(splitRevPrefix(cid)),
      // #940 案 A: layout v2 は本文が別 record。段階2 の meta-first boot は
      // skipBodies で本文読込を後回しにする(entries の body は '')。
      isV2 && !opts2?.skipBodies
        ? containers.getAllByPrefix(bodyPrefix(cid))
        : Promise.resolve([]),
    ]);
    const bodyByLid = new Map<string, string>();
    for (const { key, value } of bodyPairs) {
      if (typeof value === 'string') bodyByLid.set(key.slice(bodyPrefix(cid).length), value);
    }
    const entryByLid = new Map<string, Entry>();
    for (const { key, value } of entryPairs) {
      const lid = key.slice(splitEntryPrefix(cid).length);
      const e = value as Entry;
      entryByLid.set(lid, isV2 ? { ...e, body: bodyByLid.get(lid) ?? '' } : e);
    }
    const entries: Entry[] = [];
    for (const lid of marker.entryOrder) {
      const e = entryByLid.get(lid);
      if (e) {
        entries.push(e);
        entryByLid.delete(lid);
      }
    }
    for (const e of entryByLid.values()) entries.push(e);
    const revById = new Map<string, Revision>();
    for (const { key, value } of revPairs) {
      revById.set(key.slice(splitRevPrefix(cid).length), value as Revision);
    }
    const revisions: Revision[] = [];
    for (const id of marker.revOrder) {
      const r = revById.get(id);
      if (r) {
        revisions.push(r);
        revById.delete(id);
      }
    }
    for (const r of revById.values()) revisions.push(r);
    const { __pkc_split__: _m, __pkc_layout__: _l, ...rest } = record;
    return { ...rest, entries, revisions, assets: {} };
  }

  async function reassembleAssets(cid: string, container: Container): Promise<Container> {
    // PR #180: single-call range scan, single transaction. Replaces
    // the previous `for (key) { db.transaction(...).get(key) }` loop
    // that opened one tx per asset and serialized the round-trips.
    const pairs = await assets.getAllByPrefix(assetPrefix(cid));
    if (pairs.length === 0) return container;
    const reassembled: Record<string, string> = {};
    const persisted = persistedSetFor(cid);
    for (const { key, value } of pairs) {
      const assetKey = key.slice(assetPrefix(cid).length);
      if (typeof value === 'string') {
        reassembled[assetKey] = value;
        // #938 R1: store から読めた = persist 済み。
        persisted.add(assetKey);
      }
    }
    return { ...container, assets: reassembled };
  }

  async function load(containerId: string): Promise<Container | null> {
    const record = await containers.get(containerId);
    if (!record) return null;
    const assembled = await reassembleSplit(containerId, record as StoredContainerRecord);
    return reassembleAssets(containerId, assembled);
  }

  async function loadDefault(): Promise<Container | null> {
    const defaultId = await containers.get(DEFAULT_KEY);
    if (typeof defaultId !== 'string') return null;
    const record = await containers.get(defaultId);
    if (!record) return null;
    const assembled = await reassembleSplit(defaultId, record as StoredContainerRecord);
    return reassembleAssets(defaultId, assembled);
  }

  async function loadShallow(containerId: string): Promise<Container | null> {
    // No asset reassembly: the container record is already stored sans
    // assets (see `save`), so `record.assets` is `{}`. We normalise it
    // defensively in case a legacy record carried inline assets.
    const record = await containers.get(containerId);
    if (!record) return null;
    const assembled = await reassembleSplit(containerId, record as StoredContainerRecord);
    return { ...assembled, assets: {} };
  }

  async function loadDefaultShallow(): Promise<Container | null> {
    const defaultId = await containers.get(DEFAULT_KEY);
    if (typeof defaultId !== 'string') return null;
    return loadShallow(defaultId);
  }

  // #940 案 A 段階2: meta-first boot 用。v2 なら本文を読まず即返す。
  async function loadDefaultMetaShallow(): Promise<{ container: Container | null; bodiesDeferred: boolean }> {
    const defaultId = await containers.get(DEFAULT_KEY);
    if (typeof defaultId !== 'string') return { container: null, bodiesDeferred: false };
    const record = await containers.get(defaultId);
    if (!record) return { container: null, bodiesDeferred: false };
    const rec = record as StoredContainerRecord;
    const isV2 = rec.__pkc_layout__ === 2;
    const assembled = await reassembleSplit(defaultId, rec, { skipBodies: true });
    return { container: { ...assembled, assets: {} }, bodiesDeferred: isV2 };
  }

  async function loadBodiesFor(
    containerId: string,
    lids: readonly string[],
  ): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    await Promise.all(lids.map(async (lid) => {
      const v = await containers.get(bodyKey(containerId, lid));
      if (typeof v === 'string') out[lid] = v;
    }));
    return out;
  }

  async function loadBodies(containerId: string): Promise<Record<string, string>> {
    const pairs = await containers.getAllByPrefix(bodyPrefix(containerId));
    const out: Record<string, string> = {};
    for (const { key, value } of pairs) {
      if (typeof value === 'string') out[key.slice(bodyPrefix(containerId).length)] = value;
    }
    return out;
  }

  async function del(containerId: string): Promise<void> {
    const prefix = assetPrefix(containerId);
    const assetKeys = await assets.getKeysByPrefix(prefix);
    const assetOps: BatchOp[] = assetKeys.map((key) => ({ kind: 'delete', key }));
    // split 形式の per-entry / per-revision / per-body record も一緒に消す。
    const splitKeys = [
      ...(await containers.getKeysByPrefix(splitEntryPrefix(containerId))),
      ...(await containers.getKeysByPrefix(splitRevPrefix(containerId))),
      ...(await containers.getKeysByPrefix(bodyPrefix(containerId))),
    ];
    await Promise.all([
      containers.applyBatch([
        { kind: 'delete', key: containerId },
        ...splitKeys.map((key) => ({ kind: 'delete' as const, key })),
      ]),
      assets.applyBatch(assetOps),
    ]);
    splitState.delete(containerId);
    layoutState.delete(containerId); // #940 案 A
    persistedAssets.delete(containerId); // #938 R1
  }

  async function saveAsset(cid: string, key: string, data: string): Promise<void> {
    await assets.put(assetFullKey(cid, key), data);
    persistedSetFor(cid).add(key); // #938 R1
  }

  async function loadAsset(cid: string, key: string): Promise<string | null> {
    const result = await assets.get(assetFullKey(cid, key));
    if (typeof result !== 'string') return null;
    persistedSetFor(cid).add(key); // #938 R1: 読めた = persist 済み
    return result;
  }

  async function deleteAsset(cid: string, key: string): Promise<void> {
    await assets.delete(assetFullKey(cid, key));
    persistedSetFor(cid).delete(key); // #938 R1
  }

  async function listAssetKeys(cid: string): Promise<string[]> {
    const prefix = assetPrefix(cid);
    const keys = await assets.getKeysByPrefix(prefix);
    const out = keys.map((k) => k.slice(prefix.length));
    // #938 R1: store に存在が確認できた key は persist 済み。
    const persisted = persistedSetFor(cid);
    for (const k of out) persisted.add(k);
    return out;
  }

  async function loadAssetMeta(cid: string): Promise<AssetMetaIndex | null> {
    const rec = await containers.get(ASSET_META_PREFIX + cid);
    return rec && typeof rec === 'object' ? (rec as AssetMetaIndex) : null;
  }

  async function saveAssetMeta(cid: string, index: AssetMetaIndex): Promise<void> {
    await containers.put(ASSET_META_PREFIX + cid, index);
  }

  async function purgeAssetsExcept(cid: string, keep: Iterable<string>): Promise<string[]> {
    const prefix = assetPrefix(cid);
    const keepSet = keep instanceof Set ? keep : new Set(keep);
    // One keys-only range scan (cheap), then batch-delete the misses.
    const existingFullKeys = await assets.getKeysByPrefix(prefix);
    const deletedKeys: string[] = [];
    const ops: BatchOp[] = [];
    for (const fullKey of existingFullKeys) {
      const assetKey = fullKey.slice(prefix.length);
      if (!keepSet.has(assetKey)) {
        ops.push({ kind: 'delete', key: fullKey });
        deletedKeys.push(assetKey);
      }
    }
    if (ops.length > 0) await assets.applyBatch(ops);
    // #938 R1: 消した key は persist 記録からも落とす。
    const persisted = persistedSetFor(cid);
    for (const k of deletedKeys) persisted.delete(k);
    return deletedKeys;
  }

  async function clearAll(): Promise<void> {
    await Promise.all([containers.clear(), assets.clear()]);
    persistedAssets.clear(); // #938 R1
  }

  async function listContainers(): Promise<ContainerSummary[]> {
    // Keys-only scan → reserved key を除外してから record を読む。
    // 以前は getAllByPrefix('') で全値を読んでいたが、split 形式では
    // per-entry record が数千件並ぶため、values ごと読むと switcher を
    // 開くだけで boot 相当のコストになる。keys → 対象だけ get に変更。
    const keys = await containers.getKeysByPrefix('');
    const out: ContainerSummary[] = [];
    for (const key of keys) {
      if (key === DEFAULT_KEY || key === ACTIVE_WORKSPACE_KEY) continue;
      if (
        key.startsWith(WORKSPACE_PREFIX) ||
        key.startsWith(ASSET_META_PREFIX) ||
        key.startsWith(SPLIT_ENTRY_PREFIX) ||
        key.startsWith(SPLIT_REV_PREFIX)
      ) continue;
      const value = await containers.get(key);
      const meta = (value as { meta?: { container_id?: unknown; title?: unknown } } | null)?.meta;
      if (!meta || typeof meta.container_id !== 'string') continue;
      out.push({ id: meta.container_id, title: typeof meta.title === 'string' ? meta.title : '' });
    }
    out.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    return out;
  }

  async function setDefaultContainer(containerId: string): Promise<void> {
    await containers.put(DEFAULT_KEY, containerId);
  }

  function isWorkspace(v: unknown): v is Workspace {
    const w = v as Workspace | null;
    return (
      !!w && typeof w.id === 'string' && typeof w.name === 'string' && Array.isArray(w.containerIds)
    );
  }

  async function listWorkspaces(): Promise<Workspace[]> {
    const pairs = await containers.getAllByPrefix(WORKSPACE_PREFIX);
    const out: Workspace[] = [];
    for (const { value } of pairs) {
      if (isWorkspace(value)) out.push(value);
    }
    out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return out;
  }

  async function loadWorkspace(id: string): Promise<Workspace | null> {
    const v = await containers.get(WORKSPACE_PREFIX + id);
    return isWorkspace(v) ? v : null;
  }

  async function saveWorkspace(workspace: Workspace): Promise<void> {
    await containers.put(WORKSPACE_PREFIX + workspace.id, workspace);
  }

  async function deleteWorkspace(id: string): Promise<void> {
    await containers.delete(WORKSPACE_PREFIX + id);
  }

  async function getActiveWorkspaceId(): Promise<string | null> {
    const v = await containers.get(ACTIVE_WORKSPACE_KEY);
    return typeof v === 'string' ? v : null;
  }

  async function setActiveWorkspaceId(id: string): Promise<void> {
    await containers.put(ACTIVE_WORKSPACE_KEY, id);
  }

  return {
    save,
    saveDiff,
    load,
    loadDefault,
    loadShallow,
    loadDefaultShallow,
    loadDefaultMetaShallow,
    loadBodies,
    loadBodiesFor,
    delete: del,
    clearAll,
    listContainers,
    setDefaultContainer,
    listWorkspaces,
    loadWorkspace,
    saveWorkspace,
    deleteWorkspace,
    getActiveWorkspaceId,
    setActiveWorkspaceId,
    saveAsset,
    loadAsset,
    deleteAsset,
    listAssetKeys,
    loadAssetMeta,
    saveAssetMeta,
    purgeAssetsExcept,
    invalidatePersistedAssets: (containerId: string): void => {
      persistedAssets.delete(containerId); // #938 R1
    },
  };
}

/**
 * Create the IDB-backed ContainerStore.
 *
 * Internally: `createIDBAdapter()` → `createContainerStore(adapter)`.
 * Callers do not need to know the adapter exists.
 */
export function createIDBStore(): ContainerStore {
  return createContainerStore(createIDBAdapter());
}

/**
 * Create the in-memory ContainerStore (tests, SSR).
 */
export function createMemoryStore(): ContainerStore {
  return createContainerStore(createMemoryAdapter());
}

/**
 * Materialise the FULL asset set for `container` from the store
 * (段階3 #868). At runtime `container.assets` holds only the lazy
 * working-set, so any path that must serialise every byte — export
 * to HTML / ZIP, entry-package export — has to hydrate first or it
 * would silently drop the non-resident assets (data loss).
 *
 * Reads every stored asset key for the container, loads its bytes,
 * and returns a new container whose `assets` is the union of the
 * stored set and whatever was already resident in memory (resident
 * bytes win on conflict — they reflect un-saved in-flight edits).
 * The input container is not mutated. Keys that fail to load are
 * skipped (their reference simply stays broken, as before).
 */
export async function hydrateAllAssets(
  store: ContainerStore,
  container: Container,
): Promise<Container> {
  const cid = container.meta.container_id;
  const storedKeys = await store.listAssetKeys(cid);
  const full: Record<string, string> = {};
  await Promise.all(
    storedKeys.map(async (key) => {
      const data = await store.loadAsset(cid, key);
      if (typeof data === 'string') full[key] = data;
    }),
  );
  // Resident (possibly un-persisted) bytes take precedence.
  for (const [key, data] of Object.entries(container.assets)) {
    full[key] = data;
  }
  return { ...container, assets: full };
}

/**
 * Materialise just the assets `container`'s own entries REFERENCE
 * (段階3 #868) — the right hydration for export. Loads each referenced
 * key's bytes from the store and merges them over whatever is already
 * resident (resident wins, preserving un-persisted edits). Orphan
 * (unreferenced) bytes are intentionally NOT pulled in, so a subset
 * export carries only its own entries' assets (no leakage of the rest
 * of the workspace) and a full export drops dead orphan bytes.
 *
 * Data-safety: a referenced asset is always recoverable — either it is
 * still resident (the working-set manager never evicts un-persisted
 * bytes) or it is in the store. So nothing an entry needs is lost.
 */
export async function hydrateReferencedAssets(
  store: ContainerStore,
  container: Container,
): Promise<Container> {
  const cid = container.meta.container_id;
  const referenced = collectReferencedAssetKeys(container);
  const merged: Record<string, string> = {};
  await Promise.all(
    [...referenced].map(async (key) => {
      if (container.assets[key] != null) return; // resident wins
      const data = await store.loadAsset(cid, key);
      if (typeof data === 'string') merged[key] = data;
    }),
  );
  for (const [key, data] of Object.entries(container.assets)) merged[key] = data;
  return { ...container, assets: merged };
}

// ── Export hydration seam (段階3 #868) ───────────────────────────────
//
// Under lazy loading `container.assets` holds only the resident
// working-set, so export serializers must hydrate the referenced bytes
// before writing or they would silently drop them. The serializers live
// in the platform layer and are called from many sites (main, action-
// binder subset exports, transport export-handler) that don't all hold
// a store reference, so the active store is registered once at boot and
// the serializers hydrate through `hydrateForExport`. Unset (tests that
// pass a fully-resident container) → no-op.
let activeExportStore: ContainerStore | null = null;

/** Register the store used by `hydrateForExport`. Called once at boot. */
export function registerExportStore(store: ContainerStore | null): void {
  activeExportStore = store;
}

/**
 * Hydrate a container's referenced assets via the registered export
 * store, for serialization paths (HTML / ZIP / entry-package). No-op
 * (returns the container unchanged) when no store is registered.
 */
export async function hydrateForExport(container: Container): Promise<Container> {
  if (!activeExportStore) return container;
  const withAssets = await hydrateReferencedAssets(activeExportStore, container);
  // #940 段階4: 未 hydrate の本文(body working-set の pending)も export
  // 前に必ず復元する ── export 内容が lazy 化の影響を受けない barrier。
  const cid = withAssets.meta.container_id;
  const pendingLids = withAssets.entries
    .filter((e) => isBodyPendingGlobal(cid, e.lid))
    .map((e) => e.lid);
  if (pendingLids.length === 0) return withAssets;
  const bodies = await activeExportStore.loadBodiesFor(cid, pendingLids);
  return {
    ...withAssets,
    entries: withAssets.entries.map((e) =>
      bodies[e.lid] !== undefined ? { ...e, body: bodies[e.lid]! } : e,
    ),
  };
}

// ── Availability probe ──────────────────────
//
// IDB may be silently broken in certain runtime conditions:
//   - Some browsers disable IDB on `file://` (notably older Firefox,
//     some mobile configurations, and private-browsing modes).
//   - Private / incognito modes can return a functional-looking
//     IDB that throws on `open()` or on the first transaction.
//   - Quota-exhausted / corrupted databases can open but fail on read.
//
// We probe at boot so the UI can warn the user instead of
// silently falling back to pkc-data. The probe tries a full
// open → write → read → close cycle on a tiny disposable store.
// On failure it returns the underlying reason so callers can surface
// a diagnostic message; they never throw.

export interface IDBAvailability {
  available: boolean;
  reason?: string;
}

const PROBE_DB_NAME = 'pkc2-probe';
const PROBE_STORE = 'probe';

export async function probeIDBAvailability(): Promise<IDBAvailability> {
  if (typeof indexedDB === 'undefined' || indexedDB === null) {
    return { available: false, reason: 'indexedDB is undefined in this runtime' };
  }
  return new Promise<IDBAvailability>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(PROBE_DB_NAME, 1);
    } catch (err) {
      resolve({ available: false, reason: `open() threw: ${String(err)}` });
      return;
    }
    req.onupgradeneeded = () => {
      try {
        const db = req.result;
        if (!db.objectStoreNames.contains(PROBE_STORE)) {
          db.createObjectStore(PROBE_STORE);
        }
      } catch (err) {
        // Fall through to onerror / onsuccess — best-effort.
        console.warn('[PKC2] IDB probe upgrade failed:', err);
      }
    };
    req.onerror = () => {
      resolve({ available: false, reason: String(req.error?.message ?? req.error ?? 'unknown') });
    };
    req.onblocked = () => {
      resolve({ available: false, reason: 'open() blocked' });
    };
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction(PROBE_STORE, 'readwrite');
        const store = tx.objectStore(PROBE_STORE);
        store.put(1, '__probe__');
        const getReq = store.get('__probe__');
        getReq.onsuccess = () => {
          db.close();
          resolve({ available: getReq.result === 1 });
        };
        getReq.onerror = () => {
          db.close();
          resolve({ available: false, reason: 'probe read failed' });
        };
      } catch (err) {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        resolve({ available: false, reason: `probe txn failed: ${String(err)}` });
      }
    };
  });
}
