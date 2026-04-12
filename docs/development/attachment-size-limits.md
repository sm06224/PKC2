# Attachment Size Limits

**Status:** active — added during the April 2026 audit.  
**Scope:** documents the hard and soft size thresholds that the
attachment pipeline enforces, and why PKC2 cannot reliably accept
1 GB-class files under its current single-HTML / base64 / IndexedDB
architecture.

## Thresholds

| Level    | Constant             | Value      | Behavior |
|----------|----------------------|------------|----------|
| `none`   | — (below soft)       | < 1 MB     | No warning, no UI affordance |
| `soft`   | `SIZE_WARN_SOFT`     | 1 MB       | Info line suggesting ZIP Package export |
| `heavy`  | `SIZE_WARN_HEAVY`    | 5 MB       | Red warning line about export size impact |
| `reject` | `SIZE_REJECT_HARD`   | **250 MB** | **Pipeline refuses the file**; commit is blocked |

Source: `src/adapter/ui/guardrails.ts`.

## Why 1 GB is not supported

PKC2 distributes itself as a single HTML file (`dist/pkc2.html`) with
all attachments embedded as base64 strings inside the container
payload. Three constraints compound:

1. **Heap doubling during conversion.** `FileReader.readAsDataURL` and
   `readAsArrayBuffer` materialise the entire file in memory. The
   ArrayBuffer, the intermediate binary-string build-up, and the
   final base64 string all coexist briefly, peaking at roughly
   2–3× the source size. A 1 GB file therefore needs ≥ 2–3 GB of
   V8 heap — far above the typical ~4 GB-per-tab ceiling on desktop
   Chromium, and much lower on mobile.
2. **base64 expansion.** base64 encoding adds ~33% overhead. A 250 MB
   source becomes a ~333 MB string inside `Container.assets`, which
   is then re-embedded into the single HTML product, doubling the
   on-disk footprint.
3. **IndexedDB quotas.** `IDBObjectStore.put()` cannot stream large
   values; the full base64 string is committed in one transaction.
   Per-origin quotas vary (50 MB–several GB depending on browser and
   available disk), and exceeding them produces a
   `QuotaExceededError` that the save path currently only
   `console.warn`s.

## Entry points enforced

All three attachment entry points now consult
`isFileTooLarge(file.size)` before allocating any heap:

| Path                                             | File                            | Behaviour on reject |
|--------------------------------------------------|---------------------------------|---------------------|
| Attachment archetype — file picker `change`     | `attachment-presenter.ts:400`   | Clears hidden fields, marks `[data-pkc-attachment-rejected="true"]`, resets the file input |
| Inline paste into markdown textarea             | `action-binder.ts:2361`         | `e.preventDefault()`, `console.warn`, non-blocking toast (`[data-pkc-region="toast"]`) |
| Drag-and-drop file attachment (sidebar / body)  | `action-binder.ts:processFileAttachment` | `console.warn`, non-blocking toast, returns without dispatching |

Each entry point also now installs a `FileReader.onerror` handler so
an allocation failure **below** the hard limit (e.g. 200 MB on a
memory-pressured tab) is surfaced as a clear error instead of a silent
dropped attachment. The FileReader error surfaces the toast as kind
`error` (red) while the hard-reject uses kind `warn` (amber).

## Why toast for paste/drop but not the presenter

- The presenter path has a dedicated DOM slot (`[data-pkc-region=
  "attachment-size-warning"]`) that is already integrated with the
  visual guardrail styling — the user sees the message in place.
- Paste and drop happen from arbitrary contexts (body textareas,
  sidebar drop targets, etc.) where there is no dedicated slot, so
  they use the shared non-blocking toast helper (`showToast` in
  `src/adapter/ui/toast.ts`). The toast is dismissible, auto-closes
  after 7 s by default, coalesces on identical messages (so dragging
  five oversized files in a row does not stack five toasts), and
  upgrades severity in-place when a repeat call has a higher kind.
- Earlier revisions used `alert()`; it has been removed from the
  paste / drop paths. `alert()` remains only in the workspace-reset
  confirmation flow, which is an intentionally-blocking action.

## Escape hatches for oversized assets

1. **External storage.** Host the file on a static web server or
   object store, link to it from a TEXT entry via a plain markdown
   link, and keep PKC2 as the knowledge index rather than the storage
   layer.
2. **ZIP Package export.** For the 5 MB–250 MB band where we warn but
   accept, the `dist/pkc2.html` single-HTML embedding becomes
   awkward. ZIP Package export stores assets as raw binaries outside
   the HTML document and is the recommended export path.
3. **Split the content.** A giant PDF is usually split into
   per-chapter PDFs at the source — doing the same before attaching
   preserves searchability while staying under the ceiling.

## Future directions (not in this slice)

- **Streaming base64 conversion.** Using `Response(file).body` +
  `TextEncoder` would let the conversion operate on 64 KB chunks
  rather than the whole buffer, lowering peak heap by roughly 3×.
  Still doesn't solve the IDB and on-disk product-size problems.
- **External asset references.** Storing only the file path / URL in
  `Container.assets` and loading lazily would lift the ceiling
  entirely, but requires a schema migration and a sync/fetch
  subsystem. Out of scope for the current "monolith HTML" design.
- **Surface `save()` failures in UI.** The IDB save path currently
  only `console.warn`s on `QuotaExceededError`; pairing that with the
  IDB availability banner (see `idb-availability.md`) would make
  mid-session persistence failures visible.

## Related code

- `src/adapter/ui/guardrails.ts` — threshold constants + classifiers
- `src/adapter/ui/attachment-presenter.ts` — presenter file picker
- `src/adapter/ui/action-binder.ts` — paste handler + drop handler
- `src/adapter/ui/toast.ts` — non-blocking toast helper used by paste/drop
- `src/styles/base.css` — `.pkc-guardrail-reject` + `.pkc-toast*` rules
- `tests/adapter/guardrails.test.ts` — threshold + message tests
- `tests/adapter/toast.test.ts` — toast helper unit tests
