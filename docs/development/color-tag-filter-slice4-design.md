# Color tag Slice 4 — `color:` parser + filter axis + Saved Search bridge

**Date**: 2026-04-25
**Status**: design accepted, implementation in this PR

## 1. Scope

End-to-end wiring for Color tag filtering. Users can type `color:red` in the sidebar search bar (or compose it with `tag:urgent color:blue`), the Color filter axis AND-composes with the other axes, and the Color filter round-trips through Saved Search via the `color_filter` schema that Slice 2 already shipped. Out of scope: per-palette theme overrides, CVD simulation, swatch-picker-driven filter UI, any new CSS class or rule.

**CSS budget is the hard constraint**: current `dist/bundle.css` is **93.87 KB / 94 KB** (99.9%). Slice 4 ships **zero new CSS selectors**. The active-filter indicator reuses the existing `pkc-entry-tag-filter` classes by passing through a generic `pkc-active-filter` shape, or — simpler — we just reuse the exact `pkc-entry-tag-filter-*` classes for the Color chip too (content differs, styling identical).

## 2. Parser — `src/features/search/query-parser.ts`

Extend `ParsedSearchQuery` with a second reserved prefix.

```ts
const TAG_PREFIX = 'tag:';
const COLOR_PREFIX = 'color:';

export interface ParsedSearchQuery {
  readonly fullText: string;
  readonly tags: ReadonlySet<string>;
  readonly colors: ReadonlySet<string>;  // NEW
}
```

- Prefix name is lowercase-only (`COLOR:` is NOT recognised — same rule as `tag:` per spec §5.6).
- Value is lowercase-preserved — the palette ID grammar is already lowercase (`red` / `orange` / …), so a typo like `Color:Red` stays in FullText and is visible to the user.
- Empty value (`color:` alone) is ignored, same as the empty-tag path.
- Unknown palette IDs (`color:teal`) are stored verbatim in `parsed.colors` — round-trip preservation per data-model spec §6.4. The filter Set membership check uses string equality, so an unknown ID will just match zero entries until a palette extension ships.
- Duplicate tokens deduplicate (`color:red color:red` → `{red}`).

## 3. AppState — `src/adapter/state/app-state.ts`

Add an optional filter Set mirroring `tagFilter`.

```ts
readonly colorTagFilter?: ReadonlySet<string>;
```

Actions:

```ts
| { type: 'TOGGLE_COLOR_TAG_FILTER'; color: string }
| { type: 'CLEAR_COLOR_TAG_FILTER' }
```

`SET_COLOR_TAG_FILTER` is **not** added — the tag-axis precedent uses only TOGGLE + CLEAR, and bulk-set would only be used by Saved Search restore which goes through APPLY_SAVED_SEARCH directly. Keep the surface tight.

Reducer cases mirror `TOGGLE_TAG_FILTER` / `CLEAR_TAG_FILTER` exactly:
- TOGGLE: copy Set, add / delete by value, reassign.
- CLEAR: identity no-op when already empty.

`hasActiveFilter` (currently `searchQuery !== '' || archetypeFilter.size > 0 || (tagFilter?.size ?? 0) > 0 || categoricalPeerFilter !== null`) gets a new `|| (colorTagFilter?.size ?? 0) > 0` clause.

`CLEAR_FILTERS` resets `colorTagFilter` to a fresh empty Set alongside the existing axes.

Initial state: `colorTagFilter: new Set<string>()` — keeps the type non-optional at runtime so `applyFilters` can dereference safely.

## 4. applyFilters — `src/features/search/filter.ts`

Add a `filterByColors` helper and a new optional parameter to `applyFilters`.

```ts
export function filterByColors(
  entries: Entry[],
  filter: ReadonlySet<string>,
): Entry[] {
  if (filter.size === 0) return entries;
  return entries.filter((e) => {
    const c = e.color_tag;
    return typeof c === 'string' && filter.has(c);
  });
}

export function applyFilters(
  entries: Entry[],
  query: string,
  filter: ReadonlySet<ArchetypeId>,
  tagFilter?: ReadonlySet<string>,
  colorFilter?: ReadonlySet<string>,   // NEW
): Entry[] {
  // ... existing pipeline up to byTag ...
  const uiColors = colorFilter?.size ?? 0;
  if (uiColors === 0 && parsed.colors.size === 0) return byTag;
  const combinedColors = new Set<string>();
  if (colorFilter) for (const c of colorFilter) combinedColors.add(c);
  for (const c of parsed.colors) combinedColors.add(c);
  return filterByColors(byTag, combinedColors);
}
```

**Semantics**:
- Color axis is **OR-within-axis** (an entry matches if `entry.color_tag` is ANY of the filter values) — 1 entry only has 1 color, so AND would be vacuous. This is spec-consistent with `docs/spec/search-filter-semantics-v1.md` §4.2.
- Color axis is AND-across-axes with FullText / Archetype / Tag (all must pass).
- Entries without a `color_tag` never match when the Color axis is active.
- UI `colorFilter` Set and parser-extracted `parsed.colors` Set merge via union (same pattern as Tag).

