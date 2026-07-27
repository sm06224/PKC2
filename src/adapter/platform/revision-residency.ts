/**
 * P4a(wasm-sqlite 設計 §7-d)── revisions の要求時読み(revision residency)。
 *
 * sqlite backend の deferred boot 後、`container.revisions` は**常駐 working
 * set**(ゴミ箱 subset + boot 後の追記 + hydrate 済み分)であり全量ではない。
 * 本 module がその残高を管理する:
 *
 *   - **件数**は sqlite の COUNT 索引(boot 時 1 クエリ)+ boot 後の追記数。
 *     全量が常駐したら(ensureAll 後)従来の導出(countEntryRevisions)へ戻る
 *   - **選択 entry の履歴**は `ensureEntry` で行読み → SYS_REVISIONS_HYDRATED
 *     merge(body-working-set と同じ需要駆動 pattern)
 *   - **全量が要る流れ**(export / import merge / ゴミ箱 purge)は
 *     `ensureAllRevisionsResident()` barrier を通す ── #1023(export が部分
 *     view を直列化して添付が欠けた)の轍を revisions で踏まないための構え
 *
 * 保存安全性(§7-d): 参照 diff の削除判定は「baseline にあって next に無い
 * key」だけなので、常駐が部分でも未読行が消えることは構造的に無い。
 * hydrate merge 後は `store.noteSyncedContainer` で diff 基準を進め、
 * hydrate した行が次の保存で再 upsert されるのを防ぐ。
 *
 * 追記の観測: dispatcher.dispatch は同期なので、onState で container 参照の
 * 変化を追い、revisions 配列の**末尾増分**を数える(reducer の追記は常に
 * `[...revisions, new]` 型)。自分の hydrate merge は同期 flag で除外する。
 */
import type { Container, Revision } from '../../core/model/container';
import { getRevisionCount } from '../../core/operations/container-ops';
import type { Dispatcher } from '../state/dispatcher';
import type { ContainerStore } from './idb-store';

export interface RevisionResidencyHandle {
  /** 指定 entry の履歴を常駐化(済みなら no-op)。 */
  ensureEntry(lid: string): Promise<void>;
  /** 全 revisions を常駐化(export / import / purge の barrier)。 */
  ensureAll(): Promise<void>;
  dispose(): void;
}

let active: RevisionResidencyHandle | null = null;
let activeCid: string | null = null;
let countsBase: Record<string, number> | null = null;
let appended: Map<string, number> = new Map();
let hydratedLids: Set<string> = new Set();
let fullyResident = false;

/** renderer / export 判定用: この cid で deferred 残高管理が生きているか。 */
export function isRevisionResidencyActive(cid: string): boolean {
  return active !== null && activeCid === cid && !fullyResident;
}

/**
 * entry の revision 件数(deferred 中は COUNT 索引 + 追記数、それ以外は導出)。
 * renderer の履歴 pane が「常駐分より多い総数」を表示するための唯一の窓口。
 */
export function revisionCountOf(container: Container, lid: string): number {
  if (!isRevisionResidencyActive(container.meta.container_id) || countsBase === null) {
    return getRevisionCount(container, lid);
  }
  return (countsBase[lid] ?? 0) + (appended.get(lid) ?? 0);
}

/** 指定 entry の履歴が hydrate 待ちか(renderer が「読み込み中…」を出す判定)。 */
export function isRevisionHydrationPending(container: Container, lid: string): boolean {
  if (!isRevisionResidencyActive(container.meta.container_id)) return false;
  if (hydratedLids.has(lid)) return false;
  const resident = container.revisions.reduce((n, r) => (r.entry_lid === lid ? n + 1 : n), 0);
  return revisionCountOf(container, lid) > resident;
}

/** 全量 barrier の free function(mount されていなければ no-op)。 */
export function ensureAllRevisionsResident(): Promise<void> {
  return active ? active.ensureAll() : Promise.resolve();
}

/**
 * 全量 barrier が本当に必要か(同期判定)。caller はこれが false のとき
 * **従来どおり同期で dispatch する** ── `.then()` 経由にすると deferred と
 * 無関係な経路(flag OFF が既定)まで非同期化し、同期 dispatch を前提にした
 * 既存の挙動・test を壊すため(2026-07-27 に実際に踏んだ)。
 */
export function needsRevisionBarrier(): boolean {
  return active !== null && !fullyResident;
}

