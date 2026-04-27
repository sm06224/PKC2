# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 22.8 | 9.54 |
| c-500 | 500 | 52.2 | 9.54 |
| c-1000 | 1000 | 86.6 | 12.11 |
| c-5000 | 5000 | 9.2 | 26.32 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-27T22:18:02.076Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 5.7 | 5.7 | 5.7 | 5.7 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 5.6 | 5.6 | 5.6 | 5.6 |
| `render:scope=sidebar-only` | 1 | 5.2 | 5.2 | 5.2 | 5.2 |
| `render:sidebar` | 1 | 2.1 | 2.1 | 2.1 | 2.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **22.8 ms**
- heap used: **9.54 MB**
- captured: 2026-04-27T22:18:00.605Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 13.5 | 13.5 | 13.5 | 13.5 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 7.8 | 7.8 | 7.8 | 7.8 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 7.6 | 7.6 | 7.6 | 7.6 |
| `render:phase=ready` | 1 | 7.4 | 7.4 | 7.4 | 7.4 |
| `render:sidebar` | 1 | 4.4 | 4.4 | 4.4 | 4.4 |
| `tree:buildTree` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0 | 0 | 0 | 0 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
| `dispatch:RESTORE_SETTINGS:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-27T22:18:01.433Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 101.1 | 21.9 | 37.9 | 37.9 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 101 | 21.9 | 37.9 | 37.9 |
| `render:scope=sidebar-only` | 4 | 98.5 | 21.1 | 37.1 | 37.1 |
| `render:sidebar` | 4 | 26.4 | 4.5 | 12.8 | 12.8 |
| `filter:applyFilters` | 4 | 0.8 | 0.1 | 0.4 | 0.4 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.1 | 0 | 0.1 | 0.1 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-27T22:18:02.723Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 47.3 | 47.3 | 47.3 | 47.3 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 44 | 44 | 44 | 44 |
| `render:phase=ready` | 1 | 43.6 | 43.6 | 43.6 | 43.6 |
| `render:meta` | 1 | 4.2 | 4.2 | 4.2 | 4.2 |
| `render:sidebar` | 1 | 2.5 | 2.5 | 2.5 | 2.5 |
| `render:center` | 1 | 1.8 | 1.8 | 1.8 | 1.8 |
| `tree:buildTree` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **10.68 MB**
- captured: 2026-04-27T22:18:04.971Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 17 | 17 | 17 | 17 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 17 | 17 | 17 | 17 |
| `render:scope=sidebar-only` | 1 | 16.5 | 16.5 | 16.5 | 16.5 |
| `render:sidebar` | 1 | 10.7 | 10.7 | 10.7 | 10.7 |
| `filter:applyFilters` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **52.2 ms**
- heap used: **9.54 MB**
- captured: 2026-04-27T22:18:03.237Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 30.7 | 30.7 | 30.7 | 30.7 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 19.8 | 19.8 | 19.8 | 19.8 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 19.3 | 19.3 | 19.3 | 19.3 |
| `render:phase=ready` | 1 | 19 | 19 | 19 | 19 |
| `render:sidebar` | 1 | 12 | 12 | 12 | 12 |
| `tree:buildTree` | 1 | 0.8 | 0.8 | 0.8 | 0.8 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:phase=initializing` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-27T22:18:04.299Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 325 | 72.7 | 102.8 | 102.8 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 324.9 | 72.7 | 102.8 | 102.8 |
| `render:scope=sidebar-only` | 4 | 321.4 | 72.1 | 102 | 102 |
| `render:sidebar` | 4 | 89.6 | 18.6 | 35.4 | 35.4 |
| `filter:applyFilters` | 4 | 2 | 0.4 | 0.8 | 0.8 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-27T22:18:05.821Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 121.5 | 121.5 | 121.5 | 121.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 117.6 | 117.6 | 117.6 | 117.6 |
| `render:phase=ready` | 1 | 116.8 | 116.8 | 116.8 | 116.8 |
| `render:meta` | 1 | 11.9 | 11.9 | 11.9 | 11.9 |
| `render:sidebar` | 1 | 9.6 | 9.6 | 9.6 | 9.6 |
| `render:center` | 1 | 2.6 | 2.6 | 2.6 | 2.6 |
| `tree:buildTree` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **18.41 MB**
- captured: 2026-04-27T22:18:08.962Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 23.8 | 23.8 | 23.8 | 23.8 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 23.8 | 23.8 | 23.8 | 23.8 |
| `render:scope=sidebar-only` | 1 | 23.2 | 23.2 | 23.2 | 23.2 |
| `render:sidebar` | 1 | 14.2 | 14.2 | 14.2 | 14.2 |
| `filter:applyFilters` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **86.6 ms**
- heap used: **12.11 MB**
- captured: 2026-04-27T22:18:06.564Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 46.9 | 46.9 | 46.9 | 46.9 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 37 | 37 | 37 | 37 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 36.7 | 36.7 | 36.7 | 36.7 |
| `render:phase=ready` | 1 | 36.3 | 36.3 | 36.3 | 36.3 |
| `render:sidebar` | 1 | 24.7 | 24.7 | 24.7 | 24.7 |
| `tree:buildTree` | 1 | 2 | 2 | 2 | 2 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:scope=settings-only` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **14.5 MB**
- captured: 2026-04-27T22:18:08.207Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 687.2 | 159.8 | 214.1 | 214.1 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 686.8 | 159.7 | 214 | 214 |
| `render:scope=sidebar-only` | 4 | 682.4 | 158.7 | 212.6 | 212.6 |
| `render:sidebar` | 4 | 190.8 | 41.4 | 61.8 | 61.8 |
| `filter:applyFilters` | 4 | 4.2 | 0.6 | 2.2 | 2.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **17.36 MB**
- captured: 2026-04-27T22:18:09.877Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 171.2 | 171.2 | 171.2 | 171.2 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 167.3 | 167.3 | 167.3 | 167.3 |
| `render:phase=ready` | 1 | 166.2 | 166.2 | 166.2 | 166.2 |
| `render:meta` | 1 | 18.3 | 18.3 | 18.3 | 18.3 |
| `render:sidebar` | 1 | 17.5 | 17.5 | 17.5 | 17.5 |
| `render:center` | 1 | 3 | 3 | 3 | 3 |
| `tree:buildTree` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `cold-boot`

- boot enter→exit: **9.2 ms**
- heap used: **26.32 MB**
- captured: 2026-04-27T22:18:10.890Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 5.5 | 5.5 | 5.5 | 5.5 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 2.2 | 2.2 | 2.2 | 2.2 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 2 | 2 | 2 | 2 |
| `render:phase=ready` | 1 | 1.8 | 1.8 | 1.8 | 1.8 |
| `render:center` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
| `render:sidebar` | 1 | 0 | 0 | 0 | 0 |
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
