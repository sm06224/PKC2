/**
 * Search / Filter: first feature layer slice.
 *
 * This module lives in features/ (Layer 3), not in core/ or adapter/.
 * It provides a pure filter function that the renderer uses to narrow
 * the displayed entry list based on a search query.
 *
 * Architecture proof:
 * - Feature imports from core (read-only model types)
 * - Feature does NOT import from adapter (no state, no dispatcher)
 * - Renderer imports from feature (filter function)
 * - Feature state (searchQuery) lives in AppState as runtime-only
 *
 * Design:
 * - Case-insensitive substring match on title and body
 * - Empty query returns all entries (no filtering)
 * - Pure function: (entries, query) → filtered entries
 * - No full-text index, no fuzzy matching, no query syntax
 * - Results are computed on render, not cached
 *
 * This module does NOT:
 * - Access browser APIs
 * - Modify state or dispatch actions
 * - Touch persistent model
 * - Implement advanced search features
 */

import type { Entry, ArchetypeId } from '../../core/model/record';

/**
 * Filter entries by a search query.
 * Matches case-insensitively against title and body.
 * Returns all entries if query is empty or whitespace-only.
 */
export function filterEntries(entries: Entry[], query: string): Entry[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return entries;

  return entries.filter((entry) => {
    const title = entry.title.toLowerCase();
    const body = entry.body.toLowerCase();
    return title.includes(trimmed) || body.includes(trimmed);
  });
}

/**
 * Check if an entry matches the current search query.
 * Useful for highlighting or per-entry match checks.
 */
export function entryMatchesQuery(entry: Entry, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') return true;

  return (
    entry.title.toLowerCase().includes(trimmed) ||
    entry.body.toLowerCase().includes(trimmed)
  );
}

/**
 * Filter entries by archetype.
 * Returns all entries if archetype is null (no filter).
 */
export function filterByArchetype(entries: Entry[], archetype: ArchetypeId | null): Entry[] {
  if (archetype === null) return entries;
  return entries.filter((entry) => entry.archetype === archetype);
}

/**
 * Filter entries by a set of archetypes (multi-select).
 * Empty set = no filter (returns all entries).
 * Non-empty set = entries whose archetype is in the set (OR semantics).
 */
export function filterByArchetypes(
  entries: Entry[],
  filter: ReadonlySet<ArchetypeId>,
): Entry[] {
  if (filter.size === 0) return entries;
  return entries.filter((entry) => filter.has(entry.archetype));
}

/**
 * W1 Slice D — Tag axis filter (free-form entry-level tags).
 *
 * Semantics: AND-by-default (spec:
 * `docs/spec/search-filter-semantics-v1.md` §4.2). Every value in
 * `filter` must appear in `entry.tags` for the entry to match.
 *
 * - Empty set → axis off, returns `entries` unchanged.
 * - An entry whose `tags` is missing or empty array never matches
 *   a non-empty filter (spec §3.1, Slice B §3.3 "missing ≡ empty").
 * - String comparison is raw `===` (case-sensitive), matching
 *   Slice B §4.3. Future normalizers must preserve the stored
 *   strings, so no lowercasing here.
 *
 * Pure / features-layer.
 */
export function filterByTags(
  entries: Entry[],
  filter: ReadonlySet<string>,
): Entry[] {
  if (filter.size === 0) return entries;
  return entries.filter((entry) => {
    const tags = entry.tags;
    if (!tags || tags.length === 0) return false;
    for (const required of filter) {
      if (!tags.includes(required)) return false;
    }
    return true;
  });
}

/**
 * Apply combined filters: text AND archetype AND tag (all axes).
 *
 * W1 Slice D extended `applyFilters` with an optional `tagFilter`
 * parameter. The original 3-argument signature is preserved for
 * backward compatibility — existing callers that have not yet
 * acquired a tag filter (or tests that predate Slice D) pass no
 * extra arg and get the pre-Slice-D behavior.
 *
 * Axis composition is spec-mandated AND across all active axes
 * (`docs/spec/search-filter-semantics-v1.md` §4.1).
 */
export function applyFilters(
  entries: Entry[],
  query: string,
  filter: ReadonlySet<ArchetypeId>,
  tagFilter?: ReadonlySet<string>,
): Entry[] {
  const byText = filterEntries(entries, query);
  const byType = filterByArchetypes(byText, filter);
  if (!tagFilter || tagFilter.size === 0) return byType;
  return filterByTags(byType, tagFilter);
}
