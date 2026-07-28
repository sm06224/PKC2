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
  /** 常駐している本文の文字数(P4b の計器)。 */
  residentChars(): number;
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

/**
 * 同じ lid の本文を何回まで読み直すか(2026-07-26)。
 * 上限に達したら **backfill の対象からだけ**外す(pending は残す)。
 */
const MAX_HYDRATE_ATTEMPTS = 2;

/**
 * 🔴 hydrate 済み本文の上限(文字数)。**P4b の本体はこれである。**
 *
 * 2026-07-28 の実測で判明したこと: boot で本文を運ばないようにしても、
 * `scheduleIdleBackfill` が 200ms ごとに 32 件ずつ読み戻し、**最終的に
 * 全件常駐へ収束する**設計だったため、定常のメモリは 1 バイトも減らなかった
 * (本文 16MB の container で USS +451.1MB → +449.8MB = 誤差)。
 *
 * user 指摘(2026-07-28)「実行時に不要な部分はブラウザストレージ側に
 * 切り離してメモリを解放できるはずだ」── そのとおりで、**読んだものを
 * 捨てない限り解放は起きない**。
 *
 * 上限は「直近に見たものが十分入る」大きさにする。2M 文字 ≒ 4MB(UTF-16)で、
 * 4,000 文字の記事なら 500 件ぶん ── 通常の閲覧で追い出しは起きず、
 * 巨大 container でだけ効く。
 *
 * ⚠ 最初 8M 文字にしたが、**検証 fixture がちょうど 8M 文字**で追い出しが
 *    1 度も起きず「効果なし」と読みかけた(2026-07-28)。上限の検証は
 *    **上限より明確に大きい入力**で行うこと。
 */
const BODY_CACHE_LIMIT_CHARS = 2_000_000;

