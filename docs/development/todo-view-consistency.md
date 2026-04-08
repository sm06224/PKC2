# Todo View Consistency Specification

Issue #61 — Established in Phase gamma-delta.

## 1. Three Views and Their Roles

| View     | Purpose                     | Source of truth      |
|----------|-----------------------------|----------------------|
| Detail   | Single-entry editing        | `Entry.body` (JSON)  |
| Calendar | Date-axis overview          | `todo.date`          |
| Kanban   | Status-axis overview        | `todo.status`        |

All three views share the same `AppState.container` and `AppState.selectedLid`.
No view has its own private state beyond what is already in `AppState`.

## 2. Selection State

### Specification

- **Source of truth**: `AppState.selectedLid` (single string or null)
- **SET_VIEW_MODE does NOT clear selection.** `selectedLid` persists across view switches.
- All views read `selectedLid` from the same state. If `selectedLid` is set, the corresponding entry is marked in every view that displays it.

### Marking behavior

| Location          | Attribute                        |
|-------------------|----------------------------------|
| Sidebar entry     | `data-pkc-selected="true"` on `<li>` |
| Calendar item     | `data-pkc-selected="true"` on `<div>` |
| Kanban card       | `data-pkc-selected="true"` on `<div>` |

### Scroll position

Scroll position is NOT preserved across view switches. This is a known limitation, not a bug. Each view renders fresh DOM on state change.

## 3. Click / Double-Click

### Single click

All clickable todo elements use `data-pkc-action="select-entry"` + `data-pkc-lid`.
This dispatches `SELECT_ENTRY` via the shared action-binder click handler.

| Location           | Element selector                                  |
|--------------------|---------------------------------------------------|
| Sidebar            | `li[data-pkc-action="select-entry"]`              |
| Calendar           | `.pkc-calendar-todo-item[data-pkc-action]`        |
| Kanban             | `.pkc-kanban-card[data-pkc-action]`               |

### Double click

Double-click opens a **detached view panel** for the target entry.

- Supported in: **Sidebar, Calendar, Kanban**
- Detection: action-binder `handleDblClick` matches `[data-pkc-lid][data-pkc-action="select-entry"]` inside `[data-pkc-region="sidebar"]`, `[data-pkc-region="calendar-view"]`, or `[data-pkc-region="kanban-view"]`.
- Duplicate panels are prevented: if a panel for the same `lid` already exists, it pulses instead of creating a new one.

## 4. Archived / Overdue / Date Display Rules

### Archived

| View     | Behavior                                           |
|----------|----------------------------------------------------|
| Detail   | Shown (with archived badge). Controlled by sidebar `showArchived` toggle. |
| Calendar | Shown/hidden based on `showArchived` state.        |
| Kanban   | **Always excluded.** Kanban shows only active todos. `showArchived` has no effect. |

Rationale: Kanban is for task triage of current work. Archived items have left the active lifecycle.

### Overdue

Uses `isTodoPastDue(todo)` from `todo-presenter.ts` across all views.

Rule: A todo is overdue when `status === 'open'` AND `date < today`. Done todos are never overdue.

| View     | Visual indicator                                      |
|----------|-------------------------------------------------------|
| Detail   | `pkc-todo-date-overdue` class on date element         |
| Calendar | `data-pkc-todo-overdue="true"` attribute + left border accent |
| Kanban   | `pkc-todo-date-overdue` class on date element         |

### Date formatting

All views use `formatTodoDate(dateString)` from `todo-presenter.ts`.
This outputs a localized date string (e.g., "2026/4/10" in ja locale).
Raw `YYYY-MM-DD` is never shown to the user.

Exception: Calendar grid inherently shows dates by position; individual item labels use entry title, not the date string.

## 5. View Switching Behavior

### State preserved

- `selectedLid` — maintained across switches
- `calendarYear` / `calendarMonth` — maintained (only relevant in Calendar)
- `showArchived` — maintained (only effective in Detail/Calendar)

### State NOT preserved

- Scroll position within center pane
- Transient hover / focus state

### View mode toggle

Three buttons: **Detail | Calendar | Kanban**

- Always visible when container has entries
- Active button has `data-pkc-active="true"`
- Dispatches `SET_VIEW_MODE` on click

## 6. Empty State

| View     | Condition                              | Message                                     |
|----------|----------------------------------------|---------------------------------------------|
| Detail   | No entry selected                      | "Select an entry from the sidebar..."       |
| Calendar | No dated todos in current month        | "No dated todos this month."                |
| Kanban   | No active (non-archived) todos at all  | "No active todos. Create a todo to see it here." |

