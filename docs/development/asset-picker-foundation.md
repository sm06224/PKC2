# Asset Picker Foundation

## Purpose

Minimum viable **asset insertion** path from TEXT / TEXTLOG editors. A user
in an editing context can now pick an image asset from the container and
insert a markdown reference to it at the caret position, without ever
leaving the textarea.

This closes the loop on the Asset Reference Resolution Foundation
(`docs/development/asset-reference-resolution.md`): the renderer could
already resolve `![alt](asset:key)` syntax, but there was no user-facing
way to *produce* that syntax. The picker fills that gap with the smallest
possible amount of UI.

## Scope

### In scope

- A popover **Asset Picker** that lists image-type attachments currently
  present in the container
- Integration with the existing **slash command** system via a new
  `/asset` command
- Insertion of `![filename](asset:key)` at the caret position
- Availability in TEXT body, TEXTLOG append/edit fields, and
  TODO description editor
- Keyboard navigation (Arrow keys, Enter, Tab, Escape)
- Mouse navigation (hover / click)
- Empty state when the container has no image assets

### Out of scope (deferred)

- Inline image upload / drag-drop into the picker (users still create
  image attachments through the normal attachment flow)
- Search / filter inside the picker (list is small; this matches the
  existing slash-menu UX)
- Non-image asset types (PDFs, videos) — the resolver only renders images
- Rich previews / thumbnails inside the picker
- Rename / delete controls — editing lives on the attachment entry
- Multi-select insertion

## User flow

1. User is editing a TEXT / TEXTLOG / TODO description textarea.
2. User types `/` at a slash-eligible position (line start or after
   whitespace).
3. The slash menu opens.
4. User types `asset` (or navigates to `/asset — Insert image asset`).
5. User presses Enter. The slash menu closes and the Asset Picker popover
   opens in its place, anchored to the textarea.
6. The picker shows all image attachments in the container. User navigates
   with arrow keys or hovers with the mouse.
7. User presses Enter (or clicks an item). The picker closes and
   `![filename](asset:key)` is inserted at the range that originally held
   `/asset`.
8. The textarea dispatches `input`, the editing reducer continues as
   normal, and on commit the markdown renderer resolves the asset to an
   inline `<img>`.

## Candidate filter

The picker filter mirrors the resolver's MIME allowlist to guarantee that
any inserted reference will actually render:

| MIME                | Shown? |
|---------------------|--------|
| `image/png`         | Yes    |
| `image/jpeg`        | Yes    |
| `image/gif`         | Yes    |
| `image/webp`        | Yes    |
| `image/svg+xml`     | **No** (active content; resolver also blocks) |
| `image/bmp` / `ico` | No (not in resolver allowlist) |
| `application/pdf`, `video/*`, `audio/*`, everything else | No |

Candidates are additionally filtered by presence — attachments whose
`asset_key` is missing from `container.assets` (e.g. Light export) are
excluded because the insertion would produce an unresolvable reference.

Legacy-format attachments (body contains inline `data`, no `asset_key`)
are excluded. Users can re-save the entry to migrate to the new format.

Duplicate references to the same `asset_key` are collapsed to a single
candidate — only the first entry's name is shown.

## Insertion format

```text
![<attachment-name>](asset:<asset-key>)
```

The attachment's `name` field is used as the alt text. If empty, the
asset key itself is used as a fallback. The resolver handles unknown
alt text fine — it's just the `<img alt="...">` attribute.

## Architecture

### Layer placement

```
adapter/ui/asset-picker.ts       ← New: popover UI, state, insertion
adapter/ui/slash-menu.ts         ← Extended: /asset command + onSelect callback
adapter/ui/action-binder.ts      ← Extended: registers callback, routes keyboard
```

The picker is intentionally an **adapter-layer popover**, not a core
abstraction. It imports from `attachment-presenter.ts` (also adapter) to
reuse `parseAttachmentBody` and `isPreviewableImage`.

### Slash menu extension

`SlashCommand` gained an optional `onSelect?: (ctx) => void` field.
A command with `onSelect` is *not* inserted as text — the slash menu
closes, preserves the replacement range, and hands control to the
callback. Text-based commands still use the original `insert` field.

```ts
interface SlashCommandContext {
  textarea: HTMLTextAreaElement;
  replaceStart: number; // inclusive, start of "/command"
  replaceEnd: number;   // exclusive, current caret
  root: HTMLElement;    // #pkc-root for DOM positioning
}
```

The `/asset` command uses `onSelect` to call a **registered callback**.
Slash-menu does not know about the Asset Picker directly — the callback
is installed at `bindActions` time by the action-binder, which has the
dispatcher (and therefore the container) in scope:

```ts
registerAssetPickerCallback((ctx) => {
  const state = dispatcher.getState();
  const candidates = collectImageAssets(state.container);
  openAssetPicker(
    ctx.textarea,
    { start: ctx.replaceStart, end: ctx.replaceEnd },
    candidates,
    ctx.root,
  );
});
```

