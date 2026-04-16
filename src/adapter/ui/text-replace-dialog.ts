/**
 * Text replace dialog — minimal find/replace UI for the CURRENT
 * TEXT-entry body (S-26).
 *
 * Scope (v1):
 *   - Operates on a single `<textarea data-pkc-field="body">` the
 *     caller passes in.
 *   - Plain substring OR JavaScript RegExp find, with case-sensitive
 *     opt-in. No whole-word / multiline / preserve-case toggles.
 *   - Shows live hit count and disables Apply on zero hits or invalid
 *     regex. Invalid-regex error is shown inline.
 *   - Apply rewrites `textarea.value` and fires a synthetic `input`
 *     event so the existing dirty-state / preview / commit flow sees
 *     the change exactly as if the user had typed it.
 *
 * Out of scope (v1):
 *   - title / source_url / tags / TEXTLOG / block editor / global
 *     replace / multi-entry replace / whole-word / preserve-case /
 *     replace-next navigation.
 *   - See `docs/development/text-replace-current-entry.md`.
 *
 * Readonly / historical-revision paths never reach here because the
 * entry-point action (`open-replace-dialog`, wired in action-binder)
 * is emitted only from the edit-mode action bar for TEXT entries,
 * which is itself suppressed when `state.readonly` is true.
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

const OVERLAY_CLASS = 'pkc-text-replace-overlay';
const CARD_CLASS = 'pkc-text-replace-card';
const STATUS_CLASS = 'pkc-text-replace-status';
const ROW_CLASS = 'pkc-text-replace-row';
const ACTIONS_CLASS = 'pkc-text-replace-actions';

const FIELD_FIND = 'text-replace-find';
const FIELD_REPLACE = 'text-replace-replace';
const FIELD_REGEX = 'text-replace-regex';
const FIELD_CASE = 'text-replace-case';
const FIELD_SELECTION = 'text-replace-selection';
const ACTION_APPLY = 'text-replace-apply';
const ACTION_CLOSE = 'text-replace-close';

const DATA_REGION = 'text-replace-dialog';

// ── Module singleton state ─────────────────────────────────

let activeOverlay: HTMLElement | null = null;
let activeTextarea: HTMLTextAreaElement | null = null;
let activeEscapeHandler: ((e: KeyboardEvent) => void) | null = null;

/**
 * Per-dialog mutable state. The range is captured at open time and
 * shifted after each Apply that changes the selected slice's length,
 * so repeated replaces stay confined to what was originally selected
 * (now possibly shrunk / expanded).
 *
 * `range: null` means the textarea had no non-empty selection at open
 * time; the Selection-only checkbox is rendered but disabled in that
 * case and the state stays `null` for the life of the dialog.
 */
interface DialogState {
  range: SelectionRange | null;
}

// ── DOM helper ─────────────────────────────────────────────

/** Tiny DOM helper — keeps build code short. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// ── Exported readers / closers ─────────────────────────────

/** True while the replace dialog overlay is mounted. */
export function isTextReplaceDialogOpen(): boolean {
  return activeOverlay !== null;
}

/**
 * Unmount the dialog if open. Safe to call from anywhere; a no-op
 * when the dialog is already closed.
 */
export function closeTextReplaceDialog(): void {
  unmount();
}

// ── Entry point ────────────────────────────────────────────

/**
 * Open the replace dialog against a specific TEXT body textarea.
 * When a dialog is already open, it is unmounted first so the new
 * call wins — prevents overlays from stacking across re-renders.
 *
 * Silently returns when the target textarea is not a TEXT body
 * (`data-pkc-field !== 'body'`). Callers may defensively invoke this
 * even when they are not sure a body textarea is in the DOM.
 */
export function openTextReplaceDialog(
  textarea: HTMLTextAreaElement,
  root: HTMLElement,
): void {
  if (textarea.getAttribute('data-pkc-field') !== 'body') return;
  if (activeOverlay !== null) unmount();

  // Capture the selection BEFORE we build the overlay — mounting the
  // overlay moves focus and may collapse the textarea's selection.
  const captured = captureSelection(textarea);
  const state: DialogState = { range: captured };

  const parts = buildOverlay();
  root.appendChild(parts.overlay);

  // Selection-only is meaningful only when the textarea had a
  // non-empty selection at open time. Otherwise we disable the
  // checkbox so the user cannot switch into a mode that would count
  // zero regardless of the Find string.
  if (captured === null) {
    parts.selectionCheckbox.disabled = true;
    parts.selectionCheckbox.title = 'No selection in the body textarea';
  }

  const update = (): void => updateStatus(parts, textarea, state);
  const doApply = (): void => applyReplace(parts, textarea, state, update);

  wireInputHandlers(parts, update);
  wireApply(parts, doApply);
  wireClose(parts);

  activeOverlay = parts.overlay;
  activeTextarea = textarea;

  // Initial status + focus Find input.
  update();
  parts.findInput.focus();
}

/**
 * Snapshot `textarea.selectionStart/End` into a plain range. Returns
 * `null` when the selection is empty or the browser does not expose
 * coherent numbers (happy-dom returns null for unfocused inputs —
 * that path degrades to "full body" mode without throwing).
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

/**
 * Mutable selection range the dialog operates on when "Selection
 * only" is ON. Captured from `textarea.selectionStart/End` at open
 * time and shifted after each successful apply so repeated replaces
 * remain confined to the replaced span.
 *
 * `null` means the textarea had no non-empty selection at open; the
 * Selection-only checkbox is disabled in that case and the state
 * stays `null` for the life of the dialog.
 */
interface SelectionRange {
  start: number;
  end: number;
}

function buildOverlay(): OverlayParts {
  const overlay = el('div', OVERLAY_CLASS);
  overlay.setAttribute('data-pkc-region', DATA_REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Find and replace');

  const card = el('div', CARD_CLASS);
  const title = el('h2', 'pkc-text-replace-title');
  title.textContent = 'Find & Replace (current entry)';
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

  // S-27: Selection only. Disabled by the entry point when the
  // textarea has no non-empty selection at open time. Keeping the
  // checkbox in the DOM (rather than omitting it) gives the user a
  // stable landmark and lets tests assert the disabled/enabled state.
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
 * meaning callers should operate over the whole textarea value.
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
  const scope = range === null ? 'current entry' : 'selection';
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
  if (next === oldValue) return;

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

  // Refresh the hit count in place so the dialog becomes visibly
  // "done" rather than still advertising the pre-apply count.
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

  // Enter inside the Find or Replace field triggers Apply when it is
  // enabled, matching typical find/replace UX.
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

  // Click on the backdrop (overlay itself, not the inner card)
  // closes the dialog. Using mousedown so a click-drag that starts
  // on the card but ends on the backdrop does not close.
  parts.overlay.addEventListener('mousedown', (e) => {
    if (e.target === parts.overlay) unmount();
  });

  // Escape from anywhere in the document closes only the dialog.
  // stopPropagation so the global Escape handler (which may cancel
  // edit mode) does not also fire on the same keypress.
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
    // Return focus to the textarea so the user can keep editing
    // without an intermediate click.
    if (returnFocus && document.contains(returnFocus)) {
      returnFocus.focus();
    }
  }
  activeTextarea = null;
}
