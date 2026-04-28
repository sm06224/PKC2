# Profile bench summary (PR #176)

_Captured by `tests/bench/profile.bench.ts`. Re-generate via `npm run bench` (rebuild + run + summarise)._

## Cold-boot wall clock

| scale | entries | boot enter→exit (ms) | heap used (MB) |
|---|---|---|---|
| c-100 | 100 | 28.4 | 9.54 |
| c-500 | 500 | 48.4 | 9.54 |
| c-1000 | 1000 | 80.0 | 11.35 |
| c-5000 | 5000 | 220.6 | 35.57 |

## c-100 (100 entries) — `archetype-toggle`

- heap used: **9.54 MB**
- captured: 2026-04-28T03:28:39.767Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 6.4 | 6.4 | 6.4 | 6.4 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 6.3 | 6.3 | 6.3 | 6.3 |
| `render:scope=sidebar-only` | 1 | 5.9 | 5.9 | 5.9 | 5.9 |
| `render:sidebar` | 1 | 2.4 | 2.4 | 2.4 | 2.4 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `cold-boot`

- boot enter→exit: **28.4 ms**
- heap used: **9.54 MB**
- captured: 2026-04-28T03:28:38.188Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `boot:loadFromStore` | 1 | 17.3 | 17.3 | 17.3 | 17.3 |
| `dispatch:SYS_INIT_COMPLETE` | 1 | 8.9 | 8.9 | 8.9 | 8.9 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 8.6 | 8.6 | 8.6 | 8.6 |
| `render:phase=ready` | 1 | 8.1 | 8.1 | 8.1 | 8.1 |
| `render:sidebar` | 1 | 4.1 | 4.1 | 4.1 | 4.1 |
| `tree:buildTree` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:center` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:scope=settings-only` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:phase=initializing` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-100 (100 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T03:28:39.080Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 100.9 | 21.9 | 35.9 | 35.9 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 100.7 | 21.9 | 35.8 | 35.8 |
| `render:scope=sidebar-only` | 4 | 97.3 | 20.8 | 34.9 | 34.9 |
| `render:sidebar` | 4 | 24.5 | 4.4 | 11.6 | 11.6 |
| `filter:applyFilters` | 4 | 1.1 | 0.2 | 0.6 | 0.6 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-100 (100 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T03:28:40.502Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 65.3 | 65.3 | 65.3 | 65.3 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 61.6 | 61.6 | 61.6 | 61.6 |
| `render:phase=ready` | 1 | 60.7 | 60.7 | 60.7 | 60.7 |
| `render:meta` | 1 | 5.1 | 5.1 | 5.1 | 5.1 |
| `render:sidebar` | 1 | 2.8 | 2.8 | 2.8 | 2.8 |
| `render:center` | 1 | 2.8 | 2.8 | 2.8 | 2.8 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `tree:buildTree` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `archetype-toggle`

- heap used: **10.11 MB**
- captured: 2026-04-28T03:28:43.260Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 16.5 | 16.5 | 16.5 | 16.5 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 16.5 | 16.5 | 16.5 | 16.5 |
| `render:scope=sidebar-only` | 1 | 15.9 | 15.9 | 15.9 | 15.9 |
| `render:sidebar` | 1 | 10.8 | 10.8 | 10.8 | 10.8 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `cold-boot`

- boot enter→exit: **48.4 ms**
- heap used: **9.54 MB**
- captured: 2026-04-28T03:28:41.163Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 25.9 | 25.9 | 25.9 | 25.9 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 25.5 | 25.5 | 25.5 | 25.5 |
| `render:phase=ready` | 1 | 24.8 | 24.8 | 24.8 | 24.8 |
| `boot:loadFromStore` | 1 | 20.2 | 20.2 | 20.2 | 20.2 |
| `render:sidebar` | 1 | 15.4 | 15.4 | 15.4 | 15.4 |
| `tree:buildTree` | 1 | 1.3 | 1.3 | 1.3 | 1.3 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `boot:readPkcData` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `render:center` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `render:scope=settings-only` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-500 (500 entries) — `search-keystroke`

- heap used: **9.54 MB**
- captured: 2026-04-28T03:28:42.487Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 399.1 | 71.4 | 145.3 | 145.3 |
| `dispatch:SET_SEARCH_QUERY` | 4 | 399.1 | 71.4 | 145.3 | 145.3 |
| `render:scope=sidebar-only` | 4 | 392.4 | 70.2 | 143.4 | 143.4 |
| `render:sidebar` | 4 | 95.3 | 18.5 | 39.2 | 39.2 |
| `filter:applyFilters` | 4 | 2.6 | 0.4 | 1.3 | 1.3 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-500 (500 entries) — `select-entry`

- heap used: **9.54 MB**
- captured: 2026-04-28T03:28:44.150Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 124.8 | 124.8 | 124.8 | 124.8 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 120.4 | 120.4 | 120.4 | 120.4 |
| `render:phase=ready` | 1 | 118.8 | 118.8 | 118.8 | 118.8 |
| `render:meta` | 1 | 15 | 15 | 15 | 15 |
| `render:sidebar` | 1 | 11.6 | 11.6 | 11.6 | 11.6 |
| `render:center` | 1 | 3.6 | 3.6 | 3.6 | 3.6 |
| `tree:buildTree` | 1 | 1.3 | 1.3 | 1.3 | 1.3 |
| `filter:applyFilters` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `archetype-toggle`

- heap used: **17.36 MB**
- captured: 2026-04-28T03:28:47.640Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 22.9 | 22.9 | 22.9 | 22.9 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 22.8 | 22.8 | 22.8 | 22.8 |
| `render:scope=sidebar-only` | 1 | 21.9 | 21.9 | 21.9 | 21.9 |
| `render:sidebar` | 1 | 12.5 | 12.5 | 12.5 | 12.5 |
| `filter:applyFilters` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-1000 (1000 entries) — `cold-boot`

- boot enter→exit: **80.0 ms**
- heap used: **11.35 MB**
- captured: 2026-04-28T03:28:44.909Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 41.5 | 41.5 | 41.5 | 41.5 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 41.2 | 41.2 | 41.2 | 41.2 |
| `render:phase=ready` | 1 | 40.9 | 40.9 | 40.9 | 40.9 |
| `boot:loadFromStore` | 1 | 34.9 | 34.9 | 34.9 | 34.9 |
| `render:sidebar` | 1 | 25.9 | 25.9 | 25.9 | 25.9 |
| `tree:buildTree` | 1 | 1.9 | 1.9 | 1.9 | 1.9 |
| `render:center` | 1 | 0.5 | 0.5 | 0.5 | 0.5 |
| `dispatch:RESTORE_SETTINGS` | 1 | 0.4 | 0.4 | 0.4 | 0.4 |
| `render:phase=initializing` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `render:scope=settings-only` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 0.3 | 0.3 | 0.3 | 0.3 |
| `dispatch:SYS_INIT_COMPLETE:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-1000 (1000 entries) — `search-keystroke`

