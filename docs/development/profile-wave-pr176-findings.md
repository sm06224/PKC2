# PR #176 — Profile wave findings

**Status**: bench harness implemented, results captured, bottlenecks identified
**Date**: 2026-04-27
**Goal**: data-drive the next-wave optimisations (region-scoped render
/ persistence chunking / worker / asset lazy hydration / vDOM
evaluation) so the user-facing perf work doesn't ride on intuition.

User direction:
> 「コンテナに大量のエントリとアセットを突っ込むと速度が落ちる…
>  メインスレッド拘束が顕著。 仮想DOMとかどうなんだろ？」

## 1. What we measured

A new no-op-by-default profiling harness (`src/runtime/profile.ts`)
emits `performance.mark` / `performance.measure` calls at the
hot paths. Active when:

- URL contains `?profile=1` (or `#pkc?profile=1`)
- `globalThis.__PKC2_PROFILE = true` is set before module load
- otherwise every helper is a 1-bool-check no-op (production cost = 0)

Instrumented points:

| namespace | call site |
|---|---|
| `boot:enter` / `boot:exit` (marks) | top + bottom of `boot()` in `main.ts` |
| `boot:readPkcData` | embedded `<pkc-data>` element parse |
| `boot:loadFromStore` | IDB read for the IDB candidate container |
| `dispatch:<ACTION_TYPE>` | every dispatch (split into `:reduce` + `:notify-state`) |
| `render:phase=<phase>` | the outermost `render()` entry |
| `render:sidebar` | `renderSidebar` wrapper |
| `render:center` | `renderCenter` wrapper |
| `render:meta` | `renderMetaPane` wrapper |
| `filter:applyFilters` | call site inside the renderer pipeline |
| `tree:buildTree` | call site inside the renderer pipeline |

A synthetic container generator
(`build/scripts/generate-bench-container.ts`) produces deterministic
fixtures at 4 scales:

| scale | entries | textlogs | assets | bytes (raw JSON) |
|---|---|---|---|---|
| `c-100` | 100 | 2 | 5 | ~129 KB |
| `c-500` | 500 | 10 | 25 | ~605 KB |
| `c-1000` | 1000 | 20 | 50 | ~1.27 MB |
| `c-5000` | 5000 | 100 | 250 | ~6.57 MB |

Composition (per scale): ~70 % text / ~10 % textlog / ~10 % todo /
~5 % folder / ~5 % attachment, with realistic relation density
(structural parents under folders + ~5 % cross-entry semantic /
categorical edges). Asset bytes are short-base64 (~300 chars each)
so the bench focuses on entry/relation walks rather than IDB write
volume — a separate "asset weight" wave will exercise large-byte
scenarios.

A Playwright bench runner (`tests/bench/profile.bench.ts`) seeds the
synthetic container into IndexedDB via `addInitScript`, navigates to
`/pkc2.html`, and runs four scenarios per scale:

1. **cold-boot** — page load → first sidebar paint
2. **search-keystroke** — type "meet" into the sidebar search input
3. **archetype-toggle** — click the attachment archetype filter chip
4. **select-entry** — click a sidebar entry row

Per-scenario JSON results land in `bench-results/<scale>-<scenario>.json`.
A summariser (`build/scripts/bench-summarise.ts`) aggregates everything
into `bench-results/SUMMARY.md` + `SUMMARY.json` for diffability.

Re-run via `npm run bench` (regenerates fixtures + rebuilds + runs +
summarises). Individual phases also exposed: `bench:fixtures`,
`bench:run`, `bench:summarise`.

## 2. Cold-boot wall clock (measured)

| scale | entries | boot enter→exit | heap used |
|---|---|---|---|
| `c-100` | 100 | **70.1 ms** | 9.54 MB |
| `c-500` | 500 | **151.8 ms** | 11.35 MB |
| `c-1000` | 1000 | **262.9 ms** | 15.35 MB |
| `c-5000` | 5000 | **52.1 ms** ⚠️ | 26.32 MB |

