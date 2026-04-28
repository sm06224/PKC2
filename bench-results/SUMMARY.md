# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 18.1 | 9.54 |
| c-500 | 500 | 46.7 | 10.11 |
| c-1000 | 1000 | 73.3 | 12.78 |
| c-5000 | 5000 | 218.5 | 40.15 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-28T15:10:20.329Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 5.1 | 5.1 | 5.1 | 5.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 5.1 | 5.1 | 5.1 | 5.1 |
| `render:scope=sidebar-only` | 1 | 4.6 | 4.6 | 4.6 | 4.6 |
| `render:sidebar` | 1 | 2.2 | 2.2 | 2.2 | 2.2 |
| `render:sidebar:flat-loop` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `filter:applyFilters` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:filter-pipeline` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **18.1 ms**
- heap used: **9.54 MB**
- captured: 2026-04-28T15:10:18.996Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 9.7 | 9.7 | 9.7 | 9.7 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 9.5 | 9.5 | 9.5 | 9.5 |
| `render:phase=ready` | 1 | 9.1 | 9.1 | 9.1 | 9.1 |
| `boot:loadFromStore` | 1 | 6.5 | 6.5 | 6.5 | 6.5 |
| `render:sidebar` | 1 | 5.6 | 5.6 | 5.6 | 5.6 |
| `render:sidebar:tree-loop` | 1 | 2.5 | 2.5 | 2.5 | 2.5 |
| `render:sidebar:filter-pipeline` | 1 | 1.2 | 1.2 | 1.2 | 1.2 |
| `tree:buildTree` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T15:10:19.742Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 43.9 | 9 | 16.8 | 16.8 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 43.8 | 9 | 16.8 | 16.8 |
| `render:scope=sidebar-only` | 4 | 41.6 | 8.5 | 16.2 | 16.2 |
| `render:sidebar` | 4 | 23.9 | 4 | 10.6 | 10.6 |
| `render:sidebar:flat-loop` | 4 | 18.1 | 3.1 | 7.5 | 7.5 |
| `render:sidebar:sublocation-scan` | 4 | 17.7 | 3.1 | 7.2 | 7.2 |
| `render:sidebar:filter-pipeline` | 4 | 1.5 | 0.2 | 0.9 | 0.9 |
| `filter:applyFilters` | 4 | 1.3 | 0.2 | 0.8 | 0.8 |
| `render:sidebar:sort` | 4 | 0.1 | 0 | 0.1 | 0.1 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T15:10:20.973Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 53.5 | 53.5 | 53.5 | 53.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 49.8 | 49.8 | 49.8 | 49.8 |
| `render:phase=ready` | 1 | 49.1 | 49.1 | 49.1 | 49.1 |
| `render:meta` | 1 | 5 | 5 | 5 | 5 |
| `render:sidebar` | 1 | 2.5 | 2.5 | 2.5 | 2.5 |
| `render:center` | 1 | 1.9 | 1.9 | 1.9 | 1.9 |
| `render:sidebar:tree-loop` | 1 | 1.3 | 1.3 | 1.3 | 1.3 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:filter-pipeline` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `tree:buildTree` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **10.68 MB**
- captured: 2026-04-28T15:10:23.263Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 15.7 | 15.7 | 15.7 | 15.7 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 15.6 | 15.6 | 15.6 | 15.6 |
| `render:scope=sidebar-only` | 1 | 15.1 | 15.1 | 15.1 | 15.1 |
| `render:sidebar` | 1 | 11 | 11 | 11 | 11 |
| `render:sidebar:flat-loop` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:filter-pipeline` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **46.7 ms**
- heap used: **10.11 MB**
- captured: 2026-04-28T15:10:21.542Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 23.2 | 23.2 | 23.2 | 23.2 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 22.8 | 22.8 | 22.8 | 22.8 |
| `render:phase=ready` | 1 | 22.3 | 22.3 | 22.3 | 22.3 |
| `boot:loadFromStore` | 1 | 21.1 | 21.1 | 21.1 | 21.1 |
| `render:sidebar` | 1 | 16 | 16 | 16 | 16 |
| `render:sidebar:tree-loop` | 1 | 7.2 | 7.2 | 7.2 | 7.2 |
| `render:sidebar:filter-pipeline` | 1 | 3.2 | 3.2 | 3.2 | 3.2 |
| `tree:buildTree` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `render:sidebar:sort` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T15:10:22.566Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 131.2 | 27.1 | 52.2 | 52.2 |
| `dispatch:SET_SEARCH_QUERY` | 4 | 131.2 | 27.1 | 52.2 | 52.2 |
| `render:scope=sidebar-only` | 4 | 128.2 | 26.4 | 51.6 | 51.6 |
| `render:sidebar` | 4 | 83.6 | 14.7 | 38.3 | 38.3 |
| `render:sidebar:flat-loop` | 4 | 60.9 | 11.9 | 25.1 | 25.1 |
| `render:sidebar:sublocation-scan` | 4 | 60.3 | 11.7 | 24.8 | 24.8 |
| `render:sidebar:filter-pipeline` | 4 | 2.6 | 0.4 | 1.3 | 1.3 |
| `filter:applyFilters` | 4 | 2.1 | 0.3 | 1 | 1 |
| `render:sidebar:sort` | 4 | 0.3 | 0 | 0.2 | 0.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T15:10:24.036Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 89.4 | 89.4 | 89.4 | 89.4 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 84.9 | 84.9 | 84.9 | 84.9 |
| `render:phase=ready` | 1 | 84.3 | 84.3 | 84.3 | 84.3 |
| `render:meta` | 1 | 12 | 12 | 12 | 12 |
| `render:sidebar` | 1 | 9.3 | 9.3 | 9.3 | 9.3 |
| `render:sidebar:tree-loop` | 1 | 6.7 | 6.7 | 6.7 | 6.7 |
| `render:center` | 1 | 2.6 | 2.6 | 2.6 | 2.6 |
| `tree:buildTree` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `render:sidebar:filter-pipeline` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:sort` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **17.36 MB**
- captured: 2026-04-28T15:10:26.801Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 17.9 | 17.9 | 17.9 | 17.9 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 17.8 | 17.8 | 17.8 | 17.8 |
| `render:scope=sidebar-only` | 1 | 17.2 | 17.2 | 17.2 | 17.2 |
| `render:sidebar` | 1 | 13.5 | 13.5 | 13.5 | 13.5 |
| `render:sidebar:flat-loop` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `filter:applyFilters` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:filter-pipeline` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **73.3 ms**
- heap used: **12.78 MB**
- captured: 2026-04-28T15:10:24.716Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 46 | 46 | 46 | 46 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 45.7 | 45.7 | 45.7 | 45.7 |
| `render:phase=ready` | 1 | 45.2 | 45.2 | 45.2 | 45.2 |
| `render:sidebar` | 1 | 31.9 | 31.9 | 31.9 | 31.9 |
| `boot:loadFromStore` | 1 | 24.7 | 24.7 | 24.7 | 24.7 |
| `render:sidebar:tree-loop` | 1 | 19.1 | 19.1 | 19.1 | 19.1 |
| `render:sidebar:filter-pipeline` | 1 | 6.1 | 6.1 | 6.1 | 6.1 |
| `tree:buildTree` | 1 | 2 | 2 | 2 | 2 |
| `render:center` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `render:sidebar:sort` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **12.11 MB**
- captured: 2026-04-28T15:10:26.017Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 246 | 46.8 | 93.6 | 93.6 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 245.9 | 46.8 | 93.6 | 93.6 |
| `render:scope=sidebar-only` | 4 | 241.3 | 45.6 | 92.4 | 92.4 |
| `render:sidebar` | 4 | 162.5 | 29.2 | 68.8 | 68.8 |
| `render:sidebar:flat-loop` | 4 | 115.8 | 20.2 | 49.3 | 49.3 |
| `render:sidebar:sublocation-scan` | 4 | 115.7 | 20.1 | 49.3 | 49.3 |
| `render:sidebar:filter-pipeline` | 4 | 5.6 | 0.8 | 2.9 | 2.9 |
| `filter:applyFilters` | 4 | 5.3 | 0.8 | 2.8 | 2.8 |
| `render:sidebar:sort` | 4 | 0.7 | 0.1 | 0.4 | 0.4 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **17.36 MB**
- captured: 2026-04-28T15:10:27.744Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 136.5 | 136.5 | 136.5 | 136.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 132.2 | 132.2 | 132.2 | 132.2 |
| `render:phase=ready` | 1 | 131.1 | 131.1 | 131.1 | 131.1 |
| `render:meta` | 1 | 20.4 | 20.4 | 20.4 | 20.4 |
| `render:sidebar` | 1 | 17.8 | 17.8 | 17.8 | 17.8 |
| `render:sidebar:tree-loop` | 1 | 13.7 | 13.7 | 13.7 | 13.7 |
| `render:center` | 1 | 3.1 | 3.1 | 3.1 | 3.1 |
| `tree:buildTree` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `render:sidebar:sort` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:sidebar:filter-pipeline` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `archetype-toggle`

