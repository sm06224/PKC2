/**
 * TEXTLOG → TEXT selection mode — module-local UI state.
 *
 * Spec: `docs/development/textlog-text-conversion.md` §2.1, §4, §5.
 *
 * Selection state is deliberately kept **out** of AppState /
 * reducer. The set of currently-selected log ids is transient UI
 * state tied to a single TEXTLOG viewer session: it should not
 * survive a container reload, a selection change, an editor cycle,
 * or an export snapshot. Reducer-level persistence would force us
 * to invent an event for every checkbox click for no durable
 * benefit.
 *
 * Instead we keep a small singleton here (same pattern as
 * `slash-menu.ts`, `asset-picker.ts`, `asset-autocomplete.ts`).
 * `action-binder` mutates it; `textlog-presenter` reads it at render
 * time so that the next full re-render restores whatever selection
 * was already in progress.
 *
 * ## DOM shape emitted when selection mode is active
 *
 * The toolbar is rendered inside the TEXTLOG viewer (not the outer
 * action bar) because it is scoped to one TEXTLOG at a time and we
 * want its lifecycle to match the viewer's mount / unmount:
 *
 *     <div class="pkc-textlog-view" data-pkc-textlog-selecting>
 *       <div class="pkc-textlog-select-toolbar" ...>
 *         <button data-pkc-action="begin-textlog-selection" ...> (idle only)
 *         <span class="pkc-textlog-select-count"> N logs selected
 *         <button data-pkc-action="cancel-textlog-selection"> Cancel
 *         <button data-pkc-action="open-textlog-to-text-preview"> Convert
 *       </div>
 *       ...
 *       <article class="pkc-textlog-log">
 *         <input type="checkbox" data-pkc-field="textlog-select" ...>
 *         ...
 *       </article>
 *     </div>
 *
 * A single source entry can be in selection mode at a time. Switching
 * the selected entry or dispatching BEGIN_EDIT cancels the mode (the
 * viewer re-renders without the `data-pkc-textlog-selecting`
 * attribute, and `cancelSelection()` is called opportunistically from
 * the action-binder).
 */

const state: {
  activeLid: string | null;
  selected: Set<string>;
} = {
  activeLid: null,
  selected: new Set(),
};

/** True when the given TEXTLOG entry currently owns selection mode. */
export function isSelectionModeActive(lid: string): boolean {
  return state.activeLid === lid;
}

/** Lid of the TEXTLOG that currently owns selection mode, or null. */
export function getActiveSelectionLid(): string | null {
  return state.activeLid;
}

/** Read-only view of the currently selected log ids. */
export function getSelectedLogIds(): ReadonlySet<string> {
  return state.selected;
}

/** Number of logs currently selected. Shown in the toolbar and gate the Convert button. */
export function getSelectionSize(): number {
  return state.selected.size;
}

/** True when a specific log id is in the current selection. */
export function isLogSelected(logId: string): boolean {
  return state.selected.has(logId);
}

/**
 * Enter selection mode for the given TEXTLOG entry. Clears any
 * previously active selection (selecting logs from two different
 * TEXTLOGs in the same session is not a use case we support).
 */
export function beginSelection(lid: string): void {
  state.activeLid = lid;
  state.selected = new Set();
}

/** Exit selection mode. Safe to call when not active. */
export function cancelSelection(): void {
  state.activeLid = null;
  state.selected = new Set();
}

/** Toggle a single log id in/out of the selection. */
export function toggleLogSelection(logId: string): void {
  if (state.selected.has(logId)) {
    state.selected.delete(logId);
  } else {
    state.selected.add(logId);
  }
}

/**
 * Reset selection state — used from test fixtures so each test starts
 * from a clean singleton. Not exported via `index.ts` intentionally;
 * production code should only ever use `beginSelection` /
 * `cancelSelection`.
 */
export function __resetSelectionStateForTest(): void {
  state.activeLid = null;
  state.selected = new Set();
}
