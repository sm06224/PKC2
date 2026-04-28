# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 27.0 | 9.54 |
| c-500 | 500 | 15.6 | 9.54 |
| c-1000 | 1000 | 122.5 | 12.78 |
| c-5000 | 5000 | 360.5 | 40.15 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-28T15:28:24.585Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 7.2 | 7.2 | 7.2 | 7.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 7.2 | 7.2 | 7.2 | 7.2 |
| `render:scope=sidebar-only` | 1 | 6.6 | 6.6 | 6.6 | 6.6 |
| `render:sidebar` | 1 | 2.9 | 2.9 | 2.9 | 2.9 |
| `render:sidebar:flat-loop` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:filter-pipeline` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **27.0 ms**
- heap used: **9.54 MB**
- captured: 2026-04-28T15:28:22.072Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 13.6 | 13.6 | 13.6 | 13.6 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 12.4 | 12.4 | 12.4 | 12.4 |
| `render:phase=ready` | 1 | 11.6 | 11.6 | 11.6 | 11.6 |
| `boot:loadFromStore` | 1 | 10.6 | 10.6 | 10.6 | 10.6 |
| `render:sidebar` | 1 | 6.4 | 6.4 | 6.4 | 6.4 |
| `render:sidebar:tree-loop` | 1 | 3.2 | 3.2 | 3.2 | 3.2 |
| `render:sidebar:filter-pipeline` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `render:center` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `tree:buildTree` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T15:28:23.552Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 80.7 | 16.5 | 33.1 | 33.1 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 80.5 | 16.4 | 33 | 33 |
| `render:scope=sidebar-only` | 4 | 73.9 | 15 | 31.6 | 31.6 |
| `render:sidebar` | 4 | 40.8 | 6.6 | 19.5 | 19.5 |
| `render:sidebar:flat-loop` | 4 | 29.8 | 5.3 | 13.1 | 13.1 |
| `render:sidebar:sublocation-scan` | 4 | 28.5 | 5.2 | 12.1 | 12.1 |
| `render:sidebar:filter-pipeline` | 4 | 1.6 | 0.2 | 1.1 | 1.1 |
| `filter:applyFilters` | 4 | 1.4 | 0.1 | 1 | 1 |
| `render:sidebar:sort` | 4 | 0.9 | 0.1 | 0.7 | 0.7 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T15:28:25.585Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 87.5 | 87.5 | 87.5 | 87.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 82.5 | 82.5 | 82.5 | 82.5 |
| `render:phase=ready` | 1 | 81.7 | 81.7 | 81.7 | 81.7 |
| `render:meta` | 1 | 8.1 | 8.1 | 8.1 | 8.1 |
| `render:sidebar` | 1 | 4.6 | 4.6 | 4.6 | 4.6 |
| `render:center` | 1 | 2.5 | 2.5 | 2.5 | 2.5 |
| `render:sidebar:tree-loop` | 1 | 1.9 | 1.9 | 1.9 | 1.9 |
| `render:sidebar:sort` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `tree:buildTree` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar:filter-pipeline` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-28T15:31:31.080Z