- heap used: **11.35 MB**
- captured: 2026-04-28T03:28:46.732Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 698.8 | 151.8 | 229.5 | 229.5 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 698.6 | 151.8 | 229.4 | 229.4 |
| `render:scope=sidebar-only` | 4 | 691.8 | 150.4 | 227.3 | 227.3 |
| `render:sidebar` | 4 | 194.1 | 39.1 | 71 | 71 |
| `filter:applyFilters` | 4 | 4.9 | 0.7 | 2.6 | 2.6 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0.1 | 0 | 0.1 | 0.1 |

## c-1000 (1000 entries) — `select-entry`

- heap used: **16.31 MB**
- captured: 2026-04-28T03:28:48.731Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 195.5 | 195.5 | 195.5 | 195.5 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 190.4 | 190.4 | 190.4 | 190.4 |
| `render:phase=ready` | 1 | 187.9 | 187.9 | 187.9 | 187.9 |
| `render:meta` | 1 | 23.7 | 23.7 | 23.7 | 23.7 |
| `render:sidebar` | 1 | 18.7 | 18.7 | 18.7 | 18.7 |
| `render:center` | 1 | 2.8 | 2.8 | 2.8 | 2.8 |
| `tree:buildTree` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `archetype-toggle`

- heap used: **45.2 MB**
- captured: 2026-04-28T03:28:59.125Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:TOGGLE_ARCHETYPE_FILTER:notify-state` | 1 | 152.3 | 152.3 | 152.3 | 152.3 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER` | 1 | 152.3 | 152.3 | 152.3 | 152.3 |
| `render:scope=sidebar-only` | 1 | 150.1 | 150.1 | 150.1 | 150.1 |
| `render:sidebar` | 1 | 118.3 | 118.3 | 118.3 | 118.3 |
| `filter:applyFilters` | 1 | 0.9 | 0.9 | 0.9 | 0.9 |
| `dispatch:TOGGLE_ARCHETYPE_FILTER:reduce` | 1 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `cold-boot`

