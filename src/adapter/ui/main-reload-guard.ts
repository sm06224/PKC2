/**
 * main window reload guard — Group A、Phase γ-A3(A3-4、2026-05-20)。
 *
 * 子 entry-window が開いている間に main window を reload / close すると、
 * 子 window 内の未保存編集を巻き込んで失う恐れがある。`beforeunload` で
 * browser native の確認ダイアログを出して事故を防ぐ。
 *
 * spec §3.2。flag `shell.main_reload_guard` で gate(γ-A stack は全 flag
 * OFF 出荷方針につき default OFF、spec の「default ON」想定との差分は
 * shell spec §3.6 に記録)。
 *
 * 子 window の有無は entry-window.ts の `getOpenEntryWindowLids()` が
 * 既に提供する。本モジュールはそれを **注入** で受け取り(テスト容易性 +
 * adapter/ui 内の循環 import 回避)、guard 判定 + listener 設置のみ担う。
 */

import { shellMainReloadGuardEnabled } from './shell-flags';

/**
 * reload を guard すべきか。flag ON かつ子 window が 1 つ以上開いている
 * ときだけ true。純粋関数なので単体テストはこれを直接叩く。
 */
export function shouldGuardReload(openWindowLids: readonly string[]): boolean {
  return shellMainReloadGuardEnabled() && openWindowLids.length > 0;
}

/**
 * main window の `beforeunload` に guard を設置する。`getOpenWindowLids`
 * は呼び出しごとに最新の子 window lid 一覧を返す関数(通常は
 * entry-window.ts の `getOpenEntryWindowLids`)。
 *
 * 返り値は teardown 関数(listener 解除)。
 */
export function installMainReloadGuard(
  getOpenWindowLids: () => readonly string[],
): () => void {
  const handler = (e: BeforeUnloadEvent): void => {
    if (!shouldGuardReload(getOpenWindowLids())) return;
    // preventDefault + returnValue の両方が、browser 差異を跨いで
    // native 確認ダイアログを発火させる正準形。
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
