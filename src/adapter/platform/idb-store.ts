import type { Container, Revision } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import type { BatchOp, StorageAdapter } from './storage/storage-adapter';
import { createIDBAdapter } from './storage/idb-adapter';
import { createMemoryAdapter } from './storage/memory-adapter';
import { collectReferencedAssetKeys } from '../../features/asset/asset-scan';
import type { AssetMetaIndex } from '../../features/asset/asset-meta';
import { defineFlag } from '../flags';
import { isBodyPendingGlobal } from './body-working-set';
import { isRevisionResidencyActive } from './revision-residency';

/**
 * #940 案 A(2026-07-20 user go「実装を続行しよう」): 本文・履歴を container
 * record から追い出す storage layout。段階1 の layout v2(`__body__` per-record)
 * から段階2〜4 で進み、**現在 ON が書くのは layout 5**(meta 単一 record +
 * revisions / bodies を `segments` bucket の gzip パックへ集約。#983–#988)。
 *
 * ⚠ **単独では何も起きない**。この flag を読むのは `saveDiff()` の中の
 * `wantSplitBodies` 1 箇所だけで(下記 `lazyBodies`)、`persistence.ts` は
 * `differential_save` が OFF なら `save()`(inline)しか呼ばない。差分保存は
 * 既定 OFF(#958 で ON から撤回)なので、**lazy だけ ON にしても layout は 1 の
 * まま**。実測と既定 ON 可否の判断は
 * `docs/development/lazy-entry-bodies-diagnosis-2026-07-25.md`(結論: 既定 OFF 据え置き)。
 *
 * ⚠ **「高速起動」ではない**(2026-07-25 の実測で判明。書込 I/O ベンチ doc
 * `storage-write-io-bench-2026-07-25.md`)。5000 entries / 15000 revisions で
 * 使用量 6.7MB → 4.1MB(0.61 倍)になる一方、**boot は 3303ms → 6880ms(2.1 倍)**。
 * 規模掃引では 1000/5000/15000 entries で boot +29% / +108% / +84% と**規模で消えない**。
 * 1000 entries では使用量すら 1.4MB → 2.1MB と**増える**(分割の管理情報が圧縮を上回る)。
 * boot で revision segments を全件 gunzip する(`loadRevSegments` は `skipBodies` に
 * 関係なく走る)ぶんの伸長 CPU が乗るため。**storage 逼迫時の opt-in** であって
 * 速度目的の設定ではない。既定にはしない。
 *
 * 旧ビルド互換の注意は差分保存と同一(unaware ビルドで storage を直接開くと
 * 本文が空に見える。OFF 保存で layout 1 へ書き戻る)。
 */
/**
 * 🔴 **退役(2026-07-26、user 裁定)**
 *
 * > 「lazy_entry_bodies は効果が少なく、リスクが多いなら廃止したい /
 * >  3 ヶ月後に廃止する方向性で調整に入りましょう /
 * >  まずは導線の封鎖と戻し道をつけてください /
 * >  3 ヶ月の間にユーザーが一度でも上書きすれば、安全な道に戻る」
 *
 * `retired: true` により **どの source から指定されても既定値(false)に落ち**、
 * Inspector の一覧からも消える。既に有効化していた環境は、次の保存で
 * `targetLayout = 1` に落ちて **従来形式へ書き戻る**(= 戻し道)。
 *
 * 判断の根拠(2026-07-26 の実測と実装監査):
 * - 効果があるのは **書込軸だけ**(1 編集 25,688 → 987 KB、使用量 0.62 倍)。
 *   起動軸は **比較が成立していなかった** ── layout 5 は本文 0 件で
 *   `bootReady` に到達し、その後 32 件/200ms で backfill する
 *   (15000 件なら収束まで約 94 秒。測定の外側にあった)
 * - この機構に **データ消失経路が 4 件**集中していた:
 *   ① export が本文より先に asset を集める → バックアップから添付が全部落ちる(#1023 修正)
 *   ② rev segment の復号失敗が破壊的 → 履歴が消える(#1025 修正)
 *   ③ 読めなかった本文が `''` として焼き付く(body-working-set が無条件に pending を外す)
 *   ④ `save()` に `bodyPending` guard が無い(本 PR で修正 ── **戻し道そのものだった**)
 * - 「起動のたびの 25.7MB 無駄書き」を本 flag と無関係に潰した(#1024)ため、
 *   相対的な価値がさらに下がった
 *
 * ⚠ **`storage-v3-redesign-2026-07.md` §A.7 の user 出典タグ付き指示**
 * (「ゆるいストリーミング圧縮とチャンクパックはスケールのために必須」/
 *  実デバイス書込 1/4.9 の実測)は **撤回されていない**。よって
 * **segments 実装そのものは残す**。本件で塞ぐのは user 導線だけであり、
 * 3 ヶ月後の廃止範囲(実装を消すか)は別途 user 裁定を要する。
 *
 * ⚠ **定義を消してはならない。** getter が生きていないと、既に有効化された
 * 環境が「既定値へ戻る = 安全な形式へ書き戻る」経路ごと失われる。
 */
