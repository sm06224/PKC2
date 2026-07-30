import type { Dispatcher } from '../state/dispatcher';
import type { Container } from '../../core/model/container';
import type { ContainerStore } from './idb-store';
import type { DomainEvent, DomainEventType } from '../../core/action/domain-event';
import { defineFlag } from '../flags';
import { collectReferencedAssetKeys } from '../../features/asset/asset-scan';

/**
 * Persistence: wires DomainEvent → ContainerStore.save().
 *
 * Design:
 * - Subscribes to dispatcher.onEvent
 * - Saves the current Container when a mutation event fires
 * - Debounces saves to avoid excessive IDB writes
 * - Does NOT modify state or dispatch actions
 * - Save errors are logged, not thrown (non-blocking)
 *
 * The persistence layer does NOT:
 * - Touch core types
 * - Dispatch actions (it's a passive listener)
 * - Save runtime state (phase, selectedLid, etc.)
 * - Define its own events (no SAVE_SUCCEEDED/FAILED in DomainEvent)
 *
 * ── Debounce safety note ────────────────────────────────────────────
 *
 * The scheduled save reads the CURRENT state via
 * `dispatcher.getState()` at flush time, NOT at schedule time. So the
 * pattern
 *
 *     dispatch(QUICK_UPDATE_ENTRY);
 *     dispatch(SELECT_ENTRY);   // no save trigger
 *     // …debounce fires 300 ms later…
 *
 * does NOT produce a stale save: by the time `doSave()` runs, the
 * state already reflects both actions. There is no closure-captured
 * state snapshot to go stale.
 *
 * What can still go wrong is that the tab closes *before* the 300 ms
 * timer fires, in which case the pending change is lost. `flushPending`
 * + the `pagehide` handler below is the real hardening for that case.
 */

/**
 * Events that indicate a Container mutation requiring save.
 * ④-2: folder-sink(C11 §4.5)も同じトリガ集合で debounce 書きする
 * ため export(トリガの追加漏れを二重管理にしない)。
 */
export const SAVE_TRIGGERS: ReadonlySet<DomainEventType> = new Set([
  'ENTRY_CREATED',
  'ENTRY_UPDATED',
  'ENTRY_DELETED',
  'ENTRY_RESTORED',
  'RELATION_CREATED',
  'RELATION_DELETED',
  'RELATION_KIND_UPDATED',
  'CONTAINER_LOADED',
  'CONTAINER_IMPORTED',
  // Manual `PURGE_ORPHAN_ASSETS` (and trash purge) mutates
  // `container.assets` and emits `ORPHAN_ASSETS_PURGED` as the only
  // corresponding event (no `ENTRY_*` fires because no entry is
  // touched). Without this trigger the cleanup stays memory-only and
  // a reload restores the orphans. Auto-GC paths (SYS_IMPORT_COMPLETE
  // / CONFIRM_IMPORT / CONFIRM_MERGE_IMPORT) already emit `ENTRY_*` or
  // `CONTAINER_*` events from their parent actions, so they persist
  // independently.
  //
  // 段階2 (#868): since `save()` is now additive-only it no longer
  // deletes the purged keys from IDB. This event additionally arms an
  // explicit `purgeAssetsExcept` run (see `doSave`) so the B5
  // invariant — orphan-purge + reload stays purged — still holds.
  'ORPHAN_ASSETS_PURGED',
  // FI-Settings v1 (2026-04-18): `SETTINGS_CHANGED` fires whenever any
  // theme/display/locale setting is mutated. The reducer has already
  // upserted `__settings__` into the container by the time we see the
  // event, so a plain `save(container)` persists it — no separate
  // dispatch round-trip is needed.
  'SETTINGS_CHANGED',
]);

/**
 * Live getter — persistence debounce interval. Lower values reduce
 * data-loss window after edits at the cost of more frequent IDB
 * writes. Tunable via Flags for PoC / A/B testing. Read fresh on
 * each scheduleSave so SET_FLAG takes effect from the next save
 * cycle without a reload.
 */
const persistenceDebounceMs = defineFlag<number>('persistence.debounce_ms', 300, {
  range: [0, 5000],
  category: 'perf',
  description: '永続化 debounce (ms)。低いほど data-loss window が短いが IDB 書込頻度↑',
  tier: 0,
});

