# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 23.5 | 9.54 |
| c-500 | 500 | 56.2 | 10.11 |
| c-1000 | 1000 | 81.5 | 12.78 |
| c-5000 | 5000 | 257.1 | 40.15 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-28T14:54:09.873Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 6.8 | 6.8 | 6.8 | 6.8 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 6.7 | 6.7 | 6.7 | 6.7 |
| `render:scope=sidebar-only` | 1 | 6.2 | 6.2 | 6.2 | 6.2 |
| `render:sidebar` | 1 | 2.6 | 2.6 | 2.6 | 2.6 |
| `render:sidebar:flat-loop` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `filter:applyFilters` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **23.5 ms**
- heap used: **9.54 MB**
- captured: 2026-04-28T14:54:08.124Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 12.6 | 12.6 | 12.6 | 12.6 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 12.2 | 12.2 | 12.2 | 12.2 |
| `render:phase=ready` | 1 | 11.5 | 11.5 | 11.5 | 11.5 |
| `boot:loadFromStore` | 1 | 8.6 | 8.6 | 8.6 | 8.6 |
| `render:sidebar` | 1 | 6.7 | 6.7 | 6.7 | 6.7 |
| `render:sidebar:tree-loop` | 1 | 3.3 | 3.3 | 3.3 | 3.3 |
| `render:sidebar:filter-pipeline` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `render:center` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `tree:buildTree` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:sort` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T14:54:09.120Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 60 | 10.9 | 21.5 | 21.5 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 59.9 | 10.9 | 21.5 | 21.5 |
| `render:scope=sidebar-only` | 4 | 55.7 | 9.8 | 20.4 | 20.4 |
| `render:sidebar` | 4 | 33.8 | 5.2 | 13.3 | 13.3 |
| `render:sidebar:flat-loop` | 4 | 25.6 | 3.9 | 9.2 | 9.2 |
| `render:sidebar:sublocation-scan` | 4 | 24.6 | 3.7 | 9 | 9 |
| `render:sidebar:filter-pipeline` | 4 | 1.5 | 0.1 | 1.1 | 1.1 |
| `filter:applyFilters` | 4 | 1.4 | 0.1 | 1 | 1 |
| `render:sidebar:sort` | 4 | 0.4 | 0 | 0.4 | 0.4 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T14:54:10.717Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 68.9 | 68.9 | 68.9 | 68.9 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 64.7 | 64.7 | 64.7 | 64.7 |
| `render:phase=ready` | 1 | 63.7 | 63.7 | 63.7 | 63.7 |
| `render:meta` | 1 | 6.6 | 6.6 | 6.6 | 6.6 |
| `render:sidebar` | 1 | 3.3 | 3.3 | 3.3 | 3.3 |
| `render:center` | 1 | 2.7 | 2.7 | 2.7 | 2.7 |
| `render:sidebar:tree-loop` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `render:sidebar:sort` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `tree:buildTree` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:filter-pipeline` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **10.68 MB**
- captured: 2026-04-28T14:54:13.592Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 19.2 | 19.2 | 19.2 | 19.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 19.1 | 19.1 | 19.1 | 19.1 |
| `render:scope=sidebar-only` | 1 | 18.3 | 18.3 | 18.3 | 18.3 |
| `render:sidebar` | 1 | 13.2 | 13.2 | 13.2 | 13.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `filter:applyFilters` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `render:sidebar:flat-loop` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **56.2 ms**
- heap used: **10.11 MB**
- captured: 2026-04-28T14:54:11.449Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 31.3 | 31.3 | 31.3 | 31.3 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 30.6 | 30.6 | 30.6 | 30.6 |
| `render:phase=ready` | 1 | 29.8 | 29.8 | 29.8 | 29.8 |
| `boot:loadFromStore` | 1 | 22.3 | 22.3 | 22.3 | 22.3 |
| `render:sidebar` | 1 | 19 | 19 | 19 | 19 |
| `render:sidebar:tree-loop` | 1 | 10.5 | 10.5 | 10.5 | 10.5 |
| `render:sidebar:filter-pipeline` | 1 | 2.5 | 2.5 | 2.5 | 2.5 |
| `tree:buildTree` | 1 | 1.3 | 1.3 | 1.3 | 1.3 |
| `render:sidebar:sort` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `render:center` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T14:54:12.722Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 179.5 | 38.1 | 67.7 | 67.7 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 179.4 | 38.1 | 67.7 | 67.7 |
| `render:scope=sidebar-only` | 4 | 173.7 | 36.8 | 66.2 | 66.2 |
| `render:sidebar` | 4 | 107.2 | 20.8 | 44.6 | 44.6 |
| `render:sidebar:flat-loop` | 4 | 81.1 | 16.8 | 30.4 | 30.4 |
| `render:sidebar:sublocation-scan` | 4 | 80.2 | 16.7 | 29.9 | 29.9 |
| `render:sidebar:filter-pipeline` | 4 | 3.5 | 0.5 | 1.8 | 1.8 |
| `filter:applyFilters` | 4 | 3.2 | 0.4 | 1.6 | 1.6 |
| `render:sidebar:sort` | 4 | 0.5 | 0.1 | 0.3 | 0.3 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T14:54:14.597Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 120.4 | 120.4 | 120.4 | 120.4 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 115.1 | 115.1 | 115.1 | 115.1 |
| `render:phase=ready` | 1 | 113.6 | 113.6 | 113.6 | 113.6 |
| `render:meta` | 1 | 17.3 | 17.3 | 17.3 | 17.3 |
| `render:sidebar` | 1 | 12.4 | 12.4 | 12.4 | 12.4 |
| `render:sidebar:tree-loop` | 1 | 8.5 | 8.5 | 8.5 | 8.5 |
| `render:center` | 1 | 3.9 | 3.9 | 3.9 | 3.9 |
| `tree:buildTree` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `render:sidebar:sort` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:sidebar:filter-pipeline` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **17.36 MB**
- captured: 2026-04-28T14:54:17.966Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 20.8 | 20.8 | 20.8 | 20.8 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 20.7 | 20.7 | 20.7 | 20.7 |
| `render:scope=sidebar-only` | 1 | 19.8 | 19.8 | 19.8 | 19.8 |
| `render:sidebar` | 1 | 14.7 | 14.7 | 14.7 | 14.7 |
| `render:sidebar:flat-loop` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `render:sidebar:filter-pipeline` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `filter:applyFilters` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **81.5 ms**
- heap used: **12.78 MB**
- captured: 2026-04-28T14:54:15.443Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 55.1 | 55.1 | 55.1 | 55.1 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 54.5 | 54.5 | 54.5 | 54.5 |
| `render:phase=ready` | 1 | 54 | 54 | 54 | 54 |
| `render:sidebar` | 1 | 38.2 | 38.2 | 38.2 | 38.2 |
| `render:sidebar:tree-loop` | 1 | 24.1 | 24.1 | 24.1 | 24.1 |
| `boot:loadFromStore` | 1 | 22.7 | 22.7 | 22.7 | 22.7 |
| `render:sidebar:filter-pipeline` | 1 | 6.5 | 6.5 | 6.5 | 6.5 |
| `tree:buildTree` | 1 | 2.2 | 2.2 | 2.2 | 2.2 |
| `render:center` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `render:sidebar:sort` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `render:scope=settings-only` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **14.5 MB**
- captured: 2026-04-28T14:54:17.050Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 320.3 | 70.5 | 97.3 | 97.3 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 319.9 | 70.4 | 97.1 | 97.1 |
| `render:scope=sidebar-only` | 4 | 313.2 | 68.8 | 95.5 | 95.5 |
| `render:sidebar` | 4 | 209.2 | 41.9 | 66.1 | 66.1 |
| `render:sidebar:flat-loop` | 4 | 160.9 | 32.8 | 48.9 | 48.9 |
| `render:sidebar:sublocation-scan` | 4 | 160.1 | 32.7 | 48.6 | 48.6 |
| `render:sidebar:filter-pipeline` | 4 | 6.7 | 1.2 | 2.9 | 2.9 |
| `filter:applyFilters` | 4 | 6.1 | 1.1 | 2.6 | 2.6 |
| `render:sidebar:sort` | 4 | 0.8 | 0.1 | 0.5 | 0.5 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.3 | 0 | 0.2 | 0.2 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **17.36 MB**
- captured: 2026-04-28T14:54:19.094Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 180.1 | 180.1 | 180.1 | 180.1 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 174.4 | 174.4 | 174.4 | 174.4 |
| `render:phase=ready` | 1 | 172.4 | 172.4 | 172.4 | 172.4 |
| `render:meta` | 1 | 27.4 | 27.4 | 27.4 | 27.4 |
| `render:sidebar` | 1 | 21.8 | 21.8 | 21.8 | 21.8 |
| `render:sidebar:tree-loop` | 1 | 16.9 | 16.9 | 16.9 | 16.9 |
| `render:center` | 1 | 4.4 | 4.4 | 4.4 | 4.4 |
| `tree:buildTree` | 1 | 1.4 | 1.4 | 1.4 | 1.4 |
| `render:sidebar:sort` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:sidebar:filter-pipeline` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `archetype-toggle`

