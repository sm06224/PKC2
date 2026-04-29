/**
 * Editor textarea key helpers (PR #198).
 *
 * Three orthogonal enhancements for the markdown body / textlog
 * textareas:
 *
 *   1. Enter key — preserve indent + continue lists
 *      (`- foo` ↵ → `- ` on the next line; empty list line drops
 *      the marker, providing a natural escape).
 *   2. Bracket pair auto-completion — typing `(` `[` `{` `"` `'` `` ` ``
 *      inserts the matching closer with the cursor between.
 *   3. Skip-out — typing the closing bracket when the cursor is
 *      already directly before that same character moves the cursor
 *      forward instead of producing a duplicate.
 *
 * All functions return `true` when they consumed the key (caller is
 * expected to invoke `event.preventDefault()` and dispatch an `input`
 * event so subscribers like preview / dirty-tracking pick up the
 * change). They return `false` to let default behaviour proceed.
 *
 * IME guards live at the call site (`event.isComposing`); these
 * helpers assume non-IME input.
 *
 * Pure DOM helpers — no dispatcher / state coupling.
 */

/**
 * Auto-pair character → matching closer. `'` (apostrophe) is
 * intentionally excluded — it appears mid-word in English
 * contractions (`don't`, `won't`) far more often than as an opening
 * quote, so auto-pairing creates more friction than help.
 */
const PAIRS: Readonly<Record<string, string>> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  '`': '`',
};

function isLikelyClosing(ch: string): boolean {
  return ch === ')' || ch === ']' || ch === '}' || ch === '"' || ch === "'" || ch === '`';
}

