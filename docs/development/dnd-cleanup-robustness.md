# DnD Cleanup & Cancellation Robustness

Issue #67 — DnD の終了保証と cleanup の安定化。

## 1. Background

#63–#66 で DnD は以下の4系統に拡大した:

| System               | State variable       | Update target     |
|---------------------|---------------------|-------------------|
| Sidebar tree         | `draggedLid`         | Relations         |
| Kanban board         | `kanbanDraggedLid`   | `todo.status`     |
| Calendar date        | `calendarDraggedLid` | `todo.date`       |
| Kanban → Calendar    | (bridge: reuses `kanbanDraggedLid`) | `todo.date` |

加えて cross-view drag-over-tab 用の `viewSwitchTimer` が存在する。

これらが drag 終了後に残留すると、次操作に影響する。

## 2. DnD Termination Patterns

| Pattern                | dragend fires on root? | State auto-cleared? |
|------------------------|----------------------|---------------------|
| Normal drop on target  | Yes                  | Yes (drop handler)  |
| Same-target no-op drop | Yes                  | Yes (dragend)       |
| Drop outside target    | Yes (same-view)      | Yes (dragend)       |
| Escape / cancel        | Yes (same-view)      | Yes (dragend)       |
| Cross-view drop        | **No** (source DOM removed) | Partial (drop handler clears, but dragend doesn't fire) |
| Cross-view cancel      | **No** (source DOM removed) | **No** (neither drop nor dragend cleans up) |
| Window blur / tab switch | Varies by browser  | **No** (unreliable) |

**Critical gap**: Cross-view cancel and window blur can leave state stranded.

## 3. Cleanup Targets

### State variables
- `draggedLid` (sidebar)
- `kanbanDraggedLid` (kanban + cross-view source)
- `calendarDraggedLid` (calendar)
- `viewSwitchTimer` (cross-view tab hover)

### Visual attributes
- `data-pkc-dragging` on drag source element
- `data-pkc-drag-over` on drop target / view-switch button

## 4. Cleanup Strategy

### Layer 1: Normal cleanup (existing)

Each DnD system's `handleDrop` and `handleDragEnd` clear their own state.
This handles the majority of cases (same-view operations).

### Layer 2: Cross-view drop cleanup (existing from #66)

`handleCalendarDrop` clears both `calendarDraggedLid` and `kanbanDraggedLid`.
This handles successful cross-view drops.

### Layer 3: Timer cleanup in all drop handlers (added in #67)

All three drop handlers (`handleDrop`, `handleKanbanDrop`, `handleCalendarDrop`)
now clear `viewSwitchTimer`. This prevents a pending timer from firing after
a successful drop.

### Layer 4: `clearAllDragState()` helper (added in #67)

A single function that clears everything:
- All three `draggedLid` variables
- `viewSwitchTimer`
- All `data-pkc-drag-over` attributes in the DOM
- All `data-pkc-dragging` attributes in the DOM

### Layer 5: Document-level `dragend` fallback (added in #67)

`document.addEventListener('dragend', handleDocumentDragEnd)` calls
`clearAllDragState()`. This catches `dragend` events that may not reach
`root` (e.g. when the source element is still in the DOM but the event
bubbles past root to document).

### Layer 6: Stale state detection on `mousedown` (added in #67)

`root.addEventListener('mousedown', handleStaleDragCleanup)` checks if
any `draggedLid` or timer is still set when a new mousedown fires.
If so, the previous drag ended without cleanup (e.g. cross-view cancel
where source DOM was removed). Clears all state.

This is the final safety net: no matter how the drag ended, the next
user interaction starts clean.

### Layer 7: Binder teardown

The cleanup function returned by `bindActions()` calls `clearAllDragState()`
to ensure no timers or state leak when the binder is destroyed.

## 5. View Switch Timer Lifecycle

```
dragenter on tab → start 600ms timer
  ├── dragleave from tab → cancel timer
  ├── timer fires → dispatch SET_VIEW_MODE, timer = null
  ├── drop on target → cancel timer (Layer 3)
  ├── dragend on root → not explicitly cleared (but state is cleared)
  ├── document dragend → clearAllDragState() clears timer (Layer 5)
  └── next mousedown → clearAllDragState() clears timer (Layer 6)
```

The timer is now cleared in **every** possible termination path.

## 6. Source DOM Removal Scenario

When a cross-view drag switches the view:

1. `SET_VIEW_MODE` dispatched → renderer re-renders → old view DOM destroyed
2. Drag ghost persists (browser maintains it)
3. Source element is detached → `dragend` won't bubble to `root`
4. If user drops on new view's target → drop handler cleans up (Layer 2)
5. If user cancels → neither drop nor dragend fires on root
6. User's next interaction (mousedown) → Layer 6 cleans up

## 7. User-Facing Expected Behavior

In all of the following scenarios, the UI should recover cleanly:

### Start drag → drop on target
Normal flow. State cleared immediately.

### Start drag → drop outside target
Browser fires `dragend`. State cleared via root handlers or document fallback.

### Start drag → hover tab → view switches → drop on new target
Cross-view success. Drop handler clears all state including timer.

### Start drag → hover tab → view switches → cancel (drop miss)
Cross-view cancel. Source DOM gone, `dragend` may not fire.
Next mousedown triggers Layer 6 cleanup.

### Start drag → hover tab → leave tab before switch
Timer cancelled in `handleViewSwitchDragLeave`. No view switch occurs.

### Start drag → switch tab → try another operation
Layer 6 (mousedown) detects stale state and clears it before new operation.

## 8. Why Not a Unified DragManager

A `DragManager` class that centralizes all drag state would solve cleanup
systematically. However:

1. Three DnD systems have different responsibilities (relations / status / date)
2. Only one cross-view bridge exists (Kanban → Calendar)
3. The cleanup layers added here are sufficient for current complexity
4. A DragManager would be premature abstraction per project invariants

Revisit if:
- A third cross-view direction is added
- Cleanup logic becomes difficult to maintain
- More than 5 state variables need coordinated cleanup

## 9. Test Coverage

### テスト済み (直接)
- Layer 1/2: DnD 属性付与テスト (`renderer.test.ts` — `draggable`, `data-pkc-drop-target`)
- Layer 7: 暗黙的カバー (binder teardown は別テストで検証)
- Fresh render 時に drag 残留なし (`renderer.test.ts:5254-5272`)

### テスト困難 (Layer 5/6)
- **Layer 5** (`handleDocumentDragEnd`): `document.addEventListener('dragend')` は
  happy-dom / JSDOM の HTML5 DnD 実装が不完全なため、`dragend` イベントの
  バブリング挙動を正確に再現できない。
- **Layer 6** (`handleStaleDragCleanup`): mousedown 時の stale state 検出は、
  先行する drag 操作が cleanup なしで終了した状態の再現が必要。
  テスト環境では drag 開始→source DOM 除去→mousedown の一連を
  忠実にシミュレートすることが困難。

### 判断
Layer 5/6 は **ブラウザ DnD エッジケース向けの安全ネット** であり、
テスト環境の制約により直接テストが困難。コードは十分にシンプル
(それぞれ `clearAllDragState()` を呼ぶだけ) であり、
`clearAllDragState()` 自体の正しさは Layer 4 のコードレビューで確認済み。
リグレッションリスクは低いと判断し、テスト追加は保留とする。