- boot enter→exit: **220.6 ms**
- heap used: **35.57 MB**
- captured: 2026-04-28T03:28:50.448Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SYS_INIT_COMPLETE` | 1 | 151.1 | 151.1 | 151.1 | 151.1 |
| `dispatch:SYS_INIT_COMPLETE:notify-state` | 1 | 150.5 | 150.5 | 150.5 | 150.5 |
| `render:phase=ready` | 1 | 148.9 | 148.9 | 148.9 | 148.9 |
| `render:sidebar` | 1 | 109.8 | 109.8 | 109.8 | 109.8 |
| `boot:loadFromStore` | 1 | 64.2 | 64.2 | 64.2 | 64.2 |
| `tree:buildTree` | 1 | 10.4 | 10.4 | 10.4 | 10.4 |
| `render:center` | 1 | 1.7 | 1.7 | 1.7 | 1.7 |
| `dispatch:RESTORE_SETTINGS` | 1 | 1.4 | 1.4 | 1.4 | 1.4 |
| `dispatch:RESTORE_SETTINGS:notify-state` | 1 | 1.3 | 1.3 | 1.3 | 1.3 |
| `render:scope=settings-only` | 1 | 1.1 | 1.1 | 1.1 | 1.1 |
| `render:phase=initializing` | 1 | 0.2 | 0.2 | 0.2 | 0.2 |
| `dispatch:RESTORE_SETTINGS:reduce` | 1 | 0.1 | 0.1 | 0.1 | 0.1 |

## c-5000 (5000 entries) — `search-keystroke`

- heap used: **40.15 MB**
- captured: 2026-04-28T03:28:57.138Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SET_SEARCH_QUERY` | 4 | 3977.2 | 1047.8 | 1106.3 | 1106.3 |
| `dispatch:SET_SEARCH_QUERY:notify-state` | 4 | 3976.6 | 1047.8 | 1105.9 | 1105.9 |
| `render:scope=sidebar-only` | 4 | 3955.3 | 1042.5 | 1100.9 | 1100.9 |
| `render:sidebar` | 4 | 1443.8 | 354 | 398.6 | 398.6 |
| `filter:applyFilters` | 4 | 23.6 | 3.8 | 12.2 | 12.2 |
| `dispatch:SET_SEARCH_QUERY:reduce` | 4 | 0 | 0 | 0 | 0 |

## c-5000 (5000 entries) — `select-entry`

- heap used: **42.63 MB**
- captured: 2026-04-28T03:29:01.789Z

| measure | count | total (ms) | p50 (ms) | p95 (ms) | max (ms) |
|---|---|---|---|---|---|
| `dispatch:SELECT_ENTRY` | 1 | 771.2 | 771.2 | 771.2 | 771.2 |
| `dispatch:SELECT_ENTRY:notify-state` | 1 | 766.1 | 766.1 | 766.1 | 766.1 |
| `render:phase=ready` | 1 | 756.9 | 756.9 | 756.9 | 756.9 |
| `render:meta` | 1 | 97.8 | 97.8 | 97.8 | 97.8 |
| `render:sidebar` | 1 | 86.5 | 86.5 | 86.5 | 86.5 |
| `tree:buildTree` | 1 | 15 | 15 | 15 | 15 |
| `render:center` | 1 | 8.3 | 8.3 | 8.3 | 8.3 |
| `dispatch:SELECT_ENTRY:reduce` | 1 | 0 | 0 | 0 | 0 |
| `filter:applyFilters` | 1 | 0 | 0 | 0 | 0 |
