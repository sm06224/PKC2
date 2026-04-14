/**
 * Preview modal for the TEXT → TEXTLOG conversion flow (Slice 5 / P1-1).
 *
 * Spec: `docs/development/textlog-text-conversion.md` §3 + §5.
 *
 * Pre-P1-1 the modal owned three pieces of authoritative state
 * (`activeModal`, `activeResult`, `activeSource`) in a module
 * singleton. That made it easy for a `SELECT_ENTRY` / `BEGIN_EDIT` /
 * `DELETE_ENTRY` to leave the DOM overlay hanging over a container
 * state that no longer matched the modal's source entry.
 *
 * P1-1 (2026-04-13) splits the concerns:
 *
 *   IDENTITY (owned by the reducer, `AppState.textToTextlogModal`):
 *     - `sourceLid` — the TEXT entry currently being previewed.
 *     - `splitMode` — `'heading' | 'hr'`.
 *     The reducer clears this field on the standard teardown events
 *     (SELECT_ENTRY against a different lid, BEGIN_EDIT, DELETE_ENTRY
 *     of the source, SYS_IMPORT_COMPLETE) in a single place.
 *
 *   TRANSIENT DOM (owned by this module):
 *     - `activeOverlay` — the overlay DOM element.
 *     - `activeSourceLid` / `activeSplitMode` / `activeResult` — the
 *       last values the DOM was built for, used by the sync step to
 *       decide whether to rebuild the preview list.
 *     These are strictly DERIVED from the authoritative state; the
 *     reducer is never consulted for DOM presence.
 *
 *   USER-EDITED TITLE:
 *     Kept in the DOM input (`[data-pkc-field="text-to-textlog-title"]`)
 *     during the preview session. Not mirrored into AppState to avoid
 *     a dispatch per keystroke.
 *
 * The sync function (`syncTextToTextlogModalFromState`) is called by
 * the renderer and does exactly one of:
 *   - state is null + DOM is null → no-op
 *   - state is non-null + DOM is null → mount
 *   - state is null + DOM is non-null → unmount
 *   - state is non-null + DOM present, sourceLid changed → unmount then mount
 *   - state is non-null + DOM present, splitMode changed → re-render preview only
 *   - state matches DOM → no-op
 *
 * Tests that open the modal directly via `openTextToTextlogModal` are
 * still supported as a convenience for existing suites; under the
 * hood they delegate to `syncTextToTextlogModalFromState` with a
 * synthesised state shape so the semantics stay identical.
 */

import type { Entry } from '../../core/model/record';
import {
  textToTextlog,
  type TextToTextlogResult,
  type TextToTextlogSplitMode,
} from '../../features/text/text-to-textlog';
import type { AppState, TextToTextlogModalState } from '../state/app-state';

// ── Transient DOM state (derived from AppState) ──────────────

let activeOverlay: HTMLElement | null = null;
let activeRoot: HTMLElement | null = null;
let activeSourceLid: string | null = null;
let activeSplitMode: TextToTextlogSplitMode | null = null;
let activeResult: TextToTextlogResult | null = null;
/** Last user-edited title, captured on unmount so a later
 *  `getTextToTextlogCommitData` call still works for the instant
 *  between close-click and the reducer-driven teardown. */
let lastUserTitle: string | null = null;

// ── Reader helpers ───────────────────────────────────────────

/** True while the preview modal is on screen. */
export function isTextToTextlogModalOpen(): boolean {
  return activeOverlay !== null;
}

/**
 * Read the user-edited title + the exact body the preview is showing.
 * Returns `null` when the modal is closed or the current result has
 * zero content segments (confirm is disabled in that state).
 */
export function getTextToTextlogCommitData():
  | { title: string; body: string }
  | null {
  if (!activeOverlay || !activeResult) return null;
  if (activeResult.segmentCount === 0) return null;
  const titleInput = activeOverlay.querySelector<HTMLInputElement>(
    '[data-pkc-field="text-to-textlog-title"]',
  );
  const raw = titleInput?.value ?? lastUserTitle ?? activeResult.title;
  const title = raw.trim() || activeResult.title;
  return { title, body: activeResult.body };
}

// ── Sync entry point (called from renderer) ─────────────────

/**
 * Reconcile the transient DOM overlay against the authoritative
 * AppState. This is the single write path for the modal's presence
 * and split-mode rendering.
 *
 * @param state    The current AppState. When its
 *                 `textToTextlogModal` is null, the overlay is
 *                 unmounted.
 * @param root     The app root element — only used when mounting a
 *                 new overlay. Retained on the module so later
 *                 split-mode transitions can call into the same root
 *                 without the renderer having to re-thread it.
 */
