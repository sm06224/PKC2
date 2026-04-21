import {
  SAVED_SEARCH_NAME_MAX,
  type SavedSearch,
  type SavedSearchSortDirection,
  type SavedSearchSortKey,
} from '../../core/model/saved-search';
import type { ArchetypeId } from '../../core/model/record';

/**
 * Pure builder for a {@link SavedSearch} record.
 *
 * Canonical spec: `docs/development/saved-searches-v1.md` §1, §4.
 *
 * Responsibilities (all in `core`/`features` territory — no DOM, no
 * randomness, no clock):
 *   - Trim the name and truncate to {@link SAVED_SEARCH_NAME_MAX}.
 *   - Project the 6 AppState-derived fields into their JSON-friendly
 *     representation (archetype filter as an array, not a Set).
 *   - Set `created_at === updated_at` (v1 has no rename action).
 *
 * Caller responsibilities (reducer):
 *   - Supply a unique `id` (via `generateLid()` or similar).
 *   - Supply the current `timestamp` (ISO 8601).
 *   - Reject empty names BEFORE calling this helper — this function
 *     does not throw; an empty trimmed name still produces a record,
 *     which the reducer must avoid persisting.
 *   - Enforce the container-level cap (`SAVED_SEARCH_CAP`).
 */
export interface SavedSearchSourceFields {
  searchQuery: string;
  archetypeFilter: ReadonlySet<ArchetypeId>;
  tagFilter: string | null;
  sortKey: SavedSearchSortKey;
  sortDirection: SavedSearchSortDirection;
  showArchived: boolean;
}

export function createSavedSearch(
  id: string,
  rawName: string,
  timestamp: string,
  fields: SavedSearchSourceFields,
): SavedSearch {
  const trimmed = rawName.trim().slice(0, SAVED_SEARCH_NAME_MAX);
  return {
    id,
    name: trimmed,
    created_at: timestamp,
    updated_at: timestamp,
    search_query: fields.searchQuery,
    archetype_filter: [...fields.archetypeFilter],
    tag_filter: fields.tagFilter,
    sort_key: fields.sortKey,
    sort_direction: fields.sortDirection,
    show_archived: fields.showArchived,
  };
}

/**
 * Project a {@link SavedSearch} back into the AppState fields it
 * represents. Array → Set conversion happens here so the reducer can
 * assign directly.
 *
 * Pure. Does NOT validate the archetype ids or tag lid against the
 * current container — see §1 "復元時の挙動" for the rationale on
 * treating unknowns as pass-through.
 */
export function applySavedSearchFields(saved: SavedSearch): SavedSearchSourceFields {
  return {
    searchQuery: saved.search_query,
    archetypeFilter: new Set(saved.archetype_filter),
    tagFilter: saved.tag_filter,
    sortKey: saved.sort_key,
    sortDirection: saved.sort_direction,
    showArchived: saved.show_archived,
  };
}
