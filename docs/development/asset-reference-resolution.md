# Asset Reference Resolution — Foundation

## Purpose

Allow TEXT and TEXTLOG bodies to embed images that are already stored
inside the container's asset pool (via the ATTACHMENT archetype) by
writing a short markdown reference. No upload-from-the-editor story, no
binary streaming, no asset picker. Just: "if I know the asset_key, I can
show the image inline in a note."

This is the foundation (Phase 1) — scope is intentionally tight. Future
phases can layer richer affordances (picker, autocomplete, export) on
top without revisiting the syntax or the storage contract.

## Scope

### In scope (foundation)

- **One reference syntax**: `![alt](asset:asset_key)`
- **Image display only**: the reference must use the markdown image form
  (`!`-prefixed). Plain link references `[text](asset:key)` are ignored.
- **Raster image MIME allowlist**: `image/png`, `image/jpeg`,
  `image/gif`, `image/webp`.
- **Visible fallback markers** when a reference cannot be resolved.
- **Pre-processing pass** in the presenter layer — the markdown renderer
  itself stays stateless.
- **Both TEXT and TEXTLOG**: same helper is wired into the text
  presenter and into each log entry of the textlog presenter.

### Out of scope (intentionally deferred)

- Asset picker / insert-from-pool UI
- Editor autocomplete on `asset:`
- `pkc://` or other namespaced URI schemes
- SVG inline embedding (see "Why SVG is excluded" below)
- Non-image assets (pdf, audio, video, zip …)
- Document-set export / cross-container asset federation
- Interactive preview-on-hover
- BLOB URL caching (all resolution produces inline `data:` URIs)

## Adopted reference syntax

```markdown
![alt text](asset:ast-abc-001)
![with title](asset:ast-abc-001 "tooltip")
![](asset:ast-abc-001)
```

A reference is:

1. Literal `![`
2. Alt text (any chars except `]`, including empty)
3. `](asset:`
4. Asset key (any chars except whitespace, `)`, `"`)
5. Optional ` "title"` suffix
6. Closing `)`

The asset key format follows the existing `generateAssetKey()` contract
(`ast-{ts-base36}-{rand}`), so the safe character class used for
fallback display is `[A-Za-z0-9_-]`.

### Why only one syntax?

Earlier drafts considered several alternatives:

| Candidate | Why rejected |
|---|---|
| `![alt](pkc://lid/filename)` | Requires a filename index; collides with relation references; longer. |
| `![alt](@ast-xxx)` | Not valid markdown — would require a custom link rule. |
| `<asset:ast-xxx>` (autolink) | Loses alt text; harder to style. |
| Mixed image + link: `[text](asset:key)` | Breaks the "images only" invariant and forces us to decide how a clicked asset-link should behave (download? modal?). Deferred on purpose. |
| Custom HTML: `<pkc-asset key="…"/>` | Violates `html: false` hardening from Phase 1. |

`![alt](asset:key)` wins because:

- It **is** valid CommonMark image syntax. markdown-it parses it
  natively — we only need to rewrite the URL before rendering.
- It keeps alt text, which is important for accessibility and for the
  fallback marker when resolution fails.
- It is trivially scannable with a regex in a pre-processing pass, so
  the renderer itself has zero knowledge of asset storage.
- It looks like "normal markdown image with a custom scheme," which is
  what users will intuit.

One syntax, one mental model, one code path. Additional affordances
(autocomplete, picker) can all desugar to this same string.

## Resolved MIMEs

| MIME | Resolution |
|---|---|
| `image/png` | Inline `data:image/png;base64,…` |
| `image/jpeg` | Inline `data:image/jpeg;base64,…` |
| `image/gif` | Inline `data:image/gif;base64,…` |
| `image/webp` | Inline `data:image/webp;base64,…` |
| `image/svg+xml` | **Unsupported** (see below) |
| Anything else | **Unsupported** |

### Why SVG is excluded

SVG is technically an image but semantically an executable document —
it can carry `<script>`, event handlers, and external references. The
existing attachment preview path renders SVG inside a sandboxed
`<iframe>` precisely because of this. Embedding the same SVG inline in
a markdown-rendered `<img>` would bypass that sandbox.

Until a dedicated safe-SVG serializer is in place, SVG assets fall
through to the `*[unsupported asset: key]*` fallback even though they
are an image format.

### Why only raster formats?

The four allowed MIMEs cover the realistic everyday note-taking case
(screenshots, photos, animated GIFs, modern web images). Adding more
types requires a per-format safety review, so the allowlist is explicit.

## Fallback policy

When resolution cannot succeed, the reference is **replaced with a
visible italic marker** instead of producing a broken image:

| Condition | Replacement |
|---|---|
| Key not in `container.assets` | `*[missing asset: key]*` |
| Key has no MIME in the attachment index | `*[missing asset: key]*` |
| MIME is not in the allowlist | `*[unsupported asset: key]*` |

