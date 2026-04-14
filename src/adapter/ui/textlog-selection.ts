/**
 * TEXTLOG → TEXT selection mode — forward cache over AppState (P1-1).
 *
 * Pre-P1-1 this file owned authoritative state: an action-binder would
 * call `beginSelection(lid)` etc. to mutate the module singleton, and
 * `textlog-presenter` would read the same singleton at render time.
 * That made `selectedLid` change, `BEGIN_EDIT`, `DELETE_ENTRY`, and
 * `SYS_IMPORT_COMPLETE` carry the risk of leaving the singleton stale
 * — each site had to remember to call `cancelSelection()` as a
 * defensive clean-up step.
 *
 * P1-1 (2026-04-13) moves the authoritative state into
 * `AppState.textlogSelection`:
 *
 *   - The action-binder now dispatches
 *     `BEGIN_TEXTLOG_SELECTION` / `TOGGLE_TEXTLOG_LOG_SELECTION` /
 *     `CANCEL_TEXTLOG_SELECTION` and never mutates singleton state.
 *   - The reducer enforces clear semantics on `SELECT_ENTRY`,
 *     `DESELECT_ENTRY`, `BEGIN_EDIT`, `DELETE_ENTRY` (when the deleted
 *     lid matches), and `SYS_IMPORT_COMPLETE` — every stale path is
 *     closed in one place.
 *   - This module keeps a small **forward cache** of the latest
 *     state so the existing reader API (`isSelectionModeActive`,
 *     `isLogSelected`, `getSelectionSize`, `getActiveSelectionLid`,
 *     `getSelectedLogIds`) can stay argument-free. The renderer
 *     calls `syncTextlogSelectionFromState(state)` at the start of
 *     each render pass so the cache is always current.
 *
 * Scope & invariants:
 *   - Mutator functions from the pre-P1-1 API
 *     (`beginSelection`, `cancelSelection`, `toggleLogSelection`) are
 *     DELETED. Callers must go through `dispatcher.dispatch`.
 *   - `syncTextlogSelectionFromState` is the only write path into the
 *     cache. It is pure with respect to state and idempotent.
 *   - Reader functions are identity-stable with respect to state: two
 *     calls against the same state reference return equivalent
 *     results without re-parsing.
 *
 * Tests:
 *   - Existing call-site tests that used the mutator API have been
 *     migrated to dispatch equivalent actions.
 *   - `__resetSelectionStateForTest` continues to exist as a
 *     belt-and-braces hatch for tests that bypass the dispatcher.
 */

import type { AppState, TextlogSelectionState } from '../state/app-state';

/**
 * Cached projection of `AppState.textlogSelection`. Always refreshed
 * by `syncTextlogSelectionFromState` before the renderer walks the
 * viewer DOM.
 */
let cache: TextlogSelectionState | null = null;

/**
 * Refresh the forward cache from a freshly-reduced `AppState`. Called
 * by the renderer once per render pass. Safe to call with a `null`
 * state reference — the cache collapses to `null` in that case.
 */
export function syncTextlogSelectionFromState(state: AppState | null): void {
  cache = state?.textlogSelection ?? null;
}

/** True when the given TEXTLOG entry currently owns selection mode. */
export function isSelectionModeActive(lid: string): boolean {
  return cache !== null && cache.activeLid === lid;
}

/** Lid of the TEXTLOG that currently owns selection mode, or null. */
export function getActiveSelectionLid(): string | null {
  return cache?.activeLid ?? null;
}

/**
 * Read-only view of the currently selected log ids. Returns a fresh
 * `Set` each call so callers can safely iterate / `.has()` without
 * worrying about cache invalidation — the identity changes only when
 * `sync*` is next called.
 */
export function getSelectedLogIds(): ReadonlySet<string> {
  return new Set(cache?.selectedLogIds ?? []);
}

/** Number of logs currently selected. Shown in the toolbar and gate the Convert button. */
export function getSelectionSize(): number {
  return cache?.selectedLogIds.length ?? 0;
}

/** True when a specific log id is in the current selection. */
export function isLogSelected(logId: string): boolean {
  return cache?.selectedLogIds.includes(logId) ?? false;
}

/**
 * Reset cache state — used from test fixtures that construct DOM
 * directly without going through the dispatcher (and therefore
 * without calling `syncTextlogSelectionFromState`). Not exported via
 * `index.ts` intentionally; production code should never need this.
 */
export function __resetSelectionStateForTest(): void {
  cache = null;
}
