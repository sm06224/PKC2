/**
 * Textlog log-replace dialog — minimal find/replace UI for a SINGLE
 * textlog log entry's text (S-28; Selection only added in S-29 / v1.x).
 *
 * Scope (v1.x, per docs/spec/textlog-replace-v1-behavior-contract.md):
 *   - Operates on ONE `<textarea data-pkc-field="textlog-entry-text"
 *     data-pkc-log-id="<id>">` the caller resolves and passes in.
 *   - Plain substring OR JavaScript RegExp find, with case-sensitive
 *     opt-in. Selection only is opt-in: when the textarea has a
 *     non-empty selection at open time, the user can confine count /
 *     replace to that range. When no selection was captured, the
 *     checkbox is rendered but disabled.
 *   - Shows live hit count and disables Apply on zero hits or invalid
 *     regex. Invalid-regex error shown inline.
 *   - Apply rewrites the log textarea's `.value` and fires a synthetic
 *     `input` event so the existing dirty-state / commit-edit flow
 *     (via textlogPresenter.collectBody) observes the change exactly
 *     as if the user had typed it.
 *   - `log.id` / `log.createdAt` / `log.flags` / `entries` array length
 *     and order are NEVER touched — textarea.value only holds
 *     `log.text` so metadata is structurally unreachable from here.
 *   - Selection only narrows further but never widens beyond the
 *     current log; cross-log behaviour is structurally impossible
 *     because the dialog holds a single textarea reference.
 *
 * Out of scope (v1.x):
 *   - whole textlog / selected lines / visible lines
 *   - append area / viewer (ready phase) triggers
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
  countMatchesInRange,
  replaceAll,
  replaceAllInRange,
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
const FIELD_SELECTION = 'textlog-log-replace-selection';
const ACTION_APPLY = 'textlog-log-replace-apply';
const ACTION_CLOSE = 'textlog-log-replace-close';

const DATA_REGION = 'textlog-log-replace-dialog';

// ── Module singleton state ─────────────────────────────────

let activeOverlay: HTMLElement | null = null;
let activeTextarea: HTMLTextAreaElement | null = null;
let activeEscapeHandler: ((e: KeyboardEvent) => void) | null = null;

/**
 * Per-dialog mutable state. The range is captured at open time and
 * shifted after each Apply that changes the selected slice's length,
 * so repeated replaces stay confined to what was originally selected
 * (now possibly shrunk / expanded). Mirrors the TEXT dialog's
 * SelectionRange contract — see find-replace-behavior-contract.md
 * §5.4 — but scoped to a single log textarea instead of the whole
 * TEXT body.
 *
 * `range: null` means the textarea had no non-empty selection at
 * open time; the Selection-only checkbox is rendered but disabled
 * in that case.
 */
interface SelectionRange {
  start: number;
  end: number;
}

interface DialogState {
  range: SelectionRange | null;
}

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

  // S-29 (v1.x): capture the log textarea's selection BEFORE we
  // build the overlay — mounting the overlay moves focus and may
  // collapse the textarea's selection.
  const captured = captureSelection(textarea);
  const state: DialogState = { range: captured };

  const parts = buildOverlay();
  root.appendChild(parts.overlay);

  // Selection-only is meaningful only when the log textarea had a
  // non-empty selection at open time. Otherwise we disable the
  // checkbox so the user cannot switch into a mode that would count
  // zero regardless of the Find string.
  if (captured === null) {
    parts.selectionCheckbox.disabled = true;
    parts.selectionCheckbox.title = 'No selection in the current log textarea';
  }

  const update = (): void => updateStatus(parts, textarea, state);
  const doApply = (): void => applyReplace(parts, textarea, state, update);

  wireInputHandlers(parts, update);
  wireApply(parts, doApply);
  wireClose(parts);

  activeOverlay = parts.overlay;
  activeTextarea = textarea;

  update();
  parts.findInput.focus();
}

/**
 * Snapshot `textarea.selectionStart/End` into a plain range. Returns
 * `null` when the selection is empty or the browser does not expose
 * coherent numbers (happy-dom returns null for unfocused inputs —
 * that path degrades to "current log full text" mode without throwing).
 */
function captureSelection(
  textarea: HTMLTextAreaElement,
): SelectionRange | null {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  if (typeof start !== 'number' || typeof end !== 'number') return null;
  if (end <= start) return null;
  return { start, end };
}