This keeps slash-menu framework-agnostic and avoids a dispatcher
dependency from the slash layer.

### SLASH_ELIGIBLE_FIELDS

Extended from `{ body, todo-description }` to include TEXTLOG fields:

| `data-pkc-field`       | Archetype      | Slash commands allowed? |
|------------------------|----------------|-------------------------|
| `body`                 | TEXT, Folder   | Yes                     |
| `todo-description`     | TODO           | Yes                     |
| `textlog-append-text`  | TEXTLOG append | **Yes (new)**           |
| `textlog-entry-text`   | TEXTLOG edit   | **Yes (new)**           |
| `form-note`            | FORM           | No (reserved)           |
| `search`               | Toolbar        | No                      |

### Picker lifecycle

```
openAssetPicker(textarea, range, candidates, root)
  ↓  appends popover to root, positions below textarea
  ↓  renders candidate list (or empty state)
  ↓
[keyboard: ArrowUp/Down + Enter/Tab]     [mouse: hover + click]
  ↓
insertCandidate(cand)
  ↓  textarea.value = before + snippet + after
  ↓  caret → after snippet
  ↓  textarea dispatches `input`
  ↓
closeAssetPicker()
```

Escape and click-outside also close the picker (handled by the
action-binder's existing overlay-dismissal logic).

### Keyboard priority order

```
handleKeydown
  1. Asset picker  (if open)  ← new
  2. Slash menu    (if open)
  3. Global shortcuts
```

The asset picker takes priority because it opens *as a replacement for*
the slash menu at the same trigger point. Keyboard events should not
leak back to the slash menu once the picker has taken over.

## Testing

`tests/adapter/asset-picker.test.ts` (new file) covers:

- `collectImageAssets`:
  - null / empty container
  - legacy format (no asset_key) excluded
  - missing asset data excluded
  - non-image MIME excluded
  - SVG excluded
  - non-attachment archetypes excluded
  - duplicate asset_key deduped
- `buildAssetInsertion`:
  - filename as alt text
  - key fallback when name empty
- Picker lifecycle: open / empty state / close
- Keyboard navigation: Escape, ArrowDown, ArrowUp (wrap), Enter, Tab
- Range-based insertion (the `/asset` → picker hand-off path)
- Caret-position insertion (direct call without range)
- Empty list: Enter does not consume event, picker stays open

`tests/adapter/slash-menu.test.ts` gains:

- Textlog fields are slash-eligible
- `SLASH_COMMANDS.length === 9` (was 8)
- `/asset` command has `onSelect`, not `insert`
- `registerAssetPickerCallback` hooks the `/asset` path
- `/asset` with no callback is a safe no-op (text unchanged)
- ArrowUp from default position wraps to `asset` (last command)

## Invariants preserved

- **5-layer structure**: picker stays in adapter, reuses adapter helpers
- **Container is source of truth**: no UI state leaks into the container
- **No core imports from adapter**: `registerAssetPickerCallback` injects
  the dispatcher-dependent callback; slash-menu stays standalone
- **`data-pkc-*` selectors only**: both region (`data-pkc-region="asset-picker"`)
  and items (`data-pkc-asset-key`) are attribute-based
- **Popover dismissal**: same Escape + click-outside contract as
  slash-menu / context-menu

## Related: Folder Collapse Fix

While this foundation was being added, a separate sidebar tree bug was
fixed in the same commit: folders in the left pane had no way to
collapse or expand. Previously, folders were always shown fully
expanded, so deep hierarchies quickly became unusable.

The fix is a minimal runtime-only toggle:

- New `AppState.collapsedFolders: string[]` (default `[]`)
- New `TOGGLE_FOLDER_COLLAPSE` UserAction, reduced in `ready` phase
- Renderer adds a `▼` / `▶` chevron button to folder tree nodes that
  have at least one structural child; clicking it dispatches the toggle
- When a folder is collapsed, its descendants are skipped entirely
  during tree traversal — so selection, DnD, and drop-target logic on
  descendants simply don't see them
- `aria-expanded` is kept in sync for accessibility
- The chevron's click handler calls `stopPropagation()` so clicking it
  does not also re-select the folder via the surrounding `<li>`

State is intentionally not persisted. Refresh → everything expanded,
matching the behavior of many file browsers and the existing "expand
all" defaults in PKC2.

## Future scope

1. **Thumbnails inside the picker** — show a small `<img>` beside the
   filename, using the same base64 data URI the resolver would emit.
   Keep the list length bounded; virtualize if assets grow large.
2. **Non-image asset insertion** — for PDFs / videos, insert a link
   `[filename](asset:key)` and extend the resolver to emit `<a>` /
   `<video>` elements.
3. **Drag-drop upload inside the picker** — combine the picker with
   the existing file-drop zone for a one-step "drop → insert" flow.
4. **Filter box** — once candidate counts grow, add an inline input to
   narrow the list. Defer until there's a real performance or usability
   need.
5. **Persist folder collapse state** — if user research confirms users
   want their collapse state remembered across sessions, move the field
   to the persistence layer.