export const lazyEntryBodiesEnabled = defineFlag<boolean>(
  'persistence.lazy_entry_bodies',
  false,
  {
    category: 'perf',
    retired: true,
    retiredReason:
      '2026-07-26 user 裁定により退役(3 ヶ月後に廃止予定)。導線を封鎖し、次の保存で従来形式へ戻す',
    description:
      '案 A: 本文・履歴を segments へ分割圧縮する省容量 layout(現行 ON = layout 5)。実測= 数千件以上で使用量 0.6 倍・**boot 1.3〜2.1 倍**(小規模では使用量も増える)。⚠ differential_save も同時に ON でないと無効(単独では layout 1 のまま)。留意: ON 保存した storage は旧ビルドから本文が見えない(OFF 保存で復帰)',
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
   *
   * `storedInline` は「読んだそのままを書き戻しても storage が 1 バイトも
   * 変わらない形式か」。呼び元(boot)はこれが true のときだけ
   * `notePersistedBaseline` を立ててよい ── false のときの保存は
   * **形式を戻す作業**であって無駄書きではない。
   */
  loadDefaultMetaShallow(): Promise<{
    container: Container | null;
    bodiesDeferred: boolean;
    storedInline: boolean;
    /**
     * P4a(wasm-sqlite §7-d): revisions が要求時読みに deferred されているか。
     * true のとき container.revisions は**常駐 working set**(ゴミ箱 subset +
     * 以後の追記 + hydrate 済み分)であり全量ではない。caller(main.ts)は
     * revision-residency manager を mount する責務を負う。旧実装は返さない
     * (undefined = false)。
     */
    revisionsDeferred?: boolean;
  }>;

  // ── P4a: revisions の要求時読み(optional ── sqlite 実装のみ提供)──
  // 提供しない store では revisions は従来どおり全量常駐で、これらは呼ばれない。
  /** entry_lid → revision 件数(行本体は運ばない)。 */
  loadRevisionCounts?(cid: string): Promise<Record<string, number>>;
  /** 指定 entry の revisions(created_at 昇順)。 */
  loadRevisionsFor?(cid: string, entryLid: string): Promise<Revision[]>;
  /** 全 revisions(export / ensureAll 用。created_at 昇順)。 */
  loadAllRevisions?(cid: string): Promise<Revision[]>;
  /**
   * hydrate した revisions を参照 diff の baseline に**追加**する(sqlite 実装)。
   * hydrate した行は storage 由来なので、これを怠ると次の保存が同一内容の行を
   * 再 upsert する。⚠ **baseline を container ごと差し替えてはならない** ──
   * 未保存の編集を含む state を「同期済み」と主張することになり、直後の保存が
   * 0 diff に化けて編集が消える(lost write)。行の追加だけが安全。
   */
  noteHydratedRevisions?(cid: string, revisions: readonly Revision[]): void;
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

  // ── P1 slice 1(#967 storage v3): Blob asset CRUD ──
  // asset bytes を base64 文字列ではなく Blob(ヒープ外)で読み書きする
  // 新契約。旧 base64 record との両読みを保証する:
  //   - saveAssetBlob は Blob 対応 backend(IDB / memory)へは Blob を
  //     そのまま、非対応 backend(FS 系)へは base64 へ変換して書く
  //   - loadAssetBlob は Blob record / base64 record のどちらでも Blob を返す
  //   - 既存 loadAsset は Blob record に当たったら base64 へ変換して返す
  //     (旧呼び出し面の互換。後続 slice で呼び出し面を Blob へ移行)
  saveAssetBlob(cid: string, key: string, data: Blob): Promise<void>;
  loadAssetBlob(cid: string, key: string): Promise<Blob | null>;

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
 * 差分保存の relations サイドカー record の key prefix(2026-07-26)。
 *
 * **なぜ分けるか**: 実測(`docs/development/save-write-volume-2026-07-26.md`)で
 * core record の内訳を項別に測ったところ、**relations が最大項**だった:
 *
 *   N=5000 / M=15000 / R=3074、1 保存あたりの core record
 *     split v1 : relations 442 KB(70%)/ revOrder 145 KB / entryOrder 47 KB
 *     layout 5 : entries 768 KB / relations 442 KB / revOrder 145 KB / bodyseg 57 KB
 *
 * `core` が `...container` を spread しているため、**本文 1 文字の編集でも
 * relations が全件書き直されていた**。relations は滅多に変わらないので、
 * **変わったときだけ**別 record へ書けば、その分がまるごと消える。
 *
 * 読み側は「この record があればそれが正本、無ければ core の inline」。
 * marker に形式フラグを増やさずに旧データと両立する
 * (旧データは record が無いので自動的に inline 経路)。
 */
const REL_PREFIX = '__rel__:';
/**
 * 順序リストのサイドカー prefix(2026-07-26)。
 *
 * relations を出した後、core record に残る O(N+M) は
 * `marker.entryOrder`(全 lid)と `marker.revOrder`(全 revision id)だった:
 *
 *   split v1 : revOrder 145 KB / entryOrder 47 KB(N=5000 / M=15000)
 *
 * **`revOrder` は毎保存で伸びる**ので「変わった時だけ書く」だけでは効かない。
 * 固定長チャンクに割り、**末尾チャンクだけ書き直す**(追記の実体は 1 id なので、
 * 実質 O(チャンク) に落ちる)。`entryOrder` は entry の増減時しか変わらないので
 * relations と同じ「変わった時だけ」で足りる。
 *
 * 復元は seq 順にチャンクを連結するだけ ── 配列順の意味論
 * (`created_at` 同着時の prev_rid tie-break、`tests/core/revision-order-tiebreak.test.ts`)
 * をそのまま保つ。サイドカーが 1 つも無ければ marker の inline へ fallback する。
 */
const ORDER_PREFIX = '__order__:';
/** 順序リスト 1 チャンクあたりの id 数。 */
const ORDER_CHUNK = 2000;

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
  /** P2-3(layout 5): 本文の lid → segment seq 索引(部分 hydrate 用)。 */
  __pkc_bodyseg__?: Record<string, number>;
};

// ── P1 slice 1(#967): base64 ⇄ Blob 変換 helper ──
// チャンク処理で巨大 asset でも中間 rope / 引数上限を作らない。

/** base64 文字列 → Blob(mime 不明時は octet-stream)。 */
export function base64ToBlob(base64: string, mime = 'application/octet-stream'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Blob → base64 文字列(旧契約との互換境界でのみ使用)。 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const CHUNK = 0x8000;
  const pieces: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    pieces.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return btoa(pieces.join(''));
}

// ── P2-2(#967): revisions セグメントログ(layout 4)helpers ──
// segments bucket: key = `${cid}:rev:${seq 6桁}`、値 = gzip Blob
// (CompressionStream が無い環境では素の JSON 文字列 — 読みは両対応)。
// パックは ~1MB(非圧縮)。末尾(active)だけ書き足し、封印分は不変。

const SEG_TARGET_BYTES = 1024 * 1024;

function segRevPrefix(cid: string): string {
  return `${cid}:rev:`;
}
function segRevKey(cid: string, seq: number): string {
  return `${segRevPrefix(cid)}${String(seq).padStart(6, '0')}`;
}

// P2-3(#967): bodies プレーン。segment 値 = `Record<lid, body>` の
// JSON(gzip)。索引(lid → seq)は core record の `__pkc_bodyseg__`。
// **追記規約: 既存 lid は segment 間を移動しない**(active の in-place
// 上書き or 新規 lid の追加のみ)— segment 書きと core(索引)書きは
// 別 bucket で非原子のため、中断しても旧索引が指す位置に本文が残る。
function segBodyPrefix(cid: string): string {
  return `${cid}:body:`;
}
function segBodyKey(cid: string, seq: number): string {
  return `${segBodyPrefix(cid)}${String(seq).padStart(6, '0')}`;
}

/** revisions を ~1MB(非圧縮 JSON)のチャンク列に詰める。 */
export function chunkRevisionsForSegments(revs: readonly Revision[]): string[] {
  const chunks: string[] = [];
  let cur: Revision[] = [];
  let curSize = 2;
  for (const r of revs) {
    const s = JSON.stringify(r).length;
    if (cur.length > 0 && curSize + s > SEG_TARGET_BYTES) {
      chunks.push(JSON.stringify(cur));
      cur = [];
      curSize = 2;
    }
    cur.push(r);
    curSize += s + 1;
  }
  if (cur.length > 0) chunks.push(JSON.stringify(cur));
  return chunks;
}

async function gzipSegment(json: string): Promise<Blob | string> {
  if (typeof CompressionStream === 'undefined') return json;
  try {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  } catch {
    return json;
  }
}

async function gunzipSegment(value: unknown): Promise<string | null> {
  if (typeof value === 'string') return value;
  if (value instanceof Blob) {
    try {
      const stream = value.stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).text();
    } catch {
      return null;
    }
  }
  return null;
}

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
/** relations サイドカー(cid ごとに 1 record)。 */
function relKey(cid: string): string {
  return `${REL_PREFIX}${cid}`;
}
function relPrefix(cid: string): string {
  return `${REL_PREFIX}${cid}`;
}
/** 順序リストのチャンク key。`kind` = 'rev' | 'entry'。seq は 6 桁 0 埋め(key 順 = seq 順)。 */
function orderKey(cid: string, kind: 'rev' | 'entry', seq: number): string {
  return `${ORDER_PREFIX}${cid}:${kind}:${String(seq).padStart(6, '0')}`;
}
function orderPrefix(cid: string, kind?: 'rev' | 'entry'): string {
  return kind ? `${ORDER_PREFIX}${cid}:${kind}:` : `${ORDER_PREFIX}${cid}:`;
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
  const segments = adapter.bucket('segments');

  // P2-2(#967): revisions セグメントの再構築(全件)/ 末尾追記。
  // segments は containers と別 bucket のため別 batch(非原子)だが、
  // 正本は core record の marker.revOrder — 中断で余った stray rev は
  // 読み側で末尾に付き、次回保存で収束する(v1 split と同じ設計)。
  async function rebuildRevSegments(cid: string, revs: readonly Revision[]): Promise<void> {
    const chunks = chunkRevisionsForSegments(revs);
    const ops: BatchOp[] = [];
    for (let i = 0; i < chunks.length; i++) {
      ops.push({ kind: 'put', key: segRevKey(cid, i), value: await gzipSegment(chunks[i]!) });
    }
    const live = new Set(ops.map((o) => o.key));
    for (const k of await segments.getKeysByPrefix(segRevPrefix(cid))) {
      if (!live.has(k)) ops.push({ kind: 'delete', key: k });
    }
    await segments.applyBatch(ops);
  }

  async function appendRevSegments(cid: string, added: readonly Revision[]): Promise<void> {
    const keys = [...(await segments.getKeysByPrefix(segRevPrefix(cid)))].sort();
    let baseSeq = keys.length;
    let tail: Revision[] = [];
    if (keys.length > 0) {
      // active(最終)segment を読み戻して合流 — 封印分は触らない
      const lastKey = keys[keys.length - 1]!;
      const json = await gunzipSegment(await segments.get(lastKey));
      if (json) {
        try {
          tail = JSON.parse(json) as Revision[];
          baseSeq = keys.length - 1;
        } catch {
          // 壊れた active は読み捨て、**上書きせずに**新しい seq へ逃がす
          // (baseSeq は keys.length のまま)。バイトは残るので、後から
          // 手当てする余地が消えない。
        }
      }
      // ⚠ `json` が null(= gunzip 失敗)のときも **上書きしない**(2026-07-26)。
      //
      // ここは以前 `baseSeq = keys.length - 1` に下げていた。`tail` は空のままなので、
      // **その active pack に入っていた revision が全部消える**。
      // `gunzipSegment` は例外を握って null を返す(:390-399)ので、この失敗は
      // データ破損とは限らず **一過性**(メモリ不足 / stream 中断)でも起きる。
      // バイト自体は無事なのに、上書きすると確実に失う側へ倒れてしまう。
      //
      // JSON.parse 失敗側(上の catch)は最初から非破壊だった。同じ扱いに揃える。
      // 読み側 `loadRevSegments`(:652-664)は読めない segment を skip し、
      // 重複 id は Map で潰れるので、残置しても復元結果は壊れない。
      // regression test: tests/adapter/idb-store-rev-segment-decode-failure.test.ts
    }
    const chunks = chunkRevisionsForSegments([...tail, ...added]);
    const ops: BatchOp[] = [];
    for (let i = 0; i < chunks.length; i++) {
      ops.push({ kind: 'put', key: segRevKey(cid, baseSeq + i), value: await gzipSegment(chunks[i]!) });
    }
    await segments.applyBatch(ops);
  }

  // ── P2-3(#967): bodies プレーン(layout 5)──

  async function loadBodyPack(cid: string, seq: number): Promise<Record<string, string>> {
    const json = await gunzipSegment(await segments.get(segBodyKey(cid, seq)));
    if (!json) return {};
    try {
      const o = JSON.parse(json) as Record<string, string>;
      return o && typeof o === 'object' ? o : {};
    } catch {
      return {};
    }
  }

  /** 索引が指す segment 群から本文を読む(lids 指定で部分読み)。 */
  async function loadBodySegmentsFor(
    cid: string,
    index: Record<string, number>,
    lids?: readonly string[],
  ): Promise<Record<string, string>> {
    const wantedLids = lids ?? Object.keys(index);
    const bySeq = new Map<number, string[]>();
    for (const lid of wantedLids) {
      const seq = index[lid];
      if (typeof seq !== 'number') continue;
      const list = bySeq.get(seq) ?? [];
      list.push(lid);
      bySeq.set(seq, list);
    }
    const out: Record<string, string> = {};
    await Promise.all([...bySeq.entries()].map(async ([seq, seqLids]) => {
      const pack = await loadBodyPack(cid, seq);
      for (const lid of seqLids) {
        const v = pack[lid];
        if (typeof v === 'string') out[lid] = v;
      }
    }));
    return out;
  }

  /** 全再構築: bodies を ~1MB パック列に詰め直し、索引を返す。 */
  async function rebuildBodySegments(
    cid: string,
    bodies: Record<string, string>,
  ): Promise<Record<string, number>> {
    const index: Record<string, number> = {};
    const ops: BatchOp[] = [];
    let pack: Record<string, string> = {};
    let packSize = 2;
    let seq = 0;
    const flush = async (): Promise<void> => {
      if (Object.keys(pack).length === 0) return;
      ops.push({ kind: 'put', key: segBodyKey(cid, seq), value: await gzipSegment(JSON.stringify(pack)) });
      seq += 1;
      pack = {};
      packSize = 2;
    };
    for (const [lid, body] of Object.entries(bodies)) {
      const s2 = lid.length + body.length + 8;
      if (packSize > 2 && packSize + s2 > SEG_TARGET_BYTES) await flush();
      pack[lid] = body;
      packSize += s2;
      index[lid] = seq;
    }
    await flush();
    const live = new Set(ops.map((o) => o.key));
    for (const k of await segments.getKeysByPrefix(segBodyPrefix(cid))) {
      if (!live.has(k)) ops.push({ kind: 'delete', key: k });
    }
    await segments.applyBatch(ops);
    return index;
  }

  /**
   * 差分追記。**既存 lid は segment 間を移動しない**: active 内の lid は
   * in-place 上書き、新規は active に収まる分だけ載せ、あふれた分は
   * 新 segment へ。封印 segment は不変。deleted は索引から外すだけ
   * (旧コピーは compaction まで残る)。新しい索引を返す。
   */
  async function appendBodySegments(
    cid: string,
    updates: Record<string, string>,
    removedLids: readonly string[],
    prevIndex: Record<string, number>,
  ): Promise<Record<string, number>> {
    const index: Record<string, number> = { ...prevIndex };
    for (const lid of removedLids) delete index[lid];
    const keys = [...(await segments.getKeysByPrefix(segBodyPrefix(cid)))].sort();
    const activeSeq = keys.length > 0 ? keys.length - 1 : 0;
    const active = keys.length > 0 ? await loadBodyPack(cid, activeSeq) : {};
    let activeSize = 2;
    for (const [lid, b] of Object.entries(active)) activeSize += lid.length + b.length + 8;
    const overflow: Array<[string, string]> = [];
    let activeChanged = false;
    for (const [lid, body] of Object.entries(updates)) {
      const s2 = lid.length + body.length + 8;
      if (lid in active) {
        activeSize += body.length - active[lid]!.length;
        active[lid] = body;
        index[lid] = activeSeq;
        activeChanged = true;
      } else if (index[lid] !== undefined && index[lid] !== activeSeq) {
        // 封印 segment 内の既存 lid の更新: 移動させず新コピーを
        // active / 新 segment 側に積み、索引を付け替える(旧コピーは
        // ゴミとして残り compaction で回収)。
        if (activeSize + s2 <= SEG_TARGET_BYTES) {
          active[lid] = body;
          activeSize += s2;
          index[lid] = activeSeq;
          activeChanged = true;
        } else {
          overflow.push([lid, body]);
        }
      } else if (activeSize + s2 <= SEG_TARGET_BYTES) {
        active[lid] = body;
        activeSize += s2;
        index[lid] = activeSeq;
        activeChanged = true;
      } else {
        overflow.push([lid, body]);
      }
    }
    const ops: BatchOp[] = [];
    if (activeChanged || keys.length === 0) {
      ops.push({ kind: 'put', key: segBodyKey(cid, activeSeq), value: await gzipSegment(JSON.stringify(active)) });
    }
    let seq = activeSeq + 1;
    let pack: Record<string, string> = {};
    let packSize = 2;
    for (const [lid, body] of overflow) {
      const s2 = lid.length + body.length + 8;
      if (packSize > 2 && packSize + s2 > SEG_TARGET_BYTES) {
        ops.push({ kind: 'put', key: segBodyKey(cid, seq), value: await gzipSegment(JSON.stringify(pack)) });
        seq += 1;
        pack = {};
        packSize = 2;
      }
      pack[lid] = body;
      packSize += s2;
      index[lid] = seq;
    }
    if (Object.keys(pack).length > 0) {
      ops.push({ kind: 'put', key: segBodyKey(cid, seq), value: await gzipSegment(JSON.stringify(pack)) });
    }
    if (ops.length > 0) await segments.applyBatch(ops);
    return index;
  }

  async function loadRevSegments(cid: string): Promise<Revision[]> {
    const pairs = [...(await segments.getAllByPrefix(segRevPrefix(cid)))]
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const out: Revision[] = [];
    for (const { value } of pairs) {
      const json = await gunzipSegment(value);
      if (!json) continue;
      try {
        out.push(...(JSON.parse(json) as Revision[]));
      } catch { /* 壊れた segment は skip(revOrder に無い分は欠落) */ }
    }
    return out;
  }

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

  /**
   * layout 5 → 従来形式へ収束したあとの segments 回収(2026-07-25)。
   *
   * 従来は `save()` / `saveDiff()` の掃除がどちらも `containers` bucket の
   * prefix しか見ておらず、本文・履歴の実体である gzip Blob が
   * **コンテナ削除まで回収されなかった**(診察 doc §6)。正しさは壊れない
   * (layout 1 の load は segments を見ない)が、「OFF 保存で従来形式へ
   * 自動復元される(双方向に安全)」と謳う以上、片道分のゴミが残るのは穴。
   *
   * ⚠ 呼ぶのは **core record を書いた後** に限る。segments は収束が完了する
   *   まで本文の唯一の実体なので、先に消すと「本文が空で焼き付いた」ときの
   *   復旧手段が消える。加えて、pending(未 hydrate)な本文が 1 つでも
   *   あれば **消さない** — その container は本文を実体で持っていないので、
   *   書き戻した core record 自体が空である可能性がある。
   */
  async function dropSegments(cid: string, container: Container): Promise<void> {
    if (container.entries.some((e) => bodyPending(cid, e.lid))) return;
    const keys = [
      ...(await segments.getKeysByPrefix(segRevPrefix(cid))),
      ...(await segments.getKeysByPrefix(segBodyPrefix(cid))),
    ];
    if (keys.length > 0) {
      await segments.applyBatch(keys.map((key) => ({ kind: 'delete' as const, key })));
    }
  }

  async function save(container: Container): Promise<void> {
    const cid = container.meta.container_id;
    await putAssets(container);

    // 🔴 未 hydrate の本文を **空のまま inline へ焼かない**(2026-07-26)。
    //
    // `save()` には `bodyPending` guard が 1 つも無かった(`saveDiff` にはある)。
    // lazy layout から従来形式へ戻す経路はここを通るので、本文が未読のまま
    // 走ると `entries[].body === ''` が **正本として書き込まれ**、直後の
    // `dropSegments`(下)が本文の実体である segments を消す ── 復旧手段ごと
    // 失われる。唯一の防御は `persistence.ts` の `bodiesPending` チェックだけで、
    // その pending フラグは読み失敗時にも外れる(body-working-set)。
    //
    // 退役 flag の「戻し道」は全 user が通る経路になるので、ここを塞ぐ。
    // 方針は **保守的**: 未読の本文が 1 つでも復元できないなら、
    // **inline へ書き戻さずに現状のまま残す**。layout 5 のままでいる方が、
    // 空で焼き付くより常に安全。
    const pendingLids = container.entries
      .filter((e) => bodyPending(cid, e.lid))
      .map((e) => e.lid);
    let toWrite = container;
    if (pendingLids.length > 0) {
      const restored = await loadBodiesFor(cid, pendingLids);
      const missing = pendingLids.filter((lid) => typeof restored[lid] !== 'string');
      if (missing.length > 0) {
        console.warn(
          `[PKC2] save(): ${missing.length} 件の本文を復元できないため inline 変換を中止しました`
            + '(storage は現状のまま。次の保存で再試行されます)',
        );
        return;
      }
      toWrite = {
        ...container,
        entries: container.entries.map((e) =>
          restored[e.lid] !== undefined ? { ...e, body: restored[e.lid]! } : e,
        ),
      };
    }

    // Container record sans assets — the assets bucket owns those.
    const stripped: Container = { ...toWrite, assets: {} };
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
        // 2026-07-26: relations サイドカー。**これを消し忘れると、
        // inline へ戻したのに古い relations が正本として読まれ続ける**
        // (読み側は record の有無で正本を決めるため)。
        ...(await containers.getKeysByPrefix(relPrefix(cid))),
        // 順序リストのサイドカーも同様(残っていると古い順序が正本として読まれる)。
        ...(await containers.getKeysByPrefix(orderPrefix(cid))),
      ];
      if (stale.length > 0) {
        await containers.applyBatch(stale.map((key) => ({ kind: 'delete' as const, key })));
      }
      // layout 5 から戻ってきた場合、本文・履歴の実体は segments 側に残る。
      // inline record が正になった **後** なので、ここで回収してよい。
      await dropSegments(cid, toWrite);
      splitState.set(cid, false);
      layoutState.set(cid, 1);
    }
  }

  async function saveDiff(container: Container, previous: Container | null): Promise<void> {
    // FS 系 backend(ローカルフォルダ / OPFS)では split 形式を使わない。
    // 1 record = 1 ファイルで per-file コストが大きく、数千 entry の
    // 全件書込みが分単位・以後の boot も数千ファイル open になり、
    // R6(差分保存既定 ON)の実機で「初期化がとてつもなく遅い」を
    // 引き起こした。inline save は split keys を掃除して収束するので、
    // すでに split 化された folder も次の保存で単一ファイルへ自動復元。
    if (adapter.slowPerRecordIO) {
      await save(container);
      return;
    }
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
    const l = rec?.__pkc_layout__;
    const layout = l === 5 ? 5 : l === 4 ? 4 : l === 3 ? 3 : l === 2 ? 2 : 1;
    // #940 案 A 段階1: v2 = meta(body 空)+ __body__ record 分離。
    // P2-1(#967、storage v3): v3 = **meta 単一小レコード** — body なし
    // entries を core record に inline で持ち、per-entry record を廃止。
    // 本文は v2 と同じ `__body__:` 分離、revisions は `__rev__:` 分離の
    // まま(セグメントログ化は P2-2)。cold の meta 読みが
    // 「core 1 get + rev 1 range scan」になり、entry 数 N に比例する
    // per-record get が消える(doc §6 / A.6)。lazyBodies の新規保存は
    // v3 を書き、既存 v2 は次回保存の全件書込みで v3 へ収束する。
    // diff base は「storage の layout が目標 layout と一致」する時だけ有効
    // ── layout をまたぐ差分は混在 state(body の無い meta が正に見える)
    // を作るため、必ず全件書込みで切り替える。
    const wantSplitBodies = lazyBodies();
    // P2-2: v4 = v3 + revisions を segments bucket の gzip パックへ。
    // P2-3: v5 = v4 + bodies も segments へ(__body__ per-record 廃止、
    // 索引 __pkc_bodyseg__ で部分 hydrate を維持)。
    const targetLayout = wantSplitBodies ? 5 : 1;
    const base = isSplit && layout === targetLayout
      && previous && previous.meta.container_id === cid ? previous : null;

    const ops: BatchOp[] = [];
    const deletes: BatchOp[] = [];
    // v3: entries は core record に inline のため per-entry record を
    // 書かない。v1(split)のみ従来どおりフル entry を per-record に書く。
    const entryPut = (e: Entry): void => {
      if (!wantSplitBodies) {
        ops.push({ kind: 'put', key: splitEntryKey(cid, e.lid), value: e });
      }
    };
    // P2-3: v5 の本文索引(core record に載せる)。
    let bodySegIndex: Record<string, number> | undefined;
    if (base) {
      // 参照比較の差分:reducer は immutable update(未変更 entry /
      // revision はオブジェクト参照を保つ)なので、参照が変わったものが
      // 変更点。参照が全部変わる最悪ケースでも全件書込みに退化するだけ
      // (正しさは変わらない)。
      const prevEntries = new Map(base.entries.map((e) => [e.lid, e]));
      const bodyUpdates: Record<string, string> = {};
      for (const e of container.entries) {
        const prev = prevEntries.get(e.lid);
        if (prev !== e) {
          entryPut(e);
          // v5: body は変わった時だけ segment へ追記(title 等 meta だけの
          // 変更で本文を再書込しない)。新規 entry(prev 無し)は必ず書く。
          // 段階3: 未 hydrate entry の '' を書かない(防御の二重化)。
          if (wantSplitBodies && (!prev || prev.body !== e.body)
              && !bodyPending(cid, e.lid)) {
            bodyUpdates[e.lid] = e.body;
          }
        }
        prevEntries.delete(e.lid);
      }
      const removedLids = [...prevEntries.keys()];
      if (!wantSplitBodies) {
        for (const lid of removedLids) deletes.push({ kind: 'delete', key: splitEntryKey(cid, lid) });
      }
      if (wantSplitBodies) {
        const prevIndex = rec?.__pkc_bodyseg__ ?? {};
        // compaction: ゴミ(索引が参照しない segment 過多)なら全再構築。
        const segKeys = await segments.getKeysByPrefix(segBodyPrefix(cid));
        const referenced = new Set(Object.values(prevIndex)).size;
        if (segKeys.length > referenced * 2 + 4) {
          const stored = await loadBodySegmentsFor(cid, prevIndex);
          const bodies: Record<string, string> = {};
          for (const e of container.entries) {
            bodies[e.lid] = bodyPending(cid, e.lid) ? (stored[e.lid] ?? '') : e.body;
          }
          bodySegIndex = await rebuildBodySegments(cid, bodies);
        } else {
          bodySegIndex = await appendBodySegments(cid, bodyUpdates, removedLids, prevIndex);
        }
      }
      if (wantSplitBodies) {
        // v4: revision は immutable snapshot — 追加は active segment へ
        // 追記、削除(prune)は全再構築。同 id の参照差し替えは snapshot
        // 不変の前提で無視する。
        const prevRevIds = new Set(base.revisions.map((r) => r.id));
        const addedRevs: Revision[] = [];
        for (const r of container.revisions) {
          if (!prevRevIds.has(r.id)) addedRevs.push(r);
          prevRevIds.delete(r.id);
        }
        if (prevRevIds.size > 0) await rebuildRevSegments(cid, container.revisions);
        else if (addedRevs.length > 0) await appendRevSegments(cid, addedRevs);
      } else {
        const prevRevs = new Map(base.revisions.map((r) => [r.id, r]));
        for (const r of container.revisions) {
          if (prevRevs.get(r.id) !== r) ops.push({ kind: 'put', key: splitRevKey(cid, r.id), value: r });
          prevRevs.delete(r.id);
        }
        for (const id of prevRevs.keys()) deletes.push({ kind: 'delete', key: splitRevKey(cid, id) });
      }
    } else {
      // 全件書込み + stale key 掃除。assets と違い entries / revisions は
      // メモリ上で常に完全な集合なので diff-delete は安全(段階2 の
      // additive-only 制約は assets 固有)。layout 切替(v1↔v2)も必ず
      // この経路を通り、非対象 layout の残骸 key も併せて掃除される。
      for (const e of container.entries) entryPut(e);
      if (wantSplitBodies) {
        // v5 全再構築。pending(未 hydrate)の本文は storage の既存値を
        // 温存する — 旧 layout(v2/v3/v4 の __body__ record)からの移行も
        // ここで読み取って引き継ぐ。
        const stored: Record<string, string> = {};
        if (layout === 5 && rec?.__pkc_bodyseg__) {
          Object.assign(stored, await loadBodySegmentsFor(cid, rec.__pkc_bodyseg__));
        } else {
          for (const { key, value } of await containers.getAllByPrefix(bodyPrefix(cid))) {
            if (typeof value === 'string') stored[key.slice(bodyPrefix(cid).length)] = value;
          }
        }
        const bodies: Record<string, string> = {};
        for (const e of container.entries) {
          bodies[e.lid] = bodyPending(cid, e.lid) ? (stored[e.lid] ?? '') : e.body;
        }
        bodySegIndex = await rebuildBodySegments(cid, bodies);
      }
      if (wantSplitBodies) {
        // v4: revisions は segments へ全再構築(__rev__ record は live に
        // 載らないため下の stale 掃除で消える = v1/v3 からの自動移行)。
        await rebuildRevSegments(cid, container.revisions);
      } else {
        for (const r of container.revisions) ops.push({ kind: 'put', key: splitRevKey(cid, r.id), value: r });
      }
      const live = new Set(ops.map((o) => o.key));
      // v5: 本文は segments 側に再構築済み — __body__ record は live に
      // 載らないため下の掃除で全て消える(旧 layout からの自動移行)。
      for (const k of await containers.getKeysByPrefix(splitEntryPrefix(cid))) {
        if (!live.has(k)) deletes.push({ kind: 'delete', key: k });
      }
      for (const k of await containers.getKeysByPrefix(splitRevPrefix(cid))) {
        if (!live.has(k)) deletes.push({ kind: 'delete', key: k });
      }
      for (const k of await containers.getKeysByPrefix(bodyPrefix(cid))) {
        if (!live.has(k)) deletes.push({ kind: 'delete', key: k });
      }
      // relations サイドカーは下で必ず put する(base 無し = 全件書込み)ので
      // live に載る。ここでは掃除対象にしない。
    }

    /**
     * 順序リストのチャンク書き出し(2026-07-26)。
     *
     * `prevLen` までが不変(= 追記のみ)と分かっているときは、
     * その位置を含むチャンクから末尾までだけを書く。それ以外(prune / 並べ替え /
     * base 無し)は全チャンクを書き直す ── **正しさを優先し、速いのは追記の常道だけ**。
     * 余ったチャンク(件数が減った場合)は必ず消す。
     */
    const writeOrder = async (
      kind: 'rev' | 'entry',
      ids: string[],
      prevLen: number | null,
    ): Promise<void> => {
      const chunkCount = Math.ceil(ids.length / ORDER_CHUNK);
      const from = prevLen === null ? 0 : Math.floor(prevLen / ORDER_CHUNK);
      for (let i = from; i < chunkCount; i++) {
        ops.push({
          kind: 'put',
          key: orderKey(cid, kind, i),
          value: ids.slice(i * ORDER_CHUNK, (i + 1) * ORDER_CHUNK),
        });
      }
      // 件数が減った / 形式が変わった分の余りチャンクを掃除
      for (const k of await containers.getKeysByPrefix(orderPrefix(cid, kind))) {
        const seq = Number(k.slice(orderPrefix(cid, kind).length));
        if (!Number.isFinite(seq) || seq >= chunkCount) deletes.push({ kind: 'delete', key: k });
      }
    };

    // revOrder: 追記のみと確認できたときは末尾チャンクだけ書く。
    // 判定は「件数が減っていない」かつ「旧末尾の id が同じ位置にある」。
    const revIds = container.revisions.map((r) => r.id);
    const prevRevLen = base && base.revisions.length <= revIds.length
      && (base.revisions.length === 0
        || base.revisions[base.revisions.length - 1]?.id === revIds[base.revisions.length - 1])
      ? base.revisions.length
      : null;
    await writeOrder('rev', revIds, prevRevLen);

    // entryOrder は entry の増減時しか変わらない(split v1 のみ使う)。
    // layout 5 では空なので、空を 1 チャンクも書かずに済むよう分岐する。
    const entryIds = wantSplitBodies ? [] : container.entries.map((e) => e.lid);
    const prevEntryIds = base && !wantSplitBodies ? base.entries.map((e) => e.lid) : null;
    const entryOrderSame = prevEntryIds !== null
      && prevEntryIds.length === entryIds.length
      && prevEntryIds.every((v, i) => v === entryIds[i]);
    if (!entryOrderSame) await writeOrder('entry', entryIds, null);

    // relations サイドカー(2026-07-26): **変わったときだけ**書く。
    // Container は immutable 更新なので参照比較で十分(entries / revisions の
    // 差分判定と同じ idiom)。base が無い = 全件書込み経路では必ず書く。
    //
    // これで本文 1 文字の編集から relations 全件書き(実測 442 KB)が消える。
    if (!base || base.relations !== container.relations) {
      ops.push({ kind: 'put', key: relKey(cid), value: container.relations });
    }

    // 順序リストは上のサイドカー(__order__:)が正本。core の marker は空にする。
    // 読み側はサイドカーが 1 つも無ければ marker の inline へ fallback するので、
    // 旧データ(marker に実体が入っている)とそのまま両立する。
    const marker: SplitMarker = { entryOrder: [], revOrder: [] };
    const core: StoredContainerRecord = {
      ...container,
      // v3: body なし entries を core に inline(meta 単一小レコード)。
      entries: wantSplitBodies
        ? container.entries.map((e) => (e.body === '' ? e : { ...e, body: '' }))
        : [],
      revisions: [],
      // relations は上のサイドカー record が正本。core からは外す
      // (読み側は record が無ければ inline へ fallback するので旧データと両立)。
      relations: [],
      assets: {},
      __pkc_split__: marker,
      ...(wantSplitBodies ? { __pkc_layout__: 5, __pkc_bodyseg__: bodySegIndex ?? {} } : {}),
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
    // targetLayout 1 へ収束したときは segments が不要になる。containers の
    // batch が commit した **後** に回収する(segments は別 bucket = 別 tx なので、
    // 同じ batch に混ぜられない。先に消すと本文の唯一の実体を失う)。
    if (!wantSplitBodies) await dropSegments(cid, container);
    splitState.set(cid, true);
    layoutState.set(cid, targetLayout);
  }

  /**
   * split 形式の record なら per-entry / per-revision record を読んで
   * 配列を復元する。inline(legacy)record はそのまま返す。順序は
   * marker の順序リストが正本。リストに無い stray record(全件書込みの
   * 中断で残った余り)は末尾に付ける — 消すより安全側。
   */
  /**
   * relations の合流(2026-07-26)。サイドカー record があればそれが正本、
   * 無ければ core の inline(旧データ)。**形式フラグを増やさずに両立させる**
   * ため、record の有無そのものを判定に使う。
   *
   * ⚠ したがって inline へ復帰する経路(`save()`)では、このサイドカーを
   *   必ず消さなければならない ── 残っていると古い relations が
   *   正しい inline を上書きして見える。
   */
  /**
   * 順序リストの合流(2026-07-26)。チャンクを seq 順に連結する。
   * 1 つも無ければ marker の inline(旧データ)へ fallback。
   */
  async function mergeOrder(
    cid: string,
    kind: 'rev' | 'entry',
    fallback: string[],
  ): Promise<string[]> {
    const pairs = [...(await containers.getAllByPrefix(orderPrefix(cid, kind)))]
      .sort((a, b) => a.key.localeCompare(b.key));
    if (pairs.length === 0) return fallback;
    const out: string[] = [];
    for (const { value } of pairs) if (Array.isArray(value)) out.push(...(value as string[]));
    return out;
  }

  async function mergeRelations(
    cid: string,
    fallback: Container['relations'],
  ): Promise<Container['relations']> {
    const sidecar = await containers.get(relKey(cid));
    return Array.isArray(sidecar) ? (sidecar as Container['relations']) : fallback;
  }

  async function reassembleSplit(
    cid: string,
    record: StoredContainerRecord,
    opts2?: { skipBodies?: boolean },
  ): Promise<Container> {
    const marker = record.__pkc_split__;
    if (!marker) return record;
    // P2-1(#967): v3 = entries が core record に inline(body なし)。
    // per-entry record を読まない — rev 1 range scan(+ 必要なら body
    // 1 range scan)だけで復元できる。
    if (record.__pkc_layout__ === 3 || record.__pkc_layout__ === 4 || record.__pkc_layout__ === 5) {
      const lay = record.__pkc_layout__;
      layoutState.set(cid, lay);
      // v3: revisions は __rev__ record。v4/v5: segments の gzip パック。
      // 本文は v3/v4 = __body__ record、v5 = segments(索引参照)。
      const [revPairs3, bodyPairs3, segBodies] = await Promise.all([
        lay >= 4
          ? Promise.resolve([] as Array<{ key: string; value: unknown }>)
          : containers.getAllByPrefix(splitRevPrefix(cid)),
        opts2?.skipBodies || lay === 5
          ? Promise.resolve([] as Array<{ key: string; value: unknown }>)
          : containers.getAllByPrefix(bodyPrefix(cid)),
        !opts2?.skipBodies && lay === 5
          ? loadBodySegmentsFor(cid, record.__pkc_bodyseg__ ?? {})
          : Promise.resolve({} as Record<string, string>),
      ]);
      const bodyByLid3 = new Map<string, string>();
      for (const { key, value } of bodyPairs3) {
        if (typeof value === 'string') bodyByLid3.set(key.slice(bodyPrefix(cid).length), value);
      }
      for (const [lid, body] of Object.entries(segBodies)) bodyByLid3.set(lid, body);
      const entries3 = opts2?.skipBodies
        ? record.entries
        : record.entries.map((e) => {
          const body = bodyByLid3.get(e.lid);
          return body === undefined || body === e.body ? e : { ...e, body };
        });
      const revById3 = new Map<string, Revision>();
      if (lay >= 4) {
        for (const r of await loadRevSegments(cid)) revById3.set(r.id, r);
      } else {
        for (const { key, value } of revPairs3) {
          revById3.set(key.slice(splitRevPrefix(cid).length), value as Revision);
        }
      }
      const revisions3: Revision[] = [];
      for (const id of await mergeOrder(cid, 'rev', marker.revOrder)) {
        const r = revById3.get(id);
        if (r) {
          revisions3.push(r);
          revById3.delete(id);
        }
      }
      for (const r of revById3.values()) revisions3.push(r);
      const { __pkc_split__: _m3, __pkc_layout__: _l3, __pkc_bodyseg__: _b3, ...rest3 } = record;
      return {
        ...rest3,
        entries: entries3,
        revisions: revisions3,
        relations: await mergeRelations(cid, rest3.relations ?? []),
        assets: {},
      };
    }
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
    for (const lid of await mergeOrder(cid, 'entry', marker.entryOrder)) {
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
    for (const id of await mergeOrder(cid, 'rev', marker.revOrder)) {
      const r = revById.get(id);
      if (r) {
        revisions.push(r);
        revById.delete(id);
      }
    }
    for (const r of revById.values()) revisions.push(r);
    const { __pkc_split__: _m, __pkc_layout__: _l, ...rest } = record;
    return {
      ...rest,
      entries,
      revisions,
      relations: await mergeRelations(cid, rest.relations ?? []),
      assets: {},
    };
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
      } else if (value instanceof Blob) {
        // P1 slice 1(#967): Blob record との両読み。base64 の
        // `container.assets` 契約が残る間の互換変換(後続 slice で
        // 呼び出し面ごと Blob / ObjectURL へ移行し、この変換は消える)。
        reassembled[assetKey] = await blobToBase64(value);
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
  async function loadDefaultMetaShallow(): Promise<{
    container: Container | null;
    bodiesDeferred: boolean;
    storedInline: boolean;
  }> {
    const defaultId = await containers.get(DEFAULT_KEY);
    if (typeof defaultId !== 'string') {
      return { container: null, bodiesDeferred: false, storedInline: false };
    }
    const record = await containers.get(defaultId);
    if (!record) return { container: null, bodiesDeferred: false, storedInline: false };
    const rec = record as StoredContainerRecord;
    // v2 / v3 とも本文は `__body__:` 分離 — meta-first boot が成立する。
    const bodiesSplit = rec.__pkc_layout__ !== undefined && rec.__pkc_layout__ >= 2;
    // 「読んだそのままを書き戻しても storage が 1 バイトも変わらない」形式か。
    // ⚠ `bodiesDeferred === false` では代用できない ── split v1 は
    //   `__pkc_layout__` を持たず(= layout 1 扱い)bodiesDeferred も false だが、
    //   `__pkc_split__` marker を持つので inline ではない。ここを取り違えると、
    //   flag を OFF に戻したときの「次の保存で inline へ書き戻る」安全弁
    //   (idb-store.ts の flag doc / differential-default-cross-mode.test.ts が pin)
    //   が働かなくなる。
    const storedInline = rec.__pkc_split__ === undefined && rec.__pkc_layout__ === undefined;
    const assembled = await reassembleSplit(defaultId, rec, { skipBodies: true });
    return { container: { ...assembled, assets: {} }, bodiesDeferred: bodiesSplit, storedInline };
  }

  // P2-3: v5 は本文が segments 側。core の索引を見て経路を選ぶ
  // (旧 layout の __body__ record は従来経路 — 両読み)。
  async function bodySegIndexOf(containerId: string): Promise<Record<string, number> | null> {
    const rec = (await containers.get(containerId)) as StoredContainerRecord | undefined;
    if (rec?.__pkc_layout__ === 5) return rec.__pkc_bodyseg__ ?? {};
    return null;
  }

  async function loadBodiesFor(
    containerId: string,
    lids: readonly string[],
  ): Promise<Record<string, string>> {
    const index = await bodySegIndexOf(containerId);
    if (index) {
      // 部分 hydrate: 必要な lid が入っている segment だけを読む
      return loadBodySegmentsFor(containerId, index, lids);
    }
    const out: Record<string, string> = {};
    await Promise.all(lids.map(async (lid) => {
      const v = await containers.get(bodyKey(containerId, lid));
      if (typeof v === 'string') out[lid] = v;
    }));
    return out;
  }

  async function loadBodies(containerId: string): Promise<Record<string, string>> {
    const index = await bodySegIndexOf(containerId);
    if (index) return loadBodySegmentsFor(containerId, index);
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
      // 2026-07-26: relations サイドカーもコンテナ削除で回収する
      // (segments 孤児と同じ穴を新設しないため)。
      ...(await containers.getKeysByPrefix(relPrefix(containerId))),
      ...(await containers.getKeysByPrefix(orderPrefix(containerId))),
    ];
    // P2-2/P2-3: v4/v5 の revision / body segments も一緒に消す
    const segKeys = [
      ...(await segments.getKeysByPrefix(segRevPrefix(containerId))),
      ...(await segments.getKeysByPrefix(segBodyPrefix(containerId))),
    ];
    if (segKeys.length > 0) {
      await segments.applyBatch(segKeys.map((key) => ({ kind: 'delete', key })));
    }
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
    if (typeof result === 'string') {
      persistedSetFor(cid).add(key); // #938 R1: 読めた = persist 済み
      return result;
    }
    // P1 slice 1(#967): Blob record との両読み(旧呼び出し面の互換)。
    if (result instanceof Blob) {
      persistedSetFor(cid).add(key);
      return blobToBase64(result);
    }
    return null;
  }

  // ── P1 slice 1(#967): Blob asset CRUD ──
  const blobCapable = adapter.supportsBlobValues === true;

  async function saveAssetBlob(cid: string, key: string, data: Blob): Promise<void> {
    if (blobCapable) {
      await assets.put(assetFullKey(cid, key), data);
    } else {
      // FS 系: 値は JSON 文字列契約なので base64 へ変換して書く
      await assets.put(assetFullKey(cid, key), await blobToBase64(data));
    }
    persistedSetFor(cid).add(key); // #938 R1
  }

  async function loadAssetBlob(cid: string, key: string): Promise<Blob | null> {
    const result = await assets.get(assetFullKey(cid, key));
    if (result instanceof Blob) {
      persistedSetFor(cid).add(key);
      return result;
    }
    if (typeof result === 'string') {
      persistedSetFor(cid).add(key);
      return base64ToBlob(result);
    }
    return null;
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
    await Promise.all([containers.clear(), assets.clear(), segments.clear()]);
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
        key.startsWith(SPLIT_REV_PREFIX) ||
        // layout v2 の body record。除外漏れだと一覧のたびに全 body 値を
        // 読んでしまう(keys-only scan が避けたかった boot 相当コスト)。
        // 一覧自体は meta チェックで壊れないが、性能退行になる。
        key.startsWith(BODY_PREFIX)
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
    saveAssetBlob,
    loadAssetBlob,
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
 * #962: export が持ち出すべき asset key の列(referenced ∪ resident)。
 * `hydrateReferencedAssets` + resident merge と同じ選定規則。順序は
 * referenced(collect 順)→ 追加の resident。
 */
export function collectExportAssetKeys(container: Container): string[] {
  const keys = [...collectReferencedAssetKeys(container)];
  const seen = new Set(keys);
  for (const key of Object.keys(container.assets)) {
    if (!seen.has(key)) keys.push(key);
  }
  return keys;
}

/**
 * #962: export 用の per-asset 読み出し(resident 優先 → 登録済 store)。
 * `hydrateReferencedAssets` が全 bytes を 1 つの Record に同時保持するのに
 * 対し、こちらは 1 件ずつ返す ── 数 GB 級 container の export で全 asset を
 * ヒープに並べず、呼び出し側が streaming で処理できるようにする。
 * 読めない key は null(参照は従来どおり broken のまま)。
 */
export async function loadExportAsset(
  container: Container,
  key: string,
): Promise<string | null> {
  const resident = container.assets[key];
  if (resident != null) return resident;
  return loadAssetDirect(container.meta.container_id, key);
}

/**
 * #962: export 前の pending body 復元だけを行う(asset には触れない)。
 * `hydrateForExport` の body barrier 部分の単体版 ── streaming export は
 * asset を per-key で読むため、全 asset hydrate を伴わない形が必要。
 */
export async function hydratePendingBodiesForExport(container: Container): Promise<Container> {
  if (!activeExportStore) return container;
  const cid = container.meta.container_id;
  const pendingLids = container.entries
    .filter((e) => isBodyPendingGlobal(cid, e.lid))
    .map((e) => e.lid);
  if (pendingLids.length === 0) return container;
  const bodies = await activeExportStore.loadBodiesFor(cid, pendingLids);
  return {
    ...container,
    entries: container.entries.map((e) =>
      bodies[e.lid] !== undefined ? { ...e, body: bodies[e.lid]! } : e,
    ),
  };
}

/**
 * #956: last-resort direct asset read via the registered store, bypassing
 * the working-set entirely. User gestures that must produce bytes on the
 * spot (open HTML app in new window / download) first try the working-set
 * hydrator; when that still leaves the key non-resident (refresh race,
 * budget eviction), this reads the bytes straight from the store so the
 * gesture never fails while the data actually exists. Returns null when
 * no store is registered or the bytes truly don't exist.
 */
export async function loadAssetDirect(cid: string, key: string): Promise<string | null> {
  if (!activeExportStore) return null;
  try {
    return await activeExportStore.loadAsset(cid, key);
  } catch {
    return null;
  }
}

/**
 * Hydrate a container's referenced assets via the registered export
 * store, for serialization paths (HTML / ZIP / entry-package). No-op
 * (returns the container unchanged) when no store is registered.
 */
export async function hydrateForExport(container: Container): Promise<Container> {
  if (!activeExportStore) return container;
  // #940 段階4: 未 hydrate の本文(body working-set の pending)を export 前に
  // 必ず復元する ── export 内容が lazy 化の影響を受けない barrier。
  //
  // ⚠ **本文を先に戻すこと。順序を逆にしてはいけない**(2026-07-26 hotfix)。
  // asset の参照源は **entry の body だけ**である(`features/asset/asset-scan.ts`:
  // attachment body の JSON `asset_key` / text・textlog body の `![](asset:K)`)。
  // lazy layout の meta-first boot 直後は全 entry の body が `''` なので、
  // 本文より先に `hydrateReferencedAssets` を呼ぶと **参照集合が空になり、
  // 添付を 1 件も含まない ZIP / HTML が出来る**(本文だけは後段で戻るため
  // 「本文はあるのに添付が全部無い」バックアップになり、気づきにくい)。
  // 移行前バックアップ ZIP もこの経路なので、**安全網そのものが壊れていた**。
  // regression test: tests/adapter/export-hydration-order.test.ts
  const withBodies = await hydratePendingBodiesForExport(container);
  const withAssets = await hydrateReferencedAssets(activeExportStore, withBodies);
  // P4a(wasm-sqlite §7-d): revisions が要求時読みのときは全量を戻してから
  // 直列化する ── #1023(export が部分 view を直列化して添付が欠けた)の
  // 轍を revisions で踏まないための barrier。asset 参照は revisions を
  // 読まない(asset-scan.ts)ので、bodies → assets の順序制約とは独立。
  return hydrateDeferredRevisionsForExport(withAssets);
}

/** P4a: deferred(sqlite)のときだけ全 revisions を store から戻す。 */
async function hydrateDeferredRevisionsForExport(container: Container): Promise<Container> {
  if (!activeExportStore?.loadAllRevisions) return container;
  const cid = container.meta.container_id;
  if (!isRevisionResidencyActive(cid)) return container;
  const all = await activeExportStore.loadAllRevisions(cid);
  // 常駐 set には boot 後の追記(まだ保存前かもしれない)が含まれうる ──
  // store 側に無い id は常駐側を残す(union、id 重複は store 側優先)。
  const ids = new Set(all.map((r) => r.id));
  const extras = container.revisions.filter((r) => !ids.has(r.id));
  return { ...container, revisions: extras.length ? [...all, ...extras] : all };
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
