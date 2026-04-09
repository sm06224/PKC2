# Markdown Phase 2

## Purpose

Phase 2 strengthens the existing markdown renderer so that
TEXT and TEXTLOG display daily-use markdown content more faithfully,
without opening the door to rich-editor, math, diagrams, or
asset-resolution complexity.

Phase 1 established a minimal CommonMark renderer on top of `markdown-it`
with basic styling. Phase 2 extends that foundation with a small set of
high-value improvements only.

## Scope

### In scope (Phase 2)

- **GFM-style task lists** (`- [ ]` / `- [x]`)
- **Hardened link safety** (explicit URL scheme allowlist)
- **Hardened link attributes** (`rel="noopener noreferrer"`)
- **Language class on fenced code blocks** (hook for future highlighting)
- **Table polish** (border, header background)
- **Link styling** (hover, word-break)

### Out of scope (intentionally deferred)

- KaTeX / math rendering
- Mermaid / diagrams
- Real syntax highlighting (Prism / highlight.js)
- WYSIWYG markdown editor
- Asset picker / inline image upload
- BLOB URI resolution for `![img](asset:xxx)`
- HTML render mode (raw HTML in source stays disabled)
- Document-set export / typesetting

## Added expressions

### Task lists

```markdown
- [ ] todo item
- [x] done item
- [X] also done (uppercase)
- regular bullet (not affected)
```

Renders to:

```html
<ul>
  <li class="pkc-task-item"><input type="checkbox" class="pkc-task-checkbox" disabled> todo item</li>
  <li class="pkc-task-item"><input type="checkbox" class="pkc-task-checkbox" disabled checked> done item</li>
  <li class="pkc-task-item"><input type="checkbox" class="pkc-task-checkbox" disabled checked> also done</li>
  <li>regular bullet</li>
</ul>
```

Task items use `list-style: none` via the `pkc-task-item` class so the
bullet marker is hidden. Mixed lists (task + regular items) are supported:
only task items are transformed, regular items keep their bullet.

Checkboxes are `disabled` — this is a view-only rendering. Toggling
task state still goes through the editor. Making checkboxes interactive
is a future-phase concern.

### Fenced code block language class

```markdown
```js
const x = 1;
```
```

Renders to:

```html
<pre><code class="language-js">const x = 1;
</code></pre>
```

The `language-*` class is the standard hook used by Prism, highlight.js,
and many other syntax-highlighting libraries. Adding a highlighter in a
future phase requires no renderer changes — just drop a theme CSS and
call `Prism.highlightAll()` after render.

Fenced blocks without a language keep the original markup (no class).

## Safety hardening

### Link scheme allowlist

`validateLink` is overridden with an explicit allowlist:

| Scheme | Allowed? |
|---|---|
| `https:` / `http:` | Yes |
| `mailto:` | Yes |
| `tel:` | Yes |
| `ftp:` | Yes |
| `#fragment` | Yes |
| `/absolute` / `./relative` | Yes |
| No scheme (plain path) | Yes |
| `data:image/*` | Yes (only `gif`, `png`, `jpeg`, `webp`, `svg+xml`) |
| `ms-word:` / `ms-excel:` / `ms-powerpoint:` | Yes (Office URI schemes) |
| `ms-visio:` / `ms-access:` / `ms-project:` | Yes (Office URI schemes) |
| `ms-publisher:` / `ms-officeapp:` | Yes (Office URI schemes) |
| `ms-spd:` / `ms-infopath:` | Yes (Office URI schemes) |
| `onenote:` | Yes (OneNote deep link) |
| `javascript:` | **Blocked** |
| `vbscript:` | **Blocked** |
| `file:` | **Blocked** |
| `data:text/html` | **Blocked** |
| Unknown `ms-*:` (e.g. `ms-evil:`) | **Blocked** |
| Any other scheme | Blocked |

Blocked URLs fall through markdown-it's default "drop the href" path —
the link text is preserved but the `<a>` tag gets no `href` attribute.

### Office URI scheme support

Microsoft's [Office URI Schemes](https://learn.microsoft.com/office/client-developer/office-uri-schemes)
allow a web page to hand-off a document to the Office desktop client:

```markdown
[Edit in Word](ms-word:ofe|u|https://example.com/path/doc.docx)
[View in Excel](ms-excel:ofv|u|https://example.com/sheet.xlsx)
[Open Notebook](onenote:https://example.com/notebook.one)
```

