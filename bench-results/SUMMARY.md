# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 16.4 | 9.54 |
| c-500 | 500 | 34.9 | 10.11 |
| c-1000 | 1000 | 60.6 | 11.35 |
| c-5000 | 5000 | 178.9 | 35.57 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-28T10:06:09.912Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 4.9 | 4.9 | 4.9 | 4.9 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 4.8 | 4.8 | 4.8 | 4.8 |
| `render:scope=sidebar-only` | 1 | 4.5 | 4.5 | 4.5 | 4.5 |
| `render:sidebar` | 1 | 2.4 | 2.4 | 2.4 | 2.4 |
| `render:sidebar:filter-pipeline` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:sidebar:flat-loop` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `filter:applyFilters` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **16.4 ms**
- heap used: **9.54 MB**
- captured: 2026-04-28T10:06:08.670Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 9.1 | 9.1 | 9.1 | 9.1 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 8.9 | 8.9 | 8.9 | 8.9 |
| `render:phase=ready` | 1 | 8.6 | 8.6 | 8.6 | 8.6 |
| `boot:loadFromStore` | 1 | 5.8 | 5.8 | 5.8 | 5.8 |
| `render:sidebar` | 1 | 5.2 | 5.2 | 5.2 | 5.2 |
| `render:sidebar:tree-loop` | 1 | 3.1 | 3.1 | 3.1 | 3.1 |
| `render:center` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `tree:buildTree` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:sort` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T10:06:09.359Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 41.5 | 7.7 | 17.4 | 17.4 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 41.4 | 7.6 | 17.4 | 17.4 |
| `render:scope=sidebar-only` | 4 | 39 | 7.3 | 16.8 | 16.8 |
| `render:sidebar` | 4 | 24.3 | 3.9 | 12 | 12 |
| `render:sidebar:flat-loop` | 4 | 17.2 | 3.1 | 8 | 8 |
| `render:sidebar:sublocation-scan` | 4 | 16.8 | 3.1 | 7.6 | 7.6 |
| `render:sidebar:filter-pipeline` | 4 | 2.4 | 0.4 | 1.3 | 1.3 |
| `filter:applyFilters` | 4 | 1.1 | 0.2 | 0.4 | 0.4 |
| `render:sidebar:sort` | 4 | 0.1 | 0 | 0.1 | 0.1 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T10:06:10.496Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 45.4 | 45.4 | 45.4 | 45.4 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 42 | 42 | 42 | 42 |
| `render:phase=ready` | 1 | 41.6 | 41.6 | 41.6 | 41.6 |
| `render:meta` | 1 | 4.9 | 4.9 | 4.9 | 4.9 |
| `render:sidebar` | 1 | 2.6 | 2.6 | 2.6 | 2.6 |
| `render:center` | 1 | 1.9 | 1.9 | 1.9 | 1.9 |
| `render:sidebar:tree-loop` | 1 | 1.4 | 1.4 | 1.4 | 1.4 |
| `render:sidebar:sort` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `tree:buildTree` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **10.11 MB**
- captured: 2026-04-28T10:06:12.506Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 12.6 | 12.6 | 12.6 | 12.6 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 12.4 | 12.4 | 12.4 | 12.4 |
| `render:scope=sidebar-only` | 1 | 12.1 | 12.1 | 12.1 | 12.1 |
| `render:sidebar` | 1 | 9.3 | 9.3 | 9.3 | 9.3 |
| `render:sidebar:filter-pipeline` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `filter:applyFilters` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:flat-loop` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **34.9 ms**
- heap used: **10.11 MB**
- captured: 2026-04-28T10:06:10.986Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 18.5 | 18.5 | 18.5 | 18.5 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 18.2 | 18.2 | 18.2 | 18.2 |
| `render:phase=ready` | 1 | 18 | 18 | 18 | 18 |
| `boot:loadFromStore` | 1 | 14.6 | 14.6 | 14.6 | 14.6 |
| `render:sidebar` | 1 | 10.9 | 10.9 | 10.9 | 10.9 |
| `render:sidebar:tree-loop` | 1 | 6.7 | 6.7 | 6.7 | 6.7 |
| `tree:buildTree` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `render:center` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:filter-pipeline` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar:sort` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T10:06:11.888Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 126.2 | 27.2 | 47.1 | 47.1 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 126 | 27.1 | 47.1 | 47.1 |
| `render:scope=sidebar-only` | 4 | 123.7 | 26.6 | 46.4 | 46.4 |
| `render:sidebar` | 4 | 82.8 | 16.5 | 33.9 | 33.9 |
| `render:sidebar:flat-loop` | 4 | 57 | 11.8 | 21.3 | 21.3 |
| `render:sidebar:sublocation-scan` | 4 | 56.7 | 11.8 | 21.1 | 21.1 |
| `render:sidebar:filter-pipeline` | 4 | 7.5 | 1.7 | 2.2 | 2.2 |
| `filter:applyFilters` | 4 | 1.7 | 0.3 | 0.6 | 0.6 |
| `render:sidebar:sort` | 4 | 0.5 | 0.1 | 0.2 | 0.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.1 | 0 | 0.1 | 0.1 |

## c-500 (500 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T10:06:13.250Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 88.2 | 88.2 | 88.2 | 88.2 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 84.3 | 84.3 | 84.3 | 84.3 |
| `render:phase=ready` | 1 | 83.5 | 83.5 | 83.5 | 83.5 |
| `render:meta` | 1 | 12 | 12 | 12 | 12 |
| `render:sidebar` | 1 | 8.8 | 8.8 | 8.8 | 8.8 |
| `render:sidebar:tree-loop` | 1 | 6.2 | 6.2 | 6.2 | 6.2 |
| `render:center` | 1 | 2.4 | 2.4 | 2.4 | 2.4 |
| `tree:buildTree` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `render:sidebar:sort` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:sidebar:filter-pipeline` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **17.36 MB**
- captured: 2026-04-28T10:06:15.785Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 19 | 19 | 19 | 19 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 18.9 | 18.9 | 18.9 | 18.9 |
| `render:scope=sidebar-only` | 1 | 18.2 | 18.2 | 18.2 | 18.2 |
| `render:sidebar` | 1 | 14.6 | 14.6 | 14.6 | 14.6 |
| `render:sidebar:flat-loop` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `render:sidebar:filter-pipeline` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `filter:applyFilters` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar:sort` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **60.6 ms**
- heap used: **11.35 MB**
- captured: 2026-04-28T10:06:13.854Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 35.8 | 35.8 | 35.8 | 35.8 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 35.5 | 35.5 | 35.5 | 35.5 |
| `render:phase=ready` | 1 | 35.2 | 35.2 | 35.2 | 35.2 |
| `boot:loadFromStore` | 1 | 22.8 | 22.8 | 22.8 | 22.8 |
| `render:sidebar` | 1 | 22.1 | 22.1 | 22.1 | 22.1 |
| `render:sidebar:tree-loop` | 1 | 15.6 | 15.6 | 15.6 | 15.6 |
| `tree:buildTree` | 1 | 1.7 | 1.7 | 1.7 | 1.7 |
| `render:center` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `render:sidebar:sort` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `render:sidebar:filter-pipeline` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:scope=settings-only` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **12.11 MB**
- captured: 2026-04-28T10:06:15.057Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 248.8 | 53.9 | 84.1 | 84.1 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 248.6 | 53.9 | 84 | 84 |
| `render:scope=sidebar-only` | 4 | 245.4 | 53.1 | 83.2 | 83.2 |
| `render:sidebar` | 4 | 171.6 | 37.5 | 60.4 | 60.4 |
| `render:sidebar:flat-loop` | 4 | 114.1 | 24.8 | 41.3 | 41.3 |
| `render:sidebar:sublocation-scan` | 4 | 113.8 | 24.7 | 41.2 | 41.2 |
| `render:sidebar:filter-pipeline` | 4 | 24.5 | 5.7 | 7.1 | 7.1 |
| `filter:applyFilters` | 4 | 5.1 | 0.8 | 2.6 | 2.6 |
| `render:sidebar:sort` | 4 | 0.5 | 0.1 | 0.2 | 0.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **16.31 MB**
- captured: 2026-04-28T10:06:16.685Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 131.1 | 131.1 | 131.1 | 131.1 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 127.7 | 127.7 | 127.7 | 127.7 |
| `render:phase=ready` | 1 | 126.4 | 126.4 | 126.4 | 126.4 |
| `render:meta` | 1 | 20.6 | 20.6 | 20.6 | 20.6 |
| `render:sidebar` | 1 | 17.6 | 17.6 | 17.6 | 17.6 |
| `render:sidebar:tree-loop` | 1 | 14.1 | 14.1 | 14.1 | 14.1 |
| `render:center` | 1 | 2.9 | 2.9 | 2.9 | 2.9 |
| `tree:buildTree` | 1 | 1.4 | 1.4 | 1.4 | 1.4 |
| `render:sidebar:filter-pipeline` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar:sort` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `archetype-toggle`

- heap used: **26.32 MB**
- captured: 2026-04-28T10:06:23.234Z

*(no measures recorded)*

## c-5000 (5000 entries) — `cold-boot`

- boot enter→exit: **178.9 ms**
- heap used: **35.57 MB**
- captured: 2026-04-28T10:06:17.967Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 126.8 | 126.8 | 126.8 | 126.8 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 126.5 | 126.5 | 126.5 | 126.5 |
| `render:phase=ready` | 1 | 125.5 | 125.5 | 125.5 | 125.5 |
| `render:sidebar` | 1 | 91 | 91 | 91 | 91 |
| `render:sidebar:tree-loop` | 1 | 66.2 | 66.2 | 66.2 | 66.2 |
| `boot:loadFromStore` | 1 | 47.7 | 47.7 | 47.7 | 47.7 |
| `tree:buildTree` | 1 | 7.9 | 7.9 | 7.9 | 7.9 |
| `render:sidebar:filter-pipeline` | 1 | 2.6 | 2.6 | 2.6 | 2.6 |
| `render:sidebar:sort` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `render:center` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `render:scope=settings-only` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |

## c-5000 (5000 entries) — `search-keystroke`

- heap used: **33.47 MB**
- captured: 2026-04-28T10:06:22.341Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 1899.5 | 452.5 | 537.2 | 537.2 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 1899.2 | 452.4 | 537.2 | 537.2 |
| `render:scope=sidebar-only` | 4 | 1888.5 | 450 | 534 | 534 |
| `render:sidebar` | 4 | 1447.5 | 348.2 | 400.8 | 400.8 |
| `render:sidebar:flat-loop` | 4 | 520.2 | 118.8 | 158.7 | 158.7 |
| `render:sidebar:sublocation-scan` | 4 | 519.5 | 118.7 | 158.3 | 158.3 |
| `render:sidebar:filter-pipeline` | 4 | 416.3 | 100.6 | 111.7 | 111.7 |
| `filter:applyFilters` | 4 | 22.5 | 3.2 | 12.4 | 12.4 |
| `render:sidebar:sort` | 4 | 2.6 | 0.6 | 0.8 | 0.8 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.2 | 0 | 0.1 | 0.1 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **42.63 MB**
- captured: 2026-04-28T10:08:13.929Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 507.8 | 507.8 | 507.8 | 507.8 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 504.3 | 504.3 | 504.3 | 504.3 |
| `render:phase=ready` | 1 | 499 | 499 | 499 | 499 |
| `render:meta` | 1 | 84.7 | 84.7 | 84.7 | 84.7 |
| `render:sidebar` | 1 | 84.5 | 84.5 | 84.5 | 84.5 |
| `render:sidebar:tree-loop` | 1 | 60.2 | 60.2 | 60.2 | 60.2 |
| `tree:buildTree` | 1 | 12 | 12 | 12 | 12 |
| `render:center` | 1 | 6.5 | 6.5 | 6.5 | 6.5 |
| `render:sidebar:sort` | 1 | 2.3 | 2.3 | 2.3 | 2.3 |
| `render:sidebar:filter-pipeline` | 1 | 1 | 1 | 1 | 1 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
