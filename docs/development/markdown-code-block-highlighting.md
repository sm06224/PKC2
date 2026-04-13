# Markdown fenced code block syntax highlighting

## Goal

Give Markdown fenced code blocks basic syntax highlighting in rendered
views (detail pane, popped entry window, exported single-HTML viewer,
print) so a technical memo like a `ts` snippet or a `bash` one-liner
reads as code, not as prose.

Non-goals:

- CDN or runtime loader. PKC2 is a single-HTML product — everything
  must bundle into `dist/pkc2.html`.
- Editor-time live highlighting (textarea). Out of scope; only the
  rendered side is syntax-coloured.
- A full-featured highlighter (Prism / highlight.js). We pay ~8KB for
  a 9-language walker instead of ~100KB for a subset of highlight.js.
- Line numbers, code folding, collapse, language auto-detection.

## Scope / supported languages

| Canonical | Aliases |
| --------- | ------- |
| `javascript` | `js`, `jsx` |
| `typescript` | `ts`, `tsx` |
| `json` | — |
| `html` | — |
| `css` | — |
| `bash` | `sh`, `shell`, `zsh` |
| `yaml` | `yml` |
| `diff` | — |
| `sql` | — |
| `powershell` | `ps1`, `pwsh` |

Fence info-strings outside this list (e.g. ` ```rust `, ` ``` `)
fall back to the existing plain-escape-and-wrap behaviour:
`<pre><code class="language-xxx">…escaped text…</code></pre>`.

## Design

A pure tokenizer in `features/`:

    src/features/markdown/code-highlight.ts

- Sticky-regex walk. Each supported language declares an ordered
  `Rule[]` of `{ re: RegExp (with y flag), kind }` pairs. At every
  position the tokenizer tries rules in order; the first rule whose
  match starts exactly at the cursor wins. Unmatched characters are
  emitted verbatim. This keeps the walker O(n * rules) with a small
  constant.
- `mkRule` wraps a source regex, preserving its own flags (`i`, `m`)
  and adding the mandatory `y`. The `g` flag is dropped because it
  conflicts with sticky-mode `lastIndex` semantics.
- Line-anchored rules use `^` + the `m` flag + sticky `y`. Diff hunk
  headers and YAML keys rely on this.
- `highlightCode` HTML-escapes **every** chunk it emits — both matched
  tokens and the plain gaps between them. Source like `"<script>"`
  inside a JS string cannot escape the surrounding `<code>` element.
- `isHighlightable(lang)` / `listSupportedLanguages()` drive integration
  and tests.

Wiring into the renderer:

    src/features/markdown/markdown-render.ts

`markdown-it` is instantiated with a `highlight: (str, lang) => …`
option. When `lang` is known we return the pre-highlighted inner HTML
(escaped by us), and markdown-it wraps it as
`<pre><code class="language-xxx">…</code></pre>` as usual. When `lang`
is unknown / missing, we return `''` and markdown-it falls back to its
own default (plain `utils.escapeHtml` + wrap).

## CSS

Token kinds map to short classes: `pkc-tok-comment`, `pkc-tok-string`,
`pkc-tok-keyword`, `pkc-tok-number`, `pkc-tok-builtin`, `pkc-tok-variable`,
`pkc-tok-type`, `pkc-tok-attr`, `pkc-tok-tag`, `pkc-tok-meta`,
`pkc-tok-ins`, `pkc-tok-del`, `pkc-tok-hunk`.

Colour is driven by CSS variables `--c-tok-*` declared in
`src/styles/base.css`, with a full set for both light and dark themes.
All selectors are scoped under `.pkc-md-rendered pre code` so token
classes can't leak into any non-markdown surface.

Three rendering surfaces need the token CSS:

1. **Main window** — `src/styles/base.css` (token classes + theme vars).
2. **Popped entry window** — `src/adapter/ui/entry-window.ts`
   forwards the `--c-tok-*` variables through `getParentCssVars()` and
   inlines the token selectors into the child document's stylesheet so
   a popped viewer matches the main theme.
3. **Exported standalone HTML** — `src/adapter/ui/rendered-viewer.ts`
   hardcodes print-safe colours for each token class. The export has
   no access to the main-app theme vars, so literal values are used.

## Safety

- Every emitted character goes through `escapeHtml`. `<`, `>`, `&`, `"`
  in source never reach the DOM un-escaped. The test suite asserts
  this explicitly for a JS string containing `<script>`.
- Unknown languages skip the highlighter entirely; markdown-it's
  default escape path runs unchanged.
- Empty / null / whitespace-only language tags fall straight through
  to the plain path.

## Bundle impact

- `code-highlight.ts` ~7–8 KB source, ~3 KB gzipped.
- 15 new CSS token selectors + theme-variable declarations in
  `base.css`, a similar block inside `entry-window.ts`'s child-window
  stylesheet, and a hardcoded-colour block in `rendered-viewer.ts`
  (print-safe shades).
- Total bundle delta is small enough to be invisible at the current
  `dist/bundle.js` size; no new runtime dependency is introduced.

## Tests

- `tests/features/markdown/code-highlight.test.ts` — unit tests for
  the tokenizer: per-language coverage, alias resolution, HTML escape,
  empty/null language handling, zero-width span avoidance, whitespace
  preservation.
- `tests/features/markdown/markdown-render.test.ts` — integration
  tests confirming the markdown-it pipeline emits `pkc-tok-*` spans
  for known languages, falls back to plain escaped text for unknown
  languages, and preserves the XSS safety property end-to-end.

## Future work (deliberately out of scope)

- Editor-side live syntax highlighting inside textareas.
- Additional languages (python, go, rust, …) can be added by
  appending a new `Rule[]` entry to `LANGS` in `code-highlight.ts`
  plus a matching alias row — no infra change required.
- A `copy` button on code blocks.
- Language auto-detection when the fence info-string is missing.
