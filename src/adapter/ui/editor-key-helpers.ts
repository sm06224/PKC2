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

/** PR #198 v3 — indent unit used by Tab / Space list-level indent. */
const INDENT_UNIT = '  ';

/**
 * Tab / Shift+Tab handler for markdown-capable textareas.
 *
 * Three behaviours, in order:
 *
 *   1. **Multi-line selection** → indent or outdent every selected
 *      line. Tab prepends `INDENT_UNIT` ("  ", 2 spaces); Shift+Tab
 *      removes one leading `INDENT_UNIT` (or one `\t`) from each.
 *      Selection is preserved across the indent / outdent.
 *
 *   2. **Single cursor at the end of an empty list line** (e.g. just
 *      after Enter continued a list to `- |`) → indent the marker:
 *      `- |` becomes `  - |`. Shift+Tab outdents by one INDENT_UNIT.
 *      User-requested:
 *        「継続補完中の改行後、タブキーもしくは半角空白で字下げ補完して」
 *
 *   3. Otherwise → return `false` so the existing single-cursor Tab
 *      handler in action-binder.ts can do its `\t` insert (preserves
 *      the historical behaviour for plain prose).
 *
 * Returns `true` when handled; caller is expected to preventDefault.
 */
export function handleEditorTab(
  ta: HTMLTextAreaElement,
  shiftKey: boolean,
): boolean {
  const value = ta.value;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? start;

  // Case 1: multi-line selection — indent / outdent each line.
  if (start !== end) {
    const selected = value.slice(start, end);
    if (!selected.includes('\n')) return false; // single-line selection: fall through

    const firstLineStart = value.lastIndexOf('\n', start - 1) + 1;
    // Selection ending RIGHT AFTER a newline shouldn't expand into
    // the line below — the user didn't visibly select it.
    let regionEnd = end;
    if (value.charAt(end - 1) === '\n') {
      regionEnd = end - 1;
    }

    const before = value.slice(0, firstLineStart);
    const region = value.slice(firstLineStart, regionEnd);
    const after = value.slice(regionEnd);
    const lines = region.split('\n');

    const modifiedLines = lines.map((line) => {
      if (shiftKey) {
        if (line.startsWith(INDENT_UNIT)) return line.slice(INDENT_UNIT.length);
        if (line.startsWith('\t')) return line.slice(1);
        return line;
      }
      return INDENT_UNIT + line;
    });
    const modified = modifiedLines.join('\n');
    const delta = modified.length - region.length;

    ta.value = before + modified + after;
    // Anchor selection at firstLineStart so repeated Tab / Shift+Tab
    // keep stepping the indent in place.
    ta.selectionStart = firstLineStart;
    ta.selectionEnd = regionEnd + delta;
    notifyInput(ta);
    return true;
  }

  // Case 2: cursor at end of empty list line — indent the marker.
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const currentLine = value.slice(lineStart, start);
  // Same shape as the Enter-continuation regex: indent + marker +
  // space (+ optional `[ ]` checkbox), with NOTHING after — so we
  // know this is an "empty list slot" the user just created.
  const m = /^([\t ]*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?$/.exec(currentLine);
  if (!m) return false;

  const indent = m[1] ?? '';
  if (shiftKey) {
    if (indent.startsWith(INDENT_UNIT)) {
      ta.value = value.slice(0, lineStart) + currentLine.slice(INDENT_UNIT.length) + value.slice(start);
      ta.selectionStart = ta.selectionEnd = start - INDENT_UNIT.length;
      notifyInput(ta);
      return true;
    }
    if (indent.startsWith('\t')) {
      ta.value = value.slice(0, lineStart) + currentLine.slice(1) + value.slice(start);
      ta.selectionStart = ta.selectionEnd = start - 1;
      notifyInput(ta);
      return true;
    }
    return false;
  }
  // indent: prepend INDENT_UNIT to the current line (which shifts the
  // marker right and the cursor along with it).
  ta.value = value.slice(0, lineStart) + INDENT_UNIT + currentLine + value.slice(start);
  ta.selectionStart = ta.selectionEnd = start + INDENT_UNIT.length;
  notifyInput(ta);
  return true;
}

/**
 * Space-on-empty-list-line indent. User audit specifies Space as an
 * alternative to Tab(「タブキーもしくは半角空白で字下げ補完」)— useful
 * on iPhone / iPad where a hardware Tab is rare.
 *
 * Only fires when the cursor is at the end of an "empty list slot"
 * (same precondition as `handleEditorTab` case 2). Anywhere else,
 * Space is just Space — surprising mid-content level changes are
 * worse than missing a shortcut.
 */
export function handleEditorSpaceIndent(ta: HTMLTextAreaElement): boolean {
  const value = ta.value;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? start;
  if (start !== end) return false;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const currentLine = value.slice(lineStart, start);
  const m = /^([\t ]*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?$/.exec(currentLine);
  if (!m) return false;
  ta.value = value.slice(0, lineStart) + INDENT_UNIT + currentLine + value.slice(start);
  ta.selectionStart = ta.selectionEnd = start + INDENT_UNIT.length;
  notifyInput(ta);
  return true;
}

/**
 * iOS Safari + Japanese IME workaround (PR #198 follow-up,
 * 2026-04-29):
 *
 * Bracket auto-pair and skip-out are routed through `beforeinput`
 * instead of `keydown`. On iOS, calling `preventDefault()` on a
 * `keydown` whose source is the on-screen keyboard with IME enabled
 * is **not honoured** — the platform inserts the character anyway,
 * producing duplicates like `((` for a typed `(`. `beforeinput`
 * is reliably cancelable across iOS / Android / desktop and fires
 * for the committed text insertion (after IME has decided), so the
 * platform character can be cleanly substituted with our pair.
 *
 * Filtering: only `inputType === 'insertText'` with single-character
 * `data` participates; pastes / drops / IME composition fragments
 * are untouched.
 */
export function handleEditorBeforeInput(
  ta: HTMLTextAreaElement,
  event: InputEvent,
): boolean {
  if (event.inputType !== 'insertText') return false;
  const data = event.data;
  if (!data || data.length !== 1) return false;

  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? start;

  // Space at empty list slot — iOS soft keyboard doesn't have Tab,
  // so Space is the touch-friendly indent trigger. The keydown
  // path also handles this for hardware keyboards on desktop /
  // iPad (Bluetooth), but iOS Safari ignores `preventDefault` on
  // soft-keyboard keydown, so beforeinput is the reliable route.
  // `handleEditorSpaceIndent` returns false outside an empty list
  // slot, so plain-prose Space falls through normally.
  if (data === ' ' && start === end) {
    if (handleEditorSpaceIndent(ta)) return true;
  }

  if (start !== end) return false;

  // Skip-out: cursor sits directly before the same closer the user
  // just typed → swallow the input and step cursor forward.
  if (isLikelyClosing(data)) {
    if (ta.value.charAt(start) === data) {
      ta.selectionStart = ta.selectionEnd = start + 1;
      return true;
    }
  }

  // Auto-pair: typing an opener inserts the closer too (cursor
  // between). Skipped when next char is a word character (literal
  // mid-word opener).
  const close = PAIRS[data];
  if (close) {
    const next = ta.value.charAt(start);
    if (/\w/.test(next)) return false;
    spliceText(ta, start, start, data + close, 'inside', 1);
    notifyInput(ta);
    return true;
  }
  return false;
}

/**
 * Master dispatch: route a keydown into the appropriate helper.
 * Returns `true` when one of the helpers handled the event; the
 * caller should `event.preventDefault()`.
 *
 * Bracket auto-pair and skip-out are NOT routed here — they go
 * through `handleEditorBeforeInput` (see iOS workaround note).
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
  // Tab / Shift+Tab — list-level indent at empty list slot OR
  // multi-line indent / outdent. Falls through to action-binder's
  // existing single-cursor `\t` insert when neither precondition is
  // met (so plain prose Tab still types a tab character).
  if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    return handleEditorTab(ta, event.shiftKey);
  }
  // Space — list-level indent at empty list slot only. Mirrors the
  // user audit「タブキーもしくは半角空白で字下げ補完」(Space as
  // touch-friendly alternative to Tab on iPhone / iPad).
  if (event.key === ' ' && !event.shiftKey) {
    if (handleEditorSpaceIndent(ta)) return true;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    return handleEditorEnter(ta);
  }
  return false;
}
