/**
 * #940 案 A 段階3 — entry 本文の需要駆動 hydrate(body working-set)。
 *
 * layout v2 の meta-first boot(段階2)後、「どの entry の本文が未 hydrate か」
 * を **module-local の pending 集合**(唯一の真実)で管理し、
 *   (a) 選択 / 編集対象は即 hydrate
 *   (b) 検索・kanban・calendar・export 等の全文系は ensureAll() barrier
 *   (c) 残りは idle で低速 backfill(最終的に全 hydrate へ収束)
 * する。asset-working-set(#868)の pattern を踏襲。
 *
 * 保存安全性: pending 判定は `ContainerStoreOptions.isBodyPending` として
 * store に注入され、v2 書込は pending entry の本文を書かず既存 record を
 * 掃除からも除外する(idb-store 側 guard)。編集経路は hydrate してから
 * 編集に入る(action-binder のゲート)ため、pending entry の ref は
 * reducer 編集で変わらない。
 */
import type { Dispatcher } from '../state/dispatcher';
import type { ContainerStore } from './idb-store';

export interface BodyWorkingSetHandle {
  /** 指定 lid の本文を hydrate(済みなら no-op)。 */
  ensure(lids: readonly string[]): Promise<void>;
  /** 全 pending を hydrate(検索 / kanban / export の barrier)。 */
  ensureAll(): Promise<void>;
  /** 未 hydrate か(store 注入用の判定)。 */
  isPending(cid: string, lid: string): boolean;
  /** pending 数(UI 表示 / test 用)。 */
  pendingCount(): number;
  dispose(): void;
}

/** module-local singleton(store 注入と UI から参照)。 */
let active: BodyWorkingSetHandle | null = null;
export function activeBodyWorkingSet(): BodyWorkingSetHandle | null {
  return active;
}
/** store 注入用の free function(mount 前 / 後どちらでも安全)。 */
export function isBodyPendingGlobal(cid: string, lid: string): boolean {
  return active?.isPending(cid, lid) ?? false;
}

export function mountBodyWorkingSet(
  dispatcher: Dispatcher,
  options: { store: ContainerStore },
): BodyWorkingSetHandle {
  const { store } = options;
  // cid → pending lid 集合。SYS_INIT_COMPLETE(bodiesDeferred)で初期化。
  let cid: string | null = null;
  const pending = new Set<string>();
  let running: Promise<void> = Promise.resolve();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function initFromState(): void {
    const st = dispatcher.getState();
    if (!st.bodiesPending || !st.container) return;
    cid = st.container.meta.container_id;
    pending.clear();
    for (const e of st.container.entries) {
      // meta-first boot 直後: body '' = 未 hydrate(v2 の contract)。
      if (e.body === '') pending.add(e.lid);
    }
  }

  async function fetchAndMerge(lids: string[]): Promise<void> {
    if (!cid || lids.length === 0) return;
    const bodies = await store.loadBodiesFor(cid, lids);
    // record が無い lid(本当に空の body)も pending から外す。
    for (const lid of lids) pending.delete(lid);
    dispatcher.dispatch({
      type: 'SYS_BODIES_LOADED',
      bodies,
      partial: pending.size > 0,
    });
    scheduleIdleBackfill();
  }

  function ensure(lids: readonly string[]): Promise<void> {
    const need = lids.filter((l) => pending.has(l));
    if (need.length === 0) return Promise.resolve();
    running = running.then(() => fetchAndMerge(need)).catch((err) => {
      console.warn('[PKC2] body hydrate failed:', err);
    });
    return running;
  }

  function ensureAll(): Promise<void> {
    return ensure([...pending]);
  }

  // idle backfill: 少しずつ全 hydrate へ収束させる(1 batch 32 件)。
  function scheduleIdleBackfill(): void {
    if (idleTimer !== null || pending.size === 0) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      void ensure([...pending].slice(0, 32));
    }, 200);
  }

  const offState = dispatcher.onState((s, prev) => {
    // boot 完了(bodiesDeferred)を検知して pending 初期化。
    if (s.bodiesPending && !prev.bodiesPending) {
      initFromState();
      scheduleIdleBackfill();
    }
    // #940 段階4: 全文系への遷移は全件 barrier(検索クエリ入力 /
    // kanban・calendar への view 切替は本文全体を前提とする)。
    if (pending.size > 0) {
      const enteredFullText =
        (s.searchQuery !== prev.searchQuery && s.searchQuery !== '')
        || (s.viewMode !== prev.viewMode
            && (s.viewMode === 'kanban' || s.viewMode === 'calendar'));
      if (enteredFullText) void ensureAll();
    }
    // 選択 / 編集対象は即 hydrate。
    const want: string[] = [];
    if (s.selectedLid && pending.has(s.selectedLid)) want.push(s.selectedLid);
    if (s.editingLid && pending.has(s.editingLid)) want.push(s.editingLid);
    if (want.length > 0) void ensure(want);
  });

  const handle: BodyWorkingSetHandle = {
    ensure,
    ensureAll,
    isPending: (c, lid) => c === cid && pending.has(lid),
    pendingCount: () => pending.size,
    dispose: () => {
      offState();
      if (idleTimer !== null) clearTimeout(idleTimer);
      if (active === handle) active = null;
    },
  };
  // すでに boot 済み(bodiesPending 中)で mount された場合の初期化。
  initFromState();
  scheduleIdleBackfill();
  active = handle;
  return handle;
}