/**
 * 差分保存(改善バッチ④ 2026-07)。ON では自動保存が
 * `store.saveDiff()`(split 形式:entry / revision を個別 record に
 * 分割し、変更分だけ書く)を使う。編集ごとの書込みが container 全体
 * O(n) → 変更分 O(1) になり、大規模 container(数千 entries)でも
 * 保存コストが一定になる。
 *
 * **既定 OFF(opt-in)**。2026-07-22 に R6(#938)で一度既定 ON に
 * 昇格したが、同日の user 実機報告(#958)で撤回した:split 形式は
 * 書込を O(1) にする代わりに **読出(boot)を「数千 record の分散読み」**
 * にする。遅いストレージ × 巨大 container では record の散在
 * (backing store 上のランダム読み・断片化)がボトルネックになり、
 * 初期化が分単位に遅くなる。inline 単一 record は逐次読み 1 回で済む。
 * 昇格条件だった「使用中ユーザーに影響が無いこと」が実機で破られた
 * ため、既定は inline に戻す。ON にした環境も OFF 保存で inline へ
 * 自動復元される(双方向に安全 ──
 * tests/adapter/differential-default-cross-mode.test.ts が全 adapter 系で
 * この往復を pin)。
 *
 * 旧ビルド互換の注意(ON にする場合):split 形式で保存された storage を
 * 「この機能を知らない旧ビルド」で開くと entries が空に見える(データ
 * 自体は残っており、新ビルドで開き直せば戻る)。
 */
/**
 * 🔴 **退役(2026-07-26、user 指示「差分保存のユーザーが次回起動したら、
 * 強制的にマイグレーションしてください」)**
 *
 * `retired: true` により **どの source から指定されても既定値(false)に落ち**、
 * Inspector の一覧からも消える。既に split 形式で保存されている storage は
 * **次回起動の保存で inline へ書き戻る**(下記「強制マイグレーションの経路」)。
 *
 * 退役の理由は性能ではなく **旧ビルドとの非互換**である:
 *
 * #1022 が relations と順序リストを core record から `__rel__:` / `__order__:`
 * サイドカーへ出した。読み側は「サイドカーがあればそれが正本、無ければ core の
 * inline」で両立させているが、**#1022 より前のビルドにはこの合流が無い**
 * (`git show d5aef45^:src/adapter/platform/idb-store.ts` の load は core の
 * `relations` をそのまま採る)。よって差分保存 ON の storage を古い
 * `pkc2.html` で開くと **relations が 0 件に見え、その状態で保存すると実際に消える**。
 * revisions も保存時の配列順を失う ── 配列順は同着 revision の tie-break として
 * 効いており、後勝ち / 先勝ちの逆向きの消費者が 2 つあるため順序の喪失は観測できる。
 * PKC2 は単一 HTML 製品で、user が旧 `pkc2.html` を手元に残す運用が実在する。
 *
 * ⚠ **代償を明記する。** 差分保存 ON は 1 編集 11 KB、OFF は 25,688 KB
 * (N=5000 / M=15000、put 計器。`docs/development/save-write-volume-2026-07-26.md`)。
 * 退役はこの差を捨てる ── 書込量は増える。それでも退役を選ぶのは、
 * ① 既定 OFF・マニュアルでも非推奨で母数が小さい ② #958 で「boot が 5.5〜6.0 倍」を
 * 理由に既定から撤回済み ③ 失われるのが**復旧不能なデータ**である、の 3 点による。
 *
 * ## 強制マイグレーションの経路(この 4 つが揃って成立する)
 *
 *   1. 本 flag が `retired` = 保存の分岐が必ず `store.save()`(inline)を選ぶ
 *   2. `CONTAINER_LOADED` が `SAVE_TRIGGERS` の一員 = 起動しただけで保存が走る
 *   3. `main.ts` は `storedInline === false` のとき `notePersistedBaseline()` を
 *      **呼ばない** = #1024 の「変わっていないなら書かない」最適化に潰されない
 *   4. `save()` が `__entry__:` / `__rev__:` / `__rel__:` / `__order__:` を掃除する
 *      = サイドカーが残って古い正本として読まれ続けることがない
 *
 * ⚠ **この 4 つはどれも「性能最適化」で消えうる。** 実際 #1024 は 3 の carve-out を
 * 忘れれば戻し道ごと殺すところだった。`tests/adapter/differential-save-retirement.test.ts`
 * が 4 つとも pin している ── 落ちたら最適化ではなく退行である。
 *
 * ⚠ **定義を消してはならない。** getter が生きていないと、既に有効化された環境が
 * 「既定値へ戻る = 安全な形式へ書き戻る」経路ごと失われる。`saveDiff()` の実装も
 * 残す(FS backend の委譲元であり、退役は user 導線の封鎖であって実装の削除ではない)。
 */
