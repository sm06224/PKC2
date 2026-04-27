# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 17.4 | 9.54 |
| c-500 | 500 | 50.1 | 9.54 |
| c-1000 | 1000 | 87.9 | 11.35 |
| c-5000 | 5000 | 14.7 | 26.32 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:55:06.833Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 7.4 | 7.4 | 7.4 | 7.4 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 7.4 | 7.4 | 7.4 | 7.4 |
| `render:phase=ready` | 1 | 6.8 | 6.8 | 6.8 | 6.8 |
| `render:sidebar` | 1 | 1.7 | 1.7 | 1.7 | 1.7 |
| `render:center` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **17.4 ms**
- heap used: **9.54 MB**
- captured: 2026-04-27T21:55:05.491Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 8.5 | 8.5 | 8.5 | 8.5 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 8.2 | 8.2 | 8.2 | 8.2 |
| `render:phase=ready` | 1 | 7.8 | 7.8 | 7.8 | 7.8 |
| `boot:loadFromStore` | 1 | 7.4 | 7.4 | 7.4 | 7.4 |
| `render:sidebar` | 1 | 4.8 | 4.8 | 4.8 | 4.8 |
| `tree:buildTree` | 1 | 0.6 | 0.6 | 0.6 | 0.6 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:scope=settings-only` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `boot:readPkcData` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:55:06.238Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 96.5 | 21.2 | 33.3 | 33.3 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 96.4 | 21.2 | 33.2 | 33.2 |
| `render:phase=ready` | 4 | 93.3 | 20.5 | 32.3 | 32.3 |
| `render:sidebar` | 4 | 24.1 | 4.1 | 11.1 | 11.1 |
| `filter:applyFilters` | 4 | 0.6 | 0.1 | 0.3 | 0.3 |
| `render:center` | 4 | 0.2 | 0 | 0.1 | 0.1 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:55:07.549Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 66 | 66 | 66 | 66 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 62.5 | 62.5 | 62.5 | 62.5 |
| `render:phase=ready` | 1 | 62 | 62 | 62 | 62 |
| `render:sidebar` | 1 | 6.9 | 6.9 | 6.9 | 6.9 |
| `render:meta` | 1 | 5.4 | 5.4 | 5.4 | 5.4 |
| `tree:buildTree` | 1 | 4 | 4 | 4 | 4 |
| `render:center` | 1 | 2.9 | 2.9 | 2.9 | 2.9 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **11.35 MB**
- captured: 2026-04-27T21:55:10.028Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 19.2 | 19.2 | 19.2 | 19.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 19.2 | 19.2 | 19.2 | 19.2 |
| `render:phase=ready` | 1 | 18.7 | 18.7 | 18.7 | 18.7 |
| `render:sidebar` | 1 | 9.9 | 9.9 | 9.9 | 9.9 |
| `filter:applyFilters` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **50.1 ms**
- heap used: **9.54 MB**
- captured: 2026-04-27T21:55:08.185Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 25.3 | 25.3 | 25.3 | 25.3 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 22.8 | 22.8 | 22.8 | 22.8 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 22.7 | 22.7 | 22.7 | 22.7 |
| `render:phase=ready` | 1 | 22.5 | 22.5 | 22.5 | 22.5 |
| `render:sidebar` | 1 | 11.9 | 11.9 | 11.9 | 11.9 |
| `tree:buildTree` | 1 | 0.7 | 0.7 | 0.7 | 0.7 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:scope=settings-only` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **10.11 MB**
- captured: 2026-04-27T21:55:09.347Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 360.8 | 81 | 109.7 | 109.7 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 360.6 | 81 | 109.7 | 109.7 |
| `render:phase=ready` | 4 | 356.6 | 80 | 108.7 | 108.7 |
| `render:sidebar` | 4 | 91.6 | 18.8 | 35.8 | 35.8 |
| `filter:applyFilters` | 4 | 3.1 | 0.4 | 1.4 | 1.4 |
| `render:center` | 4 | 0.3 | 0.1 | 0.1 | 0.1 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:55:10.813Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 108.7 | 108.7 | 108.7 | 108.7 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 104.9 | 104.9 | 104.9 | 104.9 |
| `render:phase=ready` | 1 | 104.2 | 104.2 | 104.2 | 104.2 |
| `render:meta` | 1 | 11.7 | 11.7 | 11.7 | 11.7 |
| `render:sidebar` | 1 | 10.1 | 10.1 | 10.1 | 10.1 |
| `render:center` | 1 | 2.9 | 2.9 | 2.9 | 2.9 |
| `tree:buildTree` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **11.35 MB**
- captured: 2026-04-27T21:55:14.043Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 28.8 | 28.8 | 28.8 | 28.8 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 28.8 | 28.8 | 28.8 | 28.8 |
| `render:phase=ready` | 1 | 28.2 | 28.2 | 28.2 | 28.2 |
| `render:sidebar` | 1 | 15.5 | 15.5 | 15.5 | 15.5 |
| `filter:applyFilters` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:center` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **87.9 ms**
- heap used: **11.35 MB**
- captured: 2026-04-27T21:55:11.537Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 46.4 | 46.4 | 46.4 | 46.4 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 38.7 | 38.7 | 38.7 | 38.7 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 38.3 | 38.3 | 38.3 | 38.3 |
| `render:phase=ready` | 1 | 37.8 | 37.8 | 37.8 | 37.8 |
| `render:sidebar` | 1 | 23.3 | 23.3 | 23.3 | 23.3 |
| `tree:buildTree` | 1 | 1.9 | 1.9 | 1.9 | 1.9 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:scope=settings-only` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **16.31 MB**
- captured: 2026-04-27T21:55:13.292Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 695.6 | 161.6 | 207.3 | 207.3 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 695.5 | 161.6 | 207.3 | 207.3 |
| `render:phase=ready` | 4 | 690.3 | 160.5 | 206.2 | 206.2 |
| `render:sidebar` | 4 | 193.6 | 43 | 67.6 | 67.6 |
| `filter:applyFilters` | 4 | 4.7 | 0.8 | 2.2 | 2.2 |
| `render:center` | 4 | 0.6 | 0.1 | 0.2 | 0.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.1 | 0 | 0.1 | 0.1 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **17.36 MB**
- captured: 2026-04-27T21:55:14.958Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 164.1 | 164.1 | 164.1 | 164.1 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 160.5 | 160.5 | 160.5 | 160.5 |
| `render:phase=ready` | 1 | 159.4 | 159.4 | 159.4 | 159.4 |
| `render:meta` | 1 | 18.7 | 18.7 | 18.7 | 18.7 |
| `render:sidebar` | 1 | 17 | 17 | 17 | 17 |
| `render:center` | 1 | 2.6 | 2.6 | 2.6 | 2.6 |
| `tree:buildTree` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
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

- boot enter→exit: **14.7 ms**
- heap used: **26.32 MB**
- captured: 2026-04-27T21:55:15.872Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 11.3 | 11.3 | 11.3 | 11.3 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 1.9 | 1.9 | 1.9 | 1.9 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 1.7 | 1.7 | 1.7 | 1.7 |
| `render:phase=ready` | 1 | 1.4 | 1.4 | 1.4 | 1.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:sidebar` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **26.32 MB**
- captured: 2026-04-27T21:30:31.143Z

*(no measures recorded)*
