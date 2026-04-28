# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 23.4 | 9.54 |
| c-500 | 500 | 41.0 | 10.11 |
| c-1000 | 1000 | 84.5 | 12.78 |
| c-5000 | 5000 | 258.5 | 40.15 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-28T14:40:31.598Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 8.5 | 8.5 | 8.5 | 8.5 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 8.4 | 8.4 | 8.4 | 8.4 |
| `render:scope=sidebar-only` | 1 | 7.4 | 7.4 | 7.4 | 7.4 |
| `render:sidebar` | 1 | 3.3 | 3.3 | 3.3 | 3.3 |
| `render:sidebar:filter-pipeline` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `render:sidebar:flat-loop` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `filter:applyFilters` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **23.4 ms**
- heap used: **9.54 MB**
- captured: 2026-04-28T14:40:29.797Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 11.8 | 11.8 | 11.8 | 11.8 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 11.5 | 11.5 | 11.5 | 11.5 |
| `render:phase=ready` | 1 | 11 | 11 | 11 | 11 |
| `boot:loadFromStore` | 1 | 9.1 | 9.1 | 9.1 | 9.1 |
| `render:sidebar` | 1 | 6.8 | 6.8 | 6.8 | 6.8 |
| `render:sidebar:tree-loop` | 1 | 3 | 3 | 3 | 3 |
| `render:sidebar:filter-pipeline` | 1 | 1.6 | 1.6 | 1.6 | 1.6 |
| `tree:buildTree` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:sort` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T14:40:30.787Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 57.6 | 12.2 | 19.5 | 19.5 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 57.4 | 12.2 | 19.5 | 19.5 |
| `render:scope=sidebar-only` | 4 | 53 | 11.2 | 18.4 | 18.4 |
| `render:sidebar` | 4 | 28.1 | 5.5 | 10.5 | 10.5 |
| `render:sidebar:flat-loop` | 4 | 21 | 4.3 | 7.4 | 7.4 |
| `render:sidebar:sublocation-scan` | 4 | 20.4 | 4.2 | 7.1 | 7.1 |
| `render:sidebar:filter-pipeline` | 4 | 1.3 | 0.2 | 0.7 | 0.7 |
| `filter:applyFilters` | 4 | 1.1 | 0.2 | 0.6 | 0.6 |
| `render:sidebar:sort` | 4 | 0.1 | 0 | 0.1 | 0.1 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T14:40:32.476Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 70.9 | 70.9 | 70.9 | 70.9 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 66.1 | 66.1 | 66.1 | 66.1 |
| `render:phase=ready` | 1 | 65.2 | 65.2 | 65.2 | 65.2 |
| `render:meta` | 1 | 6.1 | 6.1 | 6.1 | 6.1 |
| `render:sidebar` | 1 | 3.3 | 3.3 | 3.3 | 3.3 |
| `render:center` | 1 | 2.6 | 2.6 | 2.6 | 2.6 |
| `render:sidebar:tree-loop` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `tree:buildTree` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **10.68 MB**
- captured: 2026-04-28T14:40:35.303Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 16.7 | 16.7 | 16.7 | 16.7 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 16.6 | 16.6 | 16.6 | 16.6 |
| `render:scope=sidebar-only` | 1 | 15.8 | 15.8 | 15.8 | 15.8 |
| `render:sidebar` | 1 | 12.2 | 12.2 | 12.2 | 12.2 |
| `render:sidebar:flat-loop` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `render:sidebar:filter-pipeline` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `filter:applyFilters` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **41.0 ms**
- heap used: **10.11 MB**
- captured: 2026-04-28T14:40:33.169Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 25.6 | 25.6 | 25.6 | 25.6 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 25.1 | 25.1 | 25.1 | 25.1 |
| `render:phase=ready` | 1 | 24.7 | 24.7 | 24.7 | 24.7 |
| `render:sidebar` | 1 | 15 | 15 | 15 | 15 |
| `boot:loadFromStore` | 1 | 13.3 | 13.3 | 13.3 | 13.3 |
| `render:sidebar:tree-loop` | 1 | 8.2 | 8.2 | 8.2 | 8.2 |
| `render:sidebar:filter-pipeline` | 1 | 2.4 | 2.4 | 2.4 | 2.4 |
| `tree:buildTree` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `render:sidebar:sort` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:center` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T14:40:34.482Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 168.4 | 37.4 | 62.3 | 62.3 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 168.3 | 37.4 | 62.3 | 62.3 |
| `render:scope=sidebar-only` | 4 | 163.6 | 36.2 | 60.9 | 60.9 |
| `render:sidebar` | 4 | 103 | 20 | 42.8 | 42.8 |
| `render:sidebar:flat-loop` | 4 | 76.9 | 16.3 | 28.6 | 28.6 |
| `render:sidebar:sublocation-scan` | 4 | 76.3 | 16.2 | 28.3 | 28.3 |
| `render:sidebar:filter-pipeline` | 4 | 3.5 | 0.6 | 1.6 | 1.6 |
| `filter:applyFilters` | 4 | 2.7 | 0.5 | 1.2 | 1.2 |
| `render:sidebar:sort` | 4 | 0.6 | 0.1 | 0.4 | 0.4 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T14:40:36.342Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 115.5 | 115.5 | 115.5 | 115.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 109.7 | 109.7 | 109.7 | 109.7 |
| `render:phase=ready` | 1 | 108.3 | 108.3 | 108.3 | 108.3 |
| `render:meta` | 1 | 15.1 | 15.1 | 15.1 | 15.1 |
| `render:sidebar` | 1 | 11.2 | 11.2 | 11.2 | 11.2 |
| `render:sidebar:tree-loop` | 1 | 7.6 | 7.6 | 7.6 | 7.6 |
| `render:center` | 1 | 3.4 | 3.4 | 3.4 | 3.4 |
| `tree:buildTree` | 1 | 1 | 1 | 1 | 1 |
| `render:sidebar:sort` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:filter-pipeline` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **17.36 MB**
- captured: 2026-04-28T14:40:39.909Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 23.2 | 23.2 | 23.2 | 23.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 23.1 | 23.1 | 23.1 | 23.1 |
| `render:scope=sidebar-only` | 1 | 22.1 | 22.1 | 22.1 | 22.1 |
| `render:sidebar` | 1 | 16.7 | 16.7 | 16.7 | 16.7 |
| `render:sidebar:flat-loop` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `render:sidebar:filter-pipeline` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `filter:applyFilters` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `render:sidebar:sort` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **84.5 ms**
- heap used: **12.78 MB**
- captured: 2026-04-28T14:40:37.208Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 54.1 | 54.1 | 54.1 | 54.1 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 53.6 | 53.6 | 53.6 | 53.6 |
| `render:phase=ready` | 1 | 53 | 53 | 53 | 53 |
| `render:sidebar` | 1 | 36.3 | 36.3 | 36.3 | 36.3 |
| `boot:loadFromStore` | 1 | 27.7 | 27.7 | 27.7 | 27.7 |
| `render:sidebar:tree-loop` | 1 | 21.7 | 21.7 | 21.7 | 21.7 |
| `render:sidebar:filter-pipeline` | 1 | 6.5 | 6.5 | 6.5 | 6.5 |
| `tree:buildTree` | 1 | 2.1 | 2.1 | 2.1 | 2.1 |
| `render:center` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `render:sidebar:sort` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:scope=settings-only` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **13.64 MB**
- captured: 2026-04-28T14:40:38.924Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 336.2 | 71.5 | 113.6 | 113.6 |
| `dispatch:SET_SEARCH_QUERY` | 4 | 336.2 | 71.5 | 113.6 | 113.6 |
| `render:scope=sidebar-only` | 4 | 329.6 | 69.9 | 111.8 | 111.8 |
| `render:sidebar` | 4 | 220.1 | 48.2 | 79.1 | 79.1 |
| `render:sidebar:flat-loop` | 4 | 155.6 | 34.6 | 52.7 | 52.7 |
| `render:sidebar:sublocation-scan` | 4 | 154.7 | 34.5 | 52.4 | 52.4 |
| `render:sidebar:filter-pipeline` | 4 | 7.1 | 1 | 3.7 | 3.7 |
| `filter:applyFilters` | 4 | 6.1 | 1 | 3 | 3 |
| `render:sidebar:sort` | 4 | 0.5 | 0.1 | 0.2 | 0.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **17.36 MB**
- captured: 2026-04-28T14:40:41.009Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 158.7 | 158.7 | 158.7 | 158.7 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 154.1 | 154.1 | 154.1 | 154.1 |
| `render:phase=ready` | 1 | 152.2 | 152.2 | 152.2 | 152.2 |
| `render:meta` | 1 | 23.7 | 23.7 | 23.7 | 23.7 |
| `render:sidebar` | 1 | 21.4 | 21.4 | 21.4 | 21.4 |
| `render:sidebar:tree-loop` | 1 | 16 | 16 | 16 | 16 |
| `render:center` | 1 | 3.6 | 3.6 | 3.6 | 3.6 |
| `tree:buildTree` | 1 | 1.2 | 1.2 | 1.2 | 1.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `render:sidebar:sort` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-5000 (5000 entries) — `archetype-toggle`