- heap used: **33.47 MB**
- captured: 2026-04-28T14:54:29.020Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 167.2 | 167.2 | 167.2 | 167.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 167.1 | 167.1 | 167.1 | 167.1 |
| `render:scope=sidebar-only` | 1 | 164.1 | 164.1 | 164.1 | 164.1 |
| `render:sidebar` | 1 | 149.5 | 149.5 | 149.5 | 149.5 |
| `render:sidebar:flat-loop` | 1 | 3.2 | 3.2 | 3.2 | 3.2 |
| `render:sidebar:filter-pipeline` | 1 | 1.4 | 1.4 | 1.4 | 1.4 |
| `filter:applyFilters` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `cold-boot`

- boot enter→exit: **257.1 ms**
- heap used: **40.15 MB**
- captured: 2026-04-28T14:54:20.877Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 199.1 | 199.1 | 199.1 | 199.1 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 198.4 | 198.4 | 198.4 | 198.4 |
| `render:phase=ready` | 1 | 196.8 | 196.8 | 196.8 | 196.8 |
| `render:sidebar` | 1 | 154.6 | 154.6 | 154.6 | 154.6 |
| `render:sidebar:tree-loop` | 1 | 86.2 | 86.2 | 86.2 | 86.2 |
| `boot:loadFromStore` | 1 | 51.7 | 51.7 | 51.7 | 51.7 |
| `render:sidebar:filter-pipeline` | 1 | 36.2 | 36.2 | 36.2 | 36.2 |
| `tree:buildTree` | 1 | 6.9 | 6.9 | 6.9 | 6.9 |
| `render:sidebar:sort` | 1 | 1.7 | 1.7 | 1.7 | 1.7 |
| `render:center` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `render:scope=settings-only` | 1 | 1.4 | 1.4 | 1.4 | 1.4 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 1.4 | 1.4 | 1.4 | 1.4 |