export function mountBodyWorkingSet(
  dispatcher: Dispatcher,
  options: { store: ContainerStore },
): BodyWorkingSetHandle {
  const { store } = options;
  // cid → pending lid 集合。SYS_INIT_COMPLETE(bodiesDeferred)で初期化。
  let cid: string | null = null;
  const pending = new Set<string>();
  /**
   * 読み出しに失敗し続けた lid(2026-07-26)。**pending からは外さない**
   * ── 保存側のガードを効かせ続けるため。ここに入るのは
   * 「idle backfill が同じ lid を回し続けないようにする」目的だけ。
   */
  const unreadable = new Set<string>();
  /** lid ごとの hydrate 試行回数。`MAX_HYDRATE_ATTEMPTS` で backfill を諦める。 */
  const attempts = new Map<string, number>();
  let running: Promise<void> = Promise.resolve();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * hydrate 済み lid → 本文の文字数。**挿入順 = LRU 順**として使う
   * (Map の反復は挿入順。再アクセス時は delete → set で末尾へ回す)。
   */
  const resident = new Map<string, number>();
  let residentChars = 0;

  function initFromState(): void {
    const st = dispatcher.getState();
    if (!st.bodiesPending || !st.container) return;
    cid = st.container.meta.container_id;
    pending.clear();
    unreadable.clear();
    attempts.clear();
    resident.clear();
    residentChars = 0;
    for (const e of st.container.entries) {
      // meta-first boot 直後: body '' = 未 hydrate(v2 の contract)。
      if (e.body === '') pending.add(e.lid);
    }
  }

  async function fetchAndMerge(lids: string[]): Promise<void> {
    if (!cid || lids.length === 0) return;
    const bodies = await store.loadBodiesFor(cid, lids);
    // 🔴 **返ってきた lid だけ** pending から外す(2026-07-26)。
    //
    // ここは以前 `for (const lid of lids) pending.delete(lid)` と無条件だった。
    // コメントは「record が無い lid(本当に空の body)も外す」と書いてあったが、
    // **「読めなかった」と「元から無い」を同じ扱いにしていた**。
    //
    // segments 形式では **本文が空の entry も `''` として索引に載る**
    // (`saveDiff` が `bodies[e.lid] = e.body` を無条件に積む)。つまり
    // **返ってこない = 読み失敗**である。そして `loadBodyPack` は gunzip や
    // JSON.parse に失敗すると `{}` を返すので、**1 パック(最大 1MB)ぶんの
    // 本文がまとめて「空が正本」に化ける**。
    //
    // pending が外れると `isBodyPending` が false になり、保存側のガード
    // (`idb-store.save()` の未読チェック)も素通りする ── 空の本文が
    // storage へ焼き付き、`dropSegments` が実体を消す。
    //
    // よって **解決できなかった lid は pending のまま残す**。表示は空のままだが、
    // 「読めていない」という事実が保存側に伝わり、上書きが止まる。
    const unresolved: string[] = [];
    for (const lid of lids) {
      if (typeof bodies[lid] === 'string') {
        pending.delete(lid);
        unreadable.delete(lid);
      } else {
        unresolved.push(lid);
      }
    }
    if (unresolved.length > 0) {
      // ⚠ pending に残したままだと idle backfill が同じ lid を回し続ける。
      //   retry 回数を数え、上限を超えたら **backfill の対象からだけ**外す
      //   (pending 自体は残す = 保存側のガードは効かせ続ける)。
      for (const lid of unresolved) {
        const n = (attempts.get(lid) ?? 0) + 1;
        attempts.set(lid, n);
        if (n >= MAX_HYDRATE_ATTEMPTS) unreadable.add(lid);
      }
      console.warn(
        `[PKC2] 本文を復元できない entry が ${unresolved.length} 件あります`
          + '(空で上書きしないため、保存は保留されます)',
      );
    }
    dispatcher.dispatch({
      type: 'SYS_BODIES_LOADED',
      bodies,
      partial: pending.size > 0,
    });
    for (const [lid, body] of Object.entries(bodies)) {
      if (typeof body !== 'string') continue;
      if (resident.has(lid)) residentChars -= resident.get(lid)!;
      resident.delete(lid);
      resident.set(lid, body.length); // 末尾 = 最近使った
      residentChars += body.length;
    }
    evictOverLimit();
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
    return ensure([...pending].filter((l) => !unreadable.has(l)));
  }

  /**
   * 上限を超えたぶんを **古い順に捨てる**(LRU)。
   *
   * 捨てた lid は pending に戻す ── 表示要求が来れば読み直され、保存側は
   * `isBodyPending` で空の上書きを止める。**編集中と選択中は捨てない**
   * (今まさに使っているものを捨てると、読み直しが即発生して無意味)。
   */
  function evictOverLimit(): void {
    if (residentChars <= BODY_CACHE_LIMIT_CHARS) return;
    const st = dispatcher.getState();
    const keep = new Set([st.selectedLid, st.editingLid].filter(Boolean) as string[]);
    const victims: string[] = [];
    for (const [lid, chars] of resident) {
      if (residentChars <= BODY_CACHE_LIMIT_CHARS) break;
      if (keep.has(lid)) continue;
      victims.push(lid);
      resident.delete(lid);
      residentChars -= chars;
      pending.add(lid);
      attempts.delete(lid); // 追い出しは失敗ではない ── 再読込の権利を戻す
    }
    if (victims.length > 0) {
      dispatcher.dispatch({ type: 'SYS_BODIES_EVICTED', lids: victims });
      // 🔴 store の baseline からも落とす ── ここを忘れると、保存のたびに
      //    baseline が hydrate 済み本文を掴み直し、**実運用では 1 バイトも
      //    解放されない**(2026-07-28、B14 の点検で発見)。
      if (cid) store.noteBodiesEvicted?.(cid, victims);
    }
  }

  /**
   * idle backfill: 少しずつ hydrate する。
   *
   * ⚠ **上限に達したら止める**(2026-07-28)。以前は「最終的に全 hydrate へ
   *    収束」する設計で、deferred read の効果を自分で打ち消していた。
   */
  function scheduleIdleBackfill(): void {
    if (residentChars >= BODY_CACHE_LIMIT_CHARS) return;
    const todo = [...pending].filter((l) => !unreadable.has(l));
    if (idleTimer !== null || todo.length === 0) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      void ensure(todo.slice(0, 32));
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
    residentChars: () => residentChars,
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
  // 計器: 本文の常駐量を harness から読む(P4b の効果判定はこれで行う)。
  (globalThis as unknown as Record<string, unknown>).__pkc2BodyWorkingSet = {
    residentChars: () => handle.residentChars(),
    pendingCount: () => handle.pendingCount(),
  };
  return handle;
}