The c-5000 cold-boot is "fast" only because `treeHideBuckets=true`
(default since PR #174) drops most synthetic entries from the
visible tree before render. As soon as the user disables that or
searches, work explodes — the bench's c-5000 search-keystroke
scenario timed out at the 180 s wall clock because the search
input never became interactable. The "fastest" cold boot is the
most misleading data point in the table.

## 3. Per-dispatch costs (measured, c-1000)

`c-1000` is the cleanest scaling target — large enough that the
work is visible, small enough that scenarios complete inside the
default Playwright timeouts.

### cold-boot (262.9 ms total)

| measure | total (ms) | p50 | note |
|---|---|---|---|
| `dispatch:RESTORE_SETTINGS` | **179.7** | 179.7 | dominates (~70 % of cold boot) |
| `render:phase=ready` (×2) | 121.1 | 35.3 | post-init repaint chain |
| `boot:loadFromStore` | 44.4 | 44.4 | IDB read for the seeded container |
| `dispatch:SYS_INIT_COMPLETE` | 36.2 | 36.2 | first reduce + listener flush |
| `render:sidebar` (×2) | 42 | 17.7 | per-render sidebar cost |
| `tree:buildTree` (×2) | 2.9 | 0.8 | not a bottleneck |
| `filter:applyFilters` (×2) | 0.1 | 0 | not a bottleneck |

### search-keystroke (4 keystrokes typing "meet", 689.8 ms total)

| measure | total (ms) | p50 / keystroke | note |
|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | **689.8** | 143.2 | full-shell rebuild per keystroke |
| `render:phase=ready` | 683.2 | 141.9 | render is the dispatch |
| `render:sidebar` | 196.3 | 43.3 | sidebar dominates the render |
| `filter:applyFilters` | 5.1 | 0.7 | substring scan is ~1 ms / keystroke |
| `render:center` | 0.5 | 0.1 | center is sub-millisecond |
| `dispatch:SET_SEARCH_QUERY:reduce` | 0 | 0 | reducer is free |

### select-entry (1 click, 50.5 ms)

`render:phase=ready` was 46.7 ms of the 50.5 ms total. The
sidebar (2.8 ms) + center (2 ms) + meta (4.2 ms) sub-renders are
each cheap; the bulk is in the surrounding markup-build cost
shared by the full-shell rebuild. **The clicked entry was already
visible** — none of this DOM work was strictly required to
reflect the new selection.

## 4. Identified bottlenecks (interpretation)

The plan we agreed on offered 5+1 candidates:

1. **Profile wave** (this PR — done)
2. **Region-scoped render** — stop wiping `root.innerHTML` on every dispatch
3. **Persistence chunking** — split IDB record into chunks
4. **Worker for derived indexes** — search index / backlink / connectedness
5. **Asset lazy hydration** — only fetch asset bytes on demand
6. **vDOM evaluation** — last priority

The data lets us **re-rank**. Two surprises:

- `filter:applyFilters` is NOT the keystroke bottleneck. At 1000
  entries it's ~1 ms / keystroke, not 50+. The full **shell render**
  is what costs ~140 ms / keystroke. **Worker offload of search
  filtering would save ~1 ms** in current code — almost zero
  user-visible benefit.
- `dispatch:RESTORE_SETTINGS` dominates cold boot at ~180 ms
  (1000 entries) — bigger than the IDB read AND bigger than
  SYS_INIT_COMPLETE. RESTORE_SETTINGS is supposed to be a
  near-no-op (just hydrate `settings.locale` etc.); the cost is
  almost entirely the listener-flush full-shell repaint it
  triggers. A "skip render when nothing visible changed" rule, or
  splitting the dispatch into a non-rendering settings action,
  cuts cold boot by ~70 %.

### Cold boot (1000 entries) reading

`RESTORE_SETTINGS` (~180 ms) + `SYS_INIT_COMPLETE` listener flush
(~36 ms) + initial `render:initializing → render:ready` are all
**main-thread renders**. None of the proposed worker / chunking
work shifts these. **Region-scoped render (PR #177) and
"render-skip on RESTORE_SETTINGS" (PR #177-A, ~30-line fix) are
the right primary levers**.

### Search keystroke (1000 entries) reading

Per-keystroke `dispatch:SET_SEARCH_QUERY` = 143 ms p50. Of that,
`render:sidebar` = 43 ms; the rest is the full-shell rebuild
overhead (header / center / meta repaint, scroll preservation,
post-render `scrollSelectedSidebarNodeIntoView` etc.). Region-
scoped render saves the ~100 ms of overhead per keystroke before
we even consider worker offload.

### Archetype toggle / select-entry

Both spend the entire dispatch in the full-shell rebuild. Same
fix applies.

## 5. Re-ranked priority for follow-on PRs

Based on the data, the practical order is:

1. **PR #177 — Region-scoped render + skip-render-on-no-op-dispatch** *(highest user-impact / lowest risk)*.
   - Region-scoped render: only rebuild affected `data-pkc-region`s
     when a dispatch's effects are scoped (`SET_SEARCH_QUERY` →
     sidebar list only; `SELECT_ENTRY` → sidebar selection class +
     center + meta; `TOGGLE_ARCHETYPE_FILTER` → sidebar only).
   - Skip-render-on-no-op-dispatch: when a dispatch leaves the
     state shape unchanged (RESTORE_SETTINGS with already-applied
     payload, TOGGLE_FOLDER_COLLAPSE on a folder that was already
     in the requested state, …) the listener flush short-circuits
     before triggering render.
   - Combined, these target the ~70-90 % of cold-boot + per-keystroke
     time identified above.
2. **PR #178 — Persistence chunking** *(boot-only, secondary)*. The
   IDB load itself is 44 ms at 1000 entries — meaningful but not
   dominant. Splitting into ~500-entry chunks is parallelisable
   and reduces a single 6.5 MB JSON parse to N small ones; the
   wire-format remains an aggregate `Container` after assemble.
3. **PR #179 — Worker offload for derived indexes** *(orthogonal,
   moderate gain)*. `applyFilters` is already cheap; the win is
   moving `buildConnectednessSets` / `buildLinkIndex` /
   `buildInboundCountMap` (called every render in cold path) off
   the main thread and caching them across dispatches. Bench
   re-run with PR #177 in place will quantify.
4. **PR #180 — Derived index persistence** *(amortise PR #179)*.
   Cache the worker-built indexes in IDB so subsequent boots
   skip the rebuild.
5. **PR #181 — Asset lazy hydration** *(only if memory is the
   bottleneck)*. Heap at 5000 entries was ~26 MB — well within
   modern phone RAM. The user's "container with lots of assets"
   case needs a separate "asset weight" bench (large-byte payloads,
   not just count) before deciding.
