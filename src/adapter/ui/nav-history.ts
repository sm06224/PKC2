/**
 * Navigation history bridge — `history.pushState` ⇔ dispatcher.
 *
 * PR #197 (2026-04-28) — User direction:
 *   「戻る進むボタンとマウスの同名ボタン、キーボードでalt+←、alt+→で
 *    内部的なパンくずリストを移動したい」
 *
 * The browser's back / forward UI (toolbar arrows, mouse button 4 / 5,
 * Alt+← / Alt+→ on Windows / Linux, Cmd+[ / Cmd+] on macOS) all funnel
 * through `popstate`. Wiring them to internal navigation only requires:
 *
 *   1. `replaceState` on first mount so the boot snapshot lives in
 *      browser history.
 *   2. `pushState` on every user-driven navigation (`SELECT_ENTRY`,
 *      `SET_VIEW_MODE`, `DESELECT_ENTRY`) so the previous snapshot is
 *      preserved.
 *   3. `popstate` listener that reads the restored snapshot from
 *      `event.state.pkc2` and re-dispatches the equivalent actions —
 *      with a `restoring` flag so the resulting state change does not
 *      push a new entry.
 *
 * Snapshot shape stays minimal — the user-facing notion of "where am
 * I?" is `selectedLid + viewMode`. textlogSelection / search query /
 * filters are intentionally excluded; they are workspace setup, not
 * navigation. Scrolling within an entry is also not nav-tracked.
 *
 * No persistence: `navHistory` lives only in `window.history`. A page
 * reload starts a fresh history (browser-level behavior).
 */

import type { Dispatcher } from '../state/dispatcher';
import type { AppState } from '../state/app-state';

interface NavSnapshot {
  selectedLid: string | null;
  viewMode: 'detail' | 'calendar' | 'kanban';
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
  };
}

function sameSnap(a: NavSnapshot | null, b: NavSnapshot | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.selectedLid === b.selectedLid && a.viewMode === b.viewMode;
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
  let lastSnapshot: NavSnapshot | null = snapshot(dispatcher.getState());

  // Seed the current page entry. We intentionally use `replaceState`
  // (not `pushState`) so the user's first explicit navigation creates
  // their first new history entry — the boot frame stays implicit.
  try {
    const envelope: NavStateEnvelope = { pkc2: lastSnapshot };
    window.history.replaceState(envelope, '');
  } catch {
    // Some sandboxed contexts restrict history API; fail open.
  }

  const unsubState = dispatcher.onState((state) => {
    if (restoring) return;
    const cur = snapshot(state);
    if (sameSnap(cur, lastSnapshot)) return;
    lastSnapshot = cur;
    try {
      const envelope: NavStateEnvelope = { pkc2: cur };
      window.history.pushState(envelope, '');
    } catch {
      // Ignore — history full / sandbox restriction.
    }
  });

  const popHandler = (e: PopStateEvent): void => {
    const envelope = e.state as NavStateEnvelope | null;
    const restored = envelope?.pkc2;
    if (!restored) return;
    restoring = true;
    try {
      const cur = dispatcher.getState();
      // Apply restored snapshot. Action ordering matters:
      //   1. selectedLid first — SELECT_ENTRY may clear viewMode-
      //      sensitive state, so set it before view mode.
      //   2. viewMode after.
      if ((cur.selectedLid ?? null) !== restored.selectedLid) {
        if (restored.selectedLid) {
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: restored.selectedLid });
        } else {
          dispatcher.dispatch({ type: 'DESELECT_ENTRY' });
        }
      }
      if (cur.viewMode !== restored.viewMode) {
        dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: restored.viewMode });
      }
      lastSnapshot = restored;
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
