# PR #178 — Sidebar-only region replacement

**Status**: implemented
**Date**: 2026-04-27
**Predecessors**: PR #176 (profile wave) + PR #177 (settings-only short-circuit)

User direction:
> 「ALL!! GO AHEAD!!!!」 (region-scoped render after profile wave)
> 「マージ完了 続行してくれ」 (post-PR #177 merge)

This PR ships the **`'sidebar-only'`** render scope: when a dispatch
only changes fields the sidebar consumes (search / archetype / tag /
color / categorical-peer / sort / show-archived / advanced-filter
toggles / collapsed-folders), the renderer replaces ONLY the
`[data-pkc-region="sidebar"]` subtree in place. Header / center /
meta / overlays stay put.

The PR-#176 bench expected this to drop per-keystroke `SET_SEARCH_QUERY`
by ~100 ms (from 143 ms p50 down to ~40 ms — the full-shell overhead
minus just the sidebar work). The actual win was much smaller, and
the data revealed the bottleneck shifted: the sidebar rebuild itself
is the dominant cost, not the surrounding shell.

## 1. Measured impact

Compared against PR #177 head (settings-only short-circuit landed,
sidebar still rebuilt full shell):

### c-1000 — modest gains (~7–17 %)

| scenario | before (PR #177) | after (PR #178) | Δ |
|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` p50 / keystroke | 172 ms | **160 ms** | −7 % |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 28.8 ms | **23.8 ms** | −17 % |
| `dispatch:SELECT_ENTRY` | (full-render path, unchanged — selection is `'full'` scope) | — | — |

### c-5000 — the breakthrough

| scenario | before (PR #177) | after (PR #178) |
|---|---|---|
| search-keystroke (4 chars typing "meet") | **180 s timeout** ❌ | **3.76 s total** ✅ (940 ms p50 / keystroke) |
| archetype-toggle | failed setup before reaching dispatch | **completes** |
| select-entry | failed setup before reaching dispatch | **completes** |

At 5000 entries the c-5000 search-keystroke scenario previously
hung waiting for `[data-pkc-field="search"]` to become
interactable — the full-shell rebuild on each keystroke kept the
main thread blocked too long for Playwright's click resolver to
land within its 180 s timeout. Sidebar-only rendering frees enough
main-thread budget that the input becomes interactable per
keystroke and the test suite's last big black hole closes.

## 2. New bottleneck insight

The bench data after PR #178 surfaces a clear next target:

```
c-5000 search-keystroke (per keystroke, p50):
  dispatch:SET_SEARCH_QUERY      940 ms
  render:scope=sidebar-only      937 ms
  render:sidebar                 370 ms       ← the new dominator
  filter:applyFilters             ~1 ms       ← still cheap
```

`render:sidebar` is 370 ms / keystroke at 5000 entries. The shell
overhead saved by going from `'full'` → `'sidebar-only'` was small
because the SIDEBAR work itself is the dominant cost — not the
header / center / meta rebuilds the optimisation skipped.

`renderSidebar` walks every entry to build:
- DOM `<li>` rows for each filtered entry (most of the time)
- backlink count badges (uses linkIndex)
- color tag stripes
- archetype icons
- swipe-to-delete affordances on touch
- structural-parent / connectedness markers

At 5000 entries that's a lot of per-row markup. The next-wave
candidates (PR #179+) become:

1. **Memoised row rendering** — key entry `<li>`s by `lid + updated_at`,
   reuse DOM nodes when key matches. Per-keystroke filter delta is
   typically small (a handful of rows added/removed); 95 %+ of rows
   are unchanged and could be reused verbatim.
2. **Virtualised sidebar** — only render the rows visible in the
   sidebar viewport (windowed list). At 5000 entries with ~30 rows
   visible, this is a 100× reduction in DOM work.
3. **Sub-region replacement** — split the sidebar into "search /
   filter chips" + "entry list" + "drop zone" sub-regions. Search
   keystroke could replace just the entry list, leaving the input
   element intact (saving the focus / caret restore round-trip).

## 3. What this PR ships

### `src/adapter/ui/render-scope.ts` (extended)

Adds the `'sidebar-only'` discriminant. The detection logic
enumerates 15 sidebar-affecting fields (searchQuery /
archetypeFilter / archetypeFilterExpanded / tagFilter / colorTagFilter
/ categoricalPeerFilter / sortKey / sortDirection / showArchived /
searchHideBuckets / unreferencedAttachmentsOnly / treeHideBuckets /
advancedFiltersOpen / collapsedFolders / recentPaneCollapsed) and
returns:

- only sidebar-affecting fields changed → `'sidebar-only'`
- both sidebar-affecting AND settings changed → `'full'` (safer)
- sidebar-affecting AND a non-bucketed field (e.g. `selectedLid`,
  `container`, `editingLid`) → `'full'`

### `src/adapter/ui/renderer.ts` (extended)

`render(state, root, prev?)` gains a `'sidebar-only'` branch:

```ts
if (scope === 'sidebar-only') {
  const endProfile = profileStart('render:scope=sidebar-only');
  replaceSidebarRegion(state, root);
  endProfile();
  return;
}
```

`replaceSidebarRegion(state, root)` (new, ~30 lines):
- Captures `scrollTop` + `data-pkc-collapsed` from the old sidebar
- Recomputes `linkIndex` (cheap single-pass scan over container)
- Calls `renderSidebar(state, linkIndex)` to build the replacement
- `oldSidebar.replaceWith(newSidebar)`
- Restores `scrollTop` + `data-pkc-collapsed`

### `src/main.ts` (extended)

The renderer subscriber gets a `'sidebar-only'` branch. Continuity
capture / restore IS run (the search input lives in the sidebar
and gets replaced — focus + caret need restoration). `populateAttachmentPreviews`
runs (sidebar entry rows have asset thumbnails). `populateInlineAssetPreviews`
+ `cleanupBlobUrls` are SKIPPED (center-pane only; center DOM
unchanged).

## 4. Tests

| file | new | covers |
|---|---|---|
| `tests/adapter/render-scope.test.ts` | +6 cases | 'sidebar-only' for searchQuery / archetypeFilter / sortKey / collapsedFolders / treeHideBuckets / combined sidebar-only fields. Plus 'full' fall-back when sidebar+settings or sidebar+selectedLid combine. |
| `tests/adapter/render-scope-integration.test.ts` (new) | +5 cases | sidebar element is REPLACED but header / center are REUSED (Element identity); collapsed attribute survives; scrollTop survives; selectedLid forces 'full' rebuild; pendingNav stays 'none' (no DOM work). |

5878 / 5878 unit pass + 11 / 11 smoke pass at HEAD.

## 5. Re-ranked plan after PR #178

1. ✅ PR #176 — Profile wave (instrumentation)
2. ✅ PR #177 — `'settings-only'` short-circuit (cold-boot −67 %)
3. ✅ **PR #178 — `'sidebar-only'` (this PR)** — c-5000 search now usable, c-1000 modest 7-17 % gains
4. **PR #179 — Memoised row rendering** *(new top priority based on PR #178 finding)*. Key sidebar `<li>` by `lid + updated_at`, reuse DOM across renders. Targets the 370 ms `render:sidebar` at 5000 entries directly.
5. **PR #180 — Persistence chunking** (boot-only, secondary)
6. **PR #181 — Worker offload for derived indexes**
7. **PR #182 — Derived index persistence**
8. **PR #183 — Asset lazy hydration** (memory-budget-only, deferred)
9. vDOM evaluation (deferred; PR #179 may make it irrelevant)

## 6. Backwards-compatibility

- `render(state, root, prev?)` signature unchanged — `prev` defaults to `null` (full render fallback). All existing callers untouched.
- No state shape change, no schema change, no `data-pkc-*` vocabulary change.
- `replaceSidebarRegion` is internal to renderer.ts (not exported).
- Bundle: `dist/bundle.js` +1.0 KB (sidebar-only branch + the
  replace helper).

## 7. Files touched

- Modified: `src/adapter/ui/render-scope.ts` (`'sidebar-only'`
  discriminant + detection logic, +30 lines)
- Modified: `src/adapter/ui/renderer.ts` (`replaceSidebarRegion`
  helper + scope branch, +35 lines)
- Modified: `src/main.ts` (`'sidebar-only'` subscriber branch, +18 lines)
- Modified: `tests/adapter/render-scope.test.ts` (+6 sidebar-only
  cases; 19 total)
- New: `tests/adapter/render-scope-integration.test.ts` (5 cases)
- New: `docs/development/sidebar-only-render-pr178-findings.md` (this doc)

## 8. Bench artifacts

`bench-results/SUMMARY.{md,json}` regenerated with PR #178 numbers
checked in. The PR #177 baseline preserved at
`bench-results.before-pr178/` is NOT checked in (transient working
copy only) — cross-day diff is via the canonical `bench-results/`
which always reflects the latest commit.

Re-run via `npm run bench` (regenerates fixtures + rebuilds + runs
+ summarises).