*(no measures recorded)*

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **15.6 ms**
- heap used: **9.54 MB**
- captured: 2026-04-28T15:28:26.388Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 10.1 | 10.1 | 10.1 | 10.1 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 3.3 | 3.3 | 3.3 | 3.3 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 2.8 | 2.8 | 2.8 | 2.8 |
| `render:phase=ready` | 1 | 2.3 | 2.3 | 2.3 | 2.3 |
| `render:center` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:scope=settings-only` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T15:24:31.560Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 181.1 | 33.8 | 73.5 | 73.5 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 180.7 | 33.8 | 73.4 | 73.4 |
| `render:scope=sidebar-only` | 4 | 175.1 | 32.7 | 71.7 | 71.7 |
| `render:sidebar` | 4 | 113.1 | 21.7 | 49.1 | 49.1 |
| `render:sidebar:flat-loop` | 4 | 83.6 | 18 | 30.9 | 30.9 |
| `render:sidebar:sublocation-scan` | 4 | 82.8 | 17.9 | 30.4 | 30.4 |
| `render:sidebar:filter-pipeline` | 4 | 3.6 | 0.5 | 1.8 | 1.8 |
| `filter:applyFilters` | 4 | 3.1 | 0.4 | 1.5 | 1.5 |
| `render:sidebar:sort` | 4 | 0.4 | 0 | 0.3 | 0.3 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.2 | 0 | 0.1 | 0.1 |

## c-500 (500 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T15:31:31.951Z

*(no measures recorded)*

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **10.68 MB**
- captured: 2026-04-28T15:31:36.246Z

*(no measures recorded)*

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **122.5 ms**
- heap used: **12.78 MB**
- captured: 2026-04-28T15:31:33.084Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 79.8 | 79.8 | 79.8 | 79.8 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 79 | 79 | 79 | 79 |
| `render:phase=ready` | 1 | 78.3 | 78.3 | 78.3 | 78.3 |
| `render:sidebar` | 1 | 55.1 | 55.1 | 55.1 | 55.1 |
| `boot:loadFromStore` | 1 | 38.7 | 38.7 | 38.7 | 38.7 |
| `render:sidebar:tree-loop` | 1 | 33.5 | 33.5 | 33.5 | 33.5 |
| `render:sidebar:filter-pipeline` | 1 | 7.7 | 7.7 | 7.7 | 7.7 |
| `tree:buildTree` | 1 | 6.2 | 6.2 | 6.2 | 6.2 |
| `render:sidebar:sort` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `render:center` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **12.11 MB**
- captured: 2026-04-28T15:31:35.232Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 370.3 | 68.8 | 152.4 | 152.4 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 369.9 | 68.7 | 152.2 | 152.2 |
| `render:scope=sidebar-only` | 4 | 361.9 | 67.1 | 150.3 | 150.3 |
| `render:sidebar` | 4 | 245.4 | 42.8 | 110.9 | 110.9 |
| `render:sidebar:flat-loop` | 4 | 175.6 | 32.1 | 76 | 76 |
| `render:sidebar:sublocation-scan` | 4 | 174.7 | 31.9 | 75.5 | 75.5 |
| `render:sidebar:filter-pipeline` | 4 | 6.3 | 1 | 3.1 | 3.1 |
| `filter:applyFilters` | 4 | 5.9 | 0.9 | 2.9 | 2.9 |
| `render:sidebar:sort` | 4 | 0.8 | 0.2 | 0.3 | 0.3 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.1 | 0 | 0.1 | 0.1 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **10.68 MB**
- captured: 2026-04-28T15:31:37.186Z

*(no measures recorded)*

## c-5000 (5000 entries) — `archetype-toggle`

- heap used: **45.2 MB**
- captured: 2026-04-28T15:31:48.139Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 148.1 | 148.1 | 148.1 | 148.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 148 | 148 | 148 | 148 |
| `render:scope=sidebar-only` | 1 | 145.3 | 145.3 | 145.3 | 145.3 |
| `render:sidebar` | 1 | 127.7 | 127.7 | 127.7 | 127.7 |
| `render:sidebar:flat-loop` | 1 | 3.7 | 3.7 | 3.7 | 3.7 |
| `render:sidebar:filter-pipeline` | 1 | 1 | 1 | 1 | 1 |
| `filter:applyFilters` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `render:sidebar:sort` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `cold-boot`

- boot enter→exit: **360.5 ms**
- heap used: **40.15 MB**
- captured: 2026-04-28T15:31:39.467Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 259.5 | 259.5 | 259.5 | 259.5 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 259.1 | 259.1 | 259.1 | 259.1 |
| `render:phase=ready` | 1 | 257.3 | 257.3 | 257.3 | 257.3 |
| `render:sidebar` | 1 | 210.3 | 210.3 | 210.3 | 210.3 |
| `render:sidebar:tree-loop` | 1 | 125.3 | 125.3 | 125.3 | 125.3 |
| `boot:loadFromStore` | 1 | 93.5 | 93.5 | 93.5 | 93.5 |
| `render:sidebar:filter-pipeline` | 1 | 45.9 | 45.9 | 45.9 | 45.9 |
| `tree:buildTree` | 1 | 7.6 | 7.6 | 7.6 | 7.6 |
| `render:sidebar:sort` | 1 | 1.8 | 1.8 | 1.8 | 1.8 |
| `render:center` | 1 | 1.6 | 1.6 | 1.6 | 1.6 |
| `dispatch:RESTORE_SETTINGS` | 1 | 1.4 | 1.4 | 1.4 | 1.4 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 1.2 | 1.2 | 1.2 | 1.2 |

## c-5000 (5000 entries) — `search-keystroke`

- heap used: **64.85 MB**
- captured: 2026-04-28T15:31:45.718Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 2132.7 | 512.9 | 633.8 | 633.8 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 2132.2 | 512.8 | 633.8 | 633.8 |
| `render:scope=sidebar-only` | 4 | 2110 | 507.6 | 629.7 | 629.7 |
| `render:sidebar` | 4 | 1405.1 | 328 | 450.5 | 450.5 |
| `render:sidebar:flat-loop` | 4 | 896.7 | 192.9 | 307 | 307 |
| `render:sidebar:sublocation-scan` | 4 | 895.7 | 192.7 | 306.6 | 306.6 |
| `render:sidebar:filter-pipeline` | 4 | 44.4 | 5 | 19.1 | 19.1 |
| `filter:applyFilters` | 4 | 41.3 | 4.4 | 18 | 18 |
| `render:sidebar:sort` | 4 | 3.8 | 0.7 | 1.3 | 1.3 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **35.57 MB**
- captured: 2026-04-28T15:31:51.410Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 760.8 | 760.8 | 760.8 | 760.8 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 753.4 | 753.4 | 753.4 | 753.4 |
| `render:phase=ready` | 1 | 743.7 | 743.7 | 743.7 | 743.7 |
| `render:meta` | 1 | 143.7 | 143.7 | 143.7 | 143.7 |
| `render:sidebar` | 1 | 126.7 | 126.7 | 126.7 | 126.7 |
| `render:sidebar:tree-loop` | 1 | 108.4 | 108.4 | 108.4 | 108.4 |
| `render:center` | 1 | 12 | 12 | 12 | 12 |
| `tree:buildTree` | 1 | 6.4 | 6.4 | 6.4 | 6.4 |
| `render:sidebar:filter-pipeline` | 1 | 1.3 | 1.3 | 1.3 | 1.3 |
| `render:sidebar:sort` | 1 | 1.2 | 1.2 | 1.2 | 1.2 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
