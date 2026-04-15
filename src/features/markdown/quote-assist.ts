/**
 * Markdown quote (`> …`) input assist — Slice α (continuation only).
 *
 * USER_REQUEST_LEDGER S-17 (2026-04-14, B-3 partial promotion).
 * Spec: docs/development/markdown-extensions/markdown-quote-input-assist.md
 *
 * Features layer — pure function, no DOM access, no side effects.
 *
 * Slice α scope (this file):
 *   - When the user is at the end of a non-empty `> …` line and
 *     presses Enter, suggest inserting `\n> ` instead of the bare
 *     `\n` so the next line continues the blockquote naturally.
 *
 * Deferred (still CONDITIONAL — Slice β / γ):
 *   - Empty `>` line → Enter exits the blockquote (removes the
 *     trailing `> ` instead of just continuing it forever)
 *   - Selection-range bulk `> ` toggle keyboard shortcut
 *   - Same logic mirrored into the entry-window child-side script
 *
 * Why a pure helper rather than inlining the keydown logic:
 *   - Lets us pin the line-detection / prefix-matching corner cases
 *     in vitest without a DOM
 *   - Makes the eventual Slice β additions (exit / bulk toggle)
 *     additive — they extend `QuoteAssistAction` and reuse the
 *     same line scanner
 */

/** Action returned by the assist computation, or null when nothing should happen. */
export type QuoteAssistAction =
  | { type: 'continue'; insert: string };

/**
 * Evaluate whether the current Enter keypress in a markdown textarea
 * should be enriched with a `> ` continuation prefix.
 *
 * Pure: takes (textarea value, caret offset) and returns either an
 * action describing what to insert, or null when the assist does
 * not apply.
 *
 * Continuation rule:
 *   1. The caret must be a collapsed point (caller responsibility).
 *   2. The caret must be at the END of its current line — either
 *      at the end of `value`, or immediately before a `\n`. Mid-
 *      line Enters fall through to native behaviour so users can
 *      still split a quote line in two.
 *   3. The current line (substring from the previous `\n` exclusive
 *      to the caret) must match `> X` where X is non-empty after
 *      stripping any single space / tab right after the `>`.
 *      Empty `>` and `> ` lines fall through (no continuation —
 *      Slice β will turn those into "exit blockquote" later).
 *   4. Only one level of `>` is recognised in this slice. Nested
 *      blockquotes (`>>`, `> >`, etc.) are out of Slice α scope to
 *      keep the rule narrow and predictable.
 *
 * On match: return `{ type: 'continue', insert: '\n> ' }`. The
 * caller is expected to `preventDefault()` the Enter and insert
 * `insert` at the caret (we recommend `execCommand('insertText',
 * false, insert)` to preserve the textarea's native undo stack).
 */
export function computeQuoteAssistOnEnter(
  value: string,
  caretPos: number,
): QuoteAssistAction | null {
  if (caretPos < 0 || caretPos > value.length) return null;
  // Caret must be at end-of-line (next char is \n or EOF).
  if (caretPos < value.length && value[caretPos] !== '\n') return null;
  // Find the start of the current line.
  const lineStart = value.lastIndexOf('\n', caretPos - 1) + 1;
  const line = value.slice(lineStart, caretPos);
  // Match `> ` or `>\t` or `>` (single-level only). Capture what
  // follows the prefix to check non-empty.
  const m = /^>[ \t]?(.*)$/.exec(line);
  if (!m) return null;
  const afterPrefix = m[1] ?? '';
  // Empty quote line — Slice β handles "exit blockquote". Stay null
  // here so native Enter just creates another empty line; the user
  // can still backspace twice to escape, matching pre-S-17 behaviour.
  if (afterPrefix === '') return null;
  return { type: 'continue', insert: '\n> ' };
}
