# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 22.7 | 9.54 |
| c-500 | 500 | 34.7 | 10.11 |
| c-1000 | 1000 | 58.4 | 12.11 |
| c-5000 | 5000 | 186.4 | 35.57 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-28T04:05:43.344Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 4.5 | 4.5 | 4.5 | 4.5 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 4.5 | 4.5 | 4.5 | 4.5 |
| `render:scope=sidebar-only` | 1 | 4.2 | 4.2 | 4.2 | 4.2 |
| `render:sidebar` | 1 | 2.1 | 2.1 | 2.1 | 2.1 |
| `render:sidebar:filter-pipeline` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:flat-loop` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **22.7 ms**
- heap used: **9.54 MB**
- captured: 2026-04-28T04:05:42.103Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 12.8 | 12.8 | 12.8 | 12.8 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 8.1 | 8.1 | 8.1 | 8.1 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 7.5 | 7.5 | 7.5 | 7.5 |
| `render:phase=ready` | 1 | 7.2 | 7.2 | 7.2 | 7.2 |
| `render:sidebar` | 1 | 4.2 | 4.2 | 4.2 | 4.2 |
| `render:sidebar:tree-loop` | 1 | 2.3 | 2.3 | 2.3 | 2.3 |
| `tree:buildTree` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:center` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T04:05:42.816Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 79 | 15.9 | 30.6 | 30.6 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 78.8 | 15.9 | 30.5 | 30.5 |
| `render:scope=sidebar-only` | 4 | 76.4 | 15.4 | 29.8 | 29.8 |
| `render:sidebar` | 4 | 22.3 | 3.8 | 10.7 | 10.7 |
| `render:sidebar:flat-loop` | 4 | 17.2 | 3.2 | 8.2 | 8.2 |
| `render:sidebar:sublocation-scan` | 4 | 16.7 | 3.2 | 7.8 | 7.8 |
| `render:sidebar:filter-pipeline` | 4 | 1.8 | 0.4 | 0.7 | 0.7 |
| `filter:applyFilters` | 4 | 0.9 | 0.2 | 0.4 | 0.4 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.2 | 0 | 0.1 | 0.1 |
| `render:sidebar:sort` | 4 | 0.1 | 0 | 0.1 | 0.1 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T04:05:43.932Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 53.2 | 53.2 | 53.2 | 53.2 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 50.1 | 50.1 | 50.1 | 50.1 |
| `render:phase=ready` | 1 | 49.8 | 49.8 | 49.8 | 49.8 |
| `render:meta` | 1 | 4.9 | 4.9 | 4.9 | 4.9 |
| `render:sidebar` | 1 | 2.1 | 2.1 | 2.1 | 2.1 |
| `render:center` | 1 | 2 | 2 | 2 | 2 |
| `render:sidebar:tree-loop` | 1 | 1.3 | 1.3 | 1.3 | 1.3 |
| `render:sidebar:sort` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `tree:buildTree` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **10.11 MB**
- captured: 2026-04-28T04:05:46.022Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 14.1 | 14.1 | 14.1 | 14.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 14 | 14 | 14 | 14 |
| `render:scope=sidebar-only` | 1 | 13.7 | 13.7 | 13.7 | 13.7 |
| `render:sidebar` | 1 | 9.9 | 9.9 | 9.9 | 9.9 |
| `render:sidebar:filter-pipeline` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:sort` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:flat-loop` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **34.7 ms**
- heap used: **10.11 MB**
- captured: 2026-04-28T04:05:44.424Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 17.7 | 17.7 | 17.7 | 17.7 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 17.3 | 17.3 | 17.3 | 17.3 |
| `render:phase=ready` | 1 | 17.1 | 17.1 | 17.1 | 17.1 |
| `boot:loadFromStore` | 1 | 15.1 | 15.1 | 15.1 | 15.1 |
| `render:sidebar` | 1 | 10.3 | 10.3 | 10.3 | 10.3 |
| `render:sidebar:tree-loop` | 1 | 6.4 | 6.4 | 6.4 | 6.4 |
| `tree:buildTree` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `render:sidebar:sort` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:center` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T04:05:45.427Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 279.3 | 60 | 96.1 | 96.1 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 279 | 59.9 | 96.1 | 96.1 |
| `render:scope=sidebar-only` | 4 | 276.5 | 59.2 | 95.3 | 95.3 |
| `render:sidebar` | 4 | 79.8 | 14.7 | 33.9 | 33.9 |
| `render:sidebar:flat-loop` | 4 | 51.8 | 10.9 | 17.8 | 17.8 |
| `render:sidebar:sublocation-scan` | 4 | 51.5 | 10.8 | 17.7 | 17.7 |
| `render:sidebar:filter-pipeline` | 4 | 10.3 | 1.5 | 5.7 | 5.7 |
| `filter:applyFilters` | 4 | 1.4 | 0.2 | 0.6 | 0.6 |
| `render:sidebar:sort` | 4 | 0.4 | 0.1 | 0.2 | 0.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.1 | 0 | 0.1 | 0.1 |

## c-500 (500 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T04:05:46.749Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 96 | 96 | 96 | 96 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 92.7 | 92.7 | 92.7 | 92.7 |
| `render:phase=ready` | 1 | 91.8 | 91.8 | 91.8 | 91.8 |
| `render:meta` | 1 | 11.1 | 11.1 | 11.1 | 11.1 |
| `render:sidebar` | 1 | 9.7 | 9.7 | 9.7 | 9.7 |
| `render:sidebar:tree-loop` | 1 | 6.7 | 6.7 | 6.7 | 6.7 |
| `render:center` | 1 | 2.6 | 2.6 | 2.6 | 2.6 |
| `tree:buildTree` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `render:sidebar:filter-pipeline` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:sort` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **17.36 MB**
- captured: 2026-04-28T04:05:49.579Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 19.2 | 19.2 | 19.2 | 19.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 19.1 | 19.1 | 19.1 | 19.1 |
| `render:scope=sidebar-only` | 1 | 18.5 | 18.5 | 18.5 | 18.5 |
| `render:sidebar` | 1 | 12 | 12 | 12 | 12 |
| `render:sidebar:flat-loop` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `render:sidebar:filter-pipeline` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **58.4 ms**
- heap used: **12.11 MB**
- captured: 2026-04-28T04:05:47.335Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 34.9 | 34.9 | 34.9 | 34.9 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 34.7 | 34.7 | 34.7 | 34.7 |
| `render:phase=ready` | 1 | 34.4 | 34.4 | 34.4 | 34.4 |
| `render:sidebar` | 1 | 21.4 | 21.4 | 21.4 | 21.4 |
| `boot:loadFromStore` | 1 | 21.3 | 21.3 | 21.3 | 21.3 |
| `render:sidebar:tree-loop` | 1 | 14.8 | 14.8 | 14.8 | 14.8 |
| `tree:buildTree` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `render:sidebar:filter-pipeline` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `render:center` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:sidebar:sort` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **13.64 MB**
- captured: 2026-04-28T04:05:48.841Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 584 | 121.3 | 182.8 | 182.8 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 583.9 | 121.2 | 182.8 | 182.8 |
| `render:scope=sidebar-only` | 4 | 580 | 120.3 | 181.5 | 181.5 |
| `render:sidebar` | 4 | 166 | 36.3 | 57.3 | 57.3 |
| `render:sidebar:flat-loop` | 4 | 109.9 | 23.9 | 38.8 | 38.8 |
| `render:sidebar:sublocation-scan` | 4 | 109.5 | 23.8 | 38.6 | 38.6 |
| `render:sidebar:filter-pipeline` | 4 | 22.2 | 5.5 | 6.2 | 6.2 |
| `filter:applyFilters` | 4 | 3.9 | 0.7 | 1.9 | 1.9 |
| `render:sidebar:sort` | 4 | 0.7 | 0.1 | 0.4 | 0.4 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **16.31 MB**
- captured: 2026-04-28T04:05:50.474Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 150.3 | 150.3 | 150.3 | 150.3 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 146.8 | 146.8 | 146.8 | 146.8 |
| `render:phase=ready` | 1 | 145.6 | 145.6 | 145.6 | 145.6 |
| `render:meta` | 1 | 17 | 17 | 17 | 17 |
| `render:sidebar` | 1 | 15.5 | 15.5 | 15.5 | 15.5 |
| `render:sidebar:tree-loop` | 1 | 12.1 | 12.1 | 12.1 | 12.1 |
| `render:center` | 1 | 2.7 | 2.7 | 2.7 | 2.7 |
| `tree:buildTree` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `render:sidebar:filter-pipeline` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:sort` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `archetype-toggle`

