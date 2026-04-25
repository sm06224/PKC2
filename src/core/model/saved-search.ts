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
  /**
   * Free-form Tag filter values (W1 Slice E, 2026-04-23).
   *
   * Independent axis from `categorical_peer_filter`. Array shape
   * holds the `ReadonlySet<string>` from `AppState.tagFilter` in
   * insertion order — Slice B §5.1 mandates insertion-order
   * preservation, and JavaScript Set iteration already honors it,
   * so `Array.from(set)` is the canonical serialization.
   *
   * `_v2` suffix avoids collision with the legacy `tag_filter` key
   * (which stored a single categorical peer lid). Slice C §6.2
   * enumerates the options considered.
   *
   * Missing or empty array = Tag axis off (spec §3.1, §6.2).
   * Writers MAY omit the field entirely when the filter is empty;
   * readers MUST treat missing and `[]` as equivalent.
   */
  tag_filter_v2?: string[];
  /**
   * Color tag filter (Slice 2, additive — `docs/spec/color-palette-v1.md`
   * §8.3 / `docs/spec/color-tag-data-model-v1-minimum-scope.md` §6.5).
   *
   * Stored as a deduplicated array of color IDs in canonical palette
   * order. Element type is `string` rather than `ColorTagId` so that
   * unknown IDs from a future palette extension survive a read-write
   * round trip — data model §6.4 / §7.2 require unknown IDs to be
   * preserved, not silently dropped, even when the runtime filter
   * cannot resolve them.
   *
   * Missing or empty array = Color axis off (data model §3.3 / §6.4).
   * Writers MAY omit the field when the filter is empty; readers MUST
   * treat missing, `null`, and `[]` as equivalent. Order is **not**
   * semantically meaningful — the canonical palette-order
   * normalisation just makes diffs and round-trips stable.
   *
   * Slice 2 covers schema / write / read only. Picker UI, runtime
   * filtering, and the `color:<id>` query parser are still in later
   * slices; the field is dormant in the current runtime.
   */
  color_filter?: string[] | null;
  sort_key: SavedSearchSortKey;
  sort_direction: SavedSearchSortDirection;
  show_archived: boolean;
}

/** Maximum saved searches allowed per container in v1 (§3). */
export const SAVED_SEARCH_CAP = 20;

/** Maximum characters in a saved-search name (§4). */
export const SAVED_SEARCH_NAME_MAX = 80;
