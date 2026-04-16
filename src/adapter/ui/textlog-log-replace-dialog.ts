/**
 * Textlog log-replace dialog — minimal find/replace UI for a SINGLE
 * textlog log entry's text (S-28).
 *
 * Scope (v1, per docs/spec/textlog-replace-v1-behavior-contract.md):
 *   - Operates on ONE `<textarea data-pkc-field="textlog-entry-text"
 *     data-pkc-log-id="<id>">` the caller resolves and passes in.
 *   - Plain substring OR JavaScript RegExp find, with case-sensitive
 *     opt-in. No whole-word / multiline / preserve-case / Selection
 *     only toggles (Selection only is intentionally deferred).
 *   - Shows live hit count and disables Apply on zero hits or invalid
 *     regex. Invalid-regex error shown inline.
 *   - Apply rewrites the log textarea's `.value` and fires a synthetic
 *     `input` event so the existing dirty-state / commit-edit flow
 *     (via textlogPresenter.collectBody) observes the change exactly
 *     as if the user had typed it.
 *   - `log.id` / `log.createdAt` / `log.flags` / `entries` array length
 *     and order are NEVER touched — textarea.value only holds
 *     `log.text` so metadata is structurally unreachable from here.
 *
 * Out of scope (v1):
 *   - whole textlog / selected lines / visible lines
 *   - append area / viewer (ready phase) triggers
 *   - Selection only (deferred v1.x candidate)
 *   - Replace next / hit highlight / multi-entry / global replace
 *   - TEXT body replace (use text-replace-dialog.ts instead)
 *
 * Readonly / historical / preservation paths never reach here — the
 * trigger (`open-log-replace-dialog`) is only rendered inside
 * textlogPresenter.renderEditorBody, which runs only when editing
 * mode is entered (which the reducer blocks in readonly).
 */

import {
  buildFindRegex,
  countMatches,
  replaceAll,
  type ReplaceOptions,
} from '../../features/text/text-replace';

// ── Constants ──────────────────────────────────────────────
//
// Separate data-pkc-field namespace from text-replace-dialog so the
// two dialogs coexist in the DOM without selector collisions (the
// TEXT Replace dialog is unreachable while a textlog is being edited
// anyway, but the namespacing guards against future overlap).

const OVERLAY_CLASS = 'pkc-text-replace-overlay';
const CARD_CLASS = 'pkc-text-replace-card';
const STATUS_CLASS = 'pkc-text-replace-status';
const ROW_CLASS = 'pkc-text-replace-row';
const ACTIONS_CLASS = 'pkc-text-replace-actions';

const FIELD_FIND = 'textlog-log-replace-find';
const FIELD_REPLACE = 'textlog-log-replace-replace';
const FIELD_REGEX = 'textlog-log-replace-regex';
const FIELD_CASE = 'textlog-log-replace-case';
const ACTION_APPLY = 'textlog-log-replace-apply';
const ACTION_CLOSE = 'textlog-log-replace-close';

const DATA_REGION = 'textlog-log-replace-dialog';

// ── Module singleton state ─────────────────────────────────

let activeOverlay: HTMLElement | null = null;
let activeTextarea: HTMLTextAreaElement | null = null;
let activeEscapeHandler: ((e: KeyboardEvent) => void) | null = null;

// ── DOM helper ─────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// ── Exported readers / closers ─────────────────────────────

/** True while the log-replace dialog overlay is mounted. */
export function isTextlogLogReplaceDialogOpen(): boolean {
  return activeOverlay !== null;
}

/**
 * Unmount the dialog if open. Safe to call from anywhere; a no-op
 * when the dialog is already closed.
 */
export function closeTextlogLogReplaceDialog(): void {
  unmount();
}

// ── Entry point ────────────────────────────────────────────

/**
 * Open the log-replace dialog against a specific textlog log
 * textarea. The textarea MUST have both `data-pkc-field =
 * "textlog-entry-text"` and a non-empty `data-pkc-log-id`. When
 * either check fails the call silently returns, keeping the edit
 * session untouched.
 *
 * If a dialog is already open, it is unmounted first so the new
 * call wins — prevents overlays stacking across re-renders.
 */
