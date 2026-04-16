/**
 * Text find/replace helpers for the TEXT-entry body dialog (S-26).
 *
 * Pure algorithmic functions — no DOM, no state, no side effects.
 * The adapter layer owns the dialog UI (`text-replace-dialog.ts`) and
 * is the only caller; tests exercise these helpers directly.
 *
 * Scope: plain-substring and JavaScript `RegExp` find/replace over a
 * single TEXT entry body. Not a general find/replace engine — see
 * `docs/development/text-replace-current-entry.md` for v1 limits
 * (no whole-word, no multiline toggle, no preserve-case, no scope
 * beyond the active TEXT body).
 */

export interface ReplaceOptions {
  /** When true, `query` is interpreted as a JavaScript RegExp source. */
  regex: boolean;
  /** When true, match is case-sensitive. `false` adds the `i` flag. */
  caseSensitive: boolean;
}

export type RegexValidation =
  | { ok: true; regex: RegExp }
  | { ok: false; error: string };

/**
 * Build a `g`-flagged `RegExp` from the user's input.
 *
 * - In `regex` mode, `query` is the user's pattern source. Invalid
 *   patterns are caught and reported with the engine's error message.
 * - In plain mode, `query` is escaped so every character is treated
 *   as a literal. This path returns `ok: false` only for empty input,
 *   mirroring the dialog's no-op / disabled semantics.
 *
 * Both paths always return a regex with the `g` flag so callers can
 * iterate every match. `i` is added when `caseSensitive` is `false`.
 */
export function buildFindRegex(
  query: string,
  options: ReplaceOptions,
): RegexValidation {
  if (query === '') {
    return { ok: false, error: 'Find pattern is empty' };
  }
  const flags = options.caseSensitive ? 'g' : 'gi';
  if (options.regex) {
    try {
      return { ok: true, regex: new RegExp(query, flags) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
  const escaped = escapeRegexLiteral(query);
  return { ok: true, regex: new RegExp(escaped, flags) };
}

/**
 * Count occurrences of `query` in `body` under the given options.
 * Returns `0` for empty query or invalid regex (matching the dialog's
 * "apply disabled" semantics). Never throws.
 */
export function countMatches(
  body: string,
  query: string,
  options: ReplaceOptions,
): number {
  const r = buildFindRegex(query, options);
  if (!r.ok) return 0;
  const matches = body.match(r.regex);
  return matches ? matches.length : 0;
}

/**
 * Replace every occurrence of `query` with `replacement` in `body`.
 *
 * In plain mode, the replacement string is inserted literally: `$1`
 * etc. are escaped so the user does not accidentally trigger
 * back-reference substitution.
 *
 * In regex mode, the replacement honours JavaScript's standard
 * `$&` / `$1` / `$<name>` substitution rules. That's the expected
 * behavior for regex users.
 *
 * Returns `body` unchanged when the query is empty / invalid regex.
 */
export function replaceAll(
  body: string,
  query: string,
  replacement: string,
  options: ReplaceOptions,
): string {
  const r = buildFindRegex(query, options);
  if (!r.ok) return body;
  const rep = options.regex ? replacement : escapeReplacementLiteral(replacement);
  return body.replace(r.regex, rep);
}

// ── internal ────────────────────────────────────────────────

/** Escape RegExp metacharacters so the literal matches itself. */
function escapeRegexLiteral(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

/**
 * Escape `$` so it does not trigger back-reference substitution when
 * fed into `String.prototype.replace`. The only character with
 * special meaning in the replacement string is `$`.
 */
function escapeReplacementLiteral(s: string): string {
  return s.replace(/\$/g, '$$$$');
}
