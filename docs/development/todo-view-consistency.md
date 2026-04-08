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

## 8. Impact on Future DnD (Issue #62+)

When DnD is added to Kanban:
- Status changes should dispatch `QUICK_UPDATE_ENTRY` (same as todo-status toggle)
- `selectedLid` should update to the dragged entry on drop
- Calendar date DnD (if added) should update `todo.date` via the same mechanism
- No new state variables should be needed; DnD is an action dispatch, not a state concern
