/**
 * Query parser (minimum slice) — W1 Tag wave.
 *
 * Extracts reserved prefix tokens from the sidebar search input so
 * they can drive filter axes in addition to the already-existing UI
 * affordances. The parser is **read-only**: it does NOT mutate
 * `state.searchQuery` (that stays as the raw user-typed string for
 * UX and debuggability), it just classifies tokens at filter time.
 *
 * Scope (this slice):
 *   - `tag:<value>` → Tag axis (AND-within-axis, §5.2 / §4.2)
 *   - non-prefix tokens → FullText axis
 *
 * Deliberately NOT in this slice (reserved per
 * `docs/spec/search-filter-semantics-v1.md` §5):
 *   - `color:` / `type:` / `rel:`
 *   - quoted values (`tag:"to review"`)
 *   - negation (`-tag:foo`)
 *   - OR-within-axis (`tag:a|b`)
 *   - BNF / escape rules
 *
 * Per spec §5.6 the prefix name is **lowercase-only**: `TAG:foo` is
 * NOT a prefix and falls through to FullText. This matters because
 * Tag values themselves are case-sensitive (Slice B §4 R6) — a
 * lenient prefix match would create a user-facing asymmetry with
 * the value comparison.
 *
 * Pure / features-layer. No state, no DOM, no dispatcher.
 */

/** Reserved prefix. Hard-coded here — this is the only token we
 * recognise in this slice. */
const TAG_PREFIX = 'tag:';

export interface ParsedSearchQuery {
  /** Whitespace-joined remainder after `tag:` tokens are stripped.
   * Fed straight into the existing FullText filter so the rest of
   * the substring-match pipeline is unchanged. */
  readonly fullText: string;
  /** Values extracted from `tag:<value>` tokens. Order-preserving
   * on first occurrence; duplicates dropped. */
  readonly tags: ReadonlySet<string>;
}

const EMPTY_RESULT: ParsedSearchQuery = {
  fullText: '',
  tags: new Set(),
};

/**
 * Parse a raw search query into FullText + Tag components.
 *
 * The raw string stays untouched (the caller retains it verbatim
 * in `state.searchQuery`). This function returns a classified view
 * used by the filter pipeline and the highlight pass.
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  if (!raw) return EMPTY_RESULT;
  const trimmed = raw.trim();
  if (trimmed === '') return EMPTY_RESULT;

  const tokens = trimmed.split(/\s+/);
  const tags = new Set<string>();
  const fullTextParts: string[] = [];

  for (const token of tokens) {
    // Spec §5.6: prefix name is lowercase-only. Uppercase `TAG:` is
    // a plain full-text token, not a recognised prefix.
    if (token.startsWith(TAG_PREFIX)) {
      const value = token.slice(TAG_PREFIX.length);
      // Empty / whitespace-only value → ignore (e.g. a lone `tag:`
      // or `tag:   ` from an in-progress type). The raw string in
      // `state.searchQuery` still keeps the literal token so the
      // user sees their own input.
      if (value !== '') {
        tags.add(value);
      }
      continue;
    }
    fullTextParts.push(token);
  }

  return {
    fullText: fullTextParts.join(' '),
    tags,
  };
}
