/**
 * UI prefs 永続化 facade — C11(2026-07-22 user 要望)。
 *
 * 「localStorage やクッキーといったストレージが必ず初期化されてしまう
 * 環境なので、そこに依存しない仕組みとして欲しい」への解。
 *
 * 設計(storage v3 正本 doc §C11):
 *   - **正本 = container の `__settings__` payload `uiPrefs` バッグ**。
 *     prefs はデータと同じ場所に住み、データが生き残る限り生き残る
 *     (IDB / 単一 HTML export / Backup ZIP / FSA フォルダに同乗)。
 *   - **localStorage はセッション内ミラー**に格下げ。boot 時にバッグ →
 *     localStorage へ seed するので、localStorage を直読みする既存
 *     reader(子 window の inline JS 等)は無変更で正しく動く。
 *   - 未 init(pre-boot / readonly viewer / test)は **完全 passthrough**
 *     = 従来どおり localStorage のみ。挙動の後方互換を保つ。
 *   - 書き込みは debounce して `SET_UI_PREFS` を 1 回 dispatch(reducer
 *     が `__settings__` へ merge → `SETTINGS_CHANGED` → persistence が
 *     保存)。readonly では dispatch しない(ミラーのみ)。
 *   - legacy 移行は lazy: バッグに無い key を localStorage で読めたら
 *     採用してバッグへ流し込む(明示的な一括移行は不要)。
 *
 * 管理対象 key は allowlist(下記)。**意図的に除外**:
 *   - `pkc2.debug` / `pkc2.debug-contents` / `pkc2.split-sync-debug`
 *     (デバッグ設定を container に載せて他環境へ持ち出さない)
 *   - `pkc2.storageBackend`(boot 前に必要な bootstrap 設定。container
 *     を読むためのバックエンド選択自体は container に置けない)
 *   - `pkc2.windowLayout`(端末固有 geometry、multi-window spec §4.2)
 *   - `pkc2.last-known-version`(配信 URL 固有。消えても更新 toast が
 *     1 回出ないだけの無害値)
 */

import type { Dispatchable } from '../../core/action';
import type { AppState } from '../state/app-state';

/**
 * facade が必要とする dispatcher の最小構造型。`Dispatcher` は構造的に
 * これを満たす(dispatch の戻り値は使わないため unknown)。テストの
 * fake dispatcher が戻り値型に縛られないための緩和でもある。
 */
export interface UiPrefsDispatcher {
  dispatch(action: Dispatchable): unknown;
  getState(): AppState;
}

/** container バッグへ同乗させる key(完全一致)。 */
const MANAGED_EXACT_KEYS: ReadonlySet<string> = new Set([
  'pkc2.startup-notice.seen',
  'pkc2.startup-notice.disabled',
  'pkc2.editMode',
  'pkc2.panePrefs',
  'pkc2.folderPrefs',
  'pkc2.split-sync-enabled',
  'pkc2.filer.column-widths',
  'pkc2.tabStrip',
  'pkc2.extensionBindings',
]);

/** container バッグへ同乗させる key(prefix 一致)。 */
const MANAGED_KEY_PREFIXES: readonly string[] = ['pkc2.imageOptimize.'];

export function isManagedUiPrefKey(key: string): boolean {
  if (MANAGED_EXACT_KEYS.has(key)) return true;
  return MANAGED_KEY_PREFIXES.some((p) => key.startsWith(p));
}

const FLUSH_DEBOUNCE_MS = 800;

/** null = 未 init(passthrough mode)。 */
let cache: Map<string, string> | null = null;
let dispatcherRef: UiPrefsDispatcher | null = null;
const pending = new Map<string, string | null>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;

function lsGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch { /* quota / private mode — バッグ側が正本なので無害 */ }
}

function lsRemove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch { /* noop */ }
}

