# Color tag Slice 3 — UI / AppState design memo

**Date**: 2026-04-25
**Status**: design accepted, implementation in this PR

## 1. Scope

Slice 3 brings Color tag to the user surface: entry persistence, picker UI, sidebar visual marker. Out of scope (deferred to Slice 4): `color:<id>` query parser, `applyFilters` Color axis merge, Saved Search UI for color filtering, theme variants, CVD verification.

## 2. Storage

- `Entry.color_tag?: string | null` (additive, optional, null / undefined / missing all equivalent — same convention as `tags`)
- Element type `string`, **not** `ColorTagId`. Mirrors the Slice-2 Saved Search `color_filter` decision: data-model spec §3.3 / §4.5 / §7.2 require unknown palette IDs to round-trip, so the schema layer must not narrow.
- Empty / null → drop the field on write (keeps JSON identical to pre-Slice-3 entries when no color is set).
- New op `updateEntryColorTag(container, lid, nextColor, now)` in `src/core/operations/container-ops.ts`. Mirrors `updateEntryTags` exactly — metadata-only mutation, **no revision snapshot** (Color tag is not body content).

## 3. Reducer

Two new actions:

- `SET_ENTRY_COLOR { lid?: string; color: string }` — set / replace.
- `CLEAR_ENTRY_COLOR { lid?: string }` — remove.

Both:
- Resolve `lid` to `state.selectedLid` when omitted.
- Block in `readonly` / `lightSource` / `viewOnlySource` (existing destructive-action gate).
- Block on `isReservedLid` (about / settings).
- Block when no container / no matching entry.
- Emit `ENTRY_UPDATED` event.
- Do **not** create a revision snapshot, do **not** transition phase, do **not** clear selection. Matches the metadata-mutation pattern already established by `updateEntryTags`.

Color value is **not validated against the palette at the reducer layer** — store loose strings (round-trip preservation). The picker UI only emits known IDs, so unknown values can only land via direct dispatch / import. This is intentional.

## 4. Picker UI

- Popover anchored to a small button in the detail title row, next to the existing archetype label. Trigger button shows the current color (small dot) or a generic icon when none.
- Popover layout: 8 swatches in a single horizontal strip (palette canonical order: red / orange / yellow / green / blue / purple / pink / gray) + a "なし / None" affordance at the right edge.
- Close on: outside click, Escape, or after a swatch click (apply + close).
- Hidden / disabled when entry is system (about / settings), reserved, or readonly / lightSource / viewOnlySource. Matches the existing tag chip + archive button gating.
- Tooltip / `aria-label`: each swatch carries the localized color name (`赤` / `オレンジ` / etc.). The "なし" affordance is `aria-label="色なし"`.

## 5. Sidebar marker

- 4px-wide left-edge color band on `.pkc-entry-item`, only when `entry.color_tag` is a known palette ID.
- Unknown palette ID → no band rendered (visually neutral, but `data-pkc-color-tag` attribute carries the raw value for round-trip / future widget pickup).
- The band uses CSS custom properties (`--pkc-color-tag-red`, …) so theme overrides are easy.

## 6. Selection / event hooks

- `data-pkc-action="open-color-picker"` — opens popover for the entry whose meta row contains the button.
- `data-pkc-action="apply-color-tag"` + `data-pkc-color="<id>"` — dispatches `SET_ENTRY_COLOR`.
- `data-pkc-action="clear-color-tag"` — dispatches `CLEAR_ENTRY_COLOR`.
- `data-pkc-action="close-color-picker"` — explicit close.
- Outside-click and Escape close handled by the picker module's lifecycle hook.

## 7. Imports / exports

- `Entry.color_tag` is part of `Entry`, so it round-trips through every container (de)serialization path automatically (JSON / IDB / sister bundle / HTML export / ZIP). No additional plumbing needed.
- Unknown palette IDs (e.g. a future `teal`) survive each round-trip because the field type is `string`, not the palette literal union.
- `schema_version` not bumped — additive optional field, old readers ignore it.

## 8. Tests

- `tests/core/app-state-color-tag.test.ts` — reducer cases (set / clear / readonly block / lightSource block / reserved block / lid resolution / unknown id stored verbatim).
- `tests/adapter/color-picker.test.ts` — popover renders 8 swatches + "なし", trigger button shows current dot, click on swatch dispatches `SET_ENTRY_COLOR`, `aria-label` present, closes on Escape.
- Existing sidebar render tests adjusted with one additional case — entries with `color_tag: 'red'` get the band, entries with `color_tag: 'teal'` (unknown) do not.

## 9. Known limitations adjustment

Old: `Color tag is spec-only — implementation deferred to a future wave`

New: `Color tag query parser ('color:<id>') and Saved Search filter axis are not implemented — picker / sidebar marker / Entry schema landed in Slice 3 (2026-04-25). Pending Slice 4.`

The user-visible statement now reflects what's actually missing (parser + filter integration) rather than the whole feature.

## 10. Out-of-scope (Slice 4)

- `color:<id>` token in `parseSearchQuery`
- `applyFilters` Color axis merge (`AppState.colorTagFilter` exposed in filter pipeline)
- Saved Search picker UI for color filter (the schema landed in Slice 2; only the UI is missing)
- Theme HEX overrides per palette ID
- Formal CVD pairwise verification (palette spec §5.3)
- `TOGGLE_COLOR_TAG_FILTER` / `CLEAR_COLOR_TAG_FILTER` actions (filter axis, not entry color)

## References

- `docs/spec/color-palette-v1.md` — palette ID list, semantic guidance
- `docs/spec/color-tag-data-model-v1-minimum-scope.md` — entry schema, round-trip contract
- `docs/development/ui-vocabulary-tag-color-relation.md` — picker UX vocabulary
- `src/features/color/color-palette.ts` — runtime palette helpers (Slice 2)
- `src/features/search/saved-searches.ts` — Saved Search `color_filter` schema (Slice 2)
- `src/core/operations/container-ops.ts` `updateEntryTags` — pattern template for `updateEntryColorTag`