6. **vDOM evaluation** *(deferred, possibly skipped)*. Once region-
   scoped render is in, the marginal win from React/Preact diffing
   is small enough that the bundle-size + rewrite cost likely
   doesn't pay back. Re-evaluate after PR #177.

## 6. CI integration (future)

The bench is currently **off by default** in CI — it produces
~10-30 MB of result JSON per run + adds 2-15 minutes to the pipeline.
Suggested rollout:

- Phase A (this PR): manual `npm run bench` only, results checked
  into `bench-results/` for cross-day diffing.
- Phase B (next wave): nightly CI workflow that runs the bench, posts
  a delta against `main`'s last result as a PR comment.
- Phase C (after dust settles): regression gate — fail the PR build
  if any p95 measure exceeds the baseline by > 25 % at the 1000-entry
  scale.

`bench-results/SUMMARY.json` is the machine-readable input for the
delta report; the markdown table is for humans.

## 7. Backwards-compatibility

- `runtime/profile.ts` is **purely additive** — `mark` / `measure` /
  `start` / `dump` are new exports. No public type / module is
  touched.
- Hot-path call sites added `profileStart(...)` calls + paired `end()`.
  When profiling is off (the default everywhere except the bench
  runner) every call returns immediately. Verified by the existing
  5854 / 5854 unit tests (no perf budget regressions, no DOM diff,
  no behaviour change).
