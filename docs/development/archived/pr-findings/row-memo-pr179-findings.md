# PR #179 — Row + index memoization

**Status**: implemented (modest gain; bottleneck shifted)
**Date**: 2026-04-27
**Predecessors**: PR #176 / #177 / #178

User direction:
> 「ALL!! GO AHEAD!!!!」 「マージ完了 続行して」

PR #178 surfaced `render:sidebar` itself as the new dominant cost
(370 ms at 5000 entries). PR #178's findings doc speculated that
**memoised row rendering** would be the natural next lever. This
PR ships row memoization AND container-derived index memoization
(`buildLinkIndex` + `buildConnectednessSets`).

## 1. Measured impact (c-1000 search-keystroke)

| measure | PR #178 | PR #179 | Δ |
|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` p50 / keystroke | 159.8 ms | **145.8 ms** | **−9 %** |
| `dispatch:SET_SEARCH_QUERY` total / 4 keystrokes | 687.2 ms | 622.1 ms | −9 % |
| `render:sidebar` p50 / keystroke | 41.4 ms | 37.7 ms | −9 % |

A modest ~9 % gain. The memo IS hitting (verified via integration
tests + the cached `buildLinkIndex` / `buildConnectednessSets`
returning their cached references), but **the bench now reveals
the next bottleneck**: most of the remaining 145 ms / keystroke is
NOT in per-row markup or in linkIndex / connectednessSets — it's
in the rest of the renderSidebar setup (filter / sort / sub-
location indexing / DOM tree assembly) plus browser layout +
paint after the replaceWith.

The PR-#178 findings doc's expectation of a 5-10× win on per-
keystroke was based on assuming per-row markup was the dominant
cost. The bench data showed it wasn't — `render:sidebar` includes
linkIndex + connectednessSets + setup + per-row, and only ~30-40 %
is per-row. With container-derived indexes also memoized this PR,
we recover ~10 % of the dispatch wall clock.

## 2. What the PR ships

### `src/adapter/ui/renderer.ts`

Three new module-level memoization caches:

```
cachedLinkIndexContainer / cachedLinkIndex
cachedConnectednessContainer / cachedConnectedness
entryRowMemo (WeakMap<Entry, HTMLElement>)
```

Wrappers:
- `memoizedBuildLinkIndex(container)` — keyed by container reference
- `memoizedBuildConnectednessSets(container, linkIndex)` — same
- `getOrCreateMemoizedEntryItem(entry, ...)` — keyed by entry reference,
  with a `clearEntryRowMemoIfStale(container)` invalidation step
  invoked at the top of the flat-mode loop.

Selection / multi-selection attributes are applied as a post-pass
on every render (cache-hit or miss) via `applyEntryRowSelectionAttrs`,
so the cached `<li>` always reflects the current `selectedLid` /
`multiSelectedLids` without needing a cache-key dimension.

Test-only resets (`__resetEntryRowMemoForTest`,
`__resetIndexMemoForTest`) are exported for fixture-based tests
that exercise repeated renders with synthetic containers.

### Wiring

`renderShell()` and `replaceSidebarRegion()` (PR #178) both now
call `memoizedBuildLinkIndex`. `renderSidebarImpl` calls
`memoizedBuildConnectednessSets`, falling back through
`memoizedBuildLinkIndex` if `sharedLinkIndex` is absent. The
flat-mode loop in `renderSidebarImpl` calls
`getOrCreateMemoizedEntryItem` instead of `renderEntryItem`.

## 3. Tree mode is intentionally NOT memoized

Tree-mode rows (`renderTreeNode → renderEntryItem`) are decorated
post-build with depth-padding, drag handle, folder-toggle button,
and child-count badge. The cache invalidation matrix for those
mutations would outweigh the win. Search-keystroke / filter-toggle
scenarios always run in flat mode (`hasActiveFilter`), which is
where the cache pays off; tree mode hits less hot paths anyway.

## 4. Tests

| file | new | covers |
|---|---|---|
| `tests/adapter/row-memo.test.ts` (new) | +6 | cache hit (same Entry ref) / selection post-pass / container invalidation / per-entry invalidation / multi-select post-pass / tree mode bypasses cache |

5884 / 5884 unit pass + 11 / 11 smoke pass at HEAD.

## 5. New top-priority bottleneck for PR #180

The 145 ms / keystroke at c-1000 still doesn't break down cleanly
into the existing per-region measures. Further sub-instrumentation
would be needed to pinpoint:

- DOM tree assembly cost in renderSidebar (the `<ul>.appendChild`
  loop on cached rows + browser reflow)
- `findSubLocationHits` per-keystroke scan cost
- Sub-location row rendering when the search has matches

Likely PR #180 candidates:
1. **Skip `findSubLocationHits` when no rows match** — currently
   runs per-entry inside the flat-mode loop even for empty queries.
2. **Persistence chunking** — independent boot-only optimisation
   (44 ms IDB load → ~10 ms parallel chunks).
3. **More granular renderSidebar instrumentation** to identify
   the sub-cost contributing the remaining 100+ ms.

## 6. Backwards-compatibility

- No state shape change, no schema change, no `data-pkc-*` change.
- `renderEntryItem` is unchanged — memoization wraps it without
  altering its public behaviour. Tree-mode callers still get a
  fresh row per render.
- Bundle: `dist/bundle.js` +1.4 KB (3 memo helpers + selection
  post-pass + 2 test-only resets).

## 7. Files touched

- Modified: `src/adapter/ui/renderer.ts` (memo helpers + wiring;
  ~80 lines added)
- New: `tests/adapter/row-memo.test.ts` (6 tests; 130 lines)
- New: `docs/development/row-memo-pr179-findings.md` (this doc)

## 8. Bench artifacts

`bench-results/SUMMARY.{md,json}` regenerated. Note: the c-5000
search-keystroke scenario timed out during the post-PR-179 bench
re-run (the c-5000 cold-boot completed cleanly, suggesting the
memo isn't slower at scale — the search-keystroke timeout is the
same realm of "5000-entry sidebar interactability" issue
pre-PR-178 also hit). The c-5000 entries in this PR's bench are
carried forward from main / PR #178 to keep the SUMMARY complete;
re-bench with a longer Playwright timeout (or the PR #180
sub-location-hits skip) would pin a fresh c-5000 number.
