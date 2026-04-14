/**
 * Preview modal for the TEXTLOG → TEXT extraction flow (Slice 4).
 *
 * Spec: `docs/development/textlog-text-conversion.md` §5 (dry-run
 * preview). The modal must be shown *before* any `CREATE_ENTRY`
 * dispatch — preview is pure and free to throw away, commit is the
 * durable step.
 *
 * Scope of this module:
 * - Build the modal DOM (overlay + panel).
 * - Populate it with the title + body produced by
 *   `features/textlog/textlog-to-text.ts`.
 * - Wire OK / Cancel buttons to data-pkc-action ids so action-binder
 *   owns the commit/cancel dispatch logic — same split as every other
 *   overlay we have (asset-picker, slash-menu).
 *
 * The module keeps the open panel as a singleton; opening a second
 * one automatically closes the first so we never leak overlays.
 *
 * Auto-close sync (2026-04-13, UI singleton audit final pass):
 *   `syncTextlogPreviewModalFromState` is called from the renderer
 *   so that reducer-driven teardown events (SELECT_ENTRY to another
 *   entry, BEGIN_EDIT, DELETE_ENTRY of the textlog, SYS_IMPORT_COMPLETE)
 *   collapse the module singleton in lock-step with the P1-1
 *   `textlogSelection` clear rules. This is a pure housekeeping hook
 *   — it never opens the modal, only closes it when the authoritative
 *   state says the backing selection has gone away.
 */

import type { AppState } from '../state/app-state';

let activeModal: HTMLElement | null = null;

/** True while the preview modal is on screen. */
export function isTextlogPreviewModalOpen(): boolean {
  return activeModal !== null;
}

/**
 * Data shown in the modal. All strings come from the pure-function
 * result; the modal itself does not compute anything.
 */
export interface TextlogPreviewModalData {
  /** Generated TEXT title (editable by the user before commit). */
  title: string;
  /** Generated TEXT markdown body (read-only preview). */
  body: string;
  /** Number of logs that will be emitted. Drives the confirm state. */
  emittedCount: number;
  /** Number of logs that were skipped because they were empty. */
  skippedEmptyCount: number;
  /** Source TEXTLOG lid — propagated to action handlers on confirm. */
  sourceLid: string;
}

/**
 * Mount the preview modal into the given root.
 *
 * The panel is appended to `root` so tests can scope DOM queries to
 * the app root. When called from the action-binder, `root` is the
 * same `#pkc-root` element the renderer targets.
 */
