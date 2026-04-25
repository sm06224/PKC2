import {
  SAVED_SEARCH_NAME_MAX,
  type SavedSearch,
  type SavedSearchSortDirection,
  type SavedSearchSortKey,
} from '../../core/model/saved-search';
import type { ArchetypeId } from '../../core/model/record';
import { colorTagPaletteOrder } from '../color/color-palette';

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
  /**
   * W1 Slice E — free-form Tag filter values. Mirrors
   * `AppState.tagFilter: ReadonlySet<string>`. Empty Set = axis
   * off. Serialized to `SavedSearch.tag_filter_v2: string[]` in
   * insertion order.
   */
  tagFilter: ReadonlySet<string>;
  /**
   * Color tag filter values (Color tag Slice 2). Loose `string`
   * element type so an unknown palette ID surviving a round trip
   * does not get silently stripped by the in-memory representation
   * — see {@link SavedSearch.color_filter} for the data-model
   * rationale. Empty Set = Color axis off; the writer omits the
   * persisted field entirely in that case (matching `tagFilter`).
   *
   * Slice 2 stops at schema / write / read. AppState does not yet
   * carry a `colorTagFilter` — Slice 3 wires that through and the
   * reducer can then bind to / from this Set directly.
   */
  colorFilter: ReadonlySet<string>;
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
  //
  // W1 Slice E — `tag_filter_v2` is only emitted when the Tag
  // filter is non-empty. Omitting when empty keeps unused saved
  // searches (the common case) identical to their pre-Slice-E JSON
  // shape, so round-trips through an older reader or through
  // export → import don't accumulate empty arrays. Readers treat
  // missing and `[]` as equivalent per spec §6.2.
  const record: SavedSearch = {
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
  if (fields.tagFilter.size > 0) {
    // `Set` iteration is insertion-order in JavaScript, matching
    // Slice B §5.1's deterministic-order invariant.
    record.tag_filter_v2 = Array.from(fields.tagFilter);
  }
  // Color tag Slice 2 — emit `color_filter` only when the axis is
  // active. The persisted array is canonicalised: deduplicated, then
  // sorted with known palette IDs first (in spec palette order) and
  // unknown IDs appended in input-iteration order. Sorting is purely
  // for diff / round-trip stability — array order has no semantic
  // meaning (data model §6.5, OR axis).
  if (fields.colorFilter.size > 0) {
    record.color_filter = canonicaliseColorFilter(fields.colorFilter);
  }
  return record;
}

function canonicaliseColorFilter(input: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const known: string[] = [];
  const unknown: string[] = [];
  for (const value of input) {
    if (typeof value !== 'string') continue;
    if (seen.has(value)) continue;
    seen.add(value);
    if (colorTagPaletteOrder(value) >= 0) {
      known.push(value);
    } else {
      unknown.push(value);
    }
  }
  known.sort((a, b) => colorTagPaletteOrder(a) - colorTagPaletteOrder(b));
  return [...known, ...unknown];
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
 *
 * W1 Slice E — `tag_filter_v2` (array) restores into
 * `tagFilter: ReadonlySet<string>`. Missing or `[]` → empty Set
 * (Tag axis off).
 */
export function applySavedSearchFields(saved: SavedSearch): SavedSearchSourceFields {
  const categoricalPeerFilter = saved.categorical_peer_filter !== undefined
    ? saved.categorical_peer_filter
    : (saved.tag_filter ?? null);
  return {
    searchQuery: saved.search_query,
    archetypeFilter: new Set(saved.archetype_filter),
    categoricalPeerFilter,
    tagFilter: new Set(saved.tag_filter_v2 ?? []),
    // Color tag Slice 2 — restore `color_filter` into a Set<string>.
    // `null` / `undefined` / `[]` all yield an empty Set (Color axis
    // off). Non-array shapes (a number, an object, …) are treated as
    // missing rather than throwing — saved-search reads stay lenient
    // to keep older / future writers from breaking the boot path.
    // Element-type filtering happens here (string-only) so callers
    // never see numeric / object junk in the resulting Set; unknown
    // **palette** IDs are still preserved because they are valid
    // strings (data model §6.4 / §7.2).
    colorFilter: new Set(extractColorFilterArray(saved.color_filter)),
    sortKey: saved.sort_key,
    sortDirection: saved.sort_direction,
    showArchived: saved.show_archived,
  };
}

function extractColorFilterArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}
