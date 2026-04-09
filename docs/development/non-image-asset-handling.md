# Non-image Asset Handling — Foundation

## Purpose

Extend the Asset Reference Resolution story to **non-image** attachments
so that PDFs, audio, video, archives and generic files can appear
inline inside TEXT and TEXTLOG bodies as meaningful, clickable chips
instead of being silently invalid URLs.

This is a foundation: clicking a chip triggers a download of the raw
asset. No inline PDF viewer, no media player, no preview card — the
goal is to make the reference *visible, actionable, and safe* with the
smallest possible diff.

## Scope

### In scope

- A second reference syntax — the **markdown link form**
  `[label](asset:asset_key)` — dedicated to non-image attachments.
- Compile-time categorisation of the asset's MIME into one of
  `pdf | audio | video | archive | other`, each with a Unicode icon.
- Pre-processing rewrite in the features layer that turns the link
  form into a CommonMark link with a fragment href
  `[<icon> <label>](#asset-<key>)`.
- Adapter-layer click interception on `a[href^="#asset-"]` that
  delegates to the existing `downloadAttachment` path.
- Presenter plumbing for a `nameByKey` map so an empty label
  `[](asset:key)` can fall back to the attachment's own filename.
- CSS pill styling applied via attribute selector (`data-pkc-*` free,
  because markdown-it's output has no hooks to set classes on
  generated links).
- Fallback markers for missing / unsupported references, matching the
  existing image resolver's language.
- Tests and documentation.

### Out of scope (intentionally deferred)

- Inline PDF embed (`<iframe>` or `<object>`). Users can already open
  PDFs through the attachment entry itself; this foundation only
  downloads.
- Inline `<audio>` / `<video>` players. Same reason.
- SVG safe-render. SVG is still rejected (can carry active content).
- Relation-based resolution (e.g. `[label](asset:<relation-name>)`).
- Hover-preview popovers.
- Asset picker integration for non-image insertion (`/asset` command
  still only lists images — adding non-image candidates is a separate
  change with its own UX discussion).
- Autocomplete over non-image assets.
- Cross-container / document-set export bundling.

## Adopted reference syntax

```markdown
[label](asset:ast-abc-001)
[](asset:ast-abc-001)
[label](asset:ast-abc-001 "tooltip")
```

A link-form reference is:

1. Literal `[`
2. Label text (any chars except `]`, including empty)
3. `](asset:`
4. Asset key (any chars except whitespace, `)`, `"`)
5. Optional ` "title"` suffix
6. Closing `)`

The **image form** `![alt](asset:key)` is preserved verbatim — the
existing image resolver still owns it. The two forms never fight: the
resolver runs the image pass first, so any surviving `[label](asset:…)`
is unambiguously non-image.

### Why two forms, one resolver?

Keeping a single pre-processing pass means:

- The markdown-it instance stays untouched. `html: false` is not
  revisited. No custom renderer rule, no new validator, no raw HTML
  injection.
- The image story (`asset-reference-resolution.md`) is unaltered. Any
  existing `![alt](asset:key)` reference in a user's container
  continues to render as an inline `data:` URI.
- The user's mental model is boringly predictable: `![ ]` = embed,
  `[ ]` = link / chip, just like everywhere else in markdown. The
  `asset:` URI scheme is the only novelty, and it is reused across
  both forms.

## MIME categories

`classifyAssetMimeCategory(mime)` maps MIME strings to a coarse
category. The category determines the chip icon; anything not
recognised falls through to `other` so an asset that exists in the
container is always downloadable.

| Category | Icon | MIME examples |
|---|---|---|
| `image`   | —  | png, jpeg, gif, webp — handled by image resolver |
| `pdf`     | 📄 | `application/pdf` |
| `audio`   | 🎵 | `audio/*` |
| `video`   | 🎬 | `video/*` |
| `archive` | 🗜 | `application/zip`, `application/x-tar`, `application/gzip`, `application/x-7z-compressed`, `application/x-rar-compressed`, `application/vnd.rar` |
| `other`   | 📎 | everything else (text, json, octet-stream, …) |

Classification is case-insensitive. Unknown MIME → `other`, never an
error.

### SVG

`image/svg+xml` is **not** in either the image allowlist or the
non-image categories. The resolver emits `*[unsupported asset: key]*`
for SVG in both forms, preserving the existing safety posture
("SVG is an executable document, embed via sandboxed iframe only").

### Image MIME via link form

`[label](asset:png-key)` is **also** rejected with an unsupported
marker. That is a user typo — they wanted an embed but wrote the link
form. The marker makes the fix obvious (`![label](asset:png-key)`).

