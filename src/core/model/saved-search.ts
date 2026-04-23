import type { ArchetypeId } from './record';

/**
 * Sort-key / sort-direction literal unions are mirrored here (not
 * imported) because `core` must not depend on `features/search/sort.ts`
 * per the 5-layer import rule (core ← features). These strings are
 * kept in sync with the canonical definitions in
 * `src/features/search/sort.ts`; any change there must be reflected
 * here. Practical overhead is near zero — both are tiny literal
 * unions that rarely change.
 */
export type SavedSearchSortKey = 'title' | 'created_at' | 'updated_at' | 'manual';
export type SavedSearchSortDirection = 'asc' | 'desc';

/**
 * A named snapshot of the user's search / filter / sort state.
 * Stored on `container.meta.saved_searches` (additive optional field)
 * and applied back to AppState via `APPLY_SAVED_SEARCH`.
 *
 * Canonical spec: `docs/development/saved-searches-v1.md` §1–§2.
 *
 * Fields mirror the 6 AppState fields that define a "search query" in
 * v1. Collections are stored as arrays (not Sets) for JSON round-trip.
 */
export interface SavedSearch {
  /** Unique id (short random string). Opaque — used as a stable key. */
  id: string;
  /** User-provided label. Trimmed, non-empty, at most 80 chars. */
  name: string;
  created_at: string;
  /**
   * Updated timestamp. v1 always equals `created_at` (no rename
   * action exists yet). Kept for forward compatibility with v2 rename.
   */
  updated_at: string;

  search_query: string;
  archetype_filter: ArchetypeId[];
  /**
   * Categorical-relation peer filter (lid of a "tag entry").
   *
   * Rename history (W1 Slice B followup): the in-memory AppState
   * field was renamed `tagFilter` → `categoricalPeerFilter`, and
   * the persisted JSON key followed suit. Writers emit only
   * `categorical_peer_filter`; readers prefer this key but fall
   * back to the legacy `tag_filter` key for 1-2 releases so saved
   * searches created before the rename keep working. Both fields
   * are marked optional so the type is permissive enough to round-
   * trip either shape.
   */
  categorical_peer_filter?: string | null;
  /** @deprecated Legacy alias for `categorical_peer_filter`. Read-only for backward compat; writers must not emit this key. */
  tag_filter?: string | null;
  sort_key: SavedSearchSortKey;
  sort_direction: SavedSearchSortDirection;
  show_archived: boolean;
}

/** Maximum saved searches allowed per container in v1 (§3). */
export const SAVED_SEARCH_CAP = 20;

/** Maximum characters in a saved-search name (§4). */
export const SAVED_SEARCH_NAME_MAX = 80;
