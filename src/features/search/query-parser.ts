/**
 * Query parser (minimum slice) — W1 Tag wave + Color tag Slice 4.
 *
 * Extracts reserved prefix tokens from the sidebar search input so
 * they can drive filter axes in addition to the already-existing UI
 * affordances. The parser is **read-only**: it does NOT mutate
 * `state.searchQuery` (that stays as the raw user-typed string for
 * UX and debuggability), it just classifies tokens at filter time.
 *
 * Scope (current):
 *   - `tag:<value>` → Tag axis (AND-within-axis, §5.2 / §4.2)
 *   - `color:<value>` → Color axis (OR-within-axis, 1-entry-1-color,
 *     Color Slice 4 / docs/spec/color-tag-data-model-v1-minimum-scope.md
 *     §6.4)
 *   - non-prefix tokens → FullText axis
 *
 * Deliberately NOT in this slice (reserved per
 * `docs/spec/search-filter-semantics-v1.md` §5):
 *   - `type:` / `rel:`
 *   - quoted values (`tag:"to review"`)
 *   - negation (`-tag:foo`)
 *   - OR-within-axis for Tag (`tag:a|b`)
 *   - BNF / escape rules
 *
 * Per spec §5.6 the prefix name is **lowercase-only**: `TAG:foo` and
 * `Color:red` are NOT prefixes and fall through to FullText. This
 * matters because the values themselves are case-sensitive — a
 * lenient prefix match would create a user-facing asymmetry with
 * the value comparison. Color palette IDs are already lowercase
 * canonical (`red` / `orange` / …), so a user who types
 * `color:Red` will see it in FullText and can self-correct.
 *
 * Unknown palette IDs are preserved verbatim (`color:teal` becomes
 * `{'teal'}` in `parsed.colors`) per data-model spec §6.4 / §7.2.
 * The filter pipeline matches via string equality, so an unknown
 * ID just yields zero results until a palette extension ships.
 *
 * Pure / features-layer. No state, no DOM, no dispatcher.
 */

/** Reserved prefixes. Hard-coded here — the only tokens we
 * recognise. */
const TAG_PREFIX = 'tag:';
const COLOR_PREFIX = 'color:';

export interface ParsedSearchQuery {
  /** Whitespace-joined remainder after reserved prefix tokens are
   * stripped. Fed straight into the existing FullText filter so
   * the rest of the substring-match pipeline is unchanged. */
  readonly fullText: string;
  /** Values extracted from `tag:<value>` tokens. Order-preserving
   * on first occurrence; duplicates dropped. */
  readonly tags: ReadonlySet<string>;
  /** Values extracted from `color:<value>` tokens (Slice 4).
   * Unknown palette IDs are preserved verbatim — see the module
   * header comment and data-model spec §6.4. */
  readonly colors: ReadonlySet<string>;
}

const EMPTY_RESULT: ParsedSearchQuery = {
  fullText: '',
  tags: new Set(),
  colors: new Set(),
};

/**
 * Parse a raw search query into FullText + Tag + Color components.
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
  const colors = new Set<string>();
  const fullTextParts: string[] = [];

  for (const token of tokens) {
    // Spec §5.6: prefix name is lowercase-only. Uppercase variants
    // are plain full-text tokens, not recognised prefixes.
    if (token.startsWith(TAG_PREFIX)) {
      const value = token.slice(TAG_PREFIX.length);
      if (value !== '') {
        tags.add(value);
      }
      continue;
    }
    if (token.startsWith(COLOR_PREFIX)) {
      const value = token.slice(COLOR_PREFIX.length);
      if (value !== '') {
        colors.add(value);
      }
      continue;
    }
    fullTextParts.push(token);
  }

  return {
    fullText: fullTextParts.join(' '),
    tags,
    colors,
  };
}
