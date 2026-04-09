/**
 * Inline calculation shortcut foundation.
 *
 * Features layer — pure functions, no browser APIs, no throws. The
 * adapter layer uses these helpers to turn `1+2=` + Enter inside a
 * TEXT / TEXTLOG textarea into `1+2=3` followed by a newline.
 *
 * Scope (first pass):
 *   - Operators: `+` `-` `*` `/` `%`, parentheses, integer and
 *     decimal literals, leading unary `+` / `-`.
 *   - Trigger: the current line of the textarea ends with `=` and
 *     the caret sits at the end of that line. Anywhere else the
 *     detector returns `null` and the caller falls through to the
 *     normal Enter key behaviour.
 *   - Error policy: every helper returns a discriminated
 *     `{ ok: true; value } | { ok: false }` result instead of
 *     throwing. Invalid expressions, division or modulo by zero,
 *     non-finite results, unbalanced parentheses, and stray
 *     characters all collapse to `{ ok: false }` so the call site
 *     can silently no-op.
 *
 * Non-responsibilities (intentional):
 *   - DOES NOT know about textarea, DOM, or `KeyboardEvent`.
 *   - DOES NOT decide WHICH textarea is eligible — the adapter
 *     filters by `data-pkc-field` and entry archetype.
 *   - DOES NOT evaluate functions (`sum`, `min`, `max`),
 *     variables, units, dates, or `%` as percent (treated as
 *     modulo). Expanding the grammar is a deliberate future
 *     Issue, not a foundation concern.
 *   - DOES NOT touch the container, dispatcher, or any reducer
 *     state. Callers are responsible for wiring results into the
 *     edit target.
 *
 * Grammar (classic recursive descent, no `eval`, no `Function`):
 *
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/' | '%') factor)*
 *   factor     := ('+' | '-') factor | '(' expression ')' | number
 *   number     := digit+ ('.' digit+)?
 *
 * A whitelist regex gates the input before parsing so exotic
 * characters (letters, `,`, `^`, `!`, unicode) reject early and
 * cannot slip into `Number(...)`.
 */

/** Discriminated union returned by the evaluator. */
export type CalcResult = { ok: true; value: number } | { ok: false };

/**
 * Evaluate a single arithmetic expression. Returns `{ ok: false }`
 * for any parse error, division / modulo by zero, non-finite
 * result, or disallowed character. Never throws.
 *
 * Whitespace is allowed anywhere between tokens.
 */
export function evaluateCalcExpression(src: string): CalcResult {
  if (typeof src !== 'string') return { ok: false };
  const trimmed = src.trim();
  if (trimmed.length === 0) return { ok: false };
  // Whitelist: digits, operators, parens, dot, whitespace. Anything
  // else (letters, commas, `^`, `!`, unicode) is rejected up front
  // so the parser never sees exotic input.
  if (!/^[0-9+\-*/%().\s]+$/.test(trimmed)) return { ok: false };

  const parser = new Parser(trimmed);
  const value = parser.parseExpression();
  if (value === null) return { ok: false };
  if (!parser.atEnd()) return { ok: false };
  if (!Number.isFinite(value)) return { ok: false };
  return { ok: true, value };
}

/**
 * Internal recursive-descent parser. Returns `null` on any parse
 * failure so the top-level evaluator can wrap the result in a
 * discriminated union without throwing.
 */
class Parser {
  private pos = 0;

  constructor(private readonly src: string) {}

  atEnd(): boolean {
    this.skipWs();
    return this.pos >= this.src.length;
  }

  parseExpression(): number | null {
    let lhs = this.parseTerm();
    if (lhs === null) return null;
    for (;;) {
      this.skipWs();
      const op = this.src[this.pos];
      if (op !== '+' && op !== '-') return lhs;
      this.pos++;
      const rhs = this.parseTerm();
      if (rhs === null) return null;
      lhs = op === '+' ? lhs + rhs : lhs - rhs;
    }
  }

  parseTerm(): number | null {
    let lhs = this.parseFactor();
    if (lhs === null) return null;
    for (;;) {
      this.skipWs();
      const op = this.src[this.pos];
      if (op !== '*' && op !== '/' && op !== '%') return lhs;
      this.pos++;
      const rhs = this.parseFactor();
      if (rhs === null) return null;
      if (op === '*') {
        lhs = lhs * rhs;
      } else if (op === '/') {
        if (rhs === 0) return null;
        lhs = lhs / rhs;
      } else {
        if (rhs === 0) return null;
        lhs = lhs % rhs;
      }
    }
  }

