# PR #177 — Render-scope short-circuit (cold-boot 67-75% faster)

**Status**: implemented
**Date**: 2026-04-27
**Predecessor**: PR #176 profile wave (`profile-wave-pr176-findings.md`)

User direction:
> 「ALL!! GO AHEAD!!!!」 (1) profile wave + (2) region-scoped render
> + ... in order, after profiling.

PR #176 surfaced two bottlenecks:
- `dispatch:RESTORE_SETTINGS` = ~70 % of cold boot at 1000 entries
- per-keystroke `SET_SEARCH_QUERY` = ~140 ms full-shell rebuild

This PR ships the lower-risk half of the fix — a **scope-driven
short-circuit at the renderer entry point** — and defers the more
invasive region-replacement work to PR #178+.

## 1. What changed

### `src/adapter/ui/render-scope.ts` (new)

Pure function `computeRenderScope(state, prev): 'none' | 'settings-only' | 'full'`:

- `prev === null` (first mount) → `'full'`
- `state === prev` (identity-equal) → `'none'`
- Settings mirror fields (`settings`, `showScanline`, `accentColor`)
  changed AND nothing else changed → `'settings-only'`
- Anything else (or settings + something else) → `'full'`

The "anything else" bucket explicitly enumerates every AppState
field the renderer reads. Conservative-by-default: a new field
defaults to `'full'` unless added to one of the narrow buckets,
so a misclassification can only fail-closed (do too much work),
never fail-open (skip needed work).

### `src/adapter/ui/renderer.ts`

`render(state, root, prev?)` accepts an optional `prev` baseline.
When provided:

- `'none'` → return immediately (no DOM work)
- `'settings-only'` → `applySystemSettings(root, state.settings, state)` only — sets `data-pkc-theme` / `data-pkc-scanline` / `--c-accent` / `html.lang` on root, ~0.3 ms even at 5000 entries
- `'full'` → existing full-shell rebuild path, unchanged

When `prev` is omitted (`null` default) the function falls back to
`'full'` exactly as before. So all existing tests + any callers that
don't provide a baseline keep their identical behaviour.

### `src/main.ts`

The renderer subscriber now tracks `prevRenderState` across ticks
and short-circuits BEFORE running the heavy pre/post-render hooks
(continuity capture, blob cleanup, attachment-preview hydration,
inline-asset preview hydration) when the scope is `'none'` or
`'settings-only'`. The `locationNavTracker.consume` call still fires
on every dispatch — its scroll trigger watches a different state
slice (`pendingNav.ticket`) and is independent of the renderer.

## 2. Measured impact (bench re-run)

| scale | entries | cold-boot before | cold-boot after | Δ |
|---|---|---|---|---|
| c-100 | 100 | 70.1 ms | **17.4 ms** | **−75 %** |
| c-500 | 500 | 151.8 ms | **50.1 ms** | **−67 %** |
| c-1000 | 1000 | 262.9 ms | **87.9 ms** | **−67 %** |
| c-5000 | 5000 | 52.1 ms | **14.7 ms** | (already-fast case, see PR #176 §2 caveat) |

The `RESTORE_SETTINGS` measure itself dropped from **179.7 ms → 0.4 ms**
at c-1000 (~450× faster) — a settings-only delta no longer triggers
the full-shell repaint chain.

Per-keystroke `SET_SEARCH_QUERY` is **unchanged** by this PR
(measured: 689.8 ms total / 4 keystrokes at c-1000, identical to
before). That requires the `'sidebar-only'` region replacement,
which is PR #178's scope.

The `+16 tests` (`tests/adapter/render-scope.test.ts`) pin the
classification policy:
- first-mount → full
- identity-equal → none
- settings-only mirrors → settings-only
- 7 different "field changed" cases → full
- combined settings + sidebar field → full (safer)

5870 / 5870 unit pass + 11 / 11 smoke pass at HEAD.

## 3. What this does NOT fix

- Per-keystroke search dispatch — still does full-shell rebuild
  (~140 ms / keystroke at 1000 entries). Region-scoped render is
  needed; tracked as PR #178.
- `dispatch:SELECT_ENTRY` — still does full-shell rebuild
  (~50 ms at 1000 entries). Same region-scoped fix would help.
- IDB `boot:loadFromStore` — 44 ms at 1000 entries, requires
  persistence chunking (PR #179 candidate).

The headline cold-boot win **does** make the typical "open PKC2,
see your container" UX feel snappy at small-to-medium scales. The
keystroke / select-entry fixes are next.

## 4. Updated re-ranked plan

(superseding PR #176 §5)

1. ✅ **PR #177 — Render-scope short-circuit** (this PR)
2. **PR #178 — Sidebar-only region replacement** *(per-keystroke + filter-toggle wins)*. Replace `[data-pkc-region="sidebar"]` in-place when `searchQuery` / `archetypeFilter` / `tagFilter` / `colorTagFilter` / `categoricalPeerFilter` / `sortKey` / `sortDirection` / etc. are the only changes. Requires exposing `renderSidebar` + threading `linkIndex` through.
3. **PR #179 — Persistence chunking** *(boot-only, secondary)*
4. **PR #180 — Worker offload for derived indexes**
5. **PR #181 — Derived index persistence**
6. **PR #182 — Asset lazy hydration** (only if memory becomes the bottleneck)
7. vDOM evaluation (deferred, likely unnecessary after PR #178)

## 5. Backwards-compatibility

- `render(state, root)` signature unchanged — `prev` is optional
  with default `null`. Existing callers that omit `prev` get the
  same full-shell behaviour as before.
- `computeRenderScope` is a new module export, purely additive.
- No state shape change, no schema change, no `data-pkc-*`
  vocabulary change.
- Bundle: `dist/bundle.js` +2.3 KB (render-scope module + the
  scope check inside renderer + the main.ts wrapper).

## 6. Files touched

- New: `src/adapter/ui/render-scope.ts` (~110 lines)
- New: `tests/adapter/render-scope.test.ts` (16 tests)
- New: `docs/development/render-scope-pr177-findings.md` (this doc)
- Modified: `src/adapter/ui/renderer.ts` (~15 lines: scope check
  at the top of `render`)
- Modified: `src/main.ts` (~40 lines: `prevRenderState` tracker +
  the early-return branches)

## 7. Re-bench

```bash
npm run bench   # regenerates fixtures + rebuilds + runs + summarises
```

The result tables in `bench-results/SUMMARY.md` are checked in so
the PR #177 baseline can be diffed against future PRs.