function flushNow(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pending.size === 0 || !dispatcherRef) return;
  const values = Object.fromEntries(pending);
  pending.clear();
  // readonly viewer では container 側に書けない(reducer も no-op)。
  // ミラーには書き済みなので session 内の挙動は従来どおり。
  if (dispatcherRef.getState().readonly) return;
  dispatcherRef.dispatch({ type: 'SET_UI_PREFS', values });
}

function queueFlush(key: string, value: string | null): void {
  if (!cache || !isManagedUiPrefKey(key)) return;
  pending.set(key, value);
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushNow, FLUSH_DEBOUNCE_MS);
}

/**
 * boot 配線(main.ts、SYS_INIT_COMPLETE dispatch **前**に呼ぶ —
 * 初回 render / tab 復元 / pane prefs 読みより先にバッグを有効化する
 * ため)。冪等: 再 boot(source 切替)では新しいバッグで再 seed。
 */
export function initUiPrefs(
  bag: Record<string, string>,
  dispatcher: UiPrefsDispatcher,
): void {
  cache = new Map(Object.entries(bag));
  dispatcherRef = dispatcher;

  // バッグ → localStorage ミラー seed。localStorage 直読みの既存
  // reader(子 window の inline JS 等)を無変更で生かす。
  for (const [k, v] of cache) {
    if (lsGet(k) !== v) lsSet(k, v);
  }

  // lazy 移行の一括版: 既に localStorage にある managed key で
  // バッグに無いものは採用して流し込む(既存ユーザーの初回 boot)。
  const adopt = (k: string): void => {
    if (cache!.has(k)) return;
    const v = lsGet(k);
    if (v !== null) {
      cache!.set(k, v);
      queueFlush(k, v);
    }
  };
  for (const k of MANAGED_EXACT_KEYS) adopt(k);
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && MANAGED_KEY_PREFIXES.some((p) => k.startsWith(p))) adopt(k);
      }
    }
  } catch { /* localStorage 不可 — バッグのみで運用 */ }

  if (!listenersInstalled && typeof window !== 'undefined') {
    listenersInstalled = true;
    // 子 window(popup の inline JS)は localStorage を直接書く。
    // storage event は「他 document の書き込み」でのみ発火するので、
    // 親側でそれを拾ってバッグへ採用する。
    window.addEventListener('storage', (e) => {
      if (!cache || !e.key || !isManagedUiPrefKey(e.key)) return;
      if (e.newValue === null) {
        cache.delete(e.key);
        queueFlush(e.key, null);
      } else {
        cache.set(e.key, e.newValue);
        queueFlush(e.key, e.newValue);
      }
    });
    // debounce 窓中の離脱で pref を落とさない(best-effort)。
    window.addEventListener('pagehide', flushNow);
  }
}

/**
 * pref を読む。init 済みならバッグ優先、無ければ localStorage
 * fallback(managed key はその場でバッグへ採用 = lazy 移行)。
 * 未 init は localStorage passthrough。
 */
export function getUiPref(key: string): string | null {
  if (cache) {
    const v = cache.get(key);
    if (v !== undefined) return v;
    const ls = lsGet(key);
    if (ls !== null && isManagedUiPrefKey(key)) {
      cache.set(key, ls);
      queueFlush(key, ls);
    }
    return ls;
  }
  return lsGet(key);
}

/** pref を書く(バッグ + ミラー write-through)。 */
export function setUiPref(key: string, value: string): void {
  cache?.set(key, value);
  lsSet(key, value);
  queueFlush(key, value);
}

/** pref を消す(バッグ + ミラー両方)。 */
export function removeUiPref(key: string): void {
  cache?.delete(key);
  lsRemove(key);
  queueFlush(key, null);
}

/** Test-only: facade を未 init(passthrough)状態へ戻す。 */
export function __resetUiPrefsForTest(): void {
  cache = null;
  dispatcherRef = null;
  pending.clear();
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/** Test-only: debounce を待たず即 flush。 */
export function __flushUiPrefsForTest(): void {
  flushNow();
}