The key printed in the marker is **sanitized** to `[A-Za-z0-9_-]` —
any other character is stripped so that a crafted asset key cannot
inject markdown metacharacters (`*`, `_`, `` ` ``, `<`, etc.) into the
rendered output.

Rationale:

- Silent failure (removing the reference) hides data loss and confuses
  users who expect to see an image.
- Broken `<img>` (leaving `asset:` in the URL) produces a
  browser-level "broken image" icon with no context.
- A visible marker tells the user *something was here* and *which key
  is missing*, making it actionable.

## Call site: presenters

The resolver lives in the features layer; the adapter layer decides
when to call it.

### Text presenter (`src/adapter/ui/detail-presenter.ts`)

```ts
renderBody(entry, assets?, mimeByKey?) {
  let source = entry.body;
  if (assets && mimeByKey && hasAssetReferences(source)) {
    source = resolveAssetReferences(source, { assets, mimeByKey });
  }
  if (hasMarkdownSyntax(source)) {
    // render markdown …
  }
}
```

### Textlog presenter (`src/adapter/ui/textlog-presenter.ts`)

Each log entry's `text` is pre-processed the same way, independently,
before markdown rendering.

### Renderer wiring (`src/adapter/ui/renderer.ts`)

At render time the renderer builds a lightweight `mimeByKey` map from
`container.entries` by walking the attachment entries:

```ts
function buildAssetMimeMap(container) {
  const map = {};
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(entry.body);
    if (att.asset_key && att.mime) map[att.asset_key] = att.mime;
  }
  return map;
}
```

Both the selected-entry view and the detached entry panel pass
`container.assets` and this `mimeByKey` map to the presenter. Other
archetypes (attachment etc.) keep their existing signature.

## Safety notes

- **No `javascript:` / `data:text/html`** can ever appear in the
  rewritten URL: we build the data URI from a fixed template
  `data:{mime};base64,{data}`, and `{mime}` is guarded by the allowlist
  regex before any substitution happens.
- **No HTML injection via alt text**: the resolver does not touch alt
  text; it is passed back into markdown-it which escapes it.
- **No HTML injection via fallback marker**: the rendered key is
  filtered to `[A-Za-z0-9_-]`. The marker itself uses plain markdown
  emphasis (`*…*`).
- **No reliance on raw HTML parsing**: `html: false` stays set on the
  markdown-it instance. All Phase 2 link hardening (scheme allowlist,
  `rel="noopener noreferrer"`) still applies.
- **Title sanitization**: if a reference carries an optional title
  (`"tooltip"`), inner `"` characters are escaped to `&quot;` so they
  cannot prematurely terminate the markdown URL.

## Testing

New test file — `tests/features/markdown/asset-resolver.test.ts`
(28 tests):

- `hasAssetReferences` — empty input, non-matching markdown, positive
  match, mid-paragraph, repeated calls (regex state reset)
- Resolution — png, gif, alt text preserved, title preserved, empty
  alt, multiple references, non-asset images untouched, link syntax
  untouched
- Fallback — unknown key, missing asset data, missing MIME,
  unsupported MIME, SVG rejected, mixed resolved + fallback
- Security — special chars in key stripped for display, HTML in alt
  text not executed, never emits `javascript:`, never emits
  `data:text/html`, path-separator keys rejected via fallback
- Edge cases — empty input, unrelated markdown untouched, reference at
  start, reference at end

Presenter integration tests — `tests/adapter/detail-presenter.test.ts`
(+7 tests):

- Data URI appears in output
- Missing asset marker visible
- Unsupported MIME marker visible
- Plain text body unaffected when neither markdown nor asset refs
- Backward compatible when called without asset context
- `[click](asset:key)` not resolved (images only)
- Alt text preserved through resolution

Presenter integration tests — `tests/adapter/textlog-presenter.test.ts`
(+3 tests):

- Asset reference inside one log entry resolves
- Missing asset marker in a log entry
- Mixed plain + asset entries: only the asset entry is rewritten

## Future scope

Captured here so the next iteration has a clear entry point.

1. **Asset picker from the editor.** A small toolbar or slash command
   that lists attachment entries in the current container and inserts
   `![filename](asset:key)` at the cursor.
2. **Editor autocomplete on `asset:`.** Typing `asset:` inside an
   editor should suggest known keys (by filename) using the same
   `mimeByKey` index.
3. **Hover-over thumbnail in the editor.** For referenced keys in edit
   mode, show a resolved preview in a popover without switching to
   view mode.
4. **Non-image asset handling.** `![label](asset:pdf-key)` could
   render a download chip or an icon link for `application/pdf`,
   `audio/*`, `video/*`. Each new MIME needs a safety review.
5. **SVG safe-render.** Parse the SVG, strip scripts and external
   references, then embed inline. Or keep the sandboxed-iframe path
   and inject the iframe from the resolver.
6. **Cross-container / document-set export.** When exporting a TEXT
   entry as a self-contained document, follow the asset references
   and bundle only the referenced assets into the export.
7. **Relation-based resolution.** If a TEXT entry relates to an
   ATTACHMENT entry via a named relation, allow
   `![alt](asset:<relation-name>)` to resolve through the graph
   instead of requiring the raw key.
8. **Cache BLOB URLs for large assets.** Inline `data:` URIs are
   simple but memory-heavy. For large images, the presenter could mint
   a BLOB URL once per render cycle and reuse it.

## Hard limits (still)

- No raw HTML tags in markdown source. `html: false` is not revisited.
- No inline script execution. Data URIs are restricted to the image
  MIME allowlist.
- No cross-origin fetches. All asset bytes are inside the container.
