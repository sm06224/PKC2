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
 * Apply combined filters: text query AND archetype filter.
 * Both filters are optional (empty query = no text filter, null archetype = no type filter).
 */
export function applyFilters(
  entries: Entry[],
  query: string,
  archetype: ArchetypeId | null,
): Entry[] {
  const byText = filterEntries(entries, query);
  return filterByArchetype(byText, archetype);
}
