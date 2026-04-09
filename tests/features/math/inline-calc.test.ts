import { describe, it, expect } from 'vitest';
import {
  evaluateCalcExpression,
  detectInlineCalcRequest,
  formatCalcResult,
} from '@features/math/inline-calc';

// ── Evaluator (pure) ───────────────────────────────────────

describe('evaluateCalcExpression', () => {
  it('simple addition', () => {
    expect(evaluateCalcExpression('1+2')).toEqual({ ok: true, value: 3 });
  });

  it('operator precedence: * before +', () => {
    expect(evaluateCalcExpression('2+3*4')).toEqual({ ok: true, value: 14 });
  });

  it('parentheses override precedence', () => {
    expect(evaluateCalcExpression('(2+3)*4')).toEqual({ ok: true, value: 20 });
  });

  it('leading unary minus', () => {
    expect(evaluateCalcExpression('-5+2')).toEqual({ ok: true, value: -3 });
  });

  it('decimals parse and add correctly', () => {
    const r = evaluateCalcExpression('0.1+0.2');
    // Floating-point equality is fragile — assert close instead so
    // the evaluator contract (accept decimal literals) is clear.
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(0.3, 10);
  });

  it('modulo operator', () => {
    expect(evaluateCalcExpression('10%3')).toEqual({ ok: true, value: 1 });
  });

  it('whitespace is ignored between tokens', () => {
    expect(evaluateCalcExpression('  1  +  2  ')).toEqual({ ok: true, value: 3 });
  });

  it('empty / whitespace-only input returns ok:false, no throw', () => {
    expect(evaluateCalcExpression('')).toEqual({ ok: false });
    expect(evaluateCalcExpression('   ')).toEqual({ ok: false });
  });

  it('rejects alphabetic characters (no variables, functions, or unit suffixes)', () => {
    expect(evaluateCalcExpression('1+abc')).toEqual({ ok: false });
    expect(evaluateCalcExpression('sum(1,2)')).toEqual({ ok: false });
    expect(evaluateCalcExpression('10px')).toEqual({ ok: false });
    expect(evaluateCalcExpression('NaN')).toEqual({ ok: false });
    expect(evaluateCalcExpression('Infinity')).toEqual({ ok: false });
  });

  it('division by zero returns ok:false', () => {
    expect(evaluateCalcExpression('1/0')).toEqual({ ok: false });
    expect(evaluateCalcExpression('5/(2-2)')).toEqual({ ok: false });
  });

  it('modulo by zero returns ok:false', () => {
    expect(evaluateCalcExpression('5%0')).toEqual({ ok: false });
  });

  it('unbalanced parentheses fail', () => {
    expect(evaluateCalcExpression('(1+2')).toEqual({ ok: false });
    expect(evaluateCalcExpression('1+2)')).toEqual({ ok: false });
  });

  it('dangling operator fails', () => {
    expect(evaluateCalcExpression('1+')).toEqual({ ok: false });
    expect(evaluateCalcExpression('*3')).toEqual({ ok: false });
  });

  it('nested parens and mixed operators', () => {
    expect(evaluateCalcExpression('((1+2)*3-4)/5')).toEqual({ ok: true, value: 1 });
  });

  it('decimal without fractional digits rejected', () => {
    // `12.` is intentionally disallowed to keep the grammar clean.
    expect(evaluateCalcExpression('12.')).toEqual({ ok: false });
  });

  it('unary minus on parenthesised subexpression', () => {
    expect(evaluateCalcExpression('-(2+3)')).toEqual({ ok: true, value: -5 });
  });

  it('double unary minus', () => {
    expect(evaluateCalcExpression('--5')).toEqual({ ok: true, value: 5 });
  });

  it('comma is not a valid separator', () => {
    expect(evaluateCalcExpression('1,000')).toEqual({ ok: false });
  });
});

// ── Line / trigger detection (pure) ────────────────────────

describe('detectInlineCalcRequest', () => {
  it('returns a request when single line ends with = and caret at line end', () => {
    const text = '1+2=';
    const req = detectInlineCalcRequest(text, 4);
    expect(req).not.toBeNull();
    expect(req!.expression).toBe('1+2');
    expect(req!.lineStart).toBe(0);
    expect(req!.lineEnd).toBe(4);
    expect(req!.equalsPos).toBe(3);
  });

  it('returns null when caret is not at line end', () => {
    const text = '1+2=';
    expect(detectInlineCalcRequest(text, 2)).toBeNull();
    expect(detectInlineCalcRequest(text, 3)).toBeNull();
  });

  it('returns null when line has no trailing `=`', () => {
    expect(detectInlineCalcRequest('1+2', 3)).toBeNull();
    expect(detectInlineCalcRequest('hello world', 11)).toBeNull();
  });

  it('returns null when the expression before `=` is empty', () => {
    expect(detectInlineCalcRequest('=', 1)).toBeNull();
    expect(detectInlineCalcRequest('   =', 4)).toBeNull();
  });

  it('picks the current line from multi-line text', () => {
    const text = 'foo\n1+2=\nbar';
    // caret at end of middle line (position after `=`)
    const req = detectInlineCalcRequest(text, 8);
    expect(req).not.toBeNull();
    expect(req!.expression).toBe('1+2');
    expect(req!.lineStart).toBe(4);
    expect(req!.lineEnd).toBe(8);
  });

  it('does not fire when caret sits on an unrelated line', () => {
    const text = '1+2=\nbar';
    // caret at end of the `bar` line — no `=` on this line
    expect(detectInlineCalcRequest(text, 8)).toBeNull();
  });

  it('handles final line with no trailing newline', () => {
    const text = 'intro\nextra\n9-4=';
    const req = detectInlineCalcRequest(text, text.length);
    expect(req).not.toBeNull();
    expect(req!.expression).toBe('9-4');
  });

  it('returns null on out-of-range caret', () => {
    expect(detectInlineCalcRequest('1+2=', -1)).toBeNull();
    expect(detectInlineCalcRequest('1+2=', 99)).toBeNull();
  });

  it('trims whitespace around the expression', () => {
    const text = '   10*2  =';
    const req = detectInlineCalcRequest(text, text.length);
    expect(req).not.toBeNull();
    expect(req!.expression).toBe('10*2');
  });
});

// ── Formatter (pure) ───────────────────────────────────────

describe('formatCalcResult', () => {
  it('integer renders without decimal point', () => {
    expect(formatCalcResult(3)).toBe('3');
    expect(formatCalcResult(0)).toBe('0');
    expect(formatCalcResult(-42)).toBe('-42');
  });

  it('strips floating-point noise from decimal results', () => {
    expect(formatCalcResult(0.1 + 0.2)).toBe('0.3');
  });

  it('preserves meaningful decimal places', () => {
    expect(formatCalcResult(1 / 4)).toBe('0.25');
    expect(formatCalcResult(1.5)).toBe('1.5');
  });

  it('negative zero normalises to "0"', () => {
    expect(formatCalcResult(-0)).toBe('0');
  });

  it('non-finite value renders as empty string', () => {
    expect(formatCalcResult(Number.NaN)).toBe('');
    expect(formatCalcResult(Number.POSITIVE_INFINITY)).toBe('');
  });
});
