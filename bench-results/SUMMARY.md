# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 70.1 | 9.54 |
| c-500 | 500 | 151.8 | 11.35 |
| c-1000 | 1000 | 262.9 | 15.35 |
| c-5000 | 5000 | 52.1 | 26.32 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:27:16.014Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 7.2 | 7.2 | 7.2 | 7.2 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 7.2 | 7.2 | 7.2 | 7.2 |
| `render:phase=ready` | 1 | 6.9 | 6.9 | 6.9 | 6.9 |
| `render:sidebar` | 1 | 1.5 | 1.5 | 1.5 | 1.5 |
| `render:center` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **70.1 ms**
- heap used: **9.54 MB**
- captured: 2026-04-27T21:27:14.712Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 47.7 | 47.7 | 47.7 | 47.7 |
| `dispatch:RESTORE_SETTINGS` | 1 | 47.7 | 47.7 | 47.7 | 47.7 |
| `render:phase=ready` | 2 | 17.9 | 7.3 | 10.6 | 10.6 |
| `boot:loadFromStore` | 1 | 13.2 | 13.2 | 13.2 | 13.2 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 7.9 | 7.9 | 7.9 | 7.9 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 7.6 | 7.6 | 7.6 | 7.6 |
| `render:sidebar` | 2 | 7.5 | 3.1 | 4.4 | 4.4 |
| `tree:buildTree` | 2 | 0.5 | 0.1 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:center` | 2 | 0.3 | 0 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 2 | 0.1 | 0 | 0.1 | 0.1 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:27:15.444Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 89.7 | 20.4 | 29.9 | 29.9 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 89.6 | 20.4 | 29.9 | 29.9 |
| `render:phase=ready` | 4 | 87.2 | 19.8 | 29.2 | 29.2 |
| `render:sidebar` | 4 | 22.5 | 4.2 | 9.5 | 9.5 |
| `filter:applyFilters` | 4 | 0.8 | 0.1 | 0.5 | 0.5 |
| `render:center` | 4 | 0.5 | 0 | 0.3 | 0.3 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:27:16.615Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 50.5 | 50.5 | 50.5 | 50.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 47.2 | 47.2 | 47.2 | 47.2 |
| `render:phase=ready` | 1 | 46.7 | 46.7 | 46.7 | 46.7 |
| `render:meta` | 1 | 4.2 | 4.2 | 4.2 | 4.2 |
| `render:sidebar` | 1 | 2.8 | 2.8 | 2.8 | 2.8 |
| `render:center` | 1 | 2 | 2 | 2 | 2 |
| `tree:buildTree` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-27T21:27:19.077Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 18.7 | 18.7 | 18.7 | 18.7 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 18.7 | 18.7 | 18.7 | 18.7 |
| `render:phase=ready` | 1 | 18.1 | 18.1 | 18.1 | 18.1 |
| `render:sidebar` | 1 | 8.9 | 8.9 | 8.9 | 8.9 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **151.8 ms**
- heap used: **11.35 MB**
- captured: 2026-04-27T21:27:17.212Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 99.1 | 99.1 | 99.1 | 99.1 |
| `dispatch:RESTORE_SETTINGS` | 1 | 99.1 | 99.1 | 99.1 | 99.1 |
| `render:phase=ready` | 2 | 66.2 | 22.6 | 43.6 | 43.6 |
| `boot:loadFromStore` | 1 | 27.4 | 27.4 | 27.4 | 27.4 |
| `render:sidebar` | 2 | 24.9 | 10.9 | 14 | 14 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 23.3 | 23.3 | 23.3 | 23.3 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 23 | 23 | 23 | 23 |
| `tree:buildTree` | 2 | 1.6 | 0.7 | 0.9 | 0.9 |
| `render:center` | 2 | 0.5 | 0.1 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **10.11 MB**
- captured: 2026-04-27T21:27:18.398Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 349.9 | 65.3 | 117.7 | 117.7 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 349.7 | 65.3 | 117.6 | 117.6 |
| `render:phase=ready` | 4 | 346.1 | 64.4 | 116.9 | 116.9 |
| `render:sidebar` | 4 | 91 | 20.8 | 29.3 | 29.3 |
| `filter:applyFilters` | 4 | 2.5 | 0.5 | 0.9 | 0.9 |
| `render:center` | 4 | 0.3 | 0 | 0.2 | 0.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `select-entry`

- heap used: **10.68 MB**
- captured: 2026-04-27T21:27:19.934Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 113.6 | 113.6 | 113.6 | 113.6 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 110.2 | 110.2 | 110.2 | 110.2 |
| `render:phase=ready` | 1 | 109.2 | 109.2 | 109.2 | 109.2 |
| `render:meta` | 1 | 13.3 | 13.3 | 13.3 | 13.3 |
| `render:sidebar` | 1 | 7.6 | 7.6 | 7.6 | 7.6 |
| `render:center` | 1 | 2.5 | 2.5 | 2.5 | 2.5 |
| `tree:buildTree` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **17.36 MB**
- captured: 2026-04-27T21:27:23.543Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 43.5 | 43.5 | 43.5 | 43.5 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 43.5 | 43.5 | 43.5 | 43.5 |
| `render:phase=ready` | 1 | 42.9 | 42.9 | 42.9 | 42.9 |
| `render:sidebar` | 1 | 22.8 | 22.8 | 22.8 | 22.8 |
| `filter:applyFilters` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:center` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **262.9 ms**
- heap used: **15.35 MB**
- captured: 2026-04-27T21:27:20.783Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 179.7 | 179.7 | 179.7 | 179.7 |
| `dispatch:RESTORE_SETTINGS` | 1 | 179.7 | 179.7 | 179.7 | 179.7 |
| `render:phase=ready` | 2 | 121.1 | 35.3 | 85.8 | 85.8 |
| `boot:loadFromStore` | 1 | 44.4 | 44.4 | 44.4 | 44.4 |
| `render:sidebar` | 2 | 42 | 17.7 | 24.3 | 24.3 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 36.2 | 36.2 | 36.2 | 36.2 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 35.8 | 35.8 | 35.8 | 35.8 |
| `tree:buildTree` | 2 | 2.9 | 0.8 | 2.1 | 2.1 |
| `render:center` | 2 | 0.5 | 0.1 | 0.4 | 0.4 |
| `boot:readPkcData` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **16.31 MB**
- captured: 2026-04-27T21:27:22.622Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 689.8 | 143.2 | 208.6 | 208.6 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 689.5 | 143.2 | 208.5 | 208.5 |
| `render:phase=ready` | 4 | 683.2 | 141.9 | 207 | 207 |
| `render:sidebar` | 4 | 196.3 | 43.3 | 65.9 | 65.9 |
| `filter:applyFilters` | 4 | 5.1 | 0.7 | 2.8 | 2.8 |
| `render:center` | 4 | 0.5 | 0.1 | 0.2 | 0.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **12.78 MB**
- captured: 2026-04-27T21:27:24.645Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 180.5 | 180.5 | 180.5 | 180.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 176.5 | 176.5 | 176.5 | 176.5 |
| `render:phase=ready` | 1 | 175.3 | 175.3 | 175.3 | 175.3 |
| `render:sidebar` | 1 | 19.8 | 19.8 | 19.8 | 19.8 |
| `render:meta` | 1 | 17.4 | 17.4 | 17.4 | 17.4 |
| `render:center` | 1 | 6.4 | 6.4 | 6.4 | 6.4 |
| `tree:buildTree` | 1 | 1.7 | 1.7 | 1.7 | 1.7 |
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

- boot enter→exit: **52.1 ms**
- heap used: **26.32 MB**
- captured: 2026-04-27T21:27:25.636Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:RESTORE_SETTINGS` | 1 | 42.6 | 42.6 | 42.6 | 42.6 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 42.5 | 42.5 | 42.5 | 42.5 |
| `render:phase=ready` | 2 | 8 | 2.7 | 5.3 | 5.3 |
| `boot:loadFromStore` | 1 | 5.1 | 5.1 | 5.1 | 5.1 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 3 | 3 | 3 | 3 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 2.8 | 2.8 | 2.8 | 2.8 |
| `render:center` | 2 | 0.8 | 0.3 | 0.5 | 0.5 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:sidebar` | 2 | 0.2 | 0 | 0.2 | 0.2 |
| `boot:readPkcData` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 2 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **26.32 MB**
- captured: 2026-04-27T21:30:31.143Z

*(no measures recorded)*
