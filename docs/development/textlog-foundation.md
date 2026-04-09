# TEXTLOG Foundation

## Purpose

TEXTLOG is a time-series multi-text archetype for PKC2.
It replaces PKC1's TEXTLOG functionality: timestamped log entries
with append-heavy UX, re-edit capability, and flag marking.

Use cases: work logs, meeting notes, investigation records, daily journals.

## Data Model

The body is a JSON string containing an array of log entries:

```json
{
  "entries": [
    {
      "id": "log-1744185600000-1",
      "text": "Investigation started",
      "createdAt": "2026-04-09T10:00:00.000Z",
      "flags": []
    },
    {
      "id": "log-1744185900000-2",
      "text": "Found root cause in module X",
      "createdAt": "2026-04-09T10:05:00.000Z",
      "flags": ["important"]
    }
  ]
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Auto-generated unique ID (`log-{timestamp}-{counter}`) |
| `text` | `string` | Log entry content (plain text or markdown) |
| `createdAt` | `string` | ISO 8601 timestamp, auto-assigned on creation |
| `flags` | `string[]` | Currently supports `"important"` |

## Architecture

### Layer placement

```
features/textlog/textlog-body.ts     ← Types, parse, serialize, append, flag toggle, delete
adapter/ui/textlog-presenter.ts      ← View/edit/collect (DetailPresenter)
adapter/ui/action-binder.ts          ← append-log-entry, toggle-log-flag, delete-log-entry
adapter/ui/renderer.ts               ← Create button (📋 Log)
main.ts                              ← registerPresenter('textlog', textlogPresenter)
```

### Operations

| Operation | Mechanism | Phase |
|---|---|---|
| Append entry | `QUICK_UPDATE_ENTRY` | `ready` (inline) |
| Toggle flag | `QUICK_UPDATE_ENTRY` | `ready` (inline) |
| Delete entry | `QUICK_UPDATE_ENTRY` | `ready` (inline) |
| Edit entries | `BEGIN_EDIT` / `COMMIT_EDIT` | `editing` |

Append, flag toggle, and delete use `QUICK_UPDATE_ENTRY` (no phase transition),
matching the pattern established by todo status toggle.

## UI

### View mode

- Log entries displayed as a timeline with left border
- Each row: flag toggle (★/☆) | timestamp | text content
- Important entries highlighted with golden border
- Markdown rendering for entries containing markdown syntax
- Append textarea + "Add" button at bottom (hidden in readonly)

### Edit mode (BEGIN_EDIT)

- All entries shown with editable textareas
- Flag checkbox per entry
- Delete button (✕) per entry
- Timestamps shown read-only

## Relationship to COMPLEX

TEXTLOG is a standalone archetype foundation.
It is intentionally NOT a COMPLEX archetype.

Future possibility: COMPLEX could subsume TEXTLOG as a parent archetype
that supports multiple block types. However:

- Today, TEXTLOG is independent
- Its data model (`{ entries: [...] }`) is self-contained in the body
- No structural relations or sub-entries are used
- Migration to COMPLEX would be a future design decision

## Not implemented (future scope)

- Attachment embedding within log entries
- Rich block editor
- Entry reordering / drag
- Advanced filtering (by flag, date range)
- Export as standalone timeline
- Nested/threaded entries
- COMPLEX archetype integration