Kanban still renders both columns (Todo / Done) in empty state.
Calendar still renders the full month grid in empty state.

## 7. User Operation Flow

Verified flow:

1. Create todo (Detail view, sidebar)
2. Edit todo in Detail (set title, description, date, status)
3. Switch to Calendar -> see todo on its date cell, with selection preserved
4. Switch to Kanban -> see todo in open/done column, with selection preserved
5. Click a different todo in Kanban -> selection updates in sidebar
6. Switch back to Detail -> selected todo is displayed
7. Double-click any todo in Calendar/Kanban -> detached panel opens

All transitions use the same `AppState` and `Dispatcher`. No private state exists.

## 8. Kanban Status Move (Issue #62)

### Purpose

This is the pre-DnD stage. Before adding drag-and-drop, the status update path
is established and verified via simple button clicks.

### Available Actions

Each Kanban card has a status move button:

| Current status | Button label | Result          |
|---------------|-------------|-----------------|
| open          | `✓ Done`    | status → done   |
| done          | `↺ Reopen`  | status → open   |

- Buttons are hidden in readonly mode.
- Only `todo.status` is changed. `title`, `description`, `date`, `archived` are preserved.

### Update Path

```
User clicks status button
  → action-binder: toggle-todo-status
    → parseTodoBody → flip status → serializeTodoBody
      → dispatch QUICK_UPDATE_ENTRY { lid, body }
        → reducer: snapshotEntry + updateEntry
          → re-render all views
```

This is the same path used by the Detail view's status toggle button.
No new actions or reducers were added.

### Click Collision Prevention

The status button is nested inside the card element:

```
div.pkc-kanban-card [data-pkc-action="select-entry"]
  └── button.pkc-kanban-status-btn [data-pkc-action="toggle-todo-status"]
```

The action-binder uses `closest('[data-pkc-action]')` from the event target.
When the button is clicked, `closest` returns the button (not the card),
so `toggle-todo-status` fires instead of `select-entry`. No `stopPropagation` needed.

Double-click on the button does not trigger detached view because
`handleDblClick` checks for `data-pkc-action="select-entry"`, which the button lacks.

### Selection Behavior

- Clicking the status button does NOT change `selectedLid`.
- The `QUICK_UPDATE_ENTRY` action does not modify `selectedLid` in the reducer.
- After status change, the entry moves to a different column but remains selected if it was selected.

### Overdue Re-evaluation

- When an open overdue todo is marked done → overdue is cleared (`isTodoPastDue` returns false for done).
- When a done todo with a past date is reopened → overdue is applied.
- This happens automatically because `isTodoPastDue` is evaluated on every render.

### Operation Flow

1. View Kanban board with open/done todos
2. Click `✓ Done` on an open card → card moves to Done column
3. Click `↺ Reopen` on a done card → card moves to Todo column
4. Switch to Detail → entry body reflects updated status
5. Switch to Calendar → overdue markers re-evaluated
6. Selection is maintained throughout

## 9. Kanban DnD Foundation (Issue #63)

### Purpose

Drag-and-drop between Kanban columns as an alternative UI for the status toggle
established in #62. The drop action reuses the exact same update path.

### Drag Source

Each Kanban card is a drag source (non-readonly mode only):

| Attribute                      | Value    | Purpose                |
|-------------------------------|----------|------------------------|
| `draggable`                   | `"true"` | Native HTML5 DnD       |
| `data-pkc-kanban-draggable`   | `"true"` | Kanban DnD identifier  |

In readonly mode, neither attribute is set. Cards remain non-draggable.

### Drop Target

Each column list is a drop target:

| Attribute                      | Value            | Purpose              |
|-------------------------------|------------------|----------------------|
| `data-pkc-kanban-drop-target` | `"open"` / `"done"` | Target status on drop |

### Update Path

```
User drags card to different column
  → handleKanbanDrop: read target column status
    → parseTodoBody → set status to target → serializeTodoBody
      → dispatch QUICK_UPDATE_ENTRY { lid, body }
        → reducer: snapshotEntry + updateEntry
          → re-render all views
    → dispatch SELECT_ENTRY { lid }
```

