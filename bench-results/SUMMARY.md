# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 17.7 | 9.54 |
| c-500 | 500 | 40.0 | 10.11 |
| c-1000 | 1000 | 73.1 | 12.78 |
| c-5000 | 5000 | 217.5 | 42.63 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-28T20:02:48.287Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 4.8 | 4.8 | 4.8 | 4.8 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 4.8 | 4.8 | 4.8 | 4.8 |
| `render:scope=sidebar-only` | 1 | 4.4 | 4.4 | 4.4 | 4.4 |
| `render:sidebar` | 1 | 1.9 | 1.9 | 1.9 | 1.9 |
| `render:sidebar:flat-loop` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:filter-pipeline` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **17.7 ms**
- heap used: **9.54 MB**
- captured: 2026-04-28T20:02:46.835Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 9.7 | 9.7 | 9.7 | 9.7 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 9.5 | 9.5 | 9.5 | 9.5 |
| `render:phase=ready` | 1 | 9 | 9 | 9 | 9 |
| `boot:loadFromStore` | 1 | 6.3 | 6.3 | 6.3 | 6.3 |
| `render:sidebar` | 1 | 5.3 | 5.3 | 5.3 | 5.3 |
| `render:sidebar:tree-loop` | 1 | 2.1 | 2.1 | 2.1 | 2.1 |
| `render:sidebar:filter-pipeline` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `tree:buildTree` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T20:02:47.655Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 47.9 | 9 | 19.4 | 19.4 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 47.5 | 9 | 19.2 | 19.2 |
| `render:scope=sidebar-only` | 4 | 44.7 | 8.3 | 18.5 | 18.5 |
| `render:sidebar` | 4 | 26.3 | 4.4 | 12.9 | 12.9 |
| `render:sidebar:flat-loop` | 4 | 20.4 | 3.2 | 9.9 | 9.9 |
| `render:sidebar:sublocation-scan` | 4 | 19.8 | 3.1 | 9.6 | 9.6 |
| `filter:applyFilters` | 4 | 1 | 0.1 | 0.6 | 0.6 |
| `render:sidebar:filter-pipeline` | 4 | 1 | 0.1 | 0.6 | 0.6 |
| `render:sidebar:sort` | 4 | 0.4 | 0 | 0.3 | 0.3 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.3 | 0.1 | 0.1 | 0.1 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T20:02:48.964Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 52 | 52 | 52 | 52 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 48 | 48 | 48 | 48 |
| `render:phase=ready` | 1 | 47.5 | 47.5 | 47.5 | 47.5 |
| `render:meta` | 1 | 5.4 | 5.4 | 5.4 | 5.4 |
| `render:sidebar` | 1 | 2.4 | 2.4 | 2.4 | 2.4 |
| `render:center` | 1 | 2.2 | 2.2 | 2.2 | 2.2 |
| `render:sidebar:tree-loop` | 1 | 1.4 | 1.4 | 1.4 | 1.4 |
| `tree:buildTree` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:filter-pipeline` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **10.68 MB**
- captured: 2026-04-28T20:02:51.314Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 13.2 | 13.2 | 13.2 | 13.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 13.1 | 13.1 | 13.1 | 13.1 |
| `render:scope=sidebar-only` | 1 | 12.6 | 12.6 | 12.6 | 12.6 |
| `render:sidebar` | 1 | 9.9 | 9.9 | 9.9 | 9.9 |
| `render:sidebar:flat-loop` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `filter:applyFilters` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **40.0 ms**
- heap used: **10.11 MB**
- captured: 2026-04-28T20:02:49.543Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 22 | 22 | 22 | 22 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 21.7 | 21.7 | 21.7 | 21.7 |
| `render:phase=ready` | 1 | 21.3 | 21.3 | 21.3 | 21.3 |
| `boot:loadFromStore` | 1 | 16.1 | 16.1 | 16.1 | 16.1 |
| `render:sidebar` | 1 | 13.9 | 13.9 | 13.9 | 13.9 |
| `render:sidebar:tree-loop` | 1 | 7.6 | 7.6 | 7.6 | 7.6 |
| `render:sidebar:filter-pipeline` | 1 | 2.2 | 2.2 | 2.2 | 2.2 |
| `tree:buildTree` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `render:sidebar:sort` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **11.35 MB**
- captured: 2026-04-28T20:02:50.618Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 131.8 | 27.5 | 54.9 | 54.9 |
| `dispatch:SET_SEARCH_QUERY` | 4 | 131.8 | 27.5 | 54.9 | 54.9 |
| `render:scope=sidebar-only` | 4 | 128.5 | 26.8 | 54.1 | 54.1 |
| `render:sidebar` | 4 | 80.2 | 13.9 | 39.6 | 39.6 |
| `render:sidebar:flat-loop` | 4 | 56 | 11 | 24.6 | 24.6 |
| `render:sidebar:sublocation-scan` | 4 | 55.7 | 11 | 24.4 | 24.4 |
| `render:sidebar:filter-pipeline` | 4 | 2.6 | 0.3 | 1.3 | 1.3 |
| `filter:applyFilters` | 4 | 2.3 | 0.3 | 1.1 | 1.1 |
| `render:sidebar:sort` | 4 | 0.5 | 0.1 | 0.3 | 0.3 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T20:02:52.094Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 86.3 | 86.3 | 86.3 | 86.3 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 82.7 | 82.7 | 82.7 | 82.7 |
| `render:phase=ready` | 1 | 81.8 | 81.8 | 81.8 | 81.8 |
| `render:meta` | 1 | 12.6 | 12.6 | 12.6 | 12.6 |
| `render:sidebar` | 1 | 9.7 | 9.7 | 9.7 | 9.7 |
| `render:sidebar:tree-loop` | 1 | 7 | 7 | 7 | 7 |
| `render:center` | 1 | 2.7 | 2.7 | 2.7 | 2.7 |
| `tree:buildTree` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `render:sidebar:filter-pipeline` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:sort` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **17.36 MB**
- captured: 2026-04-28T20:02:54.927Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 19.4 | 19.4 | 19.4 | 19.4 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 19.4 | 19.4 | 19.4 | 19.4 |
| `render:scope=sidebar-only` | 1 | 18.6 | 18.6 | 18.6 | 18.6 |
| `render:sidebar` | 1 | 14.7 | 14.7 | 14.7 | 14.7 |
| `render:sidebar:flat-loop` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `render:sidebar:sort` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `filter:applyFilters` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **73.1 ms**
- heap used: **12.78 MB**
- captured: 2026-04-28T20:02:52.765Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 48.4 | 48.4 | 48.4 | 48.4 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 48.2 | 48.2 | 48.2 | 48.2 |
| `render:phase=ready` | 1 | 47.8 | 47.8 | 47.8 | 47.8 |
| `render:sidebar` | 1 | 33.8 | 33.8 | 33.8 | 33.8 |
| `boot:loadFromStore` | 1 | 22.4 | 22.4 | 22.4 | 22.4 |
| `render:sidebar:tree-loop` | 1 | 19.5 | 19.5 | 19.5 | 19.5 |
| `render:sidebar:filter-pipeline` | 1 | 7 | 7 | 7 | 7 |
| `tree:buildTree` | 1 | 2 | 2 | 2 | 2 |
| `render:center` | 1 | 1 | 1 | 1 | 1 |
| `render:sidebar:sort` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:scope=settings-only` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **19.55 MB**
- captured: 2026-04-28T20:02:54.123Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 266.2 | 64.6 | 91.7 | 91.7 |
| `dispatch:SET_SEARCH_QUERY` | 4 | 266.2 | 64.6 | 91.7 | 91.7 |
| `render:scope=sidebar-only` | 4 | 261.7 | 63.3 | 90.6 | 90.6 |
| `render:sidebar` | 4 | 166.1 | 36.3 | 67.4 | 67.4 |
| `render:sidebar:flat-loop` | 4 | 120.3 | 26.4 | 48.9 | 48.9 |
| `render:sidebar:sublocation-scan` | 4 | 119.8 | 26.3 | 48.6 | 48.6 |
| `render:sidebar:filter-pipeline` | 4 | 6.2 | 1.1 | 2.7 | 2.7 |
| `filter:applyFilters` | 4 | 5.7 | 1.1 | 2.5 | 2.5 |
| `render:sidebar:sort` | 4 | 0.6 | 0.1 | 0.4 | 0.4 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **17.36 MB**
- captured: 2026-04-28T20:02:55.924Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 157.6 | 157.6 | 157.6 | 157.6 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 152.8 | 152.8 | 152.8 | 152.8 |
| `render:phase=ready` | 1 | 151.4 | 151.4 | 151.4 | 151.4 |
| `render:meta` | 1 | 23.5 | 23.5 | 23.5 | 23.5 |
| `render:sidebar` | 1 | 19.4 | 19.4 | 19.4 | 19.4 |
| `render:sidebar:tree-loop` | 1 | 14.9 | 14.9 | 14.9 | 14.9 |
| `render:center` | 1 | 4.5 | 4.5 | 4.5 | 4.5 |
| `tree:buildTree` | 1 | 1 | 1 | 1 | 1 |
| `render:sidebar:filter-pipeline` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:sidebar:sort` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `archetype-toggle`

- heap used: **48.07 MB**
- captured: 2026-04-28T20:03:03.705Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 148.5 | 148.5 | 148.5 | 148.5 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 148.5 | 148.5 | 148.5 | 148.5 |
| `render:scope=sidebar-only` | 1 | 147 | 147 | 147 | 147 |
| `render:sidebar` | 1 | 135.7 | 135.7 | 135.7 | 135.7 |
| `render:sidebar:flat-loop` | 1 | 2.3 | 2.3 | 2.3 | 2.3 |
| `render:sidebar:filter-pipeline` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `filter:applyFilters` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `render:sidebar:sort` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `cold-boot`

- boot enter→exit: **217.5 ms**
- heap used: **42.63 MB**
- captured: 2026-04-28T20:02:57.445Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 163.8 | 163.8 | 163.8 | 163.8 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 163.6 | 163.6 | 163.6 | 163.6 |
| `render:phase=ready` | 1 | 162.6 | 162.6 | 162.6 | 162.6 |
| `render:sidebar` | 1 | 125.6 | 125.6 | 125.6 | 125.6 |
| `render:sidebar:tree-loop` | 1 | 67.2 | 67.2 | 67.2 | 67.2 |
| `boot:loadFromStore` | 1 | 49.4 | 49.4 | 49.4 | 49.4 |
| `render:sidebar:filter-pipeline` | 1 | 36.6 | 36.6 | 36.6 | 36.6 |
| `tree:buildTree` | 1 | 5.5 | 5.5 | 5.5 | 5.5 |
| `render:sidebar:sort` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `render:scope=settings-only` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |

## c-5000 (5000 entries) — `search-keystroke`

- heap used: **61.04 MB**
- captured: 2026-04-28T20:03:01.949Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 1650 | 408.5 | 466 | 466 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 1649.8 | 408.4 | 466 | 466 |
| `render:scope=sidebar-only` | 4 | 1633.5 | 403.7 | 463.3 | 463.3 |
| `render:sidebar` | 4 | 1150.3 | 277 | 348.3 | 348.3 |
| `render:sidebar:flat-loop` | 4 | 585.6 | 130 | 198.4 | 198.4 |
| `render:sidebar:sublocation-scan` | 4 | 585.3 | 130 | 198.3 | 198.3 |
| `render:sidebar:filter-pipeline` | 4 | 33 | 4.6 | 12.5 | 12.5 |
| `filter:applyFilters` | 4 | 31 | 4.2 | 11.9 | 11.9 |
| `render:sidebar:sort` | 4 | 3 | 0.6 | 1 | 1 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.1 | 0 | 0.1 | 0.1 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **35.57 MB**
- captured: 2026-04-28T20:03:05.924Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 503 | 503 | 503 | 503 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 498.1 | 498.1 | 498.1 | 498.1 |
| `render:phase=ready` | 1 | 491.1 | 491.1 | 491.1 | 491.1 |
| `render:meta` | 1 | 88.8 | 88.8 | 88.8 | 88.8 |
| `render:sidebar` | 1 | 76 | 76 | 76 | 76 |
| `render:sidebar:tree-loop` | 1 | 60.3 | 60.3 | 60.3 | 60.3 |
| `render:center` | 1 | 7.1 | 7.1 | 7.1 | 7.1 |
| `tree:buildTree` | 1 | 6.8 | 6.8 | 6.8 | 6.8 |
| `render:sidebar:sort` | 1 | 1 | 1 | 1 | 1 |
| `render:sidebar:filter-pipeline` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