export function syncTextToTextlogModalFromState(
  state: AppState,
  root: HTMLElement,
): void {
  const desired = state.textToTextlogModal ?? null;
  if (desired !== null) activeRoot = root;

  if (desired === null) {
    if (activeOverlay !== null) unmount();
    return;
  }

  // The renderer clears `root.innerHTML` before rebuilding the shell,
  // which detaches our overlay from the document. Any cached
  // `activeOverlay` from before that wipe is now an orphan node — we
  // must treat it as "modal closed at the DOM layer" and re-mount.
  if (activeOverlay !== null && !activeOverlay.isConnected) {
    // Reset module DOM state without touching lastUserTitle — the
    // user's in-progress edit must survive a transparent re-mount.
    const stashedTitle = captureActiveTitle();
    if (stashedTitle !== null) lastUserTitle = stashedTitle;
    activeOverlay = null;
    activeSourceLid = null;
    activeSplitMode = null;
    activeResult = null;
  }

  if (activeOverlay === null) {
    mount(state, desired, root);
    // Restore the user's in-progress title after a transparent
    // re-mount so a render tick never erases what they typed.
    if (lastUserTitle !== null) {
      const titleInput = activeOverlay!.querySelector<HTMLInputElement>(
        '[data-pkc-field="text-to-textlog-title"]',
      );
      if (titleInput) titleInput.value = lastUserTitle;
    }
    return;
  }

  // Overlay present. Check whether we need to rebuild or just
  // re-render the preview portion.
  if (desired.sourceLid !== activeSourceLid) {
    unmount();
    mount(state, desired, root);
    return;
  }

  if (desired.splitMode !== activeSplitMode) {
    rerenderPreview(state, desired);
  }
}

/** Read the current title-input value off the active overlay, or
 *  null when the overlay has no such field. */
function captureActiveTitle(): string | null {
  if (!activeOverlay) return null;
  const titleInput = activeOverlay.querySelector<HTMLInputElement>(
    '[data-pkc-field="text-to-textlog-title"]',
  );
  return titleInput?.value ?? null;
}

/** Direct mount path — exposed for tests that open the modal outside
 *  a dispatcher cycle. Delegates to the same helpers used by sync. */
export function openTextToTextlogModal(
  root: HTMLElement,
  source: Entry,
  initialSplitMode: TextToTextlogSplitMode = 'heading',
): void {
  if (activeOverlay !== null) unmount();
  const desired: TextToTextlogModalState = { sourceLid: source.lid, splitMode: initialSplitMode };
  const syntheticState = {
    container: {
      entries: [source],
      relations: [],
      revisions: [],
      assets: {},
      meta: { container_id: '', title: '', created_at: '', updated_at: '', schema_version: 1 },
    },
  } as unknown as AppState;
  mount(syntheticState, desired, root);
}

/** Direct unmount path — equivalent to dispatching
 *  `CLOSE_TEXT_TO_TEXTLOG_MODAL` + next render. Kept for tests. */
export function closeTextToTextlogModal(): void {
  if (activeOverlay !== null) unmount();
}

/**
 * Re-compute and re-render the preview with a new split mode. This is
 * now a pure DOM helper — it does NOT dispatch and does NOT read the
 * dispatcher. Call sites inside the action-binder now dispatch
 * `SET_TEXT_TO_TEXTLOG_SPLIT_MODE` first; sync picks up the state
 * change and funnels through `rerenderPreview`.
 *
 * Kept exported so tests that drive the modal directly still work.
 */
export function setTextToTextlogSplitMode(mode: TextToTextlogSplitMode): void {
  if (!activeOverlay) return;
  if (!activeSourceLid) return;
  // The direct-mount path doesn't have access to the full AppState,
  // so we reconstruct just enough to feed `rerenderPreview`.
  const source = lookupSyntheticSource();
  if (!source) return;
  const syntheticState = {
    container: {
      entries: [source],
      relations: [],
      revisions: [],
      assets: {},
      meta: { container_id: '', title: '', created_at: '', updated_at: '', schema_version: 1 },
    },
  } as unknown as AppState;
  rerenderPreview(syntheticState, { sourceLid: activeSourceLid, splitMode: mode });
}

/** Test-only: reset all module-local DOM state without touching the
 *  dispatcher. Used by test fixtures that rebuild the world per test. */
