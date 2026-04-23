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
  /**
   * Categorical-relation peer filter. Field name follows AppState's
   * post-rename naming (W1 Slice B followup); the old `tagFilter`
   * name is no longer accepted on this in-memory type. Persisted
   * JSON round-trip uses the legacy key as a read-only fallback —
   * see `createSavedSearch` / `applySavedSearchFields` below.
   */
  categoricalPeerFilter: string | null;
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
  // Write path always emits the new key `categorical_peer_filter`.
  // The legacy `tag_filter` key is intentionally NOT emitted — old
  // containers that carry it remain readable via the fallback in
  // `applySavedSearchFields`, but new writes standardise on the
  // renamed field.
  return {
    id,
    name: trimmed,
    created_at: timestamp,
    updated_at: timestamp,
    search_query: fields.searchQuery,
    archetype_filter: [...fields.archetypeFilter],
    categorical_peer_filter: fields.categoricalPeerFilter,
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
 * Pure. Does NOT validate the archetype ids or peer lid against the
 * current container — see §1 "復元時の挙動" for the rationale on
 * treating unknowns as pass-through.
 *
 * Backward-compat read: prefer `categorical_peer_filter` (post-rename,
 * W1 Slice B followup) and fall back to the legacy `tag_filter` key
 * when only the old shape is present. Treat both missing as `null`.
 * The fallback is scheduled to be removed 1-2 releases after the
 * rename ships.
 */
export function applySavedSearchFields(saved: SavedSearch): SavedSearchSourceFields {
  const categoricalPeerFilter = saved.categorical_peer_filter !== undefined
    ? saved.categorical_peer_filter
    : (saved.tag_filter ?? null);
  return {
    searchQuery: saved.search_query,
    archetypeFilter: new Set(saved.archetype_filter),
    categoricalPeerFilter,
    sortKey: saved.sort_key,
    sortDirection: saved.sort_direction,
    showArchived: saved.show_archived,
  };
}
