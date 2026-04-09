# Input Assistance Foundation (P3-A)

## Overview

Date/Time shortcut keys for rapid timestamp insertion during editing.
These shortcuts are active only in editing phase (`phase === 'editing'`) and
insert text at the cursor position of the focused `<textarea>` or `<input type="text">`.

## Shortcut Table

| Shortcut | Output | Example |
|---|---|---|
| `Ctrl+;` | `yyyy/MM/dd` | `2026/04/09` |
| `Ctrl+:` | `HH:mm:ss` | `14:30:05` |
| `Ctrl+Shift+;` | `yyyy/MM/dd HH:mm:ss` | `2026/04/09 14:30:05` |
| `Ctrl+D` | `yy/MM/dd ddd` | `26/04/09 Thu` |
| `Ctrl+Shift+D` | `yy/MM/dd ddd HH:mm:ss` | `26/04/09 Thu 14:30:05` |
| `Ctrl+Shift+Alt+D` | ISO 8601 | `2026-04-09T14:30:05+09:00` |

> Mac users: `Cmd` substitutes for `Ctrl`.

## Architecture

### Layer placement

```
features/datetime/datetime-format.ts   ← Pure format functions (no browser APIs)
adapter/ui/action-binder.ts            ← Keydown handling + insertTextAtCursor
adapter/ui/renderer.ts                 ← Shortcut help overlay update
```

### Format helpers (`features/datetime/datetime-format.ts`)

All formatters accept an optional `Date` parameter (defaults to `new Date()`),
making them deterministic for testing.

- `formatDate(d?)` → `yyyy/MM/dd`
- `formatTime(d?)` → `HH:mm:ss`
- `formatDateTime(d?)` → `yyyy/MM/dd HH:mm:ss`
- `formatShortDate(d?)` → `yy/MM/dd ddd`
- `formatShortDateTime(d?)` → `yy/MM/dd ddd HH:mm:ss`
- `formatISO8601(d?)` → ISO 8601 with timezone offset

### Shortcut detection (`getDateTimeShortcutText`)

Maps `KeyboardEvent` properties to the appropriate format function.
Returns `null` for non-matching events — the caller only inserts when non-null.

### Text insertion (`insertTextAtCursor`)

1. Checks `document.activeElement` is a `<textarea>` or `<input type="text">`
2. Uses `document.execCommand('insertText')` for undo-stack integration
3. Falls back to manual `value` splicing if `execCommand` returns `false`

## Scope limitations

- Only active during `phase === 'editing'`
- Only targets focused `<textarea>` / `<input type="text">` elements
- Does NOT implement `/` command palette (reserved for P3-B)

## Keyboard layout considerations

- `Ctrl+;` and `Ctrl+:` rely on the `;` key. On US layout, `:` = `Shift+;`.
- `Ctrl+Shift+;` produces `Ctrl+:` on US keyboards — both are handled as datetime.
- Non-US layouts may vary; the implementation checks both `e.key` values.