- heap used: **33.47 MB**
- captured: 2026-04-28T14:40:50.471Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 171.8 | 171.8 | 171.8 | 171.8 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 171.7 | 171.7 | 171.7 | 171.7 |
| `render:scope=sidebar-only` | 1 | 169.2 | 169.2 | 169.2 | 169.2 |
| `render:sidebar` | 1 | 154.4 | 154.4 | 154.4 | 154.4 |
| `render:sidebar:flat-loop` | 1 | 3 | 3 | 3 | 3 |
| `render:sidebar:filter-pipeline` | 1 | 1.2 | 1.2 | 1.2 | 1.2 |
| `filter:applyFilters` | 1 | 1 | 1 | 1 | 1 |
| `render:sidebar:sort` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `cold-boot`

- boot enter→exit: **258.5 ms**
- heap used: **40.15 MB**
- captured: 2026-04-28T14:40:42.707Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 197.3 | 197.3 | 197.3 | 197.3 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 196.7 | 196.7 | 196.7 | 196.7 |
| `render:phase=ready` | 1 | 195.1 | 195.1 | 195.1 | 195.1 |
| `render:sidebar` | 1 | 152.7 | 152.7 | 152.7 | 152.7 |
| `render:sidebar:tree-loop` | 1 | 84.8 | 84.8 | 84.8 | 84.8 |
| `boot:loadFromStore` | 1 | 55 | 55 | 55 | 55 |
| `render:sidebar:filter-pipeline` | 1 | 37.7 | 37.7 | 37.7 | 37.7 |
| `tree:buildTree` | 1 | 6.8 | 6.8 | 6.8 | 6.8 |
| `render:sidebar:sort` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `dispatch:RESTORE_SETTINGS` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `render:center` | 1 | 1 | 1 | 1 | 1 |
| `render:scope=settings-only` | 1 | 1 | 1 | 1 | 1 |