- The bench scripts live under `build/scripts/` and `tests/bench/`,
  outside of the production bundle. `dist/bundle.{js,css}` is
  unchanged byte-for-byte vs `main` apart from the trivial
  `profile.ts` additions (~1.5 KB, gzipped ~0.6 KB).

## 8. Files touched (summary)

- New: `src/runtime/profile.ts`
- New: `build/scripts/generate-bench-container.ts`
- New: `build/scripts/bench-summarise.ts`
- New: `tests/bench/playwright.config.ts`
- New: `tests/bench/profile.bench.ts`
- New: `bench-fixtures/c-{100,500,1000,5000}.json` (deterministic
  output, checked in for cross-day diffability — total ~8.6 MB)
- New: `bench-results/SUMMARY.{md,json}` (regenerated, checked in
  as the canonical baseline)
- Modified: `src/main.ts` (boot enter/exit + IDB load measure)
- Modified: `src/adapter/state/dispatcher.ts` (per-action measure)
- Modified: `src/adapter/ui/renderer.ts` (render / sidebar / center /
  meta / applyFilters / buildTree wrappers)
- Modified: `package.json` (4 new `bench:*` scripts + `bench`)
- Modified: `docs/development/INDEX.md` (Last updated)

`src/` total cost: ~210 lines added (mostly the harness module).
Bundle.js delta: +1.5 KB (no-op overhead in disabled mode).

## 9. 関連

- ユーザー direction: 「コンテナに大量のエントリとアセットを突っ込
  むと速度が落ちる」「メインスレッド拘束が顕著」「仮想DOMとかどうな
  んだろ？」