const differentialSaveEnabled = defineFlag<boolean>('persistence.differential_save', false, {
  category: 'perf',
  retired: true,
  retiredReason:
    '2026-07-26 user 指示により退役。#1022 のサイドカー分離で旧ビルドが relations を 0 件と誤読するため、次回起動で inline へ強制マイグレーションする',
  description:
    '差分保存(entry/revision 単位の split 形式、既定 OFF)。書込は変更分 O(1) になるが、読出(起動)が数千 record の分散読みになり、遅いストレージ × 大きな container では起動が極端に遅くなる(#958)。書込頻度が課題で起動速度に余裕がある環境のみ ON 推奨',
  tier: 0,
});

/** `?pkc-debug=assets` 診断 overlay 用の現在値 read(#956)。 */
export function differentialSaveFlagValueForDebug(): boolean {
  return differentialSaveEnabled();
}

export interface PersistenceOptions {
  store: ContainerStore;
  debounceMs?: number;
  onError?: (error: unknown) => void;
  /**
   * When set, `mountPersistence` will attach a `pagehide` listener on
   * this target to call `flushPending()` automatically when the tab is
   * backgrounded or closed. Tests pass `null` to opt out; main.ts
   * passes `window`.
   *
   * Defaults to `window` in browser environments — see
   * `mountPersistence` for the resolution logic.
   */
  unloadTarget?: EventTarget | null;
  /**
   * 差分保存経路を使うかの判定。既定 = flag(退役済みのため常に false)。
   *
   * `persistence.differential_save` の退役で本番の分岐は `save()` に固定された
   * が、`saveDiff()` の実装自体は残っている(FS backend の委譲元)。その機構を
   * test から動かすための注入口 ── `createContainerStore(adapter,
   * { lazyEntryBodies })` と同じ作法(退役 flag は source 経由では立たないので、
   * flag source を差し替える形の test は退役と同時に機能しなくなる)。
   *
   * ⚠ **production から渡してはならない。** 渡した瞬間に「次回起動で強制
   * マイグレーション」の前提 1 が崩れる。
   */
  differentialSave?: () => boolean;
}

/**
 * Handle returned by `mountPersistence`. `dispose` tears down the
 * subscription and cancels any pending timer. `flushPending` cancels
 * the debounce and runs a save immediately using the latest
 * `dispatcher.getState()` — callable at any time, safe to call when
 * there is nothing pending (it becomes a no-op).
 */
export interface PersistenceHandle {
  dispose(): void;
  flushPending(): Promise<void>;
}

/**
 * 現在マウント中の persistence の `flushPending`。storage backend 切替の
 * `location.reload()` 前など、PersistenceHandle を直接持たない呼び出し側
 * (action-binder)が「reload 前に保留中の保存を確実に書き出す」ために使う
 * module-level hook。mounted persistence が無ければ no-op。
 */
let activeFlush: (() => Promise<void>) | null = null;

/**
 * 現在アクティブな persistence の pending save を flush する。マウント済みが
 * 無ければ何もしない。backend 切替前のデータ取りこぼし防止に使う。
 */
export async function flushActivePersistence(): Promise<void> {
  if (activeFlush) await activeFlush();
}