export function openTextlogLogReplaceDialog(
  textarea: HTMLTextAreaElement,
  root: HTMLElement,
): void {
  if (textarea.getAttribute('data-pkc-field') !== 'textlog-entry-text') return;
  if (!textarea.getAttribute('data-pkc-log-id')) return;
  if (activeOverlay !== null) unmount();

  const parts = buildOverlay();
  root.appendChild(parts.overlay);

  const update = (): void => updateStatus(parts, textarea);
  const doApply = (): void => applyReplace(parts, textarea, update);

  wireInputHandlers(parts, update);
  wireApply(parts, doApply);
  wireClose(parts);

  activeOverlay = parts.overlay;
  activeTextarea = textarea;

  update();
  parts.findInput.focus();
}

// ── Overlay construction ───────────────────────────────────

interface OverlayParts {
  overlay: HTMLElement;
  findInput: HTMLInputElement;
  replaceInput: HTMLInputElement;
  regexCheckbox: HTMLInputElement;
  caseCheckbox: HTMLInputElement;
  statusEl: HTMLElement;
  applyBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
}

function buildOverlay(): OverlayParts {
  const overlay = el('div', OVERLAY_CLASS);
  overlay.setAttribute('data-pkc-region', DATA_REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Find and replace in current log');

  const card = el('div', CARD_CLASS);
  const title = el('h2', 'pkc-text-replace-title');
  title.textContent = 'Find & Replace (current log)';
  card.appendChild(title);

  const findRow = el('div', ROW_CLASS);
  const findLabel = el('label');
  findLabel.textContent = 'Find';
  const findInput = el('input');
  findInput.type = 'text';
  findInput.setAttribute('data-pkc-field', FIELD_FIND);
  findInput.autocomplete = 'off';
  findLabel.appendChild(findInput);
  findRow.appendChild(findLabel);
  card.appendChild(findRow);

  const replaceRow = el('div', ROW_CLASS);
  const replaceLabel = el('label');
  replaceLabel.textContent = 'Replace with';
  const replaceInput = el('input');
  replaceInput.type = 'text';
  replaceInput.setAttribute('data-pkc-field', FIELD_REPLACE);
  replaceInput.autocomplete = 'off';
  replaceLabel.appendChild(replaceInput);
  replaceRow.appendChild(replaceLabel);
  card.appendChild(replaceRow);

  const optionsRow = el('div', `${ROW_CLASS} pkc-text-replace-options`);

  const regexCheckbox = el('input');
  regexCheckbox.type = 'checkbox';
  regexCheckbox.setAttribute('data-pkc-field', FIELD_REGEX);
  const regexLabel = el('label');
  regexLabel.appendChild(regexCheckbox);
  regexLabel.appendChild(document.createTextNode(' Regex'));
  optionsRow.appendChild(regexLabel);

  const caseCheckbox = el('input');
  caseCheckbox.type = 'checkbox';
  caseCheckbox.setAttribute('data-pkc-field', FIELD_CASE);
  const caseLabel = el('label');
  caseLabel.appendChild(caseCheckbox);
  caseLabel.appendChild(document.createTextNode(' Case sensitive'));
  optionsRow.appendChild(caseLabel);

  // S-28: Selection only is intentionally NOT offered here. See
  // docs/spec/textlog-replace-v1-behavior-contract.md §4.2.

  card.appendChild(optionsRow);

  const statusEl = el('div', STATUS_CLASS);
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');
  card.appendChild(statusEl);

  const actions = el('div', ACTIONS_CLASS);
  const applyBtn = el('button', 'pkc-btn pkc-btn-primary');
  applyBtn.type = 'button';
  applyBtn.setAttribute('data-pkc-action', ACTION_APPLY);
  applyBtn.textContent = 'Apply';
  const closeBtn = el('button', 'pkc-btn');
  closeBtn.type = 'button';
  closeBtn.setAttribute('data-pkc-action', ACTION_CLOSE);
  closeBtn.textContent = 'Close';
  actions.appendChild(closeBtn);
  actions.appendChild(applyBtn);
  card.appendChild(actions);

  overlay.appendChild(card);

  return {
    overlay,
    findInput,
    replaceInput,
    regexCheckbox,
    caseCheckbox,
    statusEl,
    applyBtn,
    closeBtn,
  };
}

// ── Status / apply logic ───────────────────────────────────

function readOptions(parts: OverlayParts): ReplaceOptions {
  return {
    regex: parts.regexCheckbox.checked,
    caseSensitive: parts.caseCheckbox.checked,
  };
}

function updateStatus(
  parts: OverlayParts,
  textarea: HTMLTextAreaElement,
): void {
  const query = parts.findInput.value;
  const options = readOptions(parts);

  if (query === '') {
    parts.statusEl.textContent = 'Enter text to find…';
    parts.statusEl.removeAttribute('data-pkc-error');
    parts.applyBtn.disabled = true;
    return;
  }

  const built = buildFindRegex(query, options);
  if (!built.ok) {
    parts.statusEl.textContent = `Invalid regex: ${built.error}`;
    parts.statusEl.setAttribute('data-pkc-error', 'true');
    parts.applyBtn.disabled = true;
    return;
  }

  // v1 evaluates the match within the single log's text, never
  // across logs. See contract §4.5.
  const n = countMatches(textarea.value, query, options);
  parts.statusEl.removeAttribute('data-pkc-error');
  parts.statusEl.textContent = n === 0
    ? 'No matches in current log.'
    : `${n} match${n === 1 ? '' : 'es'} will be replaced in current log.`;
  parts.applyBtn.disabled = n === 0;
}

function applyReplace(
  parts: OverlayParts,
  textarea: HTMLTextAreaElement,
  rerun: () => void,
): void {
  const query = parts.findInput.value;
  if (query === '') return;

  const options = readOptions(parts);
  const next = replaceAll(
    textarea.value,
    query,
    parts.replaceInput.value,
    options,
  );
  if (next === textarea.value) return; // 0 hit → no-op

  // Only this textarea is touched. log.id / log.createdAt /
  // log.flags / other logs / entries order are structurally out
  // of reach here. The invariance contract (§5) is protected by
  // the fact that textlogPresenter renders per-log textareas and
  // collectBody preserves all other fields.
  textarea.value = next;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  rerun();
}

// ── Event wiring ───────────────────────────────────────────

function wireInputHandlers(parts: OverlayParts, update: () => void): void {
  parts.findInput.addEventListener('input', update);
  parts.replaceInput.addEventListener('input', update);
  parts.regexCheckbox.addEventListener('change', update);
  parts.caseCheckbox.addEventListener('change', update);
}

function wireApply(parts: OverlayParts, doApply: () => void): void {
  parts.applyBtn.addEventListener('click', doApply);

  const enterToApply = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (parts.applyBtn.disabled) return;
    e.preventDefault();
    doApply();
  };
  parts.findInput.addEventListener('keydown', enterToApply);
  parts.replaceInput.addEventListener('keydown', enterToApply);
}

function wireClose(parts: OverlayParts): void {
  parts.closeBtn.addEventListener('click', () => unmount());

  parts.overlay.addEventListener('mousedown', (e) => {
    if (e.target === parts.overlay) unmount();
  });

  const escapeHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      unmount();
    }
  };
  document.addEventListener('keydown', escapeHandler, true);
  activeEscapeHandler = escapeHandler;
}

// ── Unmount ────────────────────────────────────────────────

function unmount(): void {
  if (activeEscapeHandler) {
    document.removeEventListener('keydown', activeEscapeHandler, true);
    activeEscapeHandler = null;
  }
  if (activeOverlay) {
    const returnFocus = activeTextarea;
    activeOverlay.remove();
    activeOverlay = null;
    if (returnFocus && document.contains(returnFocus)) {
      returnFocus.focus();
    }
  }
  activeTextarea = null;
}