This is the same `QUICK_UPDATE_ENTRY` path used by the status move button (#62).
If the card is dropped on the same column (no status change), no update is dispatched.

### Visual Feedback

| State      | Attribute                        | CSS effect                           |
|-----------|----------------------------------|--------------------------------------|
| Dragging  | `data-pkc-dragging="true"` on card | Semi-transparent (opacity: 0.4), dashed border |
| Drag over | `data-pkc-drag-over="true"` on list | Green tinted background, dashed outline |

Both attributes are cleaned up in `handleKanbanDragEnd`.

### Selection Behavior

- Dropping a card dispatches `SELECT_ENTRY` for the dragged entry.
- This updates `selectedLid` and is reflected in sidebar and all views.

### Isolation from Sidebar DnD

Kanban DnD uses separate attributes (`data-pkc-kanban-*`) and separate handler
functions (`handleKanbanDrag*`) from sidebar tree DnD (`data-pkc-draggable` /
`data-pkc-drop-target`). The two systems do not interfere.

### Scope Boundaries

Not implemented in this issue:
- Column reorder (columns are fixed: Todo / Done)
- Touch support / pointer events
- Custom drag preview / ghost image
- Drag between different containers

## 10. Calendar Date Move Foundation (Issue #64)

### Purpose

Drag-and-drop within the Calendar view to move a Todo to a different date.
This is the date-axis counterpart to Kanban DnD (#63), which handles the status axis.
Both use the same `QUICK_UPDATE_ENTRY` path — only the field being updated differs.

### Drag Source

Each Calendar todo item is a drag source (non-readonly mode only):

| Attribute                        | Value    | Purpose                  |
|---------------------------------|----------|--------------------------|
| `draggable`                     | `"true"` | Native HTML5 DnD         |
| `data-pkc-calendar-draggable`   | `"true"` | Calendar DnD identifier  |

In readonly mode, neither attribute is set.

### Drop Target

Each day cell (non-empty, i.e. a real date) is a drop target:

| Attribute                        | Value          | Purpose              |
|---------------------------------|----------------|----------------------|
| `data-pkc-calendar-drop-target` | `"true"`       | Accepts drops        |
| `data-pkc-date`                 | `"YYYY-MM-DD"` | Target date on drop  |

Empty cells (outside the current month) do not have drop target attributes.

### Update Path

```
User drags todo item to a different day cell
  → handleCalendarDrop: read target date from data-pkc-date
    → parseTodoBody → set date to target → serializeTodoBody
      → dispatch QUICK_UPDATE_ENTRY { lid, body }
        → reducer: snapshotEntry + updateEntry
          → re-render all views
    → dispatch SELECT_ENTRY { lid }
```

If the item is dropped on the same date (no change), no update is dispatched.

### Visual Feedback

| State      | Attribute                             | CSS effect                           |
|-----------|---------------------------------------|--------------------------------------|
| Dragging  | `data-pkc-dragging="true"` on item    | Semi-transparent (opacity: 0.4), dashed border |
| Drag over | `data-pkc-drag-over="true"` on cell   | Green tinted background, dashed outline |

Both attributes are cleaned up in `handleCalendarDragEnd`.

### Selection Behavior

- Dropping an item dispatches `SELECT_ENTRY` for the dragged entry.
- `selectedLid` is updated and reflected across all views.

### Overdue Re-evaluation

- Moving an open overdue todo to a future date clears overdue status.
- Moving an open todo to a past date triggers overdue status.
- This happens automatically because `isTodoPastDue` is evaluated on every render.

### Click / Double-Click Coexistence

- Calendar todo items have both `data-pkc-action="select-entry"` and `draggable`.
- Single click triggers `select-entry` via the action-binder click handler.
- Double-click triggers detached panel via `handleDblClick`.
- Drag starts only fire after pointer movement (native browser behavior), so they do not interfere with click/dblclick.

### Isolation from Other DnD Systems

Calendar DnD uses `data-pkc-calendar-*` attributes and `handleCalendarDrag*` functions.
Kanban DnD uses `data-pkc-kanban-*` / `handleKanbanDrag*`.
Sidebar DnD uses `data-pkc-draggable` / `data-pkc-drop-target`.
Each system has its own `draggedLid` variable. No cross-interference.

### User Operation Flow

1. Open Calendar view with dated todos
2. Drag a todo item from its current date cell
3. Drop on a different date cell
4. The todo's date updates to the target date
5. The item appears in the new cell on re-render
6. Switch to Detail → entry body reflects updated date
7. Switch to Kanban → card shows new date, overdue re-evaluated
8. Selection is maintained throughout

### Scope Boundaries

Not implemented in this issue:
- Month-crossing auto-navigation (drop only within visible month)
- Date removal (cannot drop to "unset date")
- Time-of-day support
- Multiple todo batch move
- Touch drag support
- Cross-view DnD (e.g. Kanban card → Calendar cell)

### Impact on Future Cross-View DnD

If cross-view DnD is added later:
- A unified `draggedLid` may be needed, but only when cross-view is truly required
- The update paths (`QUICK_UPDATE_ENTRY` for status or date) remain the same
- The distinction is which field is updated based on the drop target type
- No new actions or reducers should be needed
