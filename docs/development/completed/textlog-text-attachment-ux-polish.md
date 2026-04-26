# TEXTLOG / TEXT / Attachment UX Polish — Issue D

This note pins the design decisions for the five independent items
landed together as Issue D. Each section is intentionally short — the
implementing code in `src/adapter/ui/*` is the source of truth.

## 1. TEXTLOG row dblclick → BEGIN_EDIT

**What.** Double-clicking a `.pkc-textlog-row` in the centre pane
selects the owning entry (if not already selected) and dispatches
`BEGIN_EDIT` for that entry, putting the textlog into in-place edit
mode. The existing "✏️ Edit" button in the action bar remains as a
discoverable, click-once entry point and uses the same dispatch path.

**Why dblclick rather than detail≥2 in handleClick.** The textlog flow
is wholly inside an already-selected entry — no entry-window needs to
open. Routing it through the secondary `handleDblClick` listener keeps
the primary single-click path simple and avoids tangling the textlog
flag/asset/timestamp click handlers with edit-begin logic.

**Carve-outs.** The dblclick handler explicitly opts out when the
event origin is:

- `.pkc-textlog-flag-btn` — flag toggle keeps its single-click
  semantics; the user does not want to slip into edit mode when they
  flick a star.
- `a[href^="#asset-"]` — non-image asset chip anchors keep their own
  click handler that triggers the download.
- The append textarea — already outside `.pkc-textlog-row`, so no
  explicit guard is needed.

**Readonly.** The handler short-circuits in `state.readonly`: a
dblclick on a row in a read-only container is a no-op.

**Wiring.** `textlog-presenter.ts` stamps each row with
`data-pkc-lid="<owning-entry-lid>"` so the dblclick handler can map a
row directly to its parent entry without walking back through
`state.selectedLid`. Same attribute is reused by the context menu
(item 2 below).

## 2. Reference-string context-menu items

**Format spec.** Three reference shapes, all framed as standard
markdown links so they survive a paste into any markdown-aware editor:

| target            | shape                                 | example                              |
|-------------------|---------------------------------------|--------------------------------------|
| Entry             | `[title](entry:lid)`                  | `[Meeting Notes](entry:e7q)`         |
| Image asset       | `![name](asset:key)`                  | `![logo.png](asset:ast-3a9b)`        |
| Non-image asset   | `[name](asset:key)`                   | `[budget.xlsx](asset:ast-77af)`      |
| TEXTLOG line      | `[title › ts](entry:lid#log-id)`     | `[Daily › 2026/04/09 Thu 10:00](entry:tl1#log-1)` |

