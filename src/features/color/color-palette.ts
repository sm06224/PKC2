/**
 * Color tag palette v1 — fixed list of canonical color IDs.
 *
 * Spec: docs/spec/color-palette-v1.md (Slice 1, accepted 2026-04-24).
 *
 * The palette is the single source of truth for the closed set of
 * `ColorTagId` literal values used everywhere downstream:
 *
 *   - `entry.color_tag?: ColorTagId`           (Slice 3)
 *   - `state.colorTagFilter: Set<ColorTagId>`  (Slice 3)
 *   - `SavedSearch.color_filter?: string[]`    (Slice 2 — this PR)
 *   - `color:<id>` query token parser           (Slice 4)
 *
 * Slice 2 scope: just the type / guard / palette-order helper. No
 * picker UI, no theme HEX values, no parser, no filter logic — those
 * land in Slice 3 / 4 once the schema is settled.
 *
 * Invariants:
 *   - The list is **closed** at v1. Adding new IDs is a v1.x additive
 *     palette extension (spec §7.2). Removing an ID is forbidden
 *     because round-trip preservation (data model §3.3 / §4.5) means
 *     existing containers may carry the value already.
 *   - Order is the **palette order** used for picker layout and for
 *     normalisation sorts (e.g. SavedSearch `color_filter` array).
 *     Warm hues first, then cool, then neutral — see spec §3.
 */

export const COLOR_TAG_IDS = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'gray',
] as const;

/**
 * Closed string-literal union for the v1 palette. New IDs must be
 * added to {@link COLOR_TAG_IDS} first; the type follows
 * automatically via `typeof … [number]`.
 */
export type ColorTagId = (typeof COLOR_TAG_IDS)[number];

const COLOR_TAG_ID_SET: ReadonlySet<string> = new Set(COLOR_TAG_IDS);

/**
 * Type guard: `true` when `value` is one of the canonical v1 palette
 * IDs. Accepts only strings — non-string input (number / object /
 * undefined / null) returns `false`.
 *
 * Pure, allocation-free on the hot path (the underlying `Set` is
 * built once at module-load time).
 */
export function isColorTagId(value: unknown): value is ColorTagId {
  return typeof value === 'string' && COLOR_TAG_ID_SET.has(value);
}

/**
 * Palette-order index of a known ColorTagId. Returns `-1` for any
 * value that is not a known palette ID (including non-strings).
 *
 * Intended for stable normalisation sorts — e.g. SavedSearch
 * `color_filter` arrays sort known IDs by this index so
 * round-trips emit a canonical order regardless of input shape.
 * Unknown IDs (sort key `-1`) compare equal to each other and
 * conventionally land at the head of an `Array.sort()` result, so
 * callers that want unknowns appended at the tail must apply a
 * separate partition step before sorting.
 */
export function colorTagPaletteOrder(value: unknown): number {
  if (typeof value !== 'string') return -1;
  const idx = (COLOR_TAG_IDS as readonly string[]).indexOf(value);
  return idx;
}
