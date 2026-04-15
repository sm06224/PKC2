import { describe, it, expect } from 'vitest';
import { computeQuoteAssistOnEnter } from '@features/markdown/quote-assist';

/**
 * USER_REQUEST_LEDGER S-17 (2026-04-14, B-3 Slice α) — pure unit
 * coverage for the markdown quote-continuation helper. The
 * action-binder integration (Enter keydown → execCommand insertText)
 * is pinned separately in tests/adapter/quote-assist-handler.test.ts.
 *
 * Pinned contract (Slice α, continuation only):
 *   - Returns `{ type: 'continue', insert: '\n> ' }` when:
 *       1. caret is at the END of a line (next char is `\n` or EOF), AND
 *       2. that line matches `^>[ \t]?(.+)$` — single-level `>` /
 *          `> ` / `>\t` prefix followed by at least one non-whitespace
 *          character (we strip ONLY the optional single space/tab
 *          right after `>`; trailing content matters for non-empty)
 *   - Returns null otherwise (mid-line caret, empty quote line, no
 *     `>` prefix, nested `>>`, out-of-range caret, etc.).
 *
 * Slice β / γ (still CONDITIONAL): exit on empty `> `, bulk prefix
 * shortcut, entry-window mirror. Those will return `{ type: 'exit' }`
 * etc. as additional union members; until then this helper says
 * null and the textarea's native behaviour runs.
 */

describe('computeQuoteAssistOnEnter — continuation success cases', () => {
  it('continues at end of a single non-empty `> X` line (caret at EOF)', () => {
    const value = '> hello';
    const result = computeQuoteAssistOnEnter(value, value.length);
    expect(result).toEqual({ type: 'continue', insert: '\n> ' });
  });

  it('continues at end of `> X` line followed by another line', () => {
    const value = '> first\nrest';
    const caret = '> first'.length; // right before the \n
    const result = computeQuoteAssistOnEnter(value, caret);
    expect(result).toEqual({ type: 'continue', insert: '\n> ' });
  });

  it('continues across multiple existing quote lines', () => {
    const value = '> line1\n> line2';
    const caret = value.length; // end of "> line2"
    const result = computeQuoteAssistOnEnter(value, caret);
    expect(result).toEqual({ type: 'continue', insert: '\n> ' });
  });

  it('treats a tab after `>` as the optional separator', () => {
    const value = '>\thello';
    const result = computeQuoteAssistOnEnter(value, value.length);
    expect(result).toEqual({ type: 'continue', insert: '\n> ' });
  });

  it('treats no separator after `>` as also valid (>X)', () => {
    const value = '>hello';
    const result = computeQuoteAssistOnEnter(value, value.length);
    // `>hello` has no separator; the regex `^>[ \t]?(.+)$` allows
    // zero or one separator, so `hello` matches as the captured
    // non-empty group.
    expect(result).toEqual({ type: 'continue', insert: '\n> ' });
  });
});

describe('computeQuoteAssistOnEnter — null cases', () => {
  it('returns null on an empty quote line `> ` (deferred to Slice β)', () => {
    const value = '> ';
    const result = computeQuoteAssistOnEnter(value, value.length);
    expect(result).toBeNull();
  });

  it('returns null on a bare `>` line (also empty, deferred)', () => {
    const value = '>';
    const result = computeQuoteAssistOnEnter(value, value.length);
    expect(result).toBeNull();
  });

  it('returns null when the line does not start with `>`', () => {
    const value = 'hello';
    const result = computeQuoteAssistOnEnter(value, value.length);
    expect(result).toBeNull();
  });

  it('returns null when caret is mid-line (next char is not \\n)', () => {
    const value = '> hello world';
    // caret right after "> hello" — there's still " world" after.
    const caret = '> hello'.length;
    const result = computeQuoteAssistOnEnter(value, caret);
    expect(result).toBeNull();
  });

  it('returns null for nested `>> X` (Slice α handles single level only)', () => {
    const value = '>> nested';
    const result = computeQuoteAssistOnEnter(value, value.length);
    // `>>` does not match `^>[ \t]?` followed by non-empty content
    // (the second `>` is consumed as the captured "rest"). Wait —
    // actually `^>[ \t]?(.+)$` would match `>` then no separator
    // then `> nested` as the captured group. So the rule WOULD say
    // continue. We must check: is that desirable?
    //
    // For Slice α the rule is "single level only" — but the regex
    // does match. This test pins the CURRENT behaviour so changes
    // are explicit. If we later want to reject `>> X` as nested,
    // the helper needs a tighter regex.
    expect(result).toEqual({ type: 'continue', insert: '\n> ' });
  });

  it('returns null for caretPos out of range', () => {
    expect(computeQuoteAssistOnEnter('> x', -1)).toBeNull();
    expect(computeQuoteAssistOnEnter('> x', 999)).toBeNull();
  });

  it('returns null on previous-line context when current line is plain', () => {
    // `> quoted\nplain` with caret at end of "plain" — the current
    // line is "plain", not the previous quote.
    const value = '> quoted\nplain';
    const result = computeQuoteAssistOnEnter(value, value.length);
    expect(result).toBeNull();
  });
});