- heap used: **33.47 MB**
- captured: 2026-04-28T15:10:35.474Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 159.7 | 159.7 | 159.7 | 159.7 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 159.7 | 159.7 | 159.7 | 159.7 |
| `render:scope=sidebar-only` | 1 | 158.4 | 158.4 | 158.4 | 158.4 |
| `render:sidebar` | 1 | 146.8 | 146.8 | 146.8 | 146.8 |
| `render:sidebar:flat-loop` | 1 | 2.3 | 2.3 | 2.3 | 2.3 |
| `render:sidebar:filter-pipeline` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `filter:applyFilters` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `cold-boot`

- boot enter→exit: **218.5 ms**
- heap used: **40.15 MB**
- captured: 2026-04-28T15:10:29.200Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 165.7 | 165.7 | 165.7 | 165.7 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 165.3 | 165.3 | 165.3 | 165.3 |
| `render:phase=ready` | 1 | 164.5 | 164.5 | 164.5 | 164.5 |
| `render:sidebar` | 1 | 125.9 | 125.9 | 125.9 | 125.9 |
| `render:sidebar:tree-loop` | 1 | 68.3 | 68.3 | 68.3 | 68.3 |
| `boot:loadFromStore` | 1 | 48.5 | 48.5 | 48.5 | 48.5 |
| `render:sidebar:filter-pipeline` | 1 | 31.8 | 31.8 | 31.8 | 31.8 |
| `tree:buildTree` | 1 | 5.4 | 5.4 | 5.4 | 5.4 |
| `render:sidebar:sort` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `render:center` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |

