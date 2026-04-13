/**
 * Preview modal for the TEXT → TEXTLOG conversion flow (Slice 5).
 *
 * Spec: `docs/development/textlog-text-conversion.md` §3 + §5 (dry-run
 * preview). Mirrors the Slice 4 TEXTLOG → TEXT modal in shape so the
 * user learns one interaction pattern for both directions:
 *
 * - Modal is a singleton; opening a second one closes the first.
 * - Preview body is computed once via the pure `textToTextlog`
 *   function and stored on the modal node. The confirm handler reads
 *   the **same** `{ title, body }` off the modal — preview == commit.
 * - Split-mode radio (heading / hr) re-runs the pure function and
 *   re-renders just the preview list. No dispatcher involvement.
 *
 * Module-local mutable state is limited to:
 * - `activeModal` (DOM node) — matches `textlog-preview-modal.ts`.
 * - `activeResult` — the most recently computed conversion result.
 *   Kept so the confirm action can grab the body without re-parsing.
 */

import type { Entry } from '../../core/model/record';
import {
  textToTextlog,
  type TextToTextlogResult,
  type TextToTextlogSplitMode,
} from '../../features/text/text-to-textlog';

let activeModal: HTMLElement | null = null;
let activeResult: TextToTextlogResult | null = null;
let activeSource: Entry | null = null;

/** True while the preview modal is on screen. */
export function isTextToTextlogModalOpen(): boolean {
  return activeModal !== null;
}

/**
 * Open the preview modal for converting `source` (a TEXT entry) into
 * a new TEXTLOG. The modal is appended to `root` so tests can scope
 * DOM queries to the app root.
 */
export function openTextToTextlogModal(
  root: HTMLElement,
  source: Entry,
  initialSplitMode: TextToTextlogSplitMode = 'heading',
): void {
  closeTextToTextlogModal();

  activeSource = source;
  const result = textToTextlog(source, { splitMode: initialSplitMode });
  activeResult = result;

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
  modeRow.appendChild(buildModeRadio('heading', 'ATX heading (#, ##, ###)', initialSplitMode));
  modeRow.appendChild(buildModeRadio('hr', 'Horizontal rule (---)', initialSplitMode));
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
  activeModal = overlay;
}

/**
 * Re-compute the preview with a new split mode. Called by the
 * action-binder when the user flips the radio. No-op if the modal
 * isn't open.
 */
export function setTextToTextlogSplitMode(mode: TextToTextlogSplitMode): void {
  if (!activeModal || !activeSource) return;
  const result = textToTextlog(activeSource, { splitMode: mode });
  activeResult = result;

  // Update title only if the user hasn't edited it — otherwise their
  // edit gets clobbered every radio change. Simple heuristic: compare
  // against previous auto title (both old results used the same
  // source so the title is identical).
  const titleInput = activeModal.querySelector<HTMLInputElement>(
    '[data-pkc-field="text-to-textlog-title"]',
  );
  if (titleInput && titleInput.value === titleInput.getAttribute('data-pkc-auto-title')) {
    titleInput.value = result.title;
  }
  titleInput?.setAttribute('data-pkc-auto-title', result.title);

  const summary = activeModal.querySelector<HTMLElement>(
    '[data-pkc-region="text-to-textlog-summary"]',
  );
  const list = activeModal.querySelector<HTMLOListElement>(
    '[data-pkc-region="text-to-textlog-list"]',
  );
  if (summary && list) renderPreviewContent(summary, list, result);

  const confirmBtn = activeModal.querySelector<HTMLButtonElement>(
    '[data-pkc-action="confirm-text-to-textlog"]',
  );
  if (confirmBtn) applyConfirmState(confirmBtn, result);
}

/** Close the modal. Safe to call when closed. */
export function closeTextToTextlogModal(): void {
  if (activeModal && activeModal.parentNode) {
    activeModal.parentNode.removeChild(activeModal);
  }
  activeModal = null;
  activeResult = null;
  activeSource = null;
}

/**
 * Read the user-edited title + the exact body the preview is showing.
 * Returns `null` when the modal is closed or the current result has
 * zero content segments (confirm is disabled in that state).
 */
export function getTextToTextlogCommitData():
  | { title: string; body: string }
  | null {
  if (!activeModal || !activeResult) return null;
  if (activeResult.segmentCount === 0) return null;
  const titleInput = activeModal.querySelector<HTMLInputElement>(
    '[data-pkc-field="text-to-textlog-title"]',
  );
  const title = (titleInput?.value ?? activeResult.title).trim() || activeResult.title;
  return { title, body: activeResult.body };
}

// ── internals ─────────────────────────────────────────────

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