export function openTextlogPreviewModal(
  root: HTMLElement,
  data: TextlogPreviewModalData,
): void {
  closeTextlogPreviewModal();

  const overlay = document.createElement('div');
  overlay.className = 'pkc-textlog-preview-overlay';
  overlay.setAttribute('data-pkc-region', 'textlog-preview-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'TEXTLOG → TEXT preview');

  const panel = document.createElement('div');
  panel.className = 'pkc-textlog-preview-panel';
  panel.setAttribute('data-pkc-region', 'textlog-preview-panel');
  panel.setAttribute('data-pkc-source-lid', data.sourceLid);

  const heading = document.createElement('h3');
  heading.className = 'pkc-textlog-preview-heading';
  heading.textContent = 'Preview — extract to new TEXT';
  panel.appendChild(heading);

  // Summary line (#selected / #skipped) so users can sanity-check the
  // count before committing.
  const summary = document.createElement('div');
  summary.className = 'pkc-textlog-preview-summary';
  summary.setAttribute('data-pkc-region', 'textlog-preview-summary');
  const pieces: string[] = [`${data.emittedCount} log${data.emittedCount === 1 ? '' : 's'} included`];
  if (data.skippedEmptyCount > 0) {
    pieces.push(`${data.skippedEmptyCount} empty skipped`);
  }
  summary.textContent = pieces.join(' · ');
  panel.appendChild(summary);

  // Title (editable). Exposed with data-pkc-field so the confirm
  // handler can read the user-edited value.
  const titleLabel = document.createElement('label');
  titleLabel.className = 'pkc-textlog-preview-title-label';
  titleLabel.textContent = 'Title:';
  panel.appendChild(titleLabel);

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'pkc-textlog-preview-title';
  titleInput.setAttribute('data-pkc-field', 'textlog-preview-title');
  titleInput.value = data.title;
  panel.appendChild(titleInput);

  // Body preview (read-only — surface the raw markdown source, not a
  // rendered version. Rendering here would mean duplicating the TEXT
  // presenter behavior inside the preview, and that subtle mismatch
  // is exactly the kind of dry-run bug the spec warns against).
  const bodyLabel = document.createElement('label');
  bodyLabel.className = 'pkc-textlog-preview-body-label';
  bodyLabel.textContent = 'Body (markdown):';
  panel.appendChild(bodyLabel);

  const bodyPre = document.createElement('pre');
  bodyPre.className = 'pkc-textlog-preview-body';
  bodyPre.setAttribute('data-pkc-field', 'textlog-preview-body');
  bodyPre.textContent = data.body;
  panel.appendChild(bodyPre);

  // Buttons. Actions are data-pkc-action so the centralized
  // action-binder owns the dispatch logic.
  const actions = document.createElement('div');
  actions.className = 'pkc-textlog-preview-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pkc-btn pkc-textlog-preview-cancel';
  cancelBtn.setAttribute('data-pkc-action', 'cancel-textlog-to-text');
  cancelBtn.textContent = 'Cancel';
  actions.appendChild(cancelBtn);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'pkc-btn pkc-btn-create pkc-textlog-preview-confirm';
  confirmBtn.setAttribute('data-pkc-action', 'confirm-textlog-to-text');
  confirmBtn.setAttribute('data-pkc-source-lid', data.sourceLid);
  confirmBtn.textContent = 'Create TEXT';
  if (data.emittedCount === 0) {
    confirmBtn.setAttribute('disabled', 'true');
    confirmBtn.setAttribute('data-pkc-disabled', 'true');
  }
  actions.appendChild(confirmBtn);

  panel.appendChild(actions);
  overlay.appendChild(panel);
  root.appendChild(overlay);
  activeModal = overlay;
}

/** Remove the modal. Safe to call when closed. */
export function closeTextlogPreviewModal(): void {
  if (activeModal && activeModal.parentNode) {
    activeModal.parentNode.removeChild(activeModal);
  }
  activeModal = null;
}

/**
 * Read the user-edited title from the open modal. Returns `null` when
 * no modal is open so callers do not have to special-case state.
 */
export function getTextlogPreviewTitle(): string | null {
  if (!activeModal) return null;
  const input = activeModal.querySelector<HTMLInputElement>(
    '[data-pkc-field="textlog-preview-title"]',
  );
  return input?.value ?? null;
}

/**
 * Read the previewed body verbatim from the DOM. This is what will
 * be committed to the new TEXT entry's body. Sourcing from the DOM
 * (rather than re-running the pure function on commit) keeps the
 * preview == commit invariant trivially obvious.
 */
export function getTextlogPreviewBody(): string | null {
  if (!activeModal) return null;
  const pre = activeModal.querySelector<HTMLElement>(
    '[data-pkc-field="textlog-preview-body"]',
  );
  return pre?.textContent ?? null;
}

/**
 * Close the modal whenever the reducer has torn down the backing
 * selection state, or whenever the overlay has been orphaned by a
 * renderer-driven `root.innerHTML = ''` and the singleton pointer
 * is still dangling.
 *
 * Called by `renderer.ts::render()` after the main DOM has been
 * rebuilt. Never opens the modal — opening is exclusively the
 * action-binder's job via `openTextlogPreviewModal`.
 *
 * Decision rules (all three independent):
 *
 *   1. `state.textlogSelection === null` AND `activeModal !== null`
 *      The preview is always backed by an active TEXTLOG selection
 *      (the user must be in selection-mode to open it). P1-1 clears
 *      `textlogSelection` on SELECT_ENTRY to a different lid, on
 *      BEGIN_EDIT, on DELETE_ENTRY of the active textlog, and on
 *      SYS_IMPORT_COMPLETE — so this single check folds all four
 *      teardown events into one action.
 *
 *   2. `activeModal !== null` AND `!activeModal.isConnected`
 *      The renderer's `root.innerHTML = ''` detaches the overlay
 *      from the DOM tree, leaving `activeModal` as an orphan
 *      pointer. Clearing it here so the next `isTextlogPreviewModalOpen`
 *      returns honest `false` rather than a stale `true`.
 *
 *   3. Same-lid SELECT_ENTRY and unrelated state changes keep the
 *      modal open. This function makes no decision for those cases
 *      — the `textlogSelection` clear rules above are already the
 *      authoritative trigger.
 */
export function syncTextlogPreviewModalFromState(state: AppState): void {
  if (activeModal === null) return;

  // Reducer said selection is gone → modal's purpose is gone too.
  if (!state.textlogSelection) {
    closeTextlogPreviewModal();
    return;
  }

  // Overlay was detached by a whole-root re-render but the close
  // path never ran (e.g. a dispatch that preserves textlogSelection
  // yet triggers render). Clean up the stale pointer.
  if (!activeModal.isConnected) {
    closeTextlogPreviewModal();
    return;
  }
}