export function mountRevisionResidency(
  dispatcher: Dispatcher,
  options: { store: ContainerStore; cid: string },
): RevisionResidencyHandle {
  const { store, cid } = options;
  activeCid = cid;
  countsBase = null;
  appended = new Map();
  hydratedLids = new Set();
  fullyResident = false;

  let disposed = false;
  let merging = false;
  let lastContainer: Container | null = dispatcher.getState().container;
  let lastRevisions: readonly Revision[] = lastContainer?.revisions ?? [];
  let running: Promise<void> = Promise.resolve();
  const inFlight = new Set<string>();

  // COUNT 索引(boot 1 クエリ)。到着で空 merge を dispatch し、履歴 pane の
  // 件数表示を deferred 値へ切り替える(再 render 合図)。
  void store
    .loadRevisionCounts?.(cid)
    .then((counts) => {
      if (disposed) return;
      countsBase = counts;
      merging = true;
      try {
        dispatcher.dispatch({ type: 'SYS_REVISIONS_HYDRATED', revisions: [] });
      } finally {
        merging = false;
      }
    })
    .catch((err) => {
      console.warn('[PKC2] revision counts の取得に失敗(全量常駐へ fallback):', err);
      void ensureAllInternal();
    });

  function mergeRows(revisions: Revision[]): void {
    if (disposed) return;
    merging = true;
    try {
      dispatcher.dispatch({ type: 'SYS_REVISIONS_HYDRATED', revisions });
      const st = dispatcher.getState();
      if (st.container && st.container.meta.container_id === cid) {
        lastContainer = st.container;
        lastRevisions = st.container.revisions;
      }
      // hydrate した行は storage 由来 ── diff baseline に**行だけ**足す
      // (⚠ container ごとの差し替えは未保存編集を握り潰す ── interface doc 参照)。
      store.noteHydratedRevisions?.(cid, revisions);
    } finally {
      merging = false;
    }
  }

  async function ensureEntryInternal(lid: string): Promise<void> {
    if (disposed || fullyResident || hydratedLids.has(lid) || inFlight.has(lid)) return;
    if (!store.loadRevisionsFor) return;
    inFlight.add(lid);
    try {
      const revisions = await store.loadRevisionsFor(cid, lid);
      hydratedLids.add(lid);
      mergeRows(revisions);
    } finally {
      inFlight.delete(lid);
    }
  }

  async function ensureAllInternal(): Promise<void> {
    if (disposed || fullyResident) return;
    if (!store.loadAllRevisions) return;
    const revisions = await store.loadAllRevisions(cid);
    fullyResident = true; // 以後 countOf は導出へ(merge 前に立てても差は出ない)
    mergeRows(revisions);
  }

  // 追記の観測(同期 dispatch 前提の末尾増分カウント)。
  const unsubscribe = dispatcher.onState((st) => {
    if (disposed || merging || fullyResident) {
      lastContainer = st.container;
      lastRevisions = st.container?.revisions ?? [];
      return;
    }
    const c = st.container;
    if (!c || c.meta.container_id !== cid) {
      // container 切替 / 消失 ── deferred 管理はこの cid 限り。以後は導出へ。
      fullyResident = true;
      return;
    }
    if (c !== lastContainer) {
      const revs = c.revisions;
      if (revs !== lastRevisions) {
        if (revs.length >= lastRevisions.length) {
          for (let i = lastRevisions.length; i < revs.length; i++) {
            const r = revs[i] as Revision;
            appended.set(r.entry_lid, (appended.get(r.entry_lid) ?? 0) + 1);
          }
        } else {
          // 減少 = 削除系が部分常駐のまま走った(§7-d の監査では purge のみで、
          // その flow は ensureAll を先行させる)。ここに来たら設計違反なので
          // 警告し、以後は導出へ倒して数字の嘘を避ける。
          console.warn('[PKC2] revisions が部分常駐のまま削除された ── counts を導出へ切替');
          fullyResident = true;
        }
      }
      lastContainer = c;
      lastRevisions = revs;
    }
    // 需要駆動: 選択 entry の履歴を先読み(履歴 pane が完全表示になる)。
    if (st.selectedLid && countsBase !== null) {
      const lid = st.selectedLid;
      if (!hydratedLids.has(lid) && (countsBase[lid] ?? 0) > 0) {
        void ensureEntry(lid);
      }
    }
  });

  function ensureEntry(lid: string): Promise<void> {
    const p = running.then(() => ensureEntryInternal(lid));
    // chain は失敗しても切らない(rejected を持ち回ると以後の hydrate が全滅する)。
    running = p.catch((err) => {
      console.warn('[PKC2] revision hydrate failed:', err);
    });
    return running;
  }

  function ensureAll(): Promise<void> {
    const p = running.then(() => ensureAllInternal());
    running = p.catch(() => undefined);
    // barrier の失敗は caller へ伝える ── export / purge 側で中断できるように。
    return p;
  }

  const handle: RevisionResidencyHandle = {
    ensureEntry,
    ensureAll,
    dispose(): void {
      disposed = true;
      unsubscribe();
      if (active === handle) {
        active = null;
        activeCid = null;
        countsBase = null;
        fullyResident = false;
      }
    },
  };
  active = handle;
  return handle;
}
