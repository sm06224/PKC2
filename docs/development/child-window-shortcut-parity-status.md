# Child Window Shortcut Parity — Status (docs-lite audit)

## 1. Purpose / Status

**Closing the cluster.** Two implementation slices — PR-ζ₁ (#105,
Ctrl/Cmd+S + Escape) and PR-ζ₂ (date/time insert shortcuts) — have
landed on the child-window inline keyboard bridge. Beyond those, the
remaining main-shell shortcuts fall into three buckets:

1. **Parity achieved** — shortcuts already bridged into the child.
2. **Intentional non-parity** — shortcuts the child deliberately
   does not reproduce because the corresponding surface / state /
   UI does not exist inside the detached window.
3. **Backlog** — shortcuts that are unsolved in **both** windows
   and belong to a global editing policy, not to this cluster.

This doc fixes the delineation so future drive-by prompts ("add X to
the child") can be answered from a table instead of re-auditing the
code. It is **not** an implementation PR.

Related docs:

- `storage-profile-footprint-scope.md` — analogous scope-clarification
  pattern for a different feature.
- `storage-profile-ui.md` — cross-surface example of the same
  "what is in scope here" style.
- `USER_REQUEST_LEDGER.md` entries tagged with cluster D for the
  original complaint.

---

## 2. Current parity matrix

`mod` = `Ctrl` on Windows/Linux, `Cmd` (meta) on macOS. Shortcuts
are listed in the order they reach the child keydown bridge (see
`src/adapter/ui/entry-window.ts`).

| Shortcut (main-shell contract) | Main window behavior | Child window behavior | Status | Landed in |
|---|---|---|---|---|
| `mod+S` | Save in editing phase; suppress browser save in ready phase | Save in edit mode; `preventDefault` in view mode | **parity** | PR-ζ₁ (#105) |
| `Escape` | Multi-layer overlay cascade → cancel edit → clear multi-select → deselect | Edit mode → `cancelEdit()`; view mode → `window.close()` | **parity (scoped)** | PR-ζ₁ (#105) |
| `mod+;` | Insert `yyyy/MM/dd` in editing phase | Same, edit mode only | **parity** | PR-ζ₂ |
| `mod+:` | Insert `HH:mm:ss` | Same, edit mode only | **parity** | PR-ζ₂ |
| `mod+Shift+;` | Insert `yyyy/MM/dd HH:mm:ss` | Same, edit mode only | **parity** | PR-ζ₂ |
| `mod+D` | Insert `yy/MM/dd ddd` (localized) | Same, edit mode only | **parity** | PR-ζ₂ |
| `mod+Shift+D` | Insert `yy/MM/dd ddd HH:mm:ss` | Same, edit mode only | **parity** | PR-ζ₂ |
| `mod+Shift+Alt+D` | Insert ISO 8601 | Same, edit mode only | **parity** | PR-ζ₂ |
| `mod+?` | Toggle shortcut help overlay | — | **intentional non-parity** | — |
| `mod+\` | Toggle sidebar pane | — | **intentional non-parity** | — |
| `mod+Shift+\` | Toggle meta pane | — | **intentional non-parity** | — |
| `mod+N` | New text entry in ready phase | — | **intentional non-parity** | — |
| `mod+Enter` in textlog append textarea | Commit the append | — | **intentional non-parity** | — |
| Arrow Up / Down / Left / Right (unmod / mod) | Sidebar tree / calendar / kanban navigation | — | **intentional non-parity** | — |
| `Enter` (non-editing) | Activate / begin edit the selected entry | — | **intentional non-parity** | — |
| `/` at line start | Open slash / input-assist menu | — | **intentional non-parity** | — |
| Asset picker / asset autocomplete / entry-ref autocomplete keys | main-shell handles | — | **intentional non-parity** | — |
| `mod+C` / `mod+V` / `mod+X` | Native browser clipboard | Native browser clipboard | **implicit parity (native)** | — |
| `Tab` / `Shift+Tab` | Native focus cycle | Native focus cycle | **implicit parity (native)** | — |
| `mod+Z` / `mod+Y` | Native `<textarea>` undo / redo (no entry-level undo) | Same | **backlog (global)** | — |

No code change was required while compiling this table — the matrix
confirms the existing bridge already covers the productive
shortcuts, and the rest are non-parity by design or shared with the
main window.

---

## 3. Why some shortcuts are intentionally not parity

The child window is a **narrowed editing surface** by design. It
hosts the entry under edit, a view/edit mode toggle, a few
meta-controls, and nothing else: no sidebar tree, no calendar, no
kanban, no shell menu, no overlays, no append form, no selection
model, no container-mutation path. Shortcuts that target any of
those surfaces have no meaningful landing in the child, so
reproducing them would either no-op silently or — worse — invent
new child UI that duplicates the main window.

Concrete rationale per shortcut group:

- **`mod+?` (shortcut help overlay)**: main uses the help overlay
  as a memory-aid for the full catalog it hosts. The child's own
  catalog is tiny (this doc), and duplicating the overlay would
  require mirroring the main-shell's state-driven overlay pattern
  across the child's standalone document. Users who need the full
  list can toggle the main window's overlay directly.
- **`mod+\` / `mod+Shift+\` (pane toggles)**: child has no sidebar
  or meta pane. There is nothing to toggle.
- **`mod+N` (new text entry)**: child does not mutate the
  container. Creating a new entry would need to flow through the
  parent's reducer, and the UX question "where does the new entry
  appear?" has no answer inside the child's single-entry surface.
- **`mod+Enter` (textlog append)**: the child shows existing log
  rows but has no append textarea. The parent retains the append
  affordance; users who want to append switch windows. Adding a
  child-side append UI is a separate design slice, not a shortcut
  question.
- **Arrow / Enter / `/`**: navigation + selection + slash menu all
  target main-shell surfaces. They would have nothing to act on
  inside the child.
- **`mod+C` / `mod+V` / `mod+X` / `Tab`**: the browser provides
  these unchanged, so both windows already inherit the same
  behavior with zero bridge code. Implicit parity; not subject to
  this audit.

None of the intentional-non-parity items is a user-facing
regression — they reflect the child's narrower surface, not missing
work.

---

## 4. Backlog (shared with main, not a child-only gap)

- **`mod+Z` / `mod+Y` (Undo / Redo)**: neither window offers an
  entry-level undo today. Native `<textarea>` undo covers the
  in-progress edit field; a container-level Undo is a global
  editing policy decision (history model, revision integration,
  merge semantics) that belongs in its own wave. Tracking it as a
  "child gap" would mis-attribute the work.

No other backlog items surfaced during the audit.

---

## 5. Existing code reference points

- **Child keydown bridge (single listener)**:
  `src/adapter/ui/entry-window.ts` — inside `buildWindowHtml`,
  search for `document.addEventListener('keydown'` (around the
  `PR-ζ₁` comment). The listener reads `currentMode` to gate
  edit-only behavior and runs the inline `getDateTimeShortcutText`
  + `insertAtCursor` helpers for the date/time cases.
- **Child inline helpers duplicated from features/datetime**:
  same file, directly below the listener (`pad2` / `fmtDate` /
  `fmtTime` / `fmtDateTime` / `fmtShortDate` / `fmtShortDateTime` /
  `fmtISO8601` / `getDateTimeShortcutText` / `insertAtCursor`).
  Duplication is deliberate — the child runs as a standalone
  document and cannot import from the bundle.
- **Main-shell keyboard handler (the catalog the child mirrors a
  subset of)**:
  `src/adapter/ui/action-binder.ts`, look for the `handleKeydown`
  function. Ctrl+S / Escape / Ctrl+? / Ctrl+\\ / Ctrl+N / arrow
  navigation / Enter / date/time all live there. The helper
  `getDateTimeShortcutText` used by main-shell is defined in the
  same file further down.
- **Tests**:
  - `tests/adapter/entry-window.test.ts` — `Keyboard bridge (PR-ζ₁)`
    and `Keyboard bridge date/time shortcuts (PR-ζ₂)` describe
    blocks pin the HTML template content for each bridged shortcut.
  - `tests/adapter/action-binder-keyboard.test.ts` — main-shell
    shortcut behavior (the source of truth the child partially
    mirrors).
  - `tests/adapter/action-binder-pane-toggle-shortcut.test.ts` —
    pane-toggle shortcut behavior (main only).
- **Prior PRs**:
  - PR-ζ₁ (#105) — `f2a8fda` — Ctrl+S / Escape bridge.
  - PR-ζ₂ — `efc73e7` — date/time shortcuts.

---

## 6. Non-goals

- No new child-side keydown behavior in this doc's scope. The audit
  found **no tiny omission** worth landing alongside the status
  doc.
- No child-side shortcut help overlay. Duplicating the main
  overlay's state-driven pattern into the child document is a
  standalone design slice, not a shortcut parity question.
- No append UI in the child window. `mod+Enter` stays non-parity
  until that separate slice is planned.
- No global Undo / Redo policy. The main window does not have one
  either; child parity is not the wedge to introduce it.
- No rename of "parity" vs "mirror" vs "bridge" terminology across
  existing docs. Only this file formalizes the buckets; other
  docs keep their current wording.

---

## 7. Next-step options

Order of least-to-most impact:

1. **Do nothing (recommended).** The cluster is closed until a user
   brings a concrete new complaint. This doc exists so that
   complaint can be answered from the matrix rather than by
   re-auditing the code.
2. **Small UX touch-up**: surface a 1-line `<kbd>` hint inside the
   child's header ("Ctrl+S save · Esc close — full list in main
   window"). Pure copy change; would not add shortcuts.
3. **Child shortcut help overlay** (only if users persistently ask):
   mirror the main-shell state-driven overlay into the child's
   standalone document. Requires a standalone markup fork of the
   overlay — not a one-line change. Defer until the request
   materializes.
4. **Global Undo/Redo wave**: separate scope, pulled by its own
   design doc if/when container-level history is prioritized.

---

**Status: docs-lite audit. No code changes landed with this PR.
PR-ζ₁ and PR-ζ₂ remain authoritative for the parity scope; this
file makes that scope queryable without re-reading either PR.**