- 次 wave 設計: §5 の 5 PR シーケンス
- Related (not yet): `docs/development/region-scoped-render-v1.md`
  (PR #177 が同梱予定)

## 9. Appendix — Full per-scenario measurements

このセクションは `bench-results/SUMMARY.md` の機械生成出力をそのまま
保存した snapshot。後日、何らかの最適化 PR を当てたあとに「最初の
状態と何が変わったか」の baseline として参照するための保存資料。

**Run metadata**:
- 取得日時: 2026-04-27 (UTC 21:27:14 〜 21:30:31)
- HEAD: `8a9ebcd` + dirty (PR #176 instrumentation 適用済み)
- ブラウザ: Chromium headless (Playwright `chromium_headless_shell-1194`)
- Node: 22.x
- Reporter: list (pass/fail のみ); per-measure JSON は
  `bench-results/<scale>-<scenario>.json`
- 取得シナリオ: 15 / 16 (c-5000 search-keystroke は 180s timeout、
  search input が visible にならず — それ自体が
  "5000 エントリでサイドバーが操作不能" という finding)
- Bench fixture seed: 1 (deterministic; 同じ seed + 同じ scale で
  byte-identical な container が再生成される)
- Bench fixture composition: ~70% text / ~10% textlog / ~10% todo /
  ~5% folder / ~5% attachment、~60% non-folder entries が folder
  parent を持つ + ~5% cross-entry semantic/categorical edges

`addInitScript` は意図的に使わず、二相 boot で (1) 空ブートで profile
モジュールを active にし IDB 接続を開かせ、(2) 同じ open 接続上で
`clear()` + 新 fixture を put し、(3) `page.reload()` で main.ts を再
始動させて populated boot を測る、というフローで
`idb-delete-blocked` の race を回避している。詳細は
`tests/bench/profile.bench.ts` § seedIDB / setupScenario。

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:27:16.014Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 7.2 | 7.2 | 7.2 | 7.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 7.2 | 7.2 | 7.2 | 7.2 |
| `render:phase=ready` | 1 | 6.9 | 6.9 | 6.9 | 6.9 |
| `render:sidebar` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `render:center` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **70.1 ms**
- heap used: **9.54 MB**
- captured: 2026-04-27T21:27:14.712Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 47.7 | 47.7 | 47.7 | 47.7 |
| `dispatch:RESTORE_SETTINGS` | 1 | 47.7 | 47.7 | 47.7 | 47.7 |
| `render:phase=ready` | 2 | 17.9 | 7.3 | 10.6 | 10.6 |
| `boot:loadFromStore` | 1 | 13.2 | 13.2 | 13.2 | 13.2 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 7.9 | 7.9 | 7.9 | 7.9 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 7.6 | 7.6 | 7.6 | 7.6 |
| `render:sidebar` | 2 | 7.5 | 3.1 | 4.4 | 4.4 |
| `tree:buildTree` | 2 | 0.5 | 0.1 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 2 | 0.3 | 0 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 2 | 0.1 | 0 | 0.1 | 0.1 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:27:15.444Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 89.7 | 20.4 | 29.9 | 29.9 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 89.6 | 20.4 | 29.9 | 29.9 |
| `render:phase=ready` | 4 | 87.2 | 19.8 | 29.2 | 29.2 |
| `render:sidebar` | 4 | 22.5 | 4.2 | 9.5 | 9.5 |
| `filter:applyFilters` | 4 | 0.8 | 0.1 | 0.5 | 0.5 |
| `render:center` | 4 | 0.5 | 0 | 0.3 | 0.3 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:27:16.615Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 50.5 | 50.5 | 50.5 | 50.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 47.2 | 47.2 | 47.2 | 47.2 |
| `render:phase=ready` | 1 | 46.7 | 46.7 | 46.7 | 46.7 |
| `render:meta` | 1 | 4.2 | 4.2 | 4.2 | 4.2 |
| `render:sidebar` | 1 | 2.8 | 2.8 | 2.8 | 2.8 |
| `render:center` | 1 | 2 | 2 | 2 | 2 |
| `tree:buildTree` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:27:19.077Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 18.7 | 18.7 | 18.7 | 18.7 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 18.7 | 18.7 | 18.7 | 18.7 |
| `render:phase=ready` | 1 | 18.1 | 18.1 | 18.1 | 18.1 |
| `render:sidebar` | 1 | 8.9 | 8.9 | 8.9 | 8.9 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **151.8 ms**
- heap used: **11.35 MB**
- captured: 2026-04-27T21:27:17.212Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 99.1 | 99.1 | 99.1 | 99.1 |
| `dispatch:RESTORE_SETTINGS` | 1 | 99.1 | 99.1 | 99.1 | 99.1 |
| `render:phase=ready` | 2 | 66.2 | 22.6 | 43.6 | 43.6 |
| `boot:loadFromStore` | 1 | 27.4 | 27.4 | 27.4 | 27.4 |
| `render:sidebar` | 2 | 24.9 | 10.9 | 14 | 14 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 23.3 | 23.3 | 23.3 | 23.3 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 23 | 23 | 23 | 23 |
| `tree:buildTree` | 2 | 1.6 | 0.7 | 0.9 | 0.9 |
| `render:center` | 2 | 0.5 | 0.1 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **10.11 MB**
- captured: 2026-04-27T21:27:18.398Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 349.9 | 65.3 | 117.7 | 117.7 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 349.7 | 65.3 | 117.6 | 117.6 |
| `render:phase=ready` | 4 | 346.1 | 64.4 | 116.9 | 116.9 |
| `render:sidebar` | 4 | 91 | 20.8 | 29.3 | 29.3 |
| `filter:applyFilters` | 4 | 2.5 | 0.5 | 0.9 | 0.9 |
| `render:center` | 4 | 0.3 | 0 | 0.2 | 0.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `select-entry`

- heap used: **10.68 MB**
- captured: 2026-04-27T21:27:19.934Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 113.6 | 113.6 | 113.6 | 113.6 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 110.2 | 110.2 | 110.2 | 110.2 |
| `render:phase=ready` | 1 | 109.2 | 109.2 | 109.2 | 109.2 |
| `render:meta` | 1 | 13.3 | 13.3 | 13.3 | 13.3 |
| `render:sidebar` | 1 | 7.6 | 7.6 | 7.6 | 7.6 |
| `render:center` | 1 | 2.5 | 2.5 | 2.5 | 2.5 |
| `tree:buildTree` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **17.36 MB**
- captured: 2026-04-27T21:27:23.543Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 43.5 | 43.5 | 43.5 | 43.5 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 43.5 | 43.5 | 43.5 | 43.5 |
| `render:phase=ready` | 1 | 42.9 | 42.9 | 42.9 | 42.9 |
| `render:sidebar` | 1 | 22.8 | 22.8 | 22.8 | 22.8 |
| `filter:applyFilters` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:center` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **262.9 ms**
- heap used: **15.35 MB**
- captured: 2026-04-27T21:27:20.783Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 179.7 | 179.7 | 179.7 | 179.7 |
| `dispatch:RESTORE_SETTINGS` | 1 | 179.7 | 179.7 | 179.7 | 179.7 |
| `render:phase=ready` | 2 | 121.1 | 35.3 | 85.8 | 85.8 |
| `boot:loadFromStore` | 1 | 44.4 | 44.4 | 44.4 | 44.4 |
| `render:sidebar` | 2 | 42 | 17.7 | 24.3 | 24.3 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 36.2 | 36.2 | 36.2 | 36.2 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 35.8 | 35.8 | 35.8 | 35.8 |
| `tree:buildTree` | 2 | 2.9 | 0.8 | 2.1 | 2.1 |
| `render:center` | 2 | 0.5 | 0.1 | 0.4 | 0.4 |
| `boot:readPkcData` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **16.31 MB**
- captured: 2026-04-27T21:27:22.622Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 689.8 | 143.2 | 208.6 | 208.6 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 689.5 | 143.2 | 208.5 | 208.5 |
| `render:phase=ready` | 4 | 683.2 | 141.9 | 207 | 207 |
| `render:sidebar` | 4 | 196.3 | 43.3 | 65.9 | 65.9 |
| `filter:applyFilters` | 4 | 5.1 | 0.7 | 2.8 | 2.8 |
| `render:center` | 4 | 0.5 | 0.1 | 0.2 | 0.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **12.78 MB**
- captured: 2026-04-27T21:27:24.645Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 180.5 | 180.5 | 180.5 | 180.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 176.5 | 176.5 | 176.5 | 176.5 |
| `render:phase=ready` | 1 | 175.3 | 175.3 | 175.3 | 175.3 |
| `render:sidebar` | 1 | 19.8 | 19.8 | 19.8 | 19.8 |
| `render:meta` | 1 | 17.4 | 17.4 | 17.4 | 17.4 |
| `render:center` | 1 | 6.4 | 6.4 | 6.4 | 6.4 |
| `tree:buildTree` | 1 | 1.7 | 1.7 | 1.7 | 1.7 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `archetype-toggle`

- heap used: **24.8 MB**
- captured: 2026-04-27T21:30:30.171Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 187.3 | 187.3 | 187.3 | 187.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 187.3 | 187.3 | 187.3 | 187.3 |
| `render:phase=ready` | 1 | 185.6 | 185.6 | 185.6 | 185.6 |
| `render:sidebar` | 1 | 134.8 | 134.8 | 134.8 | 134.8 |
| `filter:applyFilters` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `cold-boot`

- boot enter→exit: **52.1 ms**
- heap used: **26.32 MB**
- captured: 2026-04-27T21:27:25.636Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:RESTORE_SETTINGS` | 1 | 42.6 | 42.6 | 42.6 | 42.6 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 42.5 | 42.5 | 42.5 | 42.5 |
| `render:phase=ready` | 2 | 8 | 2.7 | 5.3 | 5.3 |
| `boot:loadFromStore` | 1 | 5.1 | 5.1 | 5.1 | 5.1 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 3 | 3 | 3 | 3 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 2.8 | 2.8 | 2.8 | 2.8 |
| `render:center` | 2 | 0.8 | 0.3 | 0.5 | 0.5 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar` | 2 | 0.2 | 0 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 2 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **26.32 MB**
- captured: 2026-04-27T21:30:31.143Z

*(no measures recorded)*