The allowlist is **explicit**: only the 10 documented schemes plus
`onenote:` pass through. `ms-foo:` or any other undocumented
`ms-*:` scheme is still blocked, so the allowlist cannot be used as a
general escape hatch by an attacker-crafted link.

Matching is case-insensitive (e.g. `MS-WORD:` also works) because
URL schemes are case-insensitive per RFC 3986.

These links still receive the same `target="_blank"` and
`rel="noopener noreferrer"` hardening as `http(s)` links. The `|`
characters inside the URL may be URL-encoded to `%7C` by markdown-it's
URL normalizer — this is expected and the Office URI handler accepts
both encoded and unencoded forms.

### Link rel attribute

All `<a>` tags now get `rel="noopener noreferrer"`:

- `noopener` prevents the destination from accessing `window.opener`
- `noreferrer` prevents leaking the referring document URL

The second flag matters because the PKC2 bundle is often opened from a
local `file://` path, which should not leak to external destinations.

### Raw HTML in source

Phase 1's `html: false` setting is preserved. `<script>`, `<iframe>`,
`<img onerror>`, etc. in the source text are escaped as literal strings
and never rendered as tags.

## Effect on TEXT / TEXTLOG

Both `text` and `textlog` archetypes use the same `renderMarkdown()` /
`hasMarkdownSyntax()` helpers, so Phase 2 improvements apply uniformly:

- A TEXTLOG entry containing `- [ ] follow up` now displays as a
  disabled checkbox next to the label
- A TEXT note with a `[click](javascript:alert(1))` link is safely
  neutralized
- A code block in a TEXT entry marked ```` ```sql ```` now carries the
  `language-sql` class (ready for a future highlighter)

The `hasMarkdownSyntax()` regex is extended to match task-list prefix
`- [ ]` / `- [x]`, so entries consisting only of task items are now
rendered as markdown instead of falling back to the `<pre>` plain-text
path.

Plain-text fallback is preserved: entries with no markdown syntax still
render through `<pre>` unchanged.

## Implementation notes

### Task list rule placement

Task list transformation runs in `md.core.ruler.after('inline', ...)`.
By this point:

- The block parser has already produced `list_item_open` / `paragraph_open` /
  `inline` / `paragraph_close` / `list_item_close` sequences
- The inline parser has populated `inline.children` (the text tokens)
- The renderer has not yet run

The rule walks tokens, detects `inline` tokens whose preceding two
tokens are `paragraph_open` then `list_item_open`, and whose content
begins with `[ ]` / `[x]` / `[X]`. Matched items get:

1. `class="pkc-task-item"` added to the `<li>` (via `attrJoin`)
2. The `[ ]` marker stripped from both `token.content` and the first
   text child of `token.children`
3. An `html_inline` checkbox token prepended to `token.children`

Using `html_inline` works even with `html: false` because the option only
disables the parser rules that recognize raw HTML in source text — the
renderer still emits the content of `html_inline` tokens verbatim, and
our checkbox markup is constructed safely in code.

### Why not add markdown-it-task-lists plugin?

The official `markdown-it-task-lists` plugin does the same thing but
pulls in another dependency. A ~30-line core rule is simpler, gives us
exact control over the class names (`pkc-task-item`, `pkc-task-checkbox`),
and avoids the dependency. If future requirements (e.g. interactive
toggling) outgrow this, switching to the plugin is trivial.

## Future scope

Captured here so the next phase has a clear entry point:

### Phase 3 candidates

1. **Asset reference resolution** — `![img](asset:xxx)` or
   `![img](pkc://lid/filename)` should transparently resolve to the
   asset's base64 data URI from `container.assets`. This is the big
   future link, and it needs careful design around streaming, caching,
   and editor preview.
2. **Interactive task lists** — clicking a view-mode checkbox would
   dispatch `QUICK_UPDATE_ENTRY` to toggle `[ ]` ↔ `[x]`. Requires
   tracking source line numbers through the renderer.
3. **Syntax highlighting** — drop Prism or highlight.js behind the
   existing `language-*` hook.
4. **Footnotes** — `[^1]` / `[^1]: ...`.
5. **Callout containers** — `::: note`, `::: warning`.

### Hard limits (still)

Math, diagrams, WYSIWYG editing, and full HTML rendering remain out of
scope until a concrete user requirement justifies them.
