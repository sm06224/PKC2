# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 22.7 | 9.54 |
| c-500 | 500 | 50.7 | 9.54 |
| c-1000 | 1000 | 91.8 | 12.11 |
| c-5000 | 5000 | 15.7 | 26.32 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-27T22:48:13.189Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 6.2 | 6.2 | 6.2 | 6.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 6.1 | 6.1 | 6.1 | 6.1 |
| `render:scope=sidebar-only` | 1 | 5.5 | 5.5 | 5.5 | 5.5 |
| `render:sidebar` | 1 | 2.7 | 2.7 | 2.7 | 2.7 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **22.7 ms**
- heap used: **9.54 MB**
- captured: 2026-04-27T22:48:11.692Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 10.6 | 10.6 | 10.6 | 10.6 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 10.3 | 10.3 | 10.3 | 10.3 |
| `boot:loadFromStore` | 1 | 10.1 | 10.1 | 10.1 | 10.1 |
| `render:phase=ready` | 1 | 9.8 | 9.8 | 9.8 | 9.8 |
| `render:sidebar` | 1 | 5.6 | 5.6 | 5.6 | 5.6 |
| `tree:buildTree` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-27T22:48:12.564Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 93.8 | 19.4 | 34.8 | 34.8 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 93.7 | 19.3 | 34.8 | 34.8 |
| `render:scope=sidebar-only` | 4 | 90.8 | 18.7 | 34.1 | 34.1 |
| `render:sidebar` | 4 | 24.2 | 3.9 | 11.4 | 11.4 |
| `filter:applyFilters` | 4 | 0.7 | 0.1 | 0.4 | 0.4 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.1 | 0 | 0.1 | 0.1 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-27T22:48:13.823Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 49.3 | 49.3 | 49.3 | 49.3 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 46 | 46 | 46 | 46 |
| `render:phase=ready` | 1 | 45.5 | 45.5 | 45.5 | 45.5 |
| `render:meta` | 1 | 4.3 | 4.3 | 4.3 | 4.3 |
| `render:sidebar` | 1 | 2.7 | 2.7 | 2.7 | 2.7 |
| `render:center` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `tree:buildTree` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **10.11 MB**
- captured: 2026-04-27T22:48:16.095Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 13 | 13 | 13 | 13 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 13 | 13 | 13 | 13 |
| `render:scope=sidebar-only` | 1 | 12.6 | 12.6 | 12.6 | 12.6 |
| `render:sidebar` | 1 | 8.8 | 8.8 | 8.8 | 8.8 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **50.7 ms**
- heap used: **9.54 MB**
- captured: 2026-04-27T22:48:14.356Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 28.8 | 28.8 | 28.8 | 28.8 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 20.2 | 20.2 | 20.2 | 20.2 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 19.9 | 19.9 | 19.9 | 19.9 |
| `render:phase=ready` | 1 | 19.7 | 19.7 | 19.7 | 19.7 |
| `render:sidebar` | 1 | 12.4 | 12.4 | 12.4 | 12.4 |
| `tree:buildTree` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:scope=settings-only` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-27T22:48:15.452Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 321.4 | 60.7 | 109 | 109 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 321.2 | 60.6 | 108.9 | 108.9 |
| `render:scope=sidebar-only` | 4 | 317.6 | 60 | 107.7 | 107.7 |
| `render:sidebar` | 4 | 87.1 | 16.8 | 33.2 | 33.2 |
| `filter:applyFilters` | 4 | 2.1 | 0.3 | 0.8 | 0.8 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.1 | 0 | 0.1 | 0.1 |

## c-500 (500 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-27T22:48:16.835Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 119.5 | 119.5 | 119.5 | 119.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 115.2 | 115.2 | 115.2 | 115.2 |
| `render:phase=ready` | 1 | 114.2 | 114.2 | 114.2 | 114.2 |
| `render:meta` | 1 | 13.3 | 13.3 | 13.3 | 13.3 |
| `render:sidebar` | 1 | 9.6 | 9.6 | 9.6 | 9.6 |
| `render:center` | 1 | 2.7 | 2.7 | 2.7 | 2.7 |
| `tree:buildTree` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **17.36 MB**
- captured: 2026-04-27T22:48:19.990Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 20.3 | 20.3 | 20.3 | 20.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 20.2 | 20.2 | 20.2 | 20.2 |
| `render:scope=sidebar-only` | 1 | 19.8 | 19.8 | 19.8 | 19.8 |
| `render:sidebar` | 1 | 12.9 | 12.9 | 12.9 | 12.9 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **91.8 ms**
- heap used: **12.11 MB**
- captured: 2026-04-27T22:48:17.584Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 51.7 | 51.7 | 51.7 | 51.7 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 37.4 | 37.4 | 37.4 | 37.4 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 37.1 | 37.1 | 37.1 | 37.1 |
| `render:phase=ready` | 1 | 36.7 | 36.7 | 36.7 | 36.7 |
| `render:sidebar` | 1 | 25.7 | 25.7 | 25.7 | 25.7 |
| `tree:buildTree` | 1 | 2.1 | 2.1 | 2.1 | 2.1 |
| `render:center` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:scope=settings-only` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **11.35 MB**
- captured: 2026-04-27T22:48:19.267Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 622.1 | 145.8 | 187.9 | 187.9 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 621.9 | 145.8 | 187.9 | 187.9 |
| `render:scope=sidebar-only` | 4 | 616.5 | 144.5 | 186.1 | 186.1 |
| `render:sidebar` | 4 | 172 | 37.7 | 58.2 | 58.2 |
| `filter:applyFilters` | 4 | 4.4 | 0.7 | 2.2 | 2.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.1 | 0 | 0.1 | 0.1 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **16.31 MB**
- captured: 2026-04-27T22:48:20.883Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 165.5 | 165.5 | 165.5 | 165.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 161.9 | 161.9 | 161.9 | 161.9 |
| `render:phase=ready` | 1 | 160 | 160 | 160 | 160 |
| `render:meta` | 1 | 18 | 18 | 18 | 18 |
| `render:sidebar` | 1 | 16 | 16 | 16 | 16 |
| `render:center` | 1 | 2.4 | 2.4 | 2.4 | 2.4 |
| `tree:buildTree` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `archetype-toggle`