## c-5000 (5000 entries) — `search-keystroke`

- heap used: **31.57 MB**
- captured: 2026-04-28T14:54:26.832Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 2028.9 | 466.8 | 625.2 | 625.2 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 2028.7 | 466.8 | 625.1 | 625.1 |
| `render:scope=sidebar-only` | 4 | 1997.7 | 461.1 | 611.3 | 611.3 |
| `render:sidebar` | 4 | 1353.3 | 313 | 411.2 | 411.2 |
| `render:sidebar:flat-loop` | 4 | 741.9 | 164.4 | 241.7 | 241.7 |
| `render:sidebar:sublocation-scan` | 4 | 741.2 | 164.3 | 241.5 | 241.5 |
| `render:sidebar:filter-pipeline` | 4 | 29.5 | 4.2 | 16.9 | 16.9 |
| `filter:applyFilters` | 4 | 27.4 | 3.8 | 16.1 | 16.1 |
| `render:sidebar:sort` | 4 | 3.9 | 0.7 | 1.8 | 1.8 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **48.07 MB**
- captured: 2026-04-28T14:54:31.809Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 651.4 | 651.4 | 651.4 | 651.4 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 645.6 | 645.6 | 645.6 | 645.6 |
| `render:phase=ready` | 1 | 634.9 | 634.9 | 634.9 | 634.9 |
| `render:meta` | 1 | 108.6 | 108.6 | 108.6 | 108.6 |
| `render:sidebar` | 1 | 98.9 | 98.9 | 98.9 | 98.9 |
| `render:sidebar:tree-loop` | 1 | 76.8 | 76.8 | 76.8 | 76.8 |
| `render:center` | 1 | 11.2 | 11.2 | 11.2 | 11.2 |
| `tree:buildTree` | 1 | 7.1 | 7.1 | 7.1 | 7.1 |
| `render:sidebar:filter-pipeline` | 1 | 1.3 | 1.3 | 1.3 | 1.3 |
| `render:sidebar:sort` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