/**
 * boot 時の「storage と一致していると分かっている container 参照」を
 * persistence に教える module-level hook(2026-07-26)。
 *
 * `mountPersistence` は container を読む**前**に呼ばれる(`main.ts`)ため、
 * 基準値を options では渡せない。呼び元は store から読んだ container を
 * dispatch する直前にここへ渡す。
 *
 * ⚠ **呼んでよいのは storage が既に「書き戻しても変わらない形式」のときだけ**。
 * `loadDefaultMetaShallow().storedInline` がその判定であり、false のときの
 * 起動時保存は無駄書きではなく **形式を戻す作業**なので止めてはならない。
 */
let noteBaseline: ((container: Container) => void) | null = null;

export function notePersistedBaseline(container: Container): void {
  noteBaseline?.(container);
}

export function mountPersistence(
  dispatcher: Dispatcher,
  options: PersistenceOptions,
): PersistenceHandle {
  const { store, debounceMs: debounceOverride, onError } = options;
  const useDifferentialSave = options.differentialSave ?? differentialSaveEnabled;
  const unloadTarget = options.unloadTarget === undefined
    ? (typeof window !== 'undefined' ? window : null)
    : options.unloadTarget;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving = false;
  // 差分保存のベース:「前回 saveDiff が resolve した時点の container
  // 参照」。storage の内容と正確に一致していることが差分の前提なので、
  // 保存成功時のみ更新し、legacy save(inline 形式)が走ったら破棄する
  // (inline へ書いた時点で split ベースは無効。次の saveDiff は
  // marker 不在を検出して全件書込みへフォールバックする)。
  let diffBase: Container | null = null;
  // 「storage の内容と一致していると分かっている container 参照」(2026-07-26)。
  //
  // なぜ要るか ── `CONTAINER_LOADED` は `SAVE_TRIGGERS` の一員なので、
  // **編集を 1 回もしなくても起動のたびにコンテナ全体が保存される**。
  // 実測(put 計器・N=5000 / M=15000):**起動しただけで 25,685 KB**。
  // 既定パスなので全 user が毎起動これを踏んでいる。
  //
  // 判定は **参照比較のみ**。Container は immutable に更新されるので、
  // 参照が同じなら中身も同じ(偽陽性なし)。参照が違っても中身が同じことは
  // ありうるが、その場合は保存が 1 回走るだけで安全側に倒れる。
  // (差分保存の relations / entries 判定と同じ idiom)
  let persistedRef: Container | null = null;
  // Armed by an `ORPHAN_ASSETS_PURGED` event; consumed by the next
  // `doSave`. Since `save()` is additive-only (段階2 #868), deleting
  // the purged asset bytes from IDB is an explicit follow-up step.
  let pendingPurge = false;

  // Resolve debounce on every scheduleSave call so SET_FLAG /
  // inspector-edited persistence.debounce_ms takes effect immediately.
  // Test override (debounceOverride) wins when explicitly passed.
  function resolveDebounceMs(): number {
    return debounceOverride ?? persistenceDebounceMs();
  }

  function scheduleSave(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void doSave();
    }, resolveDebounceMs());
  }

  async function doSave(): Promise<void> {
    if (saving) {
      // Already saving, reschedule
      scheduleSave();
      return;
    }

    const currentState = dispatcher.getState();
    // #940 案 A 段階2: meta-first boot の本文復元が終わるまで保存しない。
    // 本文が '' のままの container を全件書込みすると storage の本文を
    // 空で上書きしうる(diff 経路は安全だが full-write fallback が危険)。
    // 復元完了(SYS_BODIES_LOADED)後の保存で最新 state が書かれる。
    if (currentState.bodiesPending) {
      scheduleSave();
      return;
    }
    const container = currentState.container;
    if (!container) {
      // No container to persist or purge against — drop any armed
      // purge so it can't fire later against a different container.
      pendingPurge = false;
      return;
    }

    // Skip saving when container came from a Light export (no assets).
    // Saving it would overwrite IDB with asset-stripped data.
    if (currentState.lightSource) {
      pendingPurge = false;
      return;
    }

    // Skip saving when container was booted from embedded pkc-data.
    // Boot-source policy (2026-04-16): opening an exported HTML must
    // not expand the embedded container into IndexedDB — the embedded
    // copy is a view-only snapshot. Persistence resumes only after
    // an explicit Import (CONFIRM_IMPORT / SYS_IMPORT_COMPLETE /
    // CONFIRM_MERGE_IMPORT / REHYDRATE), which clears the flag. See
    // `docs/development/boot-container-source-policy-revision.md`.
    if (currentState.viewOnlySource) {
      pendingPurge = false;
      return;
    }

    // storage と一致していると分かっている参照そのものなら、書くことが無い。
    // ⚠ `pendingPurge` が立っているときは skip しない ── orphan asset の
    //   回収は container の中身が同じでも実行しなければならない副作用である。
    if (persistedRef === container && !pendingPurge) return;

    saving = true;
    // Consume the purge arm-flag for this cycle. Re-arm on failure so
    // the next save still attempts the cleanup.
    const purgeThisCycle = pendingPurge;
    pendingPurge = false;
    try {
      if (useDifferentialSave()) {
        const prev =
          diffBase && diffBase.meta.container_id === container.meta.container_id
            ? diffBase
            : null;
        await store.saveDiff(container, prev);
        diffBase = container;
      } else {
        await store.save(container);
        diffBase = null;
      }
      persistedRef = container;
      if (purgeThisCycle) {
        // Additive-only save left the orphan bytes in IDB. Delete
        // exactly the unreferenced keys. `keep` is derived from a FULL
        // view of the container (entry references), never from
        // `container.assets`, so this stays correct even when assets
        // is a partial working-set (lazy loading, 段階3+): an asset
        // referenced by an entry is never purged, whether or not its
        // bytes are currently resident.
        const keep = collectReferencedAssetKeys(container);
        await store.purgeAssetsExcept(container.meta.container_id, keep);
      }
    } catch (err) {
      if (purgeThisCycle) pendingPurge = true;
      console.warn('[PKC2] Save failed:', err);
      onError?.(err);
    } finally {
      saving = false;
    }
  }

  /**
   * Flush any pending debounced save immediately. Cancels the running
   * timer and runs `doSave()` synchronously from the caller's view
   * (the returned promise resolves once the IDB put completes).
   *
   * No-op when there is nothing pending AND no save in flight.
   * When a save is already in flight, the inner `doSave` reschedules —
   * so callers must await the returned promise and accept that some
   * very-close-together writes may land in the *next* save batch.
   */
  async function flushPending(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    await doSave();
  }

  // この persistence を「現在アクティブ」として登録(reload 前 flush 用)。
  activeFlush = flushPending;
  // boot 側から「storage と一致している参照」を受け取る hook。
  const setBaseline = (c: Container): void => { persistedRef = c; };
  noteBaseline = setBaseline;

  function handleEvent(event: DomainEvent): void {
    if (event.type === 'ORPHAN_ASSETS_PURGED') {
      // Arm the explicit IDB purge for the next save cycle (段階2 #868).
      pendingPurge = true;
    }
    if (event.type === 'CONTAINER_IMPORTED') {
      // #938 R1: import / 外部由来の container 差し替えは同一 asset key の
      // bytes を差し替えうる唯一の経路。dirty-tracking の「persist 済み」
      // 記録を破棄し、次の保存で全 asset を書き直させる(通常編集の
      // 保存は skip 最適化のまま)。
      //
      // 🔴 **`CONTAINER_LOADED` を条件から外した(2026-07-26)。**
      //
      // 実測(`tests/bench/migration-heap.mjs`、2000 entries / 添付 100 件 ×
      // 512KB = 52.5MB):起動時のピーク heap が **157.3 → 271.8 MB(+114.6 MB)**。
      // #1035 の強制マイグレーションで起動時保存が実際に走るようになった結果、
      // **全 asset が毎起動書き直されていた**。
      //
      // なぜ外して安全か:
      //   - `CONTAINER_LOADED` の発行元は `SYS_INIT_COMPLETE` の 2 箇所だけ = **起動**。
      //     import は `CONTAINER_IMPORTED` を別に出すので、本来の目的は残る
      //   - IDB 起動なら asset は store から読んだもので、`reassembleAssets` が
      //     「読めた = persist 済み」として記録済み(`idb-store.ts:1308`)。
      //     **その正しい記録を消していたのがこの行だった**
      //   - pkc-data / light / 閲覧のみ起動では `viewOnlySource` / `lightSource` が
      //     立ち、`doSave` が保存自体を skip する ⇒ 記録の有無は結果に影響しない
      //   - 起動時に asset を読まなかった場合は記録が空のままなので、
      //     従来どおり書かれる(skip 過多にはならない)
      //
      // ⚠ 記録の更新は「書込成功」or「読出成功」のみ、という不変条件は変えていない。
      //   pin: `tests/adapter/persistence-asset-invalidation.test.ts`
      const cid = dispatcher.getState().container?.meta.container_id;
      if (cid) store.invalidatePersistedAssets(cid);
    }
    if (SAVE_TRIGGERS.has(event.type)) {
      scheduleSave();
    }
  }

  const unsubEvent = dispatcher.onEvent(handleEvent);

  // Install pagehide handler so pending saves are attempted on tab
  // close / navigation away. `pagehide` is preferred over `unload`
  // because modern browsers (esp. mobile) do not fire `unload`
  // reliably, and bfcache-friendly pages observe `pagehide` instead.
  const pagehideHandler = (): void => {
    // Fire-and-forget: the browser will not wait for the promise, so
    // the best we can do is kick off the IDB write synchronously. If
    // IDB isn't fast enough to complete before the tab dies, the
    // in-flight put is still useful — it survives into the next
    // session so long as the transaction committed.
    void flushPending();
  };
  if (unloadTarget) {
    unloadTarget.addEventListener('pagehide', pagehideHandler);
  }

  // Cleanup
  function dispose(): void {
    unsubEvent();
    // この persistence が active hook の場合だけ解除(別 mount を消さない)。
    if (activeFlush === flushPending) activeFlush = null;
    if (noteBaseline === setBaseline) noteBaseline = null;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (unloadTarget) {
      unloadTarget.removeEventListener('pagehide', pagehideHandler);
    }
  }

  return { dispose, flushPending };
}