## c-5000 (5000 entries) — `search-keystroke`

- heap used: **31.57 MB**
- captured: 2026-04-28T14:40:48.311Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 1914.2 | 443.4 | 573.5 | 573.5 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 1913.8 | 443.3 | 573.4 | 573.4 |
| `render:scope=sidebar-only` | 4 | 1895.1 | 438.3 | 569.5 | 569.5 |
| `render:sidebar` | 4 | 1288 | 300.8 | 389.3 | 389.3 |
| `render:sidebar:flat-loop` | 4 | 693 | 155.5 | 222.3 | 222.3 |
| `render:sidebar:sublocation-scan` | 4 | 692.4 | 155.4 | 222 | 222 |
| `render:sidebar:filter-pipeline` | 4 | 30.4 | 4.4 | 15.9 | 15.9 |
| `filter:applyFilters` | 4 | 27.9 | 4 | 15.1 | 15.1 |
| `render:sidebar:sort` | 4 | 3.4 | 0.9 | 1 | 1 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **48.07 MB**
- captured: 2026-04-28T14:40:53.370Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 687.8 | 687.8 | 687.8 | 687.8 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 682.5 | 682.5 | 682.5 | 682.5 |
| `render:phase=ready` | 1 | 671.5 | 671.5 | 671.5 | 671.5 |
| `render:meta` | 1 | 116.4 | 116.4 | 116.4 | 116.4 |
| `render:sidebar` | 1 | 98 | 98 | 98 | 98 |
| `render:sidebar:tree-loop` | 1 | 79.4 | 79.4 | 79.4 | 79.4 |
| `render:center` | 1 | 10.3 | 10.3 | 10.3 | 10.3 |
| `tree:buildTree` | 1 | 7.8 | 7.8 | 7.8 | 7.8 |
| `render:sidebar:sort` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `render:sidebar:filter-pipeline` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