## 5. Saved Search bridge

Slice 2 already emits / reads `color_filter?: string[]`. Slice 3 left a temporary `colorFilter: new Set<string>()` bridge in the SAVE_SEARCH reducer. Slice 4 replaces the bridge with the real state field:

```diff
  colorFilter: new Set<string>(),
+ colorFilter: state.colorTagFilter ?? new Set<string>(),
```

APPLY_SAVED_SEARCH currently doesn't set `colorTagFilter`. Add:

```ts
colorTagFilter: fields.colorFilter,
```

Slice 2 boundary tests in `tests/features/search/saved-searches.test.ts` already pin the round-trip — no change there. New tests in `tests/adapter/saved-searches-reducer.test.ts` confirm the state-level wiring.

## 6. UI — reuse existing classes

**Zero new CSS**. Add one active-filter indicator next to the existing tag-filter indicator in `renderSidebar`, using the same `pkc-entry-tag-filter-*` class names. The label text differs (`カラー:` instead of `タグ:`); the chip shows the palette ID (e.g. `red`) as literal text — no swatch rendering in Slice 4, which would need new CSS.

Action names:
- `toggle-color-tag-filter` (dispatches `TOGGLE_COLOR_TAG_FILTER`)
- `clear-entry-color-filter` (dispatches `CLEAR_COLOR_TAG_FILTER`)
- Chip attr: `data-pkc-color-value="red"` on the remove button.

The existing `clear-filters` button already clears everything because `CLEAR_FILTERS` now resets Color too.

## 7. Unknown ID policy

Preserved at every layer:
- Parser: `color:teal` → `parsed.colors = {'teal'}` (verbatim).
- Reducer: `TOGGLE_COLOR_TAG_FILTER { color: 'teal' }` stores `'teal'` verbatim.
- Filter: `entry.color_tag === 'teal'` matches; otherwise not.
- Saved Search: `color_filter: ['teal']` round-trips through write / read.
- Active-filter chip: shows `teal` as literal text.

A future palette extension gets end-to-end support the moment its ID is added to `COLOR_TAG_IDS`; no filter data is ever silently dropped.

## 8. Known limitations

Current statement:
> Color tag query parser (`color:<id>`) and filter integration are not implemented — picker / sidebar marker / Saved Search schema / Entry schema landed in Slice 1-3

After Slice 4 this is **no longer true**. The entire Color tag feature (schema + picker + parser + filter axis + Saved Search round-trip) is user-facing. Replace with:

> Color tag theme HEX values are fixed; no per-container theme override or accessibility (CVD) verification tooling is shipped.

This is genuinely still missing and a natural Slice 5+ item. Everything else works end-to-end.

Sync both `build/about-entry-builder.ts` and `docs/release/CHANGELOG_v2.1.1.md`.

## 9. CSS budget policy

- No new selectors in `src/styles/base.css`.
- Re-run `node build/check-bundle-size.cjs` after the build and confirm `dist/bundle.css <= 94 KB`.
- If at some later point a swatch-rendered chip is wanted for the active-filter bar, it must land in a **dedicated PR** that bumps the budget to 96 KB with rationale in the `check-bundle-size.cjs` header.

## 10. Tests

- `tests/features/search/query-parser.test.ts`: `color:` extraction, lowercase-only prefix, empty value, unknown ID preserved, duplicate dedup, combined with `tag:` token.
- `tests/features/search/filter.test.ts`: `filterByColors` happy path, unknown ID, entry without color_tag, color axis OR semantics, AND with tag / text / archetype.
- `tests/core/app-state.test.ts` (or a dedicated `color-tag-filter.test.ts`): TOGGLE / CLEAR / `hasActiveFilter` inclusion / CLEAR_FILTERS integration.
- `tests/adapter/saved-searches-reducer.test.ts`: SAVE_SEARCH captures current `colorTagFilter`; APPLY_SAVED_SEARCH restores into `colorTagFilter` including unknown IDs.

Target: ~25 new tests, all green. Total stays ~5674.

## 11. Non-goals

- New CSS / swatch rendering in the filter bar
- Keyboard chord for color filter toggle
- Multi-color palette sets / per-container overrides
- CVD simulation tooling
- Entry-type filter interaction (separate axis, unaffected)

## References

- `docs/spec/color-palette-v1.md` §8.1 / §8.2
- `docs/spec/color-tag-data-model-v1-minimum-scope.md` §6.4 (OR axis, unknown ID), §9 Slice 4
- `docs/spec/search-filter-semantics-v1.md` §5 reserved prefixes, §4.1 AND composition
- `src/features/search/query-parser.ts` Tag template
- `src/features/search/filter.ts` `filterByTags` + `applyFilters`
- Slice 2 / 3 landing: `#174` / `#175` in `docs/development/INDEX.md`