  parseFactor(): number | null {
    this.skipWs();
    const ch = this.src[this.pos];
    if (ch === '-') {
      this.pos++;
      const inner = this.parseFactor();
      return inner === null ? null : -inner;
    }
    if (ch === '+') {
      // Unary plus — identity, kept for symmetry with unary minus.
      this.pos++;
      return this.parseFactor();
    }
    if (ch === '(') {
      this.pos++;
      const inner = this.parseExpression();
      if (inner === null) return null;
      this.skipWs();
      if (this.src[this.pos] !== ')') return null;
      this.pos++;
      return inner;
    }
    return this.parseNumber();
  }

  parseNumber(): number | null {
    this.skipWs();
    const start = this.pos;
    while (this.pos < this.src.length && isDigit(this.src[this.pos]!)) this.pos++;
    if (this.src[this.pos] === '.') {
      this.pos++;
      const fracStart = this.pos;
      while (this.pos < this.src.length && isDigit(this.src[this.pos]!)) this.pos++;
      // Reject `12.` with no fractional digits — keeps the grammar
      // simple and avoids ambiguity with future dot-based syntax.
      if (this.pos === fracStart) return null;
    }
    if (this.pos === start) return null;
    const n = Number(this.src.slice(start, this.pos));
    return Number.isFinite(n) ? n : null;
  }

  private skipWs(): void {
    while (this.pos < this.src.length && isWs(this.src[this.pos]!)) this.pos++;
  }
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isWs(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
}

/**
 * Result of inspecting the current line around `caretPos` for an
 * inline-calc trigger. `null` means no trigger should fire.
 *
 * Fields:
 *   - `lineStart` / `lineEnd` — half-open range of the current
 *     line inside `fullText`. `lineEnd` points at the terminating
 *     `\n` (or `fullText.length` on the final line).
 *   - `expression` — text between `lineStart` and the trailing
 *     `=`, whitespace-trimmed. Guaranteed non-empty.
 *   - `equalsPos` — absolute index of the `=` that triggered the
 *     detection. Useful for callers that want to highlight it.
 */
export interface InlineCalcRequest {
  lineStart: number;
  lineEnd: number;
  expression: string;
  equalsPos: number;
}

/**
 * Inspect the text around `caretPos` and return an
 * `InlineCalcRequest` if the current line ends with `=` and the
 * caret is at the end of that line. Otherwise returns `null`.
 *
 * Contract:
 *   - Caret must be at the end of the current line
 *     (`caretPos === lineEnd`). The rationale is predictability:
 *     inline calc is a mid-sentence feature and must not fire
 *     just because the line contains an `=` somewhere.
 *   - The expression must be non-empty after stripping the `=`
 *     and surrounding whitespace.
 *   - Pure: does not evaluate. Callers must still run
 *     `evaluateCalcExpression` and handle a `{ ok: false }`
 *     result as a silent no-op.
 */
export function detectInlineCalcRequest(
  fullText: string,
  caretPos: number,
): InlineCalcRequest | null {
  if (typeof fullText !== 'string') return null;
  if (caretPos < 0 || caretPos > fullText.length) return null;

  // Current line = text between the previous '\n' and the next
  // '\n'. Both scans are O(line length) and do not allocate.
  let lineStart = caretPos;
  while (lineStart > 0 && fullText[lineStart - 1] !== '\n') lineStart--;
  let lineEnd = caretPos;
  while (lineEnd < fullText.length && fullText[lineEnd] !== '\n') lineEnd++;

  // Caret must be at line end — anywhere else is a silent no-op.
  if (caretPos !== lineEnd) return null;

  const lineText = fullText.slice(lineStart, lineEnd);
  if (!lineText.endsWith('=')) return null;

  const expression = lineText.slice(0, -1).trim();
  if (expression.length === 0) return null;

  return {
    lineStart,
    lineEnd,
    expression,
    equalsPos: lineEnd - 1,
  };
}

/**
 * Format a numeric result for insertion into the textarea.
 *
 * Rules:
 *   - Non-finite values (`NaN`, `±Infinity`) render as the empty
 *     string. Callers normally filter these out before calling
 *     via the `{ ok: false }` path, but the guard is kept so the
 *     formatter is total.
 *   - Negative zero normalises to `"0"`.
 *   - Integers render without a decimal point (`"3"`, not
 *     `"3.0"`).
 *   - Non-integers go through `Number.toPrecision(12)` to trim
 *     floating-point noise like `0.1 + 0.2 = 0.30000000000000004`
 *     and come back as `"0.3"`. Twelve significant digits keeps
 *     typical decimals (`1/3 = 0.333333333333`) readable while
 *     matching JavaScript's normal output for clean values.
 */
export function formatCalcResult(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Object.is(value, -0) || value === 0) return '0';
  if (Number.isInteger(value)) return String(value);
  return Number(value.toPrecision(12)).toString();
}
