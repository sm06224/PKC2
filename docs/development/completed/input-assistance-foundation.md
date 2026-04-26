# Input Assistance Foundation (P3-A / P3-B / P3-C)

## Overview

Three input assistance systems for editing mode:

1. **Date/Time shortcut keys** (P3-A) — Ctrl+key combinations for timestamp insertion
2. **Slash commands** (P3-B) — `/` trigger for input assist menu
3. **Inline calc shortcut** (P3-C) — `<expr>=` + Enter → `<expr>=<result>` inside TEXT / TEXTLOG textareas

P3-A and P3-B are active only in editing phase (`phase === 'editing'`).
P3-C is also active in ready phase for TEXTLOG append / edit textareas,
since the TEXTLOG append textarea renders in the detail pane without
entering edit mode.

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

## P3-C: Inline calc shortcut

### Intent

Let a user type a throwaway calculation inside a note without leaving
the textarea:

```
2026/04/09 progress
budget: 1200+350+80=
```

Pressing **Enter** at the end of the `budget: 1200+350+80=` line
rewrites that line to `budget: 1200+350+80=1630` and moves the caret
to a fresh line below, exactly as if the user had pressed Enter after
manually typing `1630`. The shortcut is opt-in by the `=` suffix — no
floating popover, no interruption to normal typing.

### Target fields

| `data-pkc-field` | Archetype | Phase | Eligibility |
|---|---|---|---|
| `body` | **TEXT** only | `editing` + matching `editingLid` | fires |
| `body` | Folder | any | **NOT** eligible |
| `textlog-append-text` | TEXTLOG | any (renders in `ready`) | fires |
| `textlog-entry-text` | TEXTLOG (edit-in-place) | any | fires |
| anywhere else | any | any | ignored |

TEXT and Folder both render a `body` textarea, so the adapter
additionally filters by the editing entry's archetype. Todo
descriptions, form fields, attachment fields, and the search input
are all intentionally excluded — they are either structured or
single-line.

### Trigger condition

Inline calc fires **only** when every one of the following is true:

- Key = `Enter`, no modifier (no Ctrl / Cmd / Shift / Alt).
- `isComposing === false` (ignored during IME composition so Enter
  still confirms a Japanese conversion).
- Selection is collapsed (`selectionStart === selectionEnd`).
- Caret is at the end of the current line (anywhere else → no-op).
- The current line ends with `=`.
- The text before the `=` on that line, trimmed, parses as a valid
  expression and evaluates to a finite number.

Any failure — wrong key combo, wrong field, caret mid-line,
composition, parse error, div/0, etc. — is a **silent no-op**. The
event is not `preventDefault`ed, so the normal Enter behaviour
(insert newline, or other shortcuts like TEXTLOG Ctrl+Enter append)
keeps running unchanged.

### Insertion semantics

On success the adapter inserts `<formatted-result>\n` at the caret,
equivalent to "append the result, then press Enter". The caret lands
at the start of a fresh line below the result. `execCommand('insertText')`
is used where available so the browser's undo stack captures the
insertion as a single step; a direct `value` + `input` event fallback
covers happy-dom / sandboxed environments.

### Supported syntax (first pass)

| Category | Examples |
|---|---|
| Binary operators | `+  -  *  /  %` |
| Unary operators | `-5`, `-(2+3)`, `--5` (double minus), `+7` |
| Grouping | `(2+3)*4`, `((1+2)*3-4)/5` |
| Literals | `0`, `42`, `0.1`, `3.14`, `100.25` |
| Whitespace | Allowed anywhere between tokens |

**Operator semantics:**

- `%` is **modulo**, not percent. `10%3 = 1`.
- `/` is floating-point division. Division by zero → silent no-op.
- `%` by zero → silent no-op.
- Unary `+` / `-` only allowed at the start of a factor.
- `12.` (decimal point with no fractional digits) is rejected.

### Formatting rules

`formatCalcResult(value)` decides what gets inserted:

| Input | Output |
|---|---|
| Integer (incl. `-0`) | `"3"`, `"0"`, `"-42"` |
| Decimal | `"0.3"` (noise stripped via `toPrecision(12)`) |
| Non-finite | `""` (guard — shouldn't reach here) |

### Intentionally NOT supported

- **No functions**: `sum`, `min`, `max`, `avg`, `sqrt`, etc.
- **No variables**: no `x = 5`, no `$ref`, no spreadsheet cells.
- **No units**: `10px`, `1kg`, `5m` all reject.
- **No dates**: date arithmetic is out of scope.
- **No multi-line expressions**: the line containing the caret is
  the entire input.
- **No comma thousands separators**: `1,000` rejects.
- **No percent-as-percent**: `%` is strictly modulo. A possible
  future refinement is a distinct `pct` suffix, but that requires
  grammar + tokenizer changes.
- **No fancy error UI**: failure is silent, not toast / inline.
- **No auto-complete mid-expression**: the menu only opens on `=`
  + Enter; there is no live preview.
- **No reducer / state involvement**: the shortcut mutates the
  textarea directly through the adapter and relies on the existing
  `input` event to update runtime state. No new `UserAction` or
  `DomainEvent` is introduced.

### Error policy

Every pure helper returns a discriminated union
(`{ ok: true; value: number } | { ok: false }`) and never throws.
The adapter only calls `preventDefault()` when the evaluator
returns `{ ok: true }`, so failures leave the event alone.
Corrupting the body on a typo is impossible by construction.

### Keydown priority chain (where this fits)

`handleKeydown` in `adapter/ui/action-binder.ts` runs the following
checks in order. Inline calc sits **between** the overlay handlers
and the TEXTLOG Ctrl+Enter append so plain Enter stays available
for inline calc while Ctrl+Enter keeps its append meaning.

1. Asset picker → asset autocomplete → slash menu (all overlay
   handlers get first shot at navigation keys).
2. **Inline calc** (plain Enter, eligible textarea, caret at line
   end, line ends with `=`).
3. Ctrl+Enter in `textlog-append-text` → log entry append.
4. Ctrl+S save.
5. Date/time shortcuts.
6. `Ctrl+?` / Escape / Ctrl+N global shortcuts. (Was bare `?`;
   moved to `Ctrl+?` so the `?` key stays usable during IME /
   markdown typing.)

### Future extension candidates

These are **explicit deferrals**, not implicit TODOs:

- **Reduction functions**: `sum(1,2,3)`, `max(10,4,7)`. Would
  require adding a call-expression rule to the grammar and a
  whitelist of function names.
- **Main window / command bar**: the same evaluator could power a
  global "quick calculator" surface (e.g. `?calc 1+2`), reusing
  `evaluateCalcExpression` verbatim.
- **Other domains**: form number-field validation could reuse the
  evaluator to sanity-check user input.
- **Decimal precision control**: currently hard-coded at 12
  significant digits. A per-archetype setting is possible but not
  necessary today.
- **Percent as percent**: a dedicated `<expr> %p` syntax (e.g.
  `1200*30%p=360`) would let `%` remain modulo while adding a
  distinct percent operator.

---

## Architecture

### Layer placement

```
features/datetime/datetime-format.ts   ← Pure format functions (no browser APIs)
features/math/inline-calc.ts           ← Pure expression evaluator + line detection
adapter/ui/slash-menu.ts               ← Command defs, trigger detection, menu UI, insertion
adapter/ui/action-binder.ts            ← Keydown/input wiring for all three systems
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

### Inline calc (`features/math/inline-calc.ts`)

Pure, no browser APIs, no throws:

- `evaluateCalcExpression(src): CalcResult` — recursive-descent
  parser over `[0-9+\-*/%().\s]`. Whitelist gate, no `eval`.
- `detectInlineCalcRequest(fullText, caretPos): InlineCalcRequest | null`
  — returns the current line bounds + stripped expression when the
  trigger condition is met.
- `formatCalcResult(value): string` — integer / decimal / -0
  normalisation.

The adapter glue lives in `action-binder.ts`:

- `isInlineCalcTarget(ta, state)` — `data-pkc-field` allow-list
  plus TEXT archetype check for `body`.
- `applyInlineCalcResult(ta, caret, formatted)` —
  `execCommand('insertText')` with fallback mutation.

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
