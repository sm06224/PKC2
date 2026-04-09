# Asset Autocomplete — Foundation

## Purpose

Inline completion for the `asset:` URL scheme in free-text editors.
Closes the last loop in the trio

1. **Resolver** (`asset-reference-resolution.md`) — renders
   `![alt](asset:key)` to an inline image.
2. **Picker** (`asset-picker-foundation.md`) — explicit selection via
   the `/asset` slash command, inserts the full markdown snippet.
3. **Autocomplete** (this doc) — when the user hand-writes
   `](asset:` because they remember the syntax, offer key
   suggestions as they type.

This is deliberately a **foundation**: it is the smallest possible
affordance that makes free-typing `asset:` references practical. The
module is siblings to `asset-picker.ts`, shares its candidate type,
and has no cross-dependency with the picker's popover code.

## Scope

### In scope

- Detect the `(asset:<query>|` caret context inside validation-free
  textareas (same eligible-field set as the slash menu).
- Filter image-type asset candidates by substring match on name or key.
- Replace only the typed `<query>` with the chosen asset key.
- Keyboard navigation: Arrow keys, Enter, Tab, Escape.
- Mouse navigation: hover / click (mousedown-based to survive blur).
- Empty-match state (user keeps typing, popover stays open).
- Skip entirely when the container has no image assets at all.

### Out of scope (intentionally deferred)

- Full editor completion framework / LSP-style provider registry
- Fuzzy finder, ranking, recently-used boost
- Non-image asset completion (PDFs, videos, audio)
- Hover-over thumbnail preview inside the popover
- Relation-based key resolution
- Autocomplete for other schemes (`pkc://`, `http://`, etc.)
- Entry-window preview Phase 4

## Trigger condition

The autocomplete opens when the caret sits inside the following pattern:

```
( asset : <query>|
         ^start    ^caret
```

Where `<query>` is zero or more characters in `[A-Za-z0-9_-]`. The
surrounding `(` is **required** — this is what keeps plain-text and
URLs from false-triggering:

| Input | Caret | Triggers? | Why |
|---|---|---|---|
| `![a](asset:\|` | end | Yes | classic image form |
| `[a](asset:\|` | end | Yes | link form (also parenthesised URL) |
| `(asset:ast-\|` | end | Yes | bare parens, user is mid-typing |
| `asset:ast\|` | end | **No** | no preceding `(` |
| `https://site/asset:bad\|` | end | **No** | preceding char is `/`, not `(` |
| `xasset:y\|` | end | **No** | preceding char is `x`, not `(` |
| `![a](asset:ast-abc) and\|` | end | **No** | caret is past `)` |
| `![a](asset:ast \|` | end | **No** | space interrupts the key run |

Detection is a pure function (`findAssetCompletionContext`) and is
exported so tests can exercise every branch independently.

## Eligible fields

The autocomplete attaches to the same set the slash menu already
allows:

| `data-pkc-field` | Archetype | Eligible? |
|---|---|---|
| `body` | TEXT, Folder | Yes |
| `todo-description` | TODO | Yes |
| `textlog-append-text` | TEXTLOG append | Yes |
| `textlog-entry-text` | TEXTLOG edit | Yes |
| `form-note` | FORM | No (reserved) |
| `search` | Toolbar | No |

This keeps the rule simple — "wherever slash commands work, `asset:`
completion works too" — and avoids introducing a second eligibility
table.

## Candidates

The candidate source is `collectImageAssets(container)` — the exact
same helper the Asset Picker already uses. That guarantees:

- Only attachments with an `asset_key` that is **present** in
  `container.assets` are shown (no dangling references).
- Only MIMEs in the picker's image allowlist are shown; SVG is
  excluded because it can carry active content.
- Legacy attachments (body contains inline `data`, no `asset_key`)
  are excluded.
- Duplicates sharing an `asset_key` are deduplicated.

The module imports the `AssetCandidate` **type** from the picker
module but does not depend on the picker's popover state. The two
popovers can never be open simultaneously in practice, but neither
owns the other.

## Filtering

Filtering is a case-insensitive substring match on `name` **or** `key`:

```ts
filterAssetCandidates(all, query).filter(c =>
  c.key.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
```

Empty query returns a copy of the full list. No fuzzy match, no
ranking — the candidate list for a single container is small enough
that simple substring matching is fine. If the result shrinks to zero,
the popover stays open in an empty state so the user can backspace
and recover.

## Insertion semantics

On accept (Enter / Tab / mousedown), the chosen candidate's **key
only** is inserted, replacing the range `[queryStart, caret)`:

```
Before: ![alt](asset:as|)
After:  ![alt](asset:ast-a|)
```

Surrounding `(`, `[alt]`, and `)` are left untouched. Caret lands at
the end of the inserted key. This mirrors how code editors expand a
completion — the user is in control of the surrounding syntax.

The insertion also dispatches an `input` event so the editing reducer
sees the change and the markdown renderer resolves the asset on
commit.

## Keyboard priority

The action-binder's keydown handler consults popovers in this order:

```
handleKeydown
  1. Asset picker      (if open)      ← explicit, opened via /asset
  2. Asset autocomplete (if open)     ← NEW
  3. Slash menu        (if open)
  4. Global shortcuts
```