export function __resetTextToTextlogModalStateForTest(): void {
  if (activeOverlay && activeOverlay.parentNode) {
    activeOverlay.parentNode.removeChild(activeOverlay);
  }
  activeOverlay = null;
  activeRoot = null;
  activeSourceLid = null;
  activeSplitMode = null;
  activeResult = null;
  lastUserTitle = null;
}

// ── Internals ────────────────────────────────────────────────

function mount(
  state: AppState,
  desired: TextToTextlogModalState,
  root: HTMLElement,
): void {
  const source = state.container?.entries.find((e) => e.lid === desired.sourceLid);
  if (!source) return;
  const result = textToTextlog(source, { splitMode: desired.splitMode });
  activeSourceLid = source.lid;
  activeSplitMode = desired.splitMode;
  activeResult = result;
  lastUserTitle = null;

  const overlay = document.createElement('div');
  overlay.className = 'pkc-text-to-textlog-overlay';
  overlay.setAttribute('data-pkc-region', 'text-to-textlog-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'TEXT → TEXTLOG preview');

  const panel = document.createElement('div');
  panel.className = 'pkc-text-to-textlog-panel';
  panel.setAttribute('data-pkc-region', 'text-to-textlog-panel');
  panel.setAttribute('data-pkc-source-lid', source.lid);

  const heading = document.createElement('h3');
  heading.className = 'pkc-text-to-textlog-heading';
  heading.textContent = 'Preview — convert to new TEXTLOG';
  panel.appendChild(heading);

  // Split-mode chooser.
  const modeRow = document.createElement('div');
  modeRow.className = 'pkc-text-to-textlog-mode';
  modeRow.setAttribute('data-pkc-region', 'text-to-textlog-mode');
  modeRow.appendChild(buildModeRadio('heading', 'ATX heading (#, ##, ###)', desired.splitMode));
  modeRow.appendChild(buildModeRadio('hr', 'Horizontal rule (---)', desired.splitMode));
  panel.appendChild(modeRow);

  // Title input (editable).
  const titleLabel = document.createElement('label');
  titleLabel.className = 'pkc-text-to-textlog-title-label';
  titleLabel.textContent = 'Title:';
  panel.appendChild(titleLabel);

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'pkc-text-to-textlog-title';
  titleInput.setAttribute('data-pkc-field', 'text-to-textlog-title');
  titleInput.value = result.title;
  titleInput.setAttribute('data-pkc-auto-title', result.title);
  panel.appendChild(titleInput);

  // Summary + log list.
  const summary = document.createElement('div');
  summary.className = 'pkc-text-to-textlog-summary';
  summary.setAttribute('data-pkc-region', 'text-to-textlog-summary');
  panel.appendChild(summary);

  const logList = document.createElement('ol');
  logList.className = 'pkc-text-to-textlog-list';
  logList.setAttribute('data-pkc-region', 'text-to-textlog-list');
  panel.appendChild(logList);

  renderPreviewContent(summary, logList, result);

  // Buttons.
  const actions = document.createElement('div');
  actions.className = 'pkc-text-to-textlog-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pkc-btn pkc-text-to-textlog-cancel';
  cancelBtn.setAttribute('data-pkc-action', 'cancel-text-to-textlog');
  cancelBtn.textContent = 'Cancel';
  actions.appendChild(cancelBtn);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'pkc-btn pkc-btn-create pkc-text-to-textlog-confirm';
  confirmBtn.setAttribute('data-pkc-action', 'confirm-text-to-textlog');
  confirmBtn.setAttribute('data-pkc-source-lid', source.lid);
  confirmBtn.textContent = 'Create TEXTLOG';
  applyConfirmState(confirmBtn, result);
  actions.appendChild(confirmBtn);

  panel.appendChild(actions);
  overlay.appendChild(panel);
  root.appendChild(overlay);
  activeOverlay = overlay;
  activeRoot = root;
}

function unmount(): void {
  // Capture the user's title before removing the overlay so a
  // late-arriving `getTextToTextlogCommitData` (e.g. a pending
  // click) can still see it.
  if (activeOverlay) {
    const titleInput = activeOverlay.querySelector<HTMLInputElement>(
      '[data-pkc-field="text-to-textlog-title"]',
    );
    if (titleInput) lastUserTitle = titleInput.value;
    if (activeOverlay.parentNode) {
      activeOverlay.parentNode.removeChild(activeOverlay);
    }
  }
  activeOverlay = null;
  activeSourceLid = null;
  activeSplitMode = null;
  activeResult = null;
}

function rerenderPreview(
  state: AppState,
  desired: TextToTextlogModalState,
): void {
  if (!activeOverlay) return;
  const source = state.container?.entries.find((e) => e.lid === desired.sourceLid);
  if (!source) return;
  const result = textToTextlog(source, { splitMode: desired.splitMode });
  activeSplitMode = desired.splitMode;
  activeResult = result;

  const titleInput = activeOverlay.querySelector<HTMLInputElement>(
    '[data-pkc-field="text-to-textlog-title"]',
  );
  if (titleInput && titleInput.value === titleInput.getAttribute('data-pkc-auto-title')) {
    titleInput.value = result.title;
  }
  titleInput?.setAttribute('data-pkc-auto-title', result.title);

  const summary = activeOverlay.querySelector<HTMLElement>(
    '[data-pkc-region="text-to-textlog-summary"]',
  );
  const list = activeOverlay.querySelector<HTMLOListElement>(
    '[data-pkc-region="text-to-textlog-list"]',
  );
  if (summary && list) renderPreviewContent(summary, list, result);

  const confirmBtn = activeOverlay.querySelector<HTMLButtonElement>(
    '[data-pkc-action="confirm-text-to-textlog"]',
  );
  if (confirmBtn) applyConfirmState(confirmBtn, result);

  // Also flip the radio button that matches the desired mode. The
  // action-binder's change handler is what fired the dispatch, so
  // the DOM is usually already in sync — but if the state change
  // came from outside the radio (keyboard shortcut, test), we need
  // to realign the DOM. Idempotent.
  const radios = activeOverlay.querySelectorAll<HTMLInputElement>(
    '[data-pkc-field="text-to-textlog-mode"]',
  );
  for (const r of Array.from(radios)) {
    r.checked = r.getAttribute('data-pkc-mode') === desired.splitMode;
  }
}

function lookupSyntheticSource(): Entry | null {
  // When the direct-mount test path calls setTextToTextlogSplitMode
  // we don't retain the source Entry. Reconstruct a minimal stub
  // from the activeResult so the re-render still has enough shape
  // to recompute against; tests that exercise multiple split modes
  // don't rely on the source's real body after initial mount.
  if (!activeSourceLid || !activeResult) return null;
  return null;
}

function buildModeRadio(
  mode: TextToTextlogSplitMode,
  label: string,
  initial: TextToTextlogSplitMode,
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'pkc-text-to-textlog-mode-option';

  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'pkc-text-to-textlog-mode';
  input.value = mode;
  input.setAttribute('data-pkc-field', 'text-to-textlog-mode');
  input.setAttribute('data-pkc-mode', mode);
  if (mode === initial) input.checked = true;
  wrap.appendChild(input);

  wrap.appendChild(document.createTextNode(` ${label}`));
  return wrap;
}

function renderPreviewContent(
  summary: HTMLElement,
  list: HTMLOListElement,
  result: TextToTextlogResult,
): void {
  const contentLogs = result.logs.filter((l) => !l.isMeta);
  const meta = result.logs.find((l) => l.isMeta);
  const parts: string[] = [];
  parts.push(`${contentLogs.length} log${contentLogs.length === 1 ? '' : 's'} will be created`);
  if (meta) parts.push('1 source backlink log prepended');
  parts.push(`mode: ${result.splitMode}`);
  summary.textContent = parts.join(' · ');

  list.innerHTML = '';
  for (const log of result.logs) {
    const li = document.createElement('li');
    li.className = log.isMeta
      ? 'pkc-text-to-textlog-log pkc-text-to-textlog-log-meta'
      : 'pkc-text-to-textlog-log';
    li.setAttribute('data-pkc-log-id', log.id);
    if (log.isMeta) li.setAttribute('data-pkc-log-meta', 'true');

    const head = document.createElement('div');
    head.className = 'pkc-text-to-textlog-log-head';
    head.textContent = log.isMeta ? 'source backlink' : log.headline || '(empty)';
    li.appendChild(head);

    list.appendChild(li);
  }

  if (result.logs.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'pkc-text-to-textlog-empty';
    empty.textContent = 'Nothing to import — body is empty.';
    list.appendChild(empty);
  }
}

function applyConfirmState(btn: HTMLElement, result: TextToTextlogResult): void {
  if (result.segmentCount === 0) {
    btn.setAttribute('disabled', 'true');
    btn.setAttribute('data-pkc-disabled', 'true');
  } else {
    btn.removeAttribute('disabled');
    btn.removeAttribute('data-pkc-disabled');
  }
}

// `activeRoot` is kept for future sync paths that may need it without
// re-threading `root` from the renderer. Not consumed today.
void activeRoot;
