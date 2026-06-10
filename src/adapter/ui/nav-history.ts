/**
 * Navigation history bridge — `history.pushState` ⇔ dispatcher.
 *
 * PR #197 (2026-04-28) — User direction:
 *   「戻る進むボタンとマウスの同名ボタン、キーボードで alt+←、alt+→で
 *    内部的なパンくずリストを移動したい」
 *
 * 領域 1 / pgc-55 統合:pgc-54 が AppState に持たせた内部 navigation
 * stack(`navHistory` / `navIndex`)を **single source of truth** とし、
 * 本 bridge はそれを browser history へミラーする。全 back/forward
 * (toolbar / マウス button 4・5 / Windows・Linux の Alt+←→ / macOS の
 * Cmd+[・] )は `popstate` に集約される。in-app の ◀ / ▶ ボタンと
 * Alt+←/→ も action-binder で `history.back()` / `history.forward()` を
 * 呼ぶため、同じ popstate 経路を 1 本通る(分岐なし=ループなし)。
 *
 *   - 新規 navigation(`SELECT_ENTRY` が `navHistory` 配列を成長 /
 *     分岐)→ `pushState`。
 *   - viewMode 変更 → `pushState`(view 切替も履歴に乗せる、PR #197
 *     踏襲)。
 *   - `navIndex` のみ移動(`GO_BACK` / `GO_FORWARD`、popstate 起因)→
 *     `pushState` しない(browser は既に移動済)。
 *
 * envelope は `{ selectedLid, viewMode, navIndex }`。popstate 時、
 * `navIndex` の差分だけ `GO_BACK` / `GO_FORWARD` を dispatch し、viewMode
 * 差は `SET_VIEW_MODE`。`navIndex` を持たない旧 frame は PR #197 互換で
 * `SELECT_ENTRY` 復元にフォールバックする。
 *
 * No persistence: browser history はページリロードでリセットされる
 * (browser-level behavior)。
 */

import type { Dispatcher } from '../state/dispatcher';
import type { AppState } from '../state/app-state';

interface NavSnapshot {
  selectedLid: string | null;
  viewMode: 'detail' | 'calendar' | 'kanban' | 'filer' | 'launcher';
  /** 内部 navigation stack の現在位置(領域 1)。 */
  navIndex: number;
}

interface NavStateEnvelope {
  pkc2: NavSnapshot;
}

export interface NavHistoryHandle {
  /** Tear down listeners. Tests and dispose hooks call this. */
  dispose: () => void;
}

function snapshot(state: AppState): NavSnapshot {
  return {
    selectedLid: state.selectedLid ?? null,
    viewMode: state.viewMode,
    navIndex: state.navIndex,
  };
}

/**
 * Mount the nav-history bridge onto `dispatcher`. Returns a handle
 * with a `dispose()` for teardown. Safe to call when `window` /
 * `history` are unavailable (returns a no-op handle).
 */
export function mountNavHistory(dispatcher: Dispatcher): NavHistoryHandle {
  if (typeof window === 'undefined' || !window.history) {
    return { dispose: () => { /* no-op */ } };
  }

  let restoring = false;
  let lastNavHistory = dispatcher.getState().navHistory;
  let lastViewMode: NavSnapshot['viewMode'] = dispatcher.getState().viewMode;

  // Seed the current page entry. `replaceState`(not `pushState`)so the
  // boot frame stays implicit and the first explicit navigation creates
  // the first new history entry.
  try {
    const envelope: NavStateEnvelope = { pkc2: snapshot(dispatcher.getState()) };
    window.history.replaceState(envelope, '');
  } catch {
    // Some sandboxed contexts restrict history API; fail open.
  }

  const unsubState = dispatcher.onState((state) => {
    if (restoring) return;
    // 新規 navigation = `navHistory` 配列の参照が変わった(SELECT_ENTRY の
    // push / 分岐)。GO_BACK / GO_FORWARD は navHistory を据え置き navIndex
    // のみ動かすので参照は不変 → pushState しない。viewMode 変更も履歴対象。
    const navChanged = state.navHistory !== lastNavHistory;
    const viewChanged = state.viewMode !== lastViewMode;
    if (!navChanged && !viewChanged) return;
    lastNavHistory = state.navHistory;
    lastViewMode = state.viewMode;
    try {
      const envelope: NavStateEnvelope = { pkc2: snapshot(state) };
      window.history.pushState(envelope, '');
    } catch {
      // Ignore — history full / sandbox restriction.
    }
  });

  const popHandler = (e: PopStateEvent): void => {
    const restored = (e.state as NavStateEnvelope | null)?.pkc2;
    if (!restored) return;
    restoring = true;
    try {
      const cur = dispatcher.getState();
      const target = restored.navIndex;
      if (typeof target === 'number') {
        // entry navigation:navIndex 差分だけ GO_BACK / GO_FORWARD。
        // guard で無限ループを構造的に阻止(stack 長 +1 が上限)。
        let guard = cur.navHistory.length + 1;
        while (dispatcher.getState().navIndex > target && guard-- > 0) {
          dispatcher.dispatch({ type: 'GO_BACK' });
        }
        while (dispatcher.getState().navIndex < target && guard-- > 0) {
          dispatcher.dispatch({ type: 'GO_FORWARD' });
        }
      } else if ((cur.selectedLid ?? null) !== restored.selectedLid) {
        // navIndex を持たない旧 frame — PR #197 互換の SELECT_ENTRY 復元。
        if (restored.selectedLid) {
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: restored.selectedLid });
        } else {
          dispatcher.dispatch({ type: 'DESELECT_ENTRY' });
        }
      }
      // viewMode 復元(entry nav とは独立軸)。
      if (dispatcher.getState().viewMode !== restored.viewMode) {
        dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: restored.viewMode });
      }
      lastNavHistory = dispatcher.getState().navHistory;
      lastViewMode = restored.viewMode;
    } finally {
      restoring = false;
    }
  };

  window.addEventListener('popstate', popHandler);

  return {
    dispose: () => {
      unsubState();
      window.removeEventListener('popstate', popHandler);
    },
  };
}