## Rewrite output

The link-form pass rewrites

```markdown
See [the report](asset:ast-pdf-001) please
```

to

```markdown
See [📄 the report](#asset-ast-pdf-001) please
```

which markdown-it then renders as an ordinary `<a>` tag. Fragment
hrefs (`#...`) are already allowed by `SAFE_URL_RE` in
`markdown-render.ts`, so the Phase 2 URL allowlist is untouched.

### Label fallback order

1. The user-supplied link text, if non-empty.
2. The attachment's own `name`, looked up in
   `ctx.nameByKey[key]` (built from `container.entries`).
3. The sanitised asset key itself.

Empty link text `[](asset:key)` is the common case for "I just want
the attachment name to show" — the resolver fills it in automatically.

### Label escaping

The label is passed through a small markdown-label escaper that
doubles `\` / `[` / `]` into `\\` / `\[` / `\]`. The simple regex
used for detection already refuses to match any `]` inside the label,
so `]` is structurally impossible — the escape is defence in depth.

## Fallback policy

| Condition | Replacement |
|---|---|
| Link form key not in `container.assets` | `*[missing asset: key]*` |
| Link form key has no MIME in the attachment index | `*[missing asset: key]*` |
| Link form MIME is in the image allowlist | `*[unsupported asset: key]*` |
| Link form MIME is `image/svg+xml` | `*[unsupported asset: key]*` |
| Link form MIME anything else | chip (`pdf` / `audio` / `video` / `archive` / `other`) |

The key printed in the marker is sanitised to `[A-Za-z0-9_-]`, same
rule as the image resolver.

## Click interception

The renderer draws plain markdown — it has no way to attach a
`data-pkc-action` to a markdown-it–generated `<a>`. Instead, the
action-binder installs a single capturing check at the top of
`handleClick`:

```ts
const assetLink = rawTarget?.closest<HTMLAnchorElement>('a[href^="#asset-"]');
if (assetLink && root.contains(assetLink)) {
  e.preventDefault();
  const key = assetLink.getAttribute('href')!.slice('#asset-'.length);
  if (key) downloadAttachmentByAssetKey(key, dispatcher);
  return;
}
```

`downloadAttachmentByAssetKey` walks `container.entries`, finds the
attachment entry whose `asset_key` matches, and delegates to the
existing `downloadAttachment(lid, dispatcher)` helper. Blob URL
lifecycle, filename, and revoke timing are therefore identical to
the attachment-entry download button — there is no new download
path.

No navigation, no history entry, no scroll jump: the fragment URL is
consumed entirely by the click handler.

## Safety notes

- **No raw HTML.** The resolver emits plain markdown. `html: false`
  is still active.
- **No `javascript:` / `data:text/html` hrefs.** Chip hrefs are
  fragment URLs built from `#asset-<sanitised-key>`. `SAFE_URL_RE`
  already admits `#...` URLs, so no allowlist change is needed.
- **No URL allowlist change.** `validateLink` in
  `src/features/markdown/markdown-render.ts` is untouched.