- heap used: **45.2 MB**
- captured: 2026-04-28T04:08:55.764Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 154.1 | 154.1 | 154.1 | 154.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 154.1 | 154.1 | 154.1 | 154.1 |
| `render:scope=sidebar-only` | 1 | 153 | 153 | 153 | 153 |
| `render:sidebar` | 1 | 124.9 | 124.9 | 124.9 | 124.9 |
| `render:sidebar:filter-pipeline` | 1 | 3.9 | 3.9 | 3.9 | 3.9 |
| `render:sidebar:flat-loop` | 1 | 2.7 | 2.7 | 2.7 | 2.7 |
| `filter:applyFilters` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:sidebar:sort` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `cold-boot`

- boot enter→exit: **186.4 ms**
- heap used: **35.57 MB**
- captured: 2026-04-28T04:05:51.894Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 131.6 | 131.6 | 131.6 | 131.6 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 131.2 | 131.2 | 131.2 | 131.2 |
| `render:phase=ready` | 1 | 130 | 130 | 130 | 130 |
| `render:sidebar` | 1 | 93 | 93 | 93 | 93 |
| `render:sidebar:tree-loop` | 1 | 66.3 | 66.3 | 66.3 | 66.3 |
| `boot:loadFromStore` | 1 | 50.2 | 50.2 | 50.2 | 50.2 |
| `tree:buildTree` | 1 | 8.4 | 8.4 | 8.4 | 8.4 |
| `render:sidebar:sort` | 1 | 2.2 | 2.2 | 2.2 | 2.2 |
| `render:sidebar:filter-pipeline` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `render:scope=settings-only` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |

## c-5000 (5000 entries) — `search-keystroke`

- heap used: **40.15 MB**
- captured: 2026-04-28T03:28:57.138Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 3977.2 | 1047.8 | 1106.3 | 1106.3 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 3976.6 | 1047.8 | 1105.9 | 1105.9 |
| `render:scope=sidebar-only` | 4 | 3955.3 | 1042.5 | 1100.9 | 1100.9 |
| `render:sidebar` | 4 | 1443.8 | 354 | 398.6 | 398.6 |
| `filter:applyFilters` | 4 | 23.6 | 3.8 | 12.2 | 12.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **42.63 MB**
- captured: 2026-04-28T04:08:58.043Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 684.6 | 684.6 | 684.6 | 684.6 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 680.7 | 680.7 | 680.7 | 680.7 |
| `render:phase=ready` | 1 | 675 | 675 | 675 | 675 |
| `render:meta` | 1 | 85.6 | 85.6 | 85.6 | 85.6 |
| `render:sidebar` | 1 | 80.5 | 80.5 | 80.5 | 80.5 |
| `render:sidebar:tree-loop` | 1 | 60.1 | 60.1 | 60.1 | 60.1 |
| `tree:buildTree` | 1 | 10.6 | 10.6 | 10.6 | 10.6 |
| `render:center` | 1 | 7.6 | 7.6 | 7.6 | 7.6 |
| `render:sidebar:sort` | 1 | 1 | 1 | 1 | 1 |
| `render:sidebar:filter-pipeline` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