/**
 * Load Container from the IDB store, with a null fallback.
 *
 * This function is intentionally **IDB-only**: it does not decide the
 * overall boot priority. The boot priority (pkc-data > IDB > empty)
 * lives in `chooseBootSource()` in `pkc-data-source.ts` and the top-
 * level orchestration in `main.ts`. Callers pass the result of this
 * function to `chooseBootSource` as the `idbContainer` argument.
 *
 * 段階3 (#868, lazy asset loading): uses `loadDefaultShallow`, so the
 * returned container has `assets: {}` — the ≈400MB of base64 never
 * lands in the heap at boot. The working-set manager (mounted in
 * main.ts) then loads only the assets the visible view references and
 * evicts the rest. The bytes remain in the store untouched. This is
 * only safe because `save()` is additive-only (段階2): a boot-time save
 * carrying empty assets can no longer wipe the stored bytes.
 */
export async function loadFromStore(
  store: ContainerStore,
): Promise<{
  source: 'idb' | 'none';
  container: import('../../core/model/container').Container | null;
  /** #940 案 A 段階2: layout v2 で本文が未読(caller が SYS_BODIES_LOADED で復元)。 */
  bodiesDeferred: boolean;
  /**
   * storage が既に「書き戻しても 1 バイトも変わらない形式」か(2026-07-26)。
   * true のときだけ、boot 由来の起動時保存を無駄書きとして止めてよい。
   */
  storedInline: boolean;
  /** P4a: revisions が要求時読み(caller が revision-residency を mount)。 */
  revisionsDeferred: boolean;
}> {
  try {
    // #940 案 A 段階2: meta-first。v2 storage では本文を読まず即返し、
    // caller(main.ts)が background で loadBodies → SYS_BODIES_LOADED。
    const { container, bodiesDeferred, storedInline, revisionsDeferred } =
      await store.loadDefaultMetaShallow();
    if (container) {
      return {
        source: 'idb',
        container,
        bodiesDeferred,
        storedInline,
        revisionsDeferred: revisionsDeferred === true,
      };
    }
  } catch (err) {
    console.warn('[PKC2] IDB load failed, falling back to pkc-data:', err);
  }
  return {
    source: 'none',
    container: null,
    bodiesDeferred: false,
    storedInline: false,
    revisionsDeferred: false,
  };
}
