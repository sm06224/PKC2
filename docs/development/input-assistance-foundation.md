# Input Assistance Foundation (P3-A / P3-B)

## Overview

Two input assistance systems for editing mode:

1. **Date/Time shortcut keys** (P3-A) — Ctrl+key combinations for timestamp insertion
2. **Slash commands** (P3-B) — `/` trigger for input assist menu

Both are active only in editing phase (`phase === 'editing'`).

---

## P3-A: Date/Time Shortcuts

### Shortcut Table

| Shortcut | Output | Example |
|---|---|---|
| `Ctrl+;` | `yyyy/MM/dd` | `2026/04/09` |
| `Ctrl+:` | `HH:mm:ss` | `14:30:05` |
| `Ctrl+Shift+;` | `yyyy/MM/dd HH:mm:ss` | `2026/04/09 14:30:05` |
| `Ctrl+D` | `yy/MM/dd 曜` | `26/04/09 木` |
| `Ctrl+Shift+D` | `yy/MM/dd 曜 HH:mm:ss` | `26/04/09 木 14:30:05` |
| `Ctrl+Shift+Alt+D` | ISO 8601 | `2026-04-09T14:30:05+09:00` |

> Mac users: `Cmd` substitutes for `Ctrl`.

### Target elements

- Any focused `<textarea>` or `<input type="text">` during editing phase

### Day-of-week locale

Day abbreviations use Japanese kanji: 日, 月, 火, 水, 木, 金, 土

---

## P3-B: Slash Commands

### Target elements (validation-free textareas only)

| `data-pkc-field` | Archetype | Description |
|---|---|---|
| `body` | TEXT, Folder | Main body textarea |
| `todo-description` | Todo | Description textarea |
| `textlog-append-text` | TEXTLOG append | Append log entry textarea |
| `textlog-entry-text` | TEXTLOG edit | Edit existing log entry textarea |

**NOT targeted:**
- `form-note` (FORM — reserved for future validation)
- `form-name`, `form-checked` (non-textarea inputs)
- `search` (search input)
- Single-line `<input>` elements

### Trigger condition

`/` is recognized as a slash command trigger when:
- It is the first character in the textarea, OR
- It is preceded by whitespace (space, tab, newline)

This prevents false triggers when typing URLs or paths like `a/b/c`.

### Initial command list

| ID | Label | Inserts |
|---|---|---|
| `date` | `/date` | `yyyy/MM/dd` (current) |
| `time` | `/time` | `HH:mm:ss` (current) |
| `datetime` | `/datetime` | `yyyy/MM/dd HH:mm:ss` |
| `iso` | `/iso` | ISO 8601 |
| `h1` | `/h1` | `# ` |
| `list` | `/list` | `- ` |
| `code` | `/code` | ``` fenced code block |
| `link` | `/link` | `[text](url)` |
| `asset` | `/asset` | Opens Asset Picker → `![name](asset:key)` |

The `/asset` command uses the `onSelect` handler path instead of static
text insertion — see
[`asset-picker-foundation.md`](./asset-picker-foundation.md).

### Menu behavior

- **Open**: `/` trigger → popover appears near textarea
- **Filter**: typing after `/` narrows the command list (e.g. `/da` shows only `date`, `datetime`)
- **Navigate**: Arrow Up/Down to select, Enter/Tab to execute
- **Close**: Escape, click outside, or when `/` is deleted
- **Execute**: replaces `/` + typed filter with command output

### Insert behavior

- The `/` trigger character and any typed filter text are replaced by the command output
- For code blocks, cursor is placed between the fences
- `input` event is dispatched for state consistency

---

## Architecture

### Layer placement

```
features/datetime/datetime-format.ts   ← Pure format functions (no browser APIs)
adapter/ui/slash-menu.ts               ← Command defs, trigger detection, menu UI, insertion
adapter/ui/action-binder.ts            ← Keydown/input wiring for both systems
adapter/ui/renderer.ts                 ← Shortcut help overlay
```

### Format helpers (`features/datetime/datetime-format.ts`)

All formatters accept an optional `Date` parameter (defaults to `new Date()`),
making them deterministic for testing.

- `formatDate(d?)` → `yyyy/MM/dd`
- `formatTime(d?)` → `HH:mm:ss`
- `formatDateTime(d?)` → `yyyy/MM/dd HH:mm:ss`
- `formatShortDate(d?)` → `yy/MM/dd 曜`
- `formatShortDateTime(d?)` → `yy/MM/dd 曜 HH:mm:ss`
- `formatISO8601(d?)` → ISO 8601 with timezone offset

### Slash menu (`adapter/ui/slash-menu.ts`)

- `SLASH_COMMANDS` — static array of `{ id, label, insert }` definitions
- `isSlashEligible(textarea)` — checks `data-pkc-field` against allow-list
- `shouldOpenSlashMenu(text, caretPos)` — trigger condition check
- `openSlashMenu(textarea, slashPos, root)` — creates popover DOM
- `filterSlashMenu(query)` — narrows visible commands
- `handleSlashMenuKeydown(e)` — Arrow/Enter/Tab/Escape handling
- `closeSlashMenu()` — removes popover, resets state

---

## Not implemented (future work)

- **FORM validation integration** — FORM fields are intentionally excluded
- **Fuzzy search** — filter is simple substring match
- **Nested commands** — no sub-menus
- **Full markdown toolbar** — only basic markdown snippets via slash

Resolved since initial P3-B:
- **Asset picker** — implemented as `/asset`; see
  [`asset-picker-foundation.md`](./asset-picker-foundation.md)

## Keyboard layout considerations

- `Ctrl+;` and `Ctrl+:` rely on the `;` key. On US layout, `:` = `Shift+;`.
- `Ctrl+Shift+;` produces `Ctrl+:` on US keyboards — both are handled as datetime.
- Non-US layouts may vary; the implementation checks both `e.key` values.