// ── Overlay construction ───────────────────────────────────

interface OverlayParts {
  overlay: HTMLElement;
  findInput: HTMLInputElement;
  replaceInput: HTMLInputElement;
  regexCheckbox: HTMLInputElement;
  caseCheckbox: HTMLInputElement;
  selectionCheckbox: HTMLInputElement;
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

  // S-29 (v1.x): log-internal Selection only. Disabled at open
  // time when the textarea has no non-empty selection.
  const selectionCheckbox = el('input');
  selectionCheckbox.type = 'checkbox';
  selectionCheckbox.setAttribute('data-pkc-field', FIELD_SELECTION);
  const selectionLabel = el('label');
  selectionLabel.appendChild(selectionCheckbox);
  selectionLabel.appendChild(document.createTextNode(' Selection only'));
  optionsRow.appendChild(selectionLabel);

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
    selectionCheckbox,
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

/**
 * Return the active selection range when the Selection-only checkbox
 * is on AND a range was captured at open time. Otherwise `null`,
 * meaning callers should operate over the whole current log textarea.
 */
function activeRange(
  parts: OverlayParts,
  state: DialogState,
): SelectionRange | null {
  if (state.range === null) return null;
  if (!parts.selectionCheckbox.checked) return null;
  return state.range;
}

function updateStatus(
  parts: OverlayParts,
  textarea: HTMLTextAreaElement,
  state: DialogState,
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
  // across logs (contract §4.5). v1.x adds the option to narrow
  // further to a captured selection inside that single log.
  const range = activeRange(parts, state);
  const n = range === null
    ? countMatches(textarea.value, query, options)
    : countMatchesInRange(
        textarea.value,
        range.start,
        range.end,
        query,
        options,
      );
  const scope = range === null ? 'current log' : 'selection';
  parts.statusEl.removeAttribute('data-pkc-error');
  parts.statusEl.textContent = n === 0
    ? `No matches in ${scope}.`
    : `${n} match${n === 1 ? '' : 'es'} will be replaced in ${scope}.`;
  parts.applyBtn.disabled = n === 0;
}

function applyReplace(
  parts: OverlayParts,
  textarea: HTMLTextAreaElement,
  state: DialogState,
  rerun: () => void,
): void {
  const query = parts.findInput.value;
  if (query === '') return;

  const options = readOptions(parts);
  const range = activeRange(parts, state);
  const oldValue = textarea.value;

  let next: string;
  let newRange: SelectionRange | null = null;
  if (range === null) {
    next = replaceAll(oldValue, query, parts.replaceInput.value, options);
  } else {
    next = replaceAllInRange(
      oldValue,
      range.start,
      range.end,
      query,
      parts.replaceInput.value,
      options,
    );
    if (next !== oldValue) {
      // Length-adjust the range so the next Apply stays confined to
      // the (possibly shrunk / expanded) replaced span. `delta` may
      // be negative when the replacement shortens the slice.
      const delta = next.length - oldValue.length;
      newRange = { start: range.start, end: range.end + delta };
    }
  }
  if (next === oldValue) return; // 0 hit → no-op

  // Only this textarea is touched. log.id / log.createdAt /
  // log.flags / other logs / entries order are structurally out
  // of reach here. The invariance contract (§5) is protected by
  // the fact that textlogPresenter renders per-log textareas and
  // collectBody preserves all other fields.
  textarea.value = next;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  // When Selection-only was in effect, snap the stored range to the
  // new span so the next Apply stays inside the (possibly shrunk /
  // expanded) replaced region, and mirror it on the textarea so the
  // user sees exactly what changed.
  if (newRange !== null) {
    state.range = newRange;
    try {
      textarea.setSelectionRange(newRange.start, newRange.end);
    } catch {
      /* happy-dom / non-focused input can reject setSelectionRange;
       * the internal state update above is what actually matters. */
    }
  }

  rerun();
}

// ── Event wiring ───────────────────────────────────────────

function wireInputHandlers(parts: OverlayParts, update: () => void): void {
  parts.findInput.addEventListener('input', update);
  parts.replaceInput.addEventListener('input', update);
  parts.regexCheckbox.addEventListener('change', update);
  parts.caseCheckbox.addEventListener('change', update);
  parts.selectionCheckbox.addEventListener('change', update);
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