The autocomplete slots between picker and slash menu because:

- The **picker** is a replacement overlay for the slash menu at the
  same trigger point; it must win when open.
- The **autocomplete** is triggered by typing `asset:` and should
  capture navigation keys before they reach the slash menu (which,
  in practice, will not be open at the same time anyway, but the
  priority makes the intent explicit).

## Escape, click-outside, cleanup

- **Escape**: closes the popover, consumed event.
- **Click outside**: document-level click handler removes the popover
  when the click target is not inside `[data-pkc-region="asset-autocomplete"]`.
- **Context exit on further typing**: when the input event arrives
  and `findAssetCompletionContext` returns null (e.g. user typed `)`,
  a space, or deleted `asset:`), the popover closes.
- **bindActions cleanup**: `closeAssetAutocomplete()` runs alongside
  the picker and slash-menu cleanup when the binder is torn down.

## Architecture

### Layer placement

```
adapter/ui/asset-autocomplete.ts   ← NEW — detection, popover, insertion
adapter/ui/asset-picker.ts         ← unchanged — type source for AssetCandidate
adapter/ui/action-binder.ts        ← wired: input/keydown/click/cleanup
```

The autocomplete is an adapter-layer popover, not a core abstraction.
It imports only from the picker (for the `AssetCandidate` type) and
stays fully inside the adapter layer.

### Module surface

```ts
findAssetCompletionContext(text, caret): { queryStart, query } | null
filterAssetCandidates(all, query): AssetCandidate[]

openAssetAutocomplete(textarea, queryStart, query, candidates, root)
updateAssetAutocompleteQuery(query)
handleAssetAutocompleteKeydown(e): boolean
isAssetAutocompleteOpen(): boolean
closeAssetAutocomplete()
```

### Data flow

```
user types inside an eligible textarea
  → action-binder handleInput
  → findAssetCompletionContext(value, caret)
      → null    → closeAssetAutocomplete() (if open)
      → ctx     → openAssetAutocomplete(...) or updateAssetAutocompleteQuery(...)
  → popover rendered near textarea
  → user navigates with keyboard / mouse
  → insertCandidate: replaces [queryStart, caret) with cand.key
  → dispatches `input` event
  → closeAssetAutocomplete()
```

## Testing

`tests/adapter/asset-autocomplete.test.ts` (new) covers:

- `findAssetCompletionContext`:
  - Match at `(asset:|` with empty query
  - Match with partial query
  - Match at `[link](asset:...)` form
  - Match when caret sits partway through the key
  - No match without preceding `(`
  - No match inside URL (`https://.../asset:`)
  - No match when preceding char before `asset:` is not `(`
  - No match with caret before the trigger
  - No match when whitespace interrupts the key
  - No match when caret is past the closing `)`
  - Empty input / very short input safety
- `filterAssetCandidates`:
  - Full list for empty query
  - Case-insensitive name match
  - Key substring match
  - Zero matches
  - Returned list is a copy (caller safety)
- Popover lifecycle:
  - Initial closed state
  - Opens with candidates, appears in DOM
  - No-op when candidate list is empty
  - Empty state when filter eliminates all candidates
  - `updateAssetAutocompleteQuery` re-renders the visible list
  - Close removes popover from DOM
- Keyboard:
  - Escape closes
  - ArrowDown moves selection
  - ArrowUp wraps to last item
  - Enter replaces query with selected key
  - Tab inserts the selected key
  - Enter on empty list does not consume the event
  - Letter keys are not consumed (user keeps typing)
- Mouse:
  - mousedown on an item inserts and closes

## Invariants preserved

- **5-layer structure**: new module stays in adapter/ui
- **core has no browser APIs**: detection logic is browser-agnostic
  but co-located with the DOM popover for cohesion; no core changes
- **Container is source of truth**: popover reads candidates from
  `dispatcher.getState().container`, never mutates
- **`data-pkc-*` selectors**: region (`asset-autocomplete`) and items
  (`data-pkc-asset-key`) are attribute-based; CSS class names are
  styling-only
- **No premature abstraction**: detection, filtering, and popover all
  live in one ~280-line module. No generic completion framework.
- **Asset Reference Resolution contract unchanged**: the resolver sees
  the exact same `![alt](asset:key)` string whether it was typed,
  pasted, produced by the picker, or completed by this module.
- **Markdown safety unchanged**: insertion only writes `[A-Za-z0-9_-]`
  characters (the candidate's key). No HTML, no special metacharacters.

## Future scope

Captured so the next iteration has a clear entry point.

1. **Hover thumbnail**: mint a data URI for the highlighted candidate
   and show a small preview above the popover. Same MIME allowlist.
2. **Non-image completion**: once the resolver supports PDF/video/
   audio, extend `collectImageAssets` (or introduce a sibling helper)
   and relax the candidate filter.
3. **Recently-used boost**: track which keys were inserted recently
   in runtime-only state and sort them to the top.
4. **Entry-name relation lookups**: allow typing a relation name and
   resolving through the container's relation graph.
5. **Keybind-only open**: `Ctrl+Space` to force-open on any caret
   position inside `(asset:` even without new input events.