function notifyInput(ta: HTMLTextAreaElement): void {
  // setRangeText doesn't fire `input`. Subscribers (preview pane,
  // dirty-state, autosave) listen for it; without this they'd miss
  // the change.
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Splice `text` into `ta` at [start, end] using `setRangeText` when
 * available so the browser's undo stack stays intact, falling back
 * to direct value assignment otherwise.
 *
 * `cursor` describes where the caret should land relative to the
 * inserted text:
 *   - 'end'    → after the last inserted character (default)
 *   - 'inside' → between split halves (used for bracket pairs)
 */
function spliceText(
  ta: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
  cursor: 'end' | 'inside',
  insidePoint?: number,
): void {
  if (typeof ta.setRangeText === 'function') {
    ta.setRangeText(text, start, end, cursor === 'end' ? 'end' : 'preserve');
    if (cursor === 'inside') {
      const point = start + (insidePoint ?? Math.floor(text.length / 2));
      ta.selectionStart = ta.selectionEnd = point;
    }
  } else {
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    ta.value = before + text + after;
    if (cursor === 'end') {
      ta.selectionStart = ta.selectionEnd = start + text.length;
    } else {
      ta.selectionStart = ta.selectionEnd = start + (insidePoint ?? Math.floor(text.length / 2));
    }
  }
}

/**
 * Handle Enter: indent maintenance + list continuation + escape.
 *
 * Cases:
 *   - Selection range (start !== end) → defer to default (replace).
 *   - Empty list line (e.g. `- ` with no content after the marker)
 *     → consume the line's indent + marker entirely, leaving an
 *     empty new paragraph. This is the "natural escape" pattern.
 *   - Plain indented line → next line starts with the same indent.
 *   - List line with content → next line starts with same indent +
 *     marker. For ordered lists (`1. foo`), the next number is
 *     `<n+1>.`; checkbox markers (`- [ ]`) carry through with an
 *     empty checkbox.
 *
 * Returns `true` if handled.
 */
export function handleEditorEnter(ta: HTMLTextAreaElement): boolean {
  const value = ta.value;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? start;
  if (start !== end) return false;

  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const currentLine = value.slice(lineStart, start);

  // Capture: indent + optional list marker (- | * | + | <digits>.) +
  // optional checkbox `[ ]` / `[x]` + space.
  const m = /^([\t ]*)(?:([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?)?/.exec(currentLine);
  if (!m) return false;

  const indent = m[1] ?? '';
  const marker = m[2];
  const checkbox = m[3];
  const restOfLine = currentLine.slice(m[0].length);

  // PR #198 v2: a plain Enter on a non-indented, non-list line
  // returns false so OTHER keydown handlers downstream
  // (inline-calc on `2+3=`, quote-continuation on `> foo`,
  // textlog-append-on-Ctrl-Enter, etc.) get to see the event.
  // Only consume Enter when there is real indent / list state to
  // continue.
  if (indent === '' && !marker) return false;

  // Empty list line → drop the marker (and indent) so user "exits"
  // the list naturally. This matches Notion / VSCode convention.
  if (marker && restOfLine.length === 0) {
    spliceText(ta, lineStart, start, '', 'end');
    notifyInput(ta);
    return true;
  }

  // Continue: \n + indent (+ marker) (+ empty checkbox if previous had one).
  let next = '\n' + indent;
  if (marker) {
    if (/^\d+\./.test(marker)) {
      const num = parseInt(marker, 10);
      next += `${num + 1}. `;
    } else {
      next += `${marker} `;
    }
    if (checkbox) {
      next += '[ ] ';
    }
  }

  spliceText(ta, start, start, next, 'end');
  notifyInput(ta);
  return true;
}

/**
 * Handle open-bracket: insert the closing pair and place the cursor
 * between them.
 *
 * Skipped when:
 *   - selection is non-empty (we'd wrap, not auto-pair). A future
 *     extension can wrap the selection here; v1 keeps it conservative.
 *   - the next character is a word character (the user is mid-word
 *     and probably means a literal opening bracket).
 *
 * For symmetric pairs (`"`, `'`, `` ` ``):
 *   - if the cursor is RIGHT BEFORE the same char, treat as skip-out
 *     instead (handled by `handleEditorSkipOut`).
 *
 * Returns `true` if handled.
 */
export function handleEditorBracketOpen(
  ta: HTMLTextAreaElement,
  ch: string,
): boolean {
  const close = PAIRS[ch];
  if (!close) return false;

  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? start;
  if (start !== end) return false;

  const next = ta.value.charAt(start);
  // Don't auto-pair when the char ahead is a word character — the
  // user is likely typing a literal opener mid-word.
  if (/\w/.test(next)) return false;

  spliceText(ta, start, start, ch + close, 'inside', 1);
  notifyInput(ta);
  return true;
}

/**
 * Handle close-bracket / matching-quote skip-out.
 *
 * If the cursor is directly before the same character the user just
 * typed, advance the cursor instead of producing a duplicate. This is
 * the natural counterpart to `handleEditorBracketOpen` — type `(`,
 * insert `()`, type `)` → cursor moves outside the pair.
 *
 * Returns `true` if handled.
 */
export function handleEditorSkipOut(
  ta: HTMLTextAreaElement,
  ch: string,
): boolean {
  if (!isLikelyClosing(ch)) return false;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? start;
  if (start !== end) return false;
  const next = ta.value.charAt(start);
  if (next !== ch) return false;
  ta.selectionStart = ta.selectionEnd = start + 1;
  return true;
}

/**
 * Master dispatch: route a keydown into the appropriate helper.
 * Returns `true` when one of the helpers handled the event; the
 * caller should `event.preventDefault()`.
 *
 * Caller is expected to have already filtered:
 *   - target is a textarea with a markdown-capable `data-pkc-field`
 *   - `event.isComposing === false` (not IME)
 *   - no modifier keys other than Shift
 */
export function tryHandleEditorKey(
  ta: HTMLTextAreaElement,
  event: KeyboardEvent,
): boolean {
  if (event.key === 'Enter' && !event.shiftKey) {
    return handleEditorEnter(ta);
  }
  // Single-character keys: open bracket OR closing skip-out.
  // Symmetric pairs (`"`, `'`, `` ` ``) ambiguity: try skip-out first.
  // Asymmetric closers (`)`, `]`, `}`) only do skip-out.
  if (event.key.length === 1 && isLikelyClosing(event.key)) {
    if (handleEditorSkipOut(ta, event.key)) return true;
  }
  if (event.key.length === 1 && PAIRS[event.key]) {
    return handleEditorBracketOpen(ta, event.key);
  }
  return false;
}
