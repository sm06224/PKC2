# TEXTLOG Double-Click Edit — Inventory and Spec

Status: spec-complete
Date: 2026-04-10

## §1 Overview

TEXTLOG entries support two distinct double-click paths:

| Location | Path | Result |
|----------|------|--------|
| Sidebar (`select-entry`) | Primary: `MouseEvent.detail >= 2` | Opens separate browser window (entry window) |
| Center pane (textlog row) | Fallback: native `dblclick` listener | In-place edit in main window (`BEGIN_EDIT`) |

The **center-pane in-place edit** is the TEXTLOG-specific feature this document
specifies. The sidebar → entry window path is shared across all archetypes and
documented in `todo-view-consistency.md §3`.

## §2 Intended Behavior

### A. Where double-click is accepted

Double-click is accepted on any child element within a `.pkc-textlog-row`
in the center pane detail view, **except**:

- Flag button (`.pkc-textlog-flag-btn`) — single-click toggles flag
- Asset chip anchors (`a[href^="#asset-"]`) — single-click navigates

The append area (`.pkc-textlog-append`) sits outside `.pkc-textlog-row`
and is out of scope.

### B. Transition into edit mode

1. `handleDblClick()` fires on native `dblclick` event
2. Finds closest `.pkc-textlog-row[data-pkc-lid]`
3. Validates: `phase === 'ready'`, `!readonly`, archetype is `textlog`
4. Dispatches `SELECT_ENTRY` if not already selected
5. Dispatches `BEGIN_EDIT` with the owning entry's LID

### C. Focus after edit mode entry

No explicit focus management. The editor renders all log entry textareas;
the browser's default scroll-to-content behavior applies. This is intentional:
TEXTLOG editing is bulk (all rows editable at once), so focusing a specific
row would be misleading.

### D. Save behavior

- "Save" button (`data-pkc-action="commit-edit"`) calls `collectBody()`
- Textlog presenter collects all non-deleted rows, preserving original
  `createdAt` timestamps
- Restores chronological order (oldest-first) for storage regardless of
  display order (newest-first)
- Dispatches `COMMIT_EDIT` with serialized JSON body
- Reducer creates revision snapshot then updates entry

### E. Cancel behavior

- "Cancel" button (`data-pkc-action="cancel-edit"`) dispatches `CANCEL_EDIT`
- Reducer sets `phase: 'ready'`, `editingLid: null`
- All edits are discarded; DOM is re-rendered from stored body

### F. Interaction with single-click selection

Single click on a textlog row is a **no-op** (rows do not have
`data-pkc-action="select-entry"`). Selection is managed by the sidebar.
The Edit button in the action bar also works as an alternative entry point.

### G. Interaction with readonly mode

`handleDblClick()` checks `state.readonly` early and returns. No transition
occurs. This is correct: readonly mode blocks all editing.

## §3 Operation Sequence

```
1. User selects TEXTLOG entry via sidebar (single click)
   → SELECT_ENTRY → phase stays 'ready', selectedLid set

2. User double-clicks a log row in center pane
   → handleDblClick() validates phase/readonly/archetype
   → dispatches BEGIN_EDIT(lid)

3. Reducer: phase → 'editing', editingLid set, viewMode → 'detail'

4. Renderer re-renders center pane:
   → renderEditor() → textlogPresenter.renderEditorBody()
   → Each log entry: timestamp (read-only), flag checkbox, delete button, textarea
   → Action bar: "✎ Editing" + Save + Cancel

5. User edits log entries (text, flags, deletions)

6. User clicks Save:
   → collectBody(): collect non-deleted rows, restore chronological order
   → COMMIT_EDIT(lid, title, body) → reducer creates revision, updates entry
   → phase → 'ready', editingLid → null
   → Re-render shows updated view

7. OR User clicks Cancel:
   → CANCEL_EDIT → phase → 'ready', editingLid → null
   → Re-render from stored (unchanged) body
```

## §4 Edge Cases

### A. Double-click while already editing

Guarded by `state.phase !== 'ready'` check in `handleDblClick()`.
Result: no-op. The existing editor remains open.

### B. Double-click on nested child elements

`rawTarget.closest('.pkc-textlog-row[data-pkc-lid]')` correctly resolves
any child element (timestamp, text, markdown elements) to the owning row.
Only flag button and asset chip anchors are explicitly excluded.

### C. Readonly mode

Blocked at `state.readonly` check. No transition.

### D. Archived entries

Not applicable — TEXTLOG entries do not have an "archived" concept.
(Archived is a TODO-specific body property.)

### E. Switching selection while edit is open

`SELECT_ENTRY` does not check phase; it updates `selectedLid` without
leaving editing phase. However, the `handleDblClick()` guard prevents
this from being triggered via TEXTLOG row dblclick while editing.
The sidebar click path does update selection during editing, which
can cause `selectedLid !== editingLid` temporarily. The renderer
handles this by checking `editingLid` for the editor panel.

### F. Empty log (no rows)

No `.pkc-textlog-row` elements exist, so dblclick on the empty state
container has no target to match. The Edit button in the action bar
remains available as the fallback path.

### G. Rapid double-click / duplicate event handling

The `dblclick` event fires once for a double-click. If the first
dblclick enters editing, subsequent dblclicks are blocked by the
`phase !== 'ready'` guard. No duplicate dispatches possible.

## §5 Current Implementation Inventory

### Already exists

| Component | File | Status |
|-----------|------|--------|
| dblclick handler (center pane) | `action-binder.ts:1751-1777` | Complete |
| Primary dblclick (sidebar → entry window) | `action-binder.ts:149-165, 1698-1745` | Complete |
| Exclusion: flag button | `action-binder.ts:1764` | Complete |
| Exclusion: asset chip anchors | `action-binder.ts:1765` | Complete |
| Phase/readonly/archetype guards | `action-binder.ts:1769-1771` | Complete |
| SELECT_ENTRY before BEGIN_EDIT | `action-binder.ts:1773-1774` | Complete |
| TEXTLOG editor rendering | `textlog-presenter.ts:123-192` | Complete |
| TEXTLOG collectBody | `textlog-presenter.ts:194-240` | Complete |
| BEGIN_EDIT reducer | `app-state.ts:227-237` | Complete |
| COMMIT_EDIT / CANCEL_EDIT reducer | `app-state.ts:888-911` | Complete |
| Tests: 5 core dblclick tests | `action-binder.test.ts:1243-1327` | Complete |

### Missing

| Item | Severity | Note |
|------|----------|------|
| Test: dblclick while already editing | Low | Guarded by code, but not explicitly tested |
| Test: repeated dblclick on same row | Low | Implicitly covered by phase guard |

### Intentionally out of scope

- Per-row focus after entering edit mode
- Keyboard shortcut to enter edit mode (Ctrl+E, etc.)
- Inline single-row editing (current: all rows editable at once)
- Entry window TEXTLOG-specific editor UI

## §6 Constraints

1. `handleDblClick()` is the TEXTLOG-specific fast path; Edit button remains available
2. Reducer is archetype-agnostic for `BEGIN_EDIT`/`COMMIT_EDIT`/`CANCEL_EDIT`
3. Textlog presenter handles all archetype-specific rendering and collection
4. No browser API in core/features layers