- heap used: **33.47 MB**
- captured: 2026-04-27T22:18:19.124Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 180.9 | 180.9 | 180.9 | 180.9 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 180.8 | 180.8 | 180.8 | 180.8 |
| `render:scope=sidebar-only` | 1 | 179.7 | 179.7 | 179.7 | 179.7 |
| `render:sidebar` | 1 | 140.4 | 140.4 | 140.4 | 140.4 |
| `filter:applyFilters` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `cold-boot`

- boot enter→exit: **15.7 ms**
- heap used: **26.32 MB**
- captured: 2026-04-27T22:48:21.743Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 12.1 | 12.1 | 12.1 | 12.1 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 2 | 2 | 2 | 2 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 1.7 | 1.7 | 1.7 | 1.7 |
| `render:phase=ready` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:sidebar` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0 | 0 | 0 | 0 |
| `dispatch:RESTORE_SETTINGS:reduce` | 1 | 0 | 0 | 0 | 0 |
| `render:scope=settings-only` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `search-keystroke`

- heap used: **29.75 MB**
- captured: 2026-04-27T22:18:17.192Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 3762.2 | 940.3 | 1043.4 | 1043.4 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 3762 | 940.3 | 1043.3 | 1043.3 |
| `render:scope=sidebar-only` | 4 | 3750.4 | 937.6 | 1040.4 | 1040.4 |
| `render:sidebar` | 4 | 1511.4 | 370.5 | 403.3 | 403.3 |
| `filter:applyFilters` | 4 | 22.4 | 3.4 | 12.3 | 12.3 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **26.32 MB**
- captured: 2026-04-27T22:18:20.037Z

*(no measures recorded)*