- **No label injection.** Labels are markdown link text — markdown-it
  escapes them. `[` and `\` are pre-escaped by the resolver before
  they reach markdown-it.
- **No key injection.** Sanitised key is the only part of the href
  that comes from user input, and it is filtered to `[A-Za-z0-9_-]`.
- **No asset-to-asset redirect.** Clicking a chip downloads the
  *same* attachment the anchor points to, or no-ops if that key is
  no longer in the container.
- **Sandbox parity.** SVG stays behind the sandboxed-iframe path used
  by the attachment preview — it never renders inline here either.
- **Cleanup.** `bindActions` returns a cleanup function that removes
  the click listener along with the existing popover cleanup; the
  chip handler uses the same root-level delegation and so tears down
  automatically.

## Layering

```
features/markdown/asset-resolver.ts   — pure resolver + classifier
adapter/ui/detail-presenter.ts        — forwards ctx to resolver
adapter/ui/textlog-presenter.ts       — forwards ctx to resolver
adapter/ui/renderer.ts                — builds mimeByKey + nameByKey
adapter/ui/action-binder.ts           — intercepts chip clicks
styles/base.css                       — pill styling (attribute selector)
```

- `core` is not touched.
- Features are still pure (no browser APIs). The resolver only
  produces a markdown string.
- Adapter owns the DOM side — chip clicks, `downloadAttachment`
  helper, CSS.

## Testing

### `tests/features/markdown/asset-resolver.test.ts` (+28 tests)

- `classifyAssetMimeCategory` — image / pdf / audio / video / archive
  / other / unknown / case-insensitive.
- Link-form resolution — pdf / audio / video / archive / other
  chip rendering, with and without label.
- `nameByKey` fallback when label is empty; key fallback when
  `nameByKey` is absent.
- Fallback markers — missing key, image MIME via link form, SVG via
  link form.
- Security — no `javascript:`, no `data:` href, escaped bracket in
  label is preserved, adjacent image form stays untouched, preceding
  punctuation is preserved, multiple link forms on one line.
- Edge cases — escaped `\[`, fenced-code context (known limitation
  documented by the test).
- `hasAssetReferences` recognises the link form.

### `tests/adapter/detail-presenter.test.ts` (+6 tests)

- PDF link form → chip with `href="#asset-…"` and icon.
- `nameByKey` fallback populates the chip label.
- Missing key → visible marker in the markdown output.
- No `asset:` href ever appears in the DOM.
- No `javascript:` href ever appears.
- Image MIME via link form now emits the unsupported marker
  (behaviour change pinned by the test).

### `tests/adapter/textlog-presenter.test.ts` (+4 tests)

- Non-image chip rendered inside a log entry.
- `nameByKey` fallback in a log entry.
- Missing marker in a log entry.
- Mixed plain + asset entries: only the entry with the chip is
  rewritten.

### `tests/adapter/action-binder.test.ts` (+2 tests)

- Clicking a `[href="#asset-KEY"]` anchor inside `root` triggers
  `URL.createObjectURL` (the download path), and the event is
  `preventDefault`-ed.
- A chip referring to an unknown asset key is a safe no-op — the
  click is still consumed (no fragment navigation), but no Blob URL
  is created.

## Invariants preserved

- **5-layer structure** — resolver in features, chip click in adapter.
- **core has no browser APIs** — unchanged.
- **Container is source of truth** — chip click reads dispatcher
  state, never mutates.
- **`html: false` hardening** — resolver output is CommonMark only.
- **`SAFE_URL_RE` allowlist** — unchanged; `#` fragments were already
  admitted.
- **Existing image resolver** — byte-identical when no link-form
  reference is present.
- **Asset Picker / Autocomplete contracts** — unchanged; the picker
  still emits `![…](asset:…)` for images only.
- **No new archetypes, no schema change, no new UserAction.**

## Known limitations

1. **`]` inside label.** The detection regex uses `[^\]]*` for label
   capture, so `[odd\]label](asset:key)` is left unchanged. Users can
   either avoid the character or quote it differently. Documented by
   an explicit test.
2. **Fenced code blocks.** The resolver pre-processes the raw
   markdown source, so a `[x](asset:key)` inside a triple-backtick
   code fence is still rewritten. markdown-it then renders the
   *rewritten* string inside the code block — the chip will not be
   clickable because it is plain text, and the user sees the icon
   label rather than the original syntax. A test pins the current
   trade-off. Future work: integrate with markdown-it's AST instead
   of the raw string.
3. **Single container.** Cross-container asset references are still
   out of scope. The resolver only consults the current
   `container.entries` / `container.assets`.
4. **No filename-based lookup.** The reference targets the opaque
   `asset_key`, not the filename. Users type keys via the picker or
   autocomplete; direct hand-typing is supported but rare.
5. **No preview.** A clicked chip downloads. For viewing without
   downloading, the user navigates to the attachment entry itself.

## Future scope

Captured so the next iteration has an entry point.

1. **Inline PDF preview** — render `[label](asset:pdf-key)` as an
   `<iframe>` when the caller opts in (config flag or explicit
   `?preview=1` hint in the URL fragment).
2. **Inline media players** — promote chips for `audio/*` and
   `video/*` to real `<audio>` / `<video>` elements, reusing the
   attachment preview pipeline.
3. **Relation-based resolution** — allow `[label](asset:<relation-name>)`
   when the current entry has a named relation to an attachment.
4. **Asset picker for non-image assets** — add a `/file` command
   or promote `/asset` to include all attachment types and pick the
   syntax (`!` or not) based on MIME.
5. **Safe SVG render** — parse SVG, strip scripts, and inline via the
   image resolver once the serializer exists.
6. **Cross-container federation** — support `@container/key` style
   references when the document-set export story lands.
7. **Drag-drop upload → chip** — drop a PDF onto a TEXT body and
   insert `[name](asset:new-key)` in one step.

## Hard limits (still)

- No raw HTML in markdown source. `html: false` is not revisited.
- No inline script execution. Chip hrefs are fragment URLs only.
- No cross-origin fetches. All asset bytes live inside the container.