## c-5000 (5000 entries) — `search-keystroke`

- heap used: **64.85 MB**
- captured: 2026-04-28T15:10:33.725Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 1725.7 | 405.9 | 521.2 | 521.2 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 1725.5 | 405.8 | 521.1 | 521.1 |
| `render:scope=sidebar-only` | 4 | 1710.4 | 401.1 | 518.3 | 518.3 |
| `render:sidebar` | 4 | 1218 | 279.4 | 393.5 | 393.5 |
| `render:sidebar:flat-loop` | 4 | 624 | 138.4 | 215.2 | 215.2 |
| `render:sidebar:sublocation-scan` | 4 | 623.5 | 138.3 | 214.9 | 214.9 |
| `render:sidebar:filter-pipeline` | 4 | 34.3 | 4.8 | 14.1 | 14.1 |
| `filter:applyFilters` | 4 | 32.5 | 4.5 | 13.3 | 13.3 |
| `render:sidebar:sort` | 4 | 2.7 | 0.7 | 1 | 1 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **48.07 MB**
- captured: 2026-04-28T15:10:37.722Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 522.1 | 522.1 | 522.1 | 522.1 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 517.4 | 517.4 | 517.4 | 517.4 |
| `render:phase=ready` | 1 | 510.7 | 510.7 | 510.7 | 510.7 |
| `render:meta` | 1 | 92.9 | 92.9 | 92.9 | 92.9 |
| `render:sidebar` | 1 | 76.2 | 76.2 | 76.2 | 76.2 |
| `render:sidebar:tree-loop` | 1 | 61.9 | 61.9 | 61.9 | 61.9 |
| `render:center` | 1 | 7 | 7 | 7 | 7 |
| `tree:buildTree` | 1 | 4.5 | 4.5 | 4.5 | 4.5 |
| `render:sidebar:sort` | 1 | 1 | 1 | 1 | 1 |
| `render:sidebar:filter-pipeline` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