The `entry:` scheme is reserved for cross-entry navigation. Future
consumers that don't understand the `#log-id` fragment still get a
valid entry-level reference. Markdown link labels are escaped via
`escapeMarkdownLabel` (doubles `\`, `[`, `]`).

**Where it lives.** `formatEntryReference`, `formatAssetReference` and
`formatLogLineReference` in `action-binder.ts`. Image vs. non-image
distinction comes from `classifyPreviewType(att.mime) === 'image'`.

**Context menu surfacing.** `renderContextMenu` now accepts a
`ContextMenuOptions` object (backward-compatible boolean overload
preserved for existing callers). It conditionally emits:

- `copy-entry-ref` — always
- `copy-asset-ref` — when `archetype === 'attachment'`
- `copy-log-line-ref` — when `archetype === 'textlog'` AND a `logId`
  was supplied (i.e. the menu was opened from a row, not the textlog
  view as a whole)

Mutating items (Edit / Delete / Move to Root) are gated on `canEdit`,
which `handleContextMenu` derives from `!state.readonly`. **Reference
copy items are always shown** even in readonly mode — they don't
mutate state, so a read-only viewer should still be able to copy a
reference for sharing.

**Three-case context menu scoping.** `handleContextMenu` now resolves
the click target in priority order:

1. `.pkc-textlog-row[data-pkc-lid][data-pkc-log-id]` →
   row-scoped menu with `archetype: 'textlog', logId`
2. `[data-pkc-mode="view"][data-pkc-archetype]` →
   detail-pane menu using the wrapping view's archetype attribute
3. `[data-pkc-region="sidebar"]` entry item → sidebar menu (legacy
   path; still selects the right-clicked entry on click)

The TEXTLOG row case takes precedence so a right-click on a log row
gives the user the per-row reference action without first having to
dismiss the entry-level menu.

## 3. HTML attachment "Open in New Window" button

**What.** HTML / SVG attachments expose a prominent
`🌐 Open in New Window` button in a new
`[data-pkc-region="attachment-actions"]` row alongside Download. Both
buttons live at the card level — the user no longer needs to scroll
into the sandboxed preview iframe to find the existing in-iframe
button. Both paths share the `open-html-attachment` action handler.

**Sandbox / trust model.** Unchanged. The new window is created via
`window.open('') + document.write(html)`, the same pattern documented
under Architecture Exception **AE-002 HTML Sandbox Bridge**. The
document inherits an `about:blank` origin, no cross-window
postMessage channel is opened, and the bytes come from
`container.assets[asset_key]` decoded fresh on each click — never a
cached blob URL. Non-HTML MIME types are filtered by
`classifyPreviewType(mime) !== 'html'`.

**Light export interaction.** When the attachment data has been
stripped (light export), the action row is suppressed entirely so
neither Download nor Open in New Window can be invoked.

## 4. Markdown source copy vs. rich (markdown + HTML) copy

The TEXT / TEXTLOG action bar gains three new always-visible buttons
in the `ready` phase (including readonly mode, since none mutate
state):

| Button             | Action                       | Clipboard payload                                 |
|--------------------|------------------------------|---------------------------------------------------|
| 📋 Copy MD         | `copy-markdown-source`       | `text/plain` only — raw markdown source           |
| 🎨 Copy Rendered   | `copy-rich-markdown`         | `text/plain` (markdown) + `text/html` (rendered)  |
| 📖 Open Viewer     | `open-rendered-viewer`       | (item 5)                                          |

**Markdown source for TEXTLOG.** The flat-string serializer
`serializeTextlogAsMarkdown` lives in `features/textlog/textlog-body.ts`
(features layer; pure, no browser APIs). It frames each log row with
a `## <timestamp>` heading using the same `formatLogTimestamp` the
on-screen UI uses, and appends a trailing ` ★` marker on important
rows so the flag is not silently lost. Entries are emitted in
**original append order** — never re-sorted by timestamp — to match
the textlog-foundation rule.

**Rich-copy clipboard chain.** `adapter/ui/clipboard.ts` exposes a
fallback chain so behaviour degrades gracefully across browsers and
the happy-dom test environment:

1. `navigator.clipboard.write([new ClipboardItem({...})])` — best UX,
   single write with both `text/plain` and `text/html`.
2. `navigator.clipboard.writeText(markdown)` — plain fallback when
   `ClipboardItem` is missing.
3. `document.execCommand('copy')` via a hidden textarea — legacy
   path, synchronous, works inside happy-dom (returns `false` instead
   of throwing).

The rich-copy path pre-resolves `asset:` references via the shared
`resolveAssetReferences` so a pasted rich-text payload still shows
the inline image embed and non-image chip.

## 5. Rendered viewer in a new window

**What.** A new `📖 Open Viewer` button on the TEXT / TEXTLOG action
bar dispatches `open-rendered-viewer`, which calls
`openRenderedViewer(entry, container)` from
`adapter/ui/rendered-viewer.ts`. The function builds a standalone HTML
document with:

- The entry title in `<title>` and `<h1>`.
- The entry body run through `resolveAssetReferences` → `renderMarkdown`
  so image embeds and non-image chips appear correctly.
- An archetype label line ("Text · rendered view (read-only)" /
  "Textlog · rendered view (read-only)").
- A tight inline stylesheet (NOT the main app stylesheet) tuned for
  readability and a `@media print` rule that strips backgrounds.

The document is written via `window.open('') + document.write(html)`
— same `about:blank` pattern documented under Architecture Exception
**AE-003 Preview Window Bridge**.

**Limits.** No editor UI ever ships into the new window: no
textarea, no save/cancel/edit buttons, no `data-pkc-field="body"`.
The viewer is read-only by construction.

**Markdown safety.** The viewer uses the same hardened
`renderMarkdown` (`html: false`) as the main app, so raw `<script>`
in a TEXT body is rendered as escaped text, never as a live tag. This
test is pinned by `tests/adapter/rendered-viewer.test.ts`.

## 6. Intentionally not done

- **CSV export & assets ZIP export** — deferred to a separate Issue
  (see section 7). Out of scope to keep this batch focused on
  in-place UX polish.
- **Drag-to-reorder for textlog rows** — out of scope, would require
  a separate design pass on log ordering rules.
- **Rich-paste import** — only the *outbound* clipboard direction is
  covered; pasting rich HTML *into* a TEXT entry is left to a future
  Issue if it ever becomes a real workflow.
- **Auto-cleanup of in-iframe Open-in-New-Window button** — kept for
  discoverability; both paths share the same action handler.

## 7. Next Issue candidate

**CSV + assets ZIP export.** A single-file CSV summary plus a ZIP
bundle containing every attachment asset, suitable for sharing the
container outside PKC2 without the `pkc2.html` runtime. Should
reuse the existing `light/full` export distinction and the
`zip-package.ts` helpers already in `adapter/platform/`.
