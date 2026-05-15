import { describe, it, expect } from 'vitest';
import {
  computeQuoteAssistOnEnter,
  computeQuoteToggleOnSelection,
} from '@features/markdown/quote-assist';

/**
 * USER_REQUEST_LEDGER S-17(B-3)pure unit coverage。
 * Slice α(continuation):2026-04-14 着地。
 * Slice β(exit / bulk toggle):2026-05-14 PR-V3 wave 着地。
 *
 * action-binder integration は tests/adapter/quote-assist-handler.test.ts、
 * entry-window child の inline mirror は tests/adapter/entry-window-quote-
 * assist.test.ts。
 */

describe('computeQuoteAssistOnEnter — continuation success cases', () => {
  it('continues at end of a single non-empty `> X` line (caret at EOF)', () => {
    const value = '> hello';
    const result = computeQuoteAssistOnEnter(value, value.length);
    expect(result).toEqual({ type: 'continue', insert: '\n> ' });
  });

  it('continues at end of `> X` line followed by another line', () => {
    const value = '> first\nrest';
    const caret = '> first'.length;
    const result = computeQuoteAssistOnEnter(value, caret);
    expect(result).toEqual({ type: 'continue', insert: '\n> ' });
  });

  it('continues across multiple existing quote lines', () => {
    const value = '> line1\n> line2';
    const caret = value.length;
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
    expect(result).toEqual({ type: 'continue', insert: '\n> ' });
  });
});

describe('computeQuoteAssistOnEnter — Slice β exit (empty `> ` line)', () => {
  it('exits on `> ` empty line (caret at EOF)', () => {
    const value = '> ';
    const r = computeQuoteAssistOnEnter(value, value.length);
    expect(r).toEqual({ type: 'exit', rangeStart: 0, rangeEnd: 2, replacement: '\n' });
  });

  it('exits on bare `>` line (caret at EOF)', () => {
    const value = '>';
    const r = computeQuoteAssistOnEnter(value, value.length);
    expect(r).toEqual({ type: 'exit', rangeStart: 0, rangeEnd: 1, replacement: '\n' });
  });

  it('exits on `prefix\\n> ` empty trailing line', () => {
    const value = 'prefix\n> ';
    const r = computeQuoteAssistOnEnter(value, value.length);
    expect(r).toEqual({ type: 'exit', rangeStart: 7, rangeEnd: 9, replacement: '\n' });
  });

  it('exits on `> first\\n> second\\n> ` empty trailing line', () => {
    const value = '> first\n> second\n> ';
    const r = computeQuoteAssistOnEnter(value, value.length);
    expect(r).toEqual({
      type: 'exit',
      rangeStart: '> first\n> second\n'.length,
      rangeEnd: value.length,
      replacement: '\n',
    });
  });
});

describe('computeQuoteAssistOnEnter — null cases', () => {
  it('returns null when the line does not start with `>`', () => {
    const value = 'hello';
    const result = computeQuoteAssistOnEnter(value, value.length);
    expect(result).toBeNull();
  });

  it('returns null when caret is mid-line (next char is not \\n)', () => {
    const value = '> hello world';
    const caret = '> hello'.length;
    const result = computeQuoteAssistOnEnter(value, caret);
    expect(result).toBeNull();
  });

  it('still returns continue for nested `>> X` (single-level rule, captures as text)', () => {
    const value = '>> nested';
    const result = computeQuoteAssistOnEnter(value, value.length);
    expect(result).toEqual({ type: 'continue', insert: '\n> ' });
  });

  it('returns null for caretPos out of range', () => {
    expect(computeQuoteAssistOnEnter('> x', -1)).toBeNull();
    expect(computeQuoteAssistOnEnter('> x', 999)).toBeNull();
  });

  it('returns null on previous-line context when current line is plain', () => {
    const value = '> quoted\nplain';
    const result = computeQuoteAssistOnEnter(value, value.length);
    expect(result).toBeNull();
  });
});

describe('computeQuoteToggleOnSelection — bulk add `> `', () => {
  it('adds `> ` to a single non-quote line via caret-only selection', () => {
    const value = 'hello';
    const r = computeQuoteToggleOnSelection(value, 0, value.length);
    expect(r?.value).toBe('> hello');
    expect(r?.selStart).toBe(0);
    expect(r?.selEnd).toBe('> hello'.length);
  });

  it('adds `> ` to all selected lines when one is non-quote', () => {
    const value = '> first\nsecond\n> third';
    const r = computeQuoteToggleOnSelection(value, 0, value.length);
    expect(r?.value).toBe('> > first\n> second\n> > third');
  });

  it('adds `> ` to caret-only selection on a non-quote line', () => {
    const value = 'plain';
    const r = computeQuoteToggleOnSelection(value, 3, 3);
    expect(r?.value).toBe('> plain');
  });

  it('adds `> ` on an empty caret-only line (creates `> `)', () => {
    const value = '';
    const r = computeQuoteToggleOnSelection(value, 0, 0);
    expect(r?.value).toBe('> ');
    expect(r?.selStart).toBe(0);
    expect(r?.selEnd).toBe('> '.length);
  });
});

describe('computeQuoteToggleOnSelection — bulk strip `> `', () => {
  it('strips `> ` from a single quoted line', () => {
    const value = '> hello';
    const r = computeQuoteToggleOnSelection(value, 0, value.length);
    expect(r?.value).toBe('hello');
  });

  it('strips `> ` from all selected quoted lines', () => {
    const value = '> first\n> second\n> third';
    const r = computeQuoteToggleOnSelection(value, 0, value.length);
    expect(r?.value).toBe('first\nsecond\nthird');
  });

  it('strips `>\\t` (tab separator)', () => {
    const value = '>\tfirst\n>\tsecond';
    const r = computeQuoteToggleOnSelection(value, 0, value.length);
    expect(r?.value).toBe('first\nsecond');
  });
});

describe('computeQuoteToggleOnSelection — edge cases', () => {
  it('selection ending at start-of-line does not include the next line', () => {
    const value = 'first\nsecond\nthird';
    // selection covers "first\n" exactly
    const r = computeQuoteToggleOnSelection(value, 0, 'first\n'.length);
    expect(r?.value).toBe('> first\nsecond\nthird');
  });

  it('returns null for out-of-range positions', () => {
    expect(computeQuoteToggleOnSelection('hi', -1, 1)).toBeNull();
    expect(computeQuoteToggleOnSelection('hi', 0, 999)).toBeNull();
  });

  it('handles `selStart > selEnd` by swapping', () => {
    const value = 'hello';
    const r = computeQuoteToggleOnSelection(value, value.length, 0);
    expect(r?.value).toBe('> hello');
  });
});
