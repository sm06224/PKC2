/**
 * Markdown-to-HTML renderer powered by markdown-it.
 *
 * Features layer — pure function, no browser APIs.
 * markdown-it is chosen for:
 *   - Full CommonMark compliance
 *   - Plugin ecosystem (future: KaTeX, footnotes, containers)
 *   - Customizable rendering (future: typesetting, document generation)
 *   - XSS-safe by default (HTML input is escaped)
 *
 * Current configuration:
 *   - HTML tags in source: disabled (XSS prevention)
 *   - Linkify: enabled (auto-detect URLs)
 *   - Typographer: enabled (smart quotes, dashes)
 *   - Breaks: enabled (newline → <br>)
 *   - Tables, strikethrough: enabled via base config
 *
 * Phase 2 additions:
 *   - GFM-style task lists (`- [ ]` / `- [x]`)
 *   - Hardened link safety (`rel="noopener noreferrer"`)
 *   - Explicit safe URL scheme allowlist
 *   - Language class hint on fenced code blocks
 */

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { makeSlugCounter } from './markdown-toc';
import { highlightCode, isHighlightable } from './code-highlight';
import { renderCsvFence } from './csv-table';
import { parsePortablePkcReference } from '../link/permalink';
import {
  isCardPresentationLabel,
  parseCardPresentation,
} from '../link/card-presentation';

const md = new MarkdownIt({
  html: false,          // Disable HTML tags in source (XSS safety)
  linkify: true,        // Auto-convert URL-like text to links
  typographer: true,    // Smart quotes, em-dash, etc.
  breaks: true,         // Convert \n to <br> for easier editing
  langPrefix: 'language-', // Code block language class prefix (for highlighting token selectors)
  // Fenced code block syntax highlighting. We return already-escaped
  // HTML for known languages; markdown-it then wraps it in
  // `<pre><code class="language-xxx">...</code></pre>`. For unknown
  // / empty languages, returning an empty string lets markdown-it
  // fall back to its default escape-and-wrap behaviour — preserving
  // the historical plain appearance. See code-highlight.ts.
  highlight: (str, lang) => {
    if (!isHighlightable(lang)) return '';
    return highlightCode(str, lang);
  },
});

// ── Link hardening ────────────────────────────────────
//
// Phase 2: tighten the default validateLink to an explicit allowlist.
// Only http(s), mailto, tel, relative paths, fragment anchors, and
// safe image data URIs pass through. Everything else (javascript:,
// vbscript:, file:, data:text/html, etc.) is rejected.
//
// Extended: Microsoft Office URI schemes are also allowed so that
// [Edit](ms-word:ofe|u|https://…/file.docx) style links open the
// corresponding Office desktop app (Word / Excel / PowerPoint /
// OneNote etc.) via the OS URL handler. The allowlist is explicit —
// only the schemes documented in the Office URI Schemes reference
// pass through; arbitrary `ms-*:` schemes remain blocked.
// https://learn.microsoft.com/office/client-developer/office-uri-schemes

// `entry:` is PKC2's internal cross-entry link scheme (see
// `docs/development/textlog-viewer-and-linkability-redesign.md` §6.5
// and `src/features/entry-ref/entry-ref.ts`). `pkc:` is the external
// shareable permalink scheme defined by
// `docs/spec/pkc-link-unification-v0.md` §4. Both schemes are on the
// safe allowlist so markdown-it emits the `<a>` at all; the link_open
// rule below then tags them for the right in-app behaviour (internal
// navigation for `entry:`, cross-container placeholder for `pkc:`).
//
// `asset:` is intentionally NOT on this allowlist. Asset references
// are preprocessed away by `asset-resolver.ts` BEFORE the text reaches
// markdown-it (`![alt](asset:key)` → inline `<img src="data:…">`,
// `[label](asset:key)` → inline chip link to `#asset-<key>`). If an
// `asset:` URL somehow leaked past that preprocessor — or if a caller
// invokes `renderMarkdown()` directly without running the resolver —
// the safe default is for markdown-it's `validateLink` to reject it
// so the raw text survives as plain characters instead of being
// turned into a live `<a href="asset:…">` that points nowhere. The
// card-presentation hook (§5, `pkc-card` core rule below) therefore
// only sees `@[card](asset:…)` when the caller has arranged for the
// tokens to be produced some other way; asset-target cards in the
// normal pipeline are handled at the asset-resolver coordination
// layer in a future slice, not here.
const SAFE_URL_RE = /^(https?:|mailto:|tel:|ftp:|entry:|pkc:|#|\/|\.\/|\.\.\/|[^:]*$)/i;
const SAFE_DATA_IMG_RE = /^data:image\/(gif|png|jpeg|webp|svg\+xml);/i;
const SAFE_OFFICE_URI_RE =
  /^(?:ms-(?:word|excel|powerpoint|visio|access|project|publisher|officeapp|spd|infopath)|onenote):/i;

md.validateLink = function (url: string): boolean {
  const trimmed = url.trim();
  if (SAFE_DATA_IMG_RE.test(trimmed)) return true;
  if (SAFE_OFFICE_URI_RE.test(trimmed)) return true;
  return SAFE_URL_RE.test(trimmed);
};

// Add target="_blank" and rel="noopener noreferrer" to all links.
// noreferrer prevents the destination from seeing the document URL,
// which matters when the bundle is opened from a local file path.
const defaultLinkOpen = md.renderer.rules.link_open ??
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

// ── B-1 (USER_REQUEST_LEDGER S-16, 2026-04-14): CSV / TSV / PSV
//    fenced blocks render as `<table>`. Short-circuits BEFORE the
//    `highlight:` hook so CSV blocks bypass syntax highlighting
//    (they're not code). On parse failure or unknown lang, fall
//    through to the default fence renderer (which then runs the
//    highlight hook, preserving B-2 behaviour for code blocks).
const defaultFence = md.renderer.rules.fence ??
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };
md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const token = tokens[idx]!;
  // 領域 10-1 PR 2 hotfix: tagSourceLines puts data-pkc-source-line
  // on the fence token, but renderCsvFence emits its own HTML and
  // bypasses token.attrs entirely. Hoist the source-line attrs onto
  // the wrapper div so the active-block lookup can find the fence.
  const sourceLineAttrs = collectSourceLineAttrs(token);
  const html = renderCsvFence(token.content, token.info);
  if (html !== null) return wrapWithCopyButton(html, 'code', sourceLineAttrs);
  const fenceHtml = defaultFence(tokens, idx, options, env, self);
  return wrapWithCopyButton(fenceHtml, 'code', sourceLineAttrs);
};

// PR #196: table copy button overlay. Wraps the entire <table>…</table>
// in a `<div class="pkc-md-block">` carrying the copy button. The
// button reads the rendered table cell text on click (via
// action-binder) and writes both `text/plain` (TSV) and `text/html`
// (the table's own HTML) to the clipboard via `copyMarkdownAndHtml`-
// style multi-MIME write.
md.renderer.rules.table_open = function (tokens, idx, options, _env, self) {
  // 領域 10-1 PR 2 hotfix: also propagate source-line attrs onto the
  // pkc-md-block wrapper so caret-on-table-line activates the wrapper
  // visually (the inner <table> still carries its own attrs through
  // self.renderToken). The wrapper appearing first in DOM order means
  // querySelectorAll('[data-pkc-source-line]') sees it before the
  // <table> — fine for active-block lookup since both anchors share
  // the same source range.
  const token = tokens[idx]!;
  const sourceLineAttrs = collectSourceLineAttrs(token);
  return `<div class="pkc-md-block" data-pkc-md-block-kind="table"${sourceLineAttrs}><button class="pkc-md-copy-btn" data-pkc-action="copy-md-block" data-pkc-copy-kind="table" type="button" aria-label="コピー" title="コピー">⧉</button>${self.renderToken(tokens, idx, options)}`;
};
md.renderer.rules.table_close = function (tokens, idx, options, _env, self) {
  return `${self.renderToken(tokens, idx, options)}</div>`;
};

/**
 * PR #196: wrap a code block's HTML in a copy-button host. The button
 * carries `data-pkc-action="copy-md-block"` so the existing
 * `action-binder` event delegation picks it up. The host element is
 * `position: relative` so the button can sit absolutely top-right.
 *
 * 領域 10-1 PR 2 hotfix: optional `extraAttrs` carries the source-line
 * attribute string (e.g. ' data-pkc-source-line="5" data-pkc-source-end="13"')
 * built from the originating token. Custom fence / table renderers
 * emit their own HTML and bypass token.attrs, so the wrapper has to
 * propagate these attrs explicitly for source ↔ preview sync to work.
 */
function wrapWithCopyButton(
  innerHtml: string,
  kind: 'code' | 'table',
  extraAttrs: string = '',
): string {
  return `<div class="pkc-md-block" data-pkc-md-block-kind="${kind}"${extraAttrs}><button class="pkc-md-copy-btn" data-pkc-action="copy-md-block" data-pkc-copy-kind="${kind}" type="button" aria-label="コピー" title="コピー">⧉</button>${innerHtml}</div>`;
}

/**
 * Build a `data-pkc-source-line` / `data-pkc-source-end` attribute
 * string from raw values. Token-agnostic — designed to be re-used by
 * future renderer paths that don't go through markdown-it (領域 10-3
 * 内部 IR、PKC-Message dispatch to extension, etc.). Returns '' when
 * `start` is null/undefined so callers can splice the result
 * unconditionally.
 *
 * Internally this is the kernel of the source-line anchor contract:
 * **the only HTML output that matters for the source ↔ preview sync
 * layer is the attribute string itself**, regardless of which renderer
 * produced it. Keeping this generic now means the hypothetical IR
 * walker (領域 10-3) can call `makeSourceLineAttrs(node.startLine,
 * node.endLine)` directly — no markdown-it Token shim required.
 */
export function makeSourceLineAttrs(
  start: number | string | null | undefined,
  end?: number | string | null | undefined,
): string {
  if (start === null || start === undefined) return '';
  let out = ` data-pkc-source-line="${start}"`;
  if (end !== null && end !== undefined) {
    out += ` data-pkc-source-end="${end}"`;
  }
  return out;
}

/**
 * Collect `data-pkc-source-line` / `data-pkc-source-end` attrs from a
 * markdown-it token (set by `tagSourceLines`) into an attr string.
 *
 * **Public — extension contract for markdown-it custom renderers**.
 * `tagSourceLines` writes the source-line anchor pair onto block-level
 * tokens via `token.attrSet`. The default markdown-it renderer copies
 * `token.attrs` onto the rendered element automatically — but **custom
 * renderers that emit their own HTML string bypass that copy**, so the
 * source-line attrs are silently dropped and the source ↔ preview
 * sync layer cannot find the block.
 *
 * Any custom renderer registered on `md.renderer.rules.<token>` MUST
 * call `collectSourceLineAttrs(token)` and splice the result onto the
 * **outermost element** of its emitted HTML. The 領域 10-1 PR 2
 * hotfix established this contract for `fence` (CSV-to-table) and
 * `table_open` (copy-button wrapper); future renderer additions
 * (e.g. clickable image / ToC / per-archetype embed) MUST follow the
 * same pattern.
 *
 * Pattern:
 *
 * ```ts
 * md.renderer.rules.my_block = function (tokens, idx, options, env, self) {
 *   const token = tokens[idx]!;
 *   const sourceLineAttrs = collectSourceLineAttrs(token);
 *   return `<div class="my-wrapper"${sourceLineAttrs}>...</div>`;
 * };
 * ```
 *
 * The opt-in flag `RenderMarkdownOptions.sourceLineAnchors` controls
 * whether the upstream `tagSourceLines` runs at all — view-mode
 * rendering skips it for backwards compatibility, so this helper
 * returns `''` when no anchors were stamped (silent no-op, safe).
 *
 * Internally a thin wrapper around `makeSourceLineAttrs(start, end)`
 * — that primitive is reusable by future non-markdown-it renderers
 * (領域 10-3 IR, PKC-Message extension dispatch, etc.).
 *
 * See `docs/development/markdown-render-scope.md` §「拡張時の
 * source-line anchor 規約」for the full extension contract.
 */
export function collectSourceLineAttrs(token: Token): string {
  return makeSourceLineAttrs(
    token.attrGet('data-pkc-source-line'),
    token.attrGet('data-pkc-source-end'),
  );
}

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx]!;
  const hrefIdx = token.attrIndex('href');
  const href = hrefIdx >= 0 ? (token.attrs?.[hrefIdx]?.[1] ?? '') : '';
  // `entry:` links stay in-app: they are routed through
  // `action-binder`'s `navigate-entry-ref` handler which parses the
  // fragment via `parseEntryRef` and scrolls to the right
  // `<section id="day-...">`, `<article id="log-...">`, or heading
  // slug anchor. Adding `target="_blank"` here would pop a new tab
  // for every in-app jump; `rel="noopener noreferrer"` is also
  // unnecessary for a link that never actually navigates. The
  // `data-pkc-entry-ref` attribute carries the raw href so the
  // handler can read the unescaped original (the parser accepts
  // the same grammar formatted by `formatEntryRef`).
  if (href.startsWith('entry:')) {
    token.attrSet('data-pkc-action', 'navigate-entry-ref');
    token.attrSet('data-pkc-entry-ref', href);
  } else if (href.startsWith('pkc:')) {
    // Portable PKC Reference — spec/pkc-link-unification-v0.md §5.5
    // (post-correction). Despite the historical name, `pkc://` is
    // NOT a permalink (no OS protocol handler, not clickable in
    // external apps). It is the **machine identifier form** used
    // by paste conversion / cross-PKC marshalling.
    //
    // Paste conversion normally demotes same-container Portable
    // References to `entry:` / `asset:` internal refs, so any
    // `pkc://` that lands in a rendered body is almost always
    // cross-container. We tag it with placeholder data-attributes
    // so CSS can render it as a portable-reference badge, and
    // keep the raw href so a future resolver (P2P / import / share
    // UI) can pick it up verbatim.
    //
    // Malformed `pkc://...` values fall back to the default
    // external-link treatment below so the body isn't silently
    // suppressed.
    const parsed = parsePortablePkcReference(href);
    const rawEnv = (env ?? {}) as { currentContainerId?: unknown };
    const currentContainerId =
      typeof rawEnv.currentContainerId === 'string' ? rawEnv.currentContainerId : '';
    if (parsed && currentContainerId && parsed.containerId === currentContainerId) {
      // Same-container Portable Reference fallback rendering
      // (spec/pkc-link-unification-v0.md §5.5). Paste conversion
      // normally demotes `pkc://<self>/...` to `entry:<lid>`
      // before the body ever reaches the renderer, but a writer
      // can also type the portable form by hand, or an older
      // import can leave it in place. When that happens we make
      // the anchor behave exactly like the equivalent `entry:`
      // internal reference so the click path stays consistent:
      //
      //   pkc://<self>/entry/<lid>           → entry:<lid>
      //   pkc://<self>/entry/<lid>#log/xyz   → entry:<lid>#log/xyz
      //
      // Entry portable references route through
      // `navigate-entry-ref` (same handler that services `entry:`
      // anchors). Asset portable references route through the new
      // `navigate-asset-ref` handler (Phase 1 step 4 / audit G3),
      // which hops to the attachment entry whose `body.asset_key`
      // matches — mirroring the External Permalink receive
      // behaviour for `&asset=<key>`.
      //
      //   pkc://<self>/entry/<lid>           → entry:<lid>
      //   pkc://<self>/entry/<lid>#log/xyz   → entry:<lid>#log/xyz
      //   pkc://<self>/asset/<key>           → owner attachment entry
      if (parsed.kind === 'entry') {
        const frag = parsed.fragment ?? '';
        token.attrSet('data-pkc-action', 'navigate-entry-ref');
        token.attrSet('data-pkc-entry-ref', `entry:${parsed.targetId}${frag}`);
      } else {
        // kind === 'asset'
        token.attrSet('data-pkc-action', 'navigate-asset-ref');
        token.attrSet('data-pkc-asset-key', parsed.targetId);
      }
      token.attrSet('rel', 'noopener noreferrer');
    } else if (parsed) {
      // Cross-container (or currentContainerId is unknown — treat
      // as cross for safety): emit the portable-reference placeholder.
      const cls = token.attrGet('class');
      const placeholderClass = 'pkc-portable-reference-placeholder';
      token.attrSet('class', cls ? `${cls} ${placeholderClass}` : placeholderClass);
      token.attrSet('data-pkc-portable-container', parsed.containerId);
      token.attrSet('data-pkc-portable-kind', parsed.kind);
      token.attrSet('data-pkc-portable-target', parsed.targetId);
      if (parsed.fragment !== undefined) {
        token.attrSet('data-pkc-portable-fragment', parsed.fragment);
      }
      token.attrSet(
        'title',
        `Portable PKC ${parsed.kind} · container ${parsed.containerId} · target ${parsed.targetId}`,
      );
      token.attrSet('rel', 'noopener noreferrer');
    } else {
      // Malformed pkc:// — treat as ordinary external URL.
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    }
  } else {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

// ── Entry transclusion placeholder (Slice 5-B) ────────
//
// `![alt](entry:<lid>[#frag])` is the transclusion syntax. markdown-it
// would otherwise emit `<img src="entry:...">` and the browser would
// try to load it as a real image (404'ing and cluttering the console).
// Instead, the image rule below detects the `entry:` scheme and emits
// an inert `<div class="pkc-transclusion-placeholder">` that the
// adapter-layer expander (`adapter/ui/transclusion.ts`) later replaces
// with the actual embed HTML.
//
// Why a `<div>` (not a `<span>`): the expanded content is block-level
// (day-grouped articles for TEXTLOG, paragraphs for TEXT). markdown-it
// emits the image inside a `<p>`, so the browser's HTML parser will
// auto-close the paragraph when it encounters the div, leaving an
// empty `<p></p>` behind. The expander deletes these empties after
// substitution.
//
// The raw `entry:` href is preserved in `data-pkc-embed-ref` verbatim
// so the expander can re-parse it via `parseEntryRef` (same grammar
// as `navigate-entry-ref`). The `alt` text is preserved in
// `data-pkc-embed-alt` and is used by the fallback path (broken /
// unsupported refs) as visible placeholder text.
//
// HTML attribute escaping: markdown-it's `escapeHtml` quotes `"`, `&`,
// `<`, `>`, which is exactly what we need for attribute values.
const defaultImage =
  md.renderer.rules.image ??
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx]!;
  const srcIdx = token.attrIndex('src');
  const src = srcIdx >= 0 ? (token.attrs?.[srcIdx]?.[1] ?? '') : '';
  if (src.startsWith('entry:')) {
    // markdown-it stashes the alt text on token.content by the time
    // the renderer runs (inline children were already linearized).
    const alt = token.content ?? '';
    const srcEsc = escapeHtmlAttr(src);
    const altEsc = escapeHtmlAttr(alt);
    return (
      `<div class="pkc-transclusion-placeholder"` +
      ` data-pkc-embed-ref="${srcEsc}"` +
      ` data-pkc-embed-alt="${altEsc}"></div>`
    );
  }
  return defaultImage(tokens, idx, options, env, self);
};

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Heading id injection ──────────────────────────────
//
// Stamp an `id` attribute on every h1/h2/h3 so the right-pane Table
// of Contents can scroll to a heading via `getElementById`. Slugs are
// produced by the same `makeSlugCounter` helper the TOC extractor uses,
// so the id emitted here matches the slug the TOC lists.
//
// Counter state is stored on the per-render `env` object (markdown-it
// creates a fresh `{}` when `md.render(src)` is called without an
// explicit env), so renders are independent. TEXTLOG renders each log
// entry in its own `renderMarkdown()` call and therefore has its own
// slug-collision scope — click handlers disambiguate cross-log-entry
// id collisions by scoping the DOM lookup to the owning log row.
//
// See `docs/development/table-of-contents-right-pane.md`.

md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx]!;
  const level = parseInt(token.tag.slice(1), 10);
  if (level >= 1 && level <= 3) {
    const inline = tokens[idx + 1];
    const text = inline && inline.type === 'inline' ? inline.content.trim() : '';
    if (text) {
      const e = env as { __pkcHeadingSlug?: (t: string) => string };
      if (!e.__pkcHeadingSlug) e.__pkcHeadingSlug = makeSlugCounter();
      token.attrSet('id', e.__pkcHeadingSlug(text));
    }
  }
  return self.renderToken(tokens, idx, options);
};

// ── Card presentation placeholder (Slice 2, docs/spec/card-embed-presentation-v0.md §5) ──
//
// Detect the `@[card](<target>)` (and `@[card:<variant>](<target>)`)
// notation and emit a minify-safe placeholder span that a future
// card widget renderer can pick up. Slice 2 **does not** render a
// widget — it only makes sure the notation survives the markdown
// pipeline with its target / variant / raw string preserved.
//
// At the markdown-it token level, `@[card](entry:e1)` tokenizes as
// four inline children:
//
//   text       "@" (may be prefixed with other text, e.g. "see @")
//   link_open  href=entry:e1
//   text       "card" (or "card:compact" etc.)
//   link_close
//
// We walk each paragraph's inline children, look for this 4-token
// shape with a recognised card label, validate the reconstructed
// `@[<label>](<href>)` through the Slice-1 parser (no grammar is
// re-implemented here), and on a successful match:
//
//   - strip the trailing `@` from the preceding text token
//   - splice the 3 link tokens out and insert one `html_inline`
//     placeholder in their place
//
// Any rejected case (unknown variant, invalid target, plain link
// without a `@` prefix, clickable-image, image-embed, etc.) is
// skipped — markdown-it continues with its default rendering so
// the body keeps displaying as `@` + plain link, which is exactly
// the fallback documented in `card-embed-presentation-v0.md` §6.1.

md.core.ruler.after('inline', 'pkc-card', function (state) {
  const tokens = state.tokens;
  for (const token of tokens) {
    if (token.type !== 'inline') continue;
    const children = token.children;
    if (!children) continue;

    // Walk forward; splicing shrinks the array, so we compare to
    // the live `children.length` each iteration.
    for (let i = 0; i + 3 < children.length; i++) {
      const t0 = children[i]!;
      const t1 = children[i + 1]!;
      const t2 = children[i + 2]!;
      const t3 = children[i + 3]!;

      if (t0.type !== 'text') continue;
      if (t1.type !== 'link_open') continue;
      if (t2.type !== 'text') continue;
      if (t3.type !== 'link_close') continue;
      if (!t0.content.endsWith('@')) continue;

      const label = t2.content;
      if (!isCardPresentationLabel(label)) continue;

      const href = t1.attrGet('href');
      if (href === null) continue;

      const parsed = parseCardPresentation(`@[${label}](${href})`);
      if (!parsed) continue;

      // Strip trailing `@` from the preceding text.
      t0.content = t0.content.slice(0, -1);

      // Build the placeholder HTML. All values come from the
      // Slice-1 parser which restricts targets to entry: / asset:
      // / pkc:// with TOKEN_RE / SLUG_RE / DATE_RE tokens, so no
      // HTML metacharacters can appear — but we escape defensively
      // anyway so a future grammar relaxation cannot silently
      // degrade safety.
      const targetEsc = escapeHtmlAttr(parsed.target);
      const variantEsc = escapeHtmlAttr(parsed.variant);
      const rawEsc = escapeHtmlAttr(parsed.raw);
      const visibleLabel =
        parsed.variant === 'default' ? '@card' : `@card:${parsed.variant}`;
      const visibleLabelEsc = escapeHtmlAttr(visibleLabel);

      const placeholder = new state.Token('html_inline', '', 0);
      // Slice 4 (2026-04-25) — the placeholder gains
      // `data-pkc-action="navigate-card-ref"` plus `tabindex="0"` and
      // `role="link"` so action-binder can route clicks AND keyboard
      // (Enter / Space) through the same code path the existing
      // `entry:` link uses. The new attributes are additive — every
      // pre-Slice-4 selector (`.pkc-card-placeholder`,
      // `data-pkc-card-target`, `data-pkc-card-variant`,
      // `data-pkc-card-raw`) is preserved verbatim, so the Slice-2
      // and Slice-3 tests continue to pass and a future widget
      // renderer can still pick the placeholder up.
      placeholder.content =
        `<span class="pkc-card-placeholder"` +
        ` data-pkc-action="navigate-card-ref"` +
        ` data-pkc-card-target="${targetEsc}"` +
        ` data-pkc-card-variant="${variantEsc}"` +
        ` data-pkc-card-raw="${rawEsc}"` +
        ` role="link" tabindex="0">${visibleLabelEsc}</span>`;

      // Replace [link_open, text, link_close] with the placeholder.
      children.splice(i + 1, 3, placeholder);
      // Loop continues; the next iteration will evaluate the token
      // following the placeholder — which cannot itself start a
      // card match because card requires a preceding `@` text.
    }
  }
});

// ── Task list support (GFM-style) ─────────────────────
//
// Phase 2: transform list items whose inline content begins with
// `[ ]` or `[x]` into task list items with a disabled checkbox.
// The `pkc-task-item` class is added to the <li> so CSS can
// remove the bullet marker.

md.core.ruler.after('inline', 'pkc-task-list', function (state) {
  const tokens = state.tokens;
  let taskIndex = 0;
  for (let i = 2; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type !== 'inline') continue;
    if (tokens[i - 1]!.type !== 'paragraph_open') continue;
    if (tokens[i - 2]!.type !== 'list_item_open') continue;

    const match = /^\[([ xX])\](?:\s+|$)/.exec(token.content);
    if (!match) continue;

    const checked = match[1]!.toLowerCase() === 'x';

    // Mark the <li> for CSS styling
    tokens[i - 2]!.attrJoin('class', 'pkc-task-item');

    // Strip the marker from the inline content
    token.content = token.content.slice(match[0].length);

    // Update children: remove marker from first text token, prepend checkbox
    const children = token.children ?? [];
    for (const child of children) {
      if (child.type === 'text') {
        child.content = child.content.replace(/^\[[ xX]\](?:\s+|$)/, '');
        break;
      }
    }

    const checkbox = new state.Token('html_inline', '', 0);
    checkbox.content = `<input type="checkbox" class="pkc-task-checkbox" data-pkc-task-index="${taskIndex}"${checked ? ' checked' : ''}> `;
    taskIndex++;
    children.unshift(checkbox);
    token.children = children as Token[];
  }
});

/**
 * Optional rendering context threaded into markdown-it's `env`.
 *
 * `currentContainerId` lets the `link_open` rule distinguish
 * same-container from cross-container `pkc://` permalinks so only
 * external references turn into the `.pkc-permalink-external`
 * placeholder badge. Omitting the field — or passing an empty
 * string — makes every recognised permalink render as an external
 * placeholder, which is the safe conservative default.
 */
export interface RenderMarkdownOptions {
  readonly currentContainerId?: string;
  /**
   * 領域 10-1 Split View 同期スクロール(2026-05-05、PR #206 reform 後再実装)
   * — stamp `data-pkc-source-line="<n>"` on every block-level token's
   * rendered output so the caret-sync adapter can match preview
   * elements to editor source lines (and vice versa).
   *
   * Each tagged element also gets `data-pkc-source-end="<m>"` (zero-
   * indexed inclusive end of the source range) so a long fence /
   * table / list spanning multiple source lines can compute internal
   * progress (caret on line K within [S, E] → preview offset
   * (K - S) / (E - S) of the rendered block height).
   *
   * Opt-in — view-only call sites (detail / todo / folder / textlog
   * presenters) leave this off and emit clean HTML. Only the split
   * editor preview turns it on. */
  readonly sourceLineAnchors?: boolean;
}

/**
 * Block-level token types whose rendered HTML should carry the
 * `data-pkc-source-line` / `data-pkc-source-end` attributes when
 * `sourceLineAnchors` is opt-in. Top-level blocks the user can
 * point at in the live preview.
 */
const SOURCE_LINE_TOKEN_TYPES: ReadonlySet<string> = new Set([
  'heading_open',
  'paragraph_open',
  'blockquote_open',
  'bullet_list_open',
  'ordered_list_open',
  'list_item_open',
  'fence',
  'code_block',
  'table_open',
  // 領域 10-1 PR 2 hotfix: table row level anchoring so click-on-row
  // and caret-on-row land on the right source line. Without this,
  // a click anywhere in a 5-row table jumps to table_open's start
  // line for every row — surprising the user.
  'tr_open',
  'hr',
  'html_block',
]);

function tagSourceLines(tokens: Token[]): void {
  for (const token of tokens) {
    if (token.map && SOURCE_LINE_TOKEN_TYPES.has(token.type)) {
      // `token.map` = [startLine, endLineExclusive]. Store both so
      // a preview block spanning many source lines can compute
      // internal progress (PR #206 v12 design).
      token.attrSet('data-pkc-source-line', String(token.map[0]));
      token.attrSet(
        'data-pkc-source-end',
        String(Math.max(token.map[0], token.map[1] - 1)),
      );
    }
    if (token.children && token.children.length > 0) {
      tagSourceLines(token.children);
    }
  }
}

// ── L-7 (2026-05-07、wave-10-2 Phase 1):図 / 表 / 式 caption + 自動採番 ──
//
// Spec §3.5:
//
//   :::figure{#fig-flow}
//   ![](asset:flowchart.png)
//   ^^^ 全体フロー
//   :::
//
//   本文 → 図 [@fig-flow] を参照
//
// `:::figure|table|equation{#id}` ... `^^^ caption` ... `:::` で図表番号を
// 自動採番、`[@id]` で参照展開(template_kind 依存ラベル「図 N」「表 N」
// 「式 N」)。
//
// 実装:pre-process で block を sentinel 置換 + registry 構築、md.render 後に
// post-process で sentinel を <figure id=...><figcaption>...</figcaption></figure>
// に展開、`[@id]` を <a href="#id">図 N</a> に展開。
// markdown-it `html: false` を回避するため Unicode PUA(U+E110〜)を sentinel に。

type FigKind = 'figure' | 'table' | 'equation';

interface FigEntry {
  kind: FigKind;
  num: number;
  caption: string;
}

const FIG_LABEL_PREFIX: Record<FigKind, string> = {
  figure: '図',
  table: '表',
  equation: '式',
};

const FIG_SENTINEL_OPEN = '';
const FIG_SENTINEL_SEP = '';
const FIG_REF_OPEN = '';
const FIG_REF_SEP = '';
const FIG_REF_CLOSE = '';

function processFigureBlocks(source: string): { transformed: string; registry: Map<string, FigEntry> } {
  const registry = new Map<string, FigEntry>();
  const lines = source.split('\n');
  const out: string[] = [];
  const counter: Record<FigKind, number> = { figure: 0, table: 0, equation: 0 };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const m = /^:::(figure|table|equation)\{#([\w-]+)\}\s*$/.exec(line);
    if (!m) {
      out.push(line);
      i++;
      continue;
    }
    const kind = m[1] as FigKind;
    const id = m[2]!;
    counter[kind]++;
    const num = counter[kind];
    const content: string[] = [];
    let caption = '';
    i++;
    while (i < lines.length && lines[i]!.trim() !== ':::') {
      const cm = /^\^\^\^\s*(.*)$/.exec(lines[i]!);
      if (cm) caption = cm[1]!;
      else content.push(lines[i]!);
      i++;
    }
    if (i < lines.length) i++; // skip closing `:::`
    registry.set(id, { kind, num, caption });
    // Sentinel emission(各 sentinel は own-line で出力 → markdown-it が <p>...</p> wrap)
    out.push(`${FIG_SENTINEL_OPEN}OPEN${FIG_SENTINEL_SEP}${kind}${FIG_SENTINEL_SEP}${id}${FIG_SENTINEL_SEP}${num}${FIG_SENTINEL_OPEN}`);
    out.push('');
    out.push(...content);
    if (caption) {
      out.push('');
      out.push(`${FIG_SENTINEL_OPEN}CAPTION${FIG_SENTINEL_SEP}${kind}${FIG_SENTINEL_SEP}${num}${FIG_SENTINEL_SEP}${caption}${FIG_SENTINEL_OPEN}`);
    }
    out.push('');
    out.push(`${FIG_SENTINEL_OPEN}CLOSE${FIG_SENTINEL_OPEN}`);
  }
  return { transformed: out.join('\n'), registry };
}

function processFigureRefs(source: string, registry: Map<string, FigEntry>): string {
  return source.replace(/\[@([\w-]+)\]/g, (full, id) => {
    const e = registry.get(id);
    if (!e) return full;
    const label = `${FIG_LABEL_PREFIX[e.kind]} ${e.num}`;
    return `${FIG_REF_OPEN}${id}${FIG_REF_SEP}${label}${FIG_REF_CLOSE}`;
  });
}

function postProcessFigureSentinels(html: string): string {
  // <p>OPENkindidnum</p>
  html = html.replace(
    new RegExp(`<p>${FIG_SENTINEL_OPEN}OPEN${FIG_SENTINEL_SEP}(figure|table|equation)${FIG_SENTINEL_SEP}([\\w-]+)${FIG_SENTINEL_SEP}(\\d+)${FIG_SENTINEL_OPEN}</p>`, 'g'),
    (_match, kind, id, num) => `<figure id="${id}" class="pkc-fig pkc-fig-${kind}" data-pkc-fig-kind="${kind}" data-pkc-fig-num="${num}">`,
  );
  html = html.replace(
    new RegExp(`<p>${FIG_SENTINEL_OPEN}CAPTION${FIG_SENTINEL_SEP}(figure|table|equation)${FIG_SENTINEL_SEP}(\\d+)${FIG_SENTINEL_SEP}([^${FIG_SENTINEL_OPEN}]+)${FIG_SENTINEL_OPEN}</p>`, 'g'),
    (_match, kind, num, captionRaw) => {
      const prefix = FIG_LABEL_PREFIX[kind as FigKind];
      // caption は markdown-it が既に inline markup(<strong>等)を render 済。
      // 再 escape すると `&lt;strong&gt;` に化けるので raw のまま埋める。
      // raw HTML は markdown-it `html: false` で source 由来の `<` は escape 済。
      return `<figcaption class="pkc-fig-caption">${prefix} ${num}: ${captionRaw as string}</figcaption>`;
    },
  );
  html = html.replace(
    new RegExp(`<p>${FIG_SENTINEL_OPEN}CLOSE${FIG_SENTINEL_OPEN}</p>`, 'g'),
    '</figure>',
  );
  // Inline references
  html = html.replace(
    new RegExp(`${FIG_REF_OPEN}([\\w-]+)${FIG_REF_SEP}([^${FIG_REF_CLOSE}]+)${FIG_REF_CLOSE}`, 'g'),
    (_match, id, label) => `<a href="#${id}" class="pkc-fig-ref">${label}</a>`,
  );
  return html;
}

/**
 * Render markdown text to an HTML string.
 *
 * HTML tags in source are escaped (not rendered) for XSS safety.
 * Returns safe HTML suitable for innerHTML assignment.
 */
export function renderMarkdown(
  text: string,
  opts: RenderMarkdownOptions = {},
): string {
  if (!text) return '';
  // L-7:figure/table/equation block を sentinel 化 + registry 構築、
  // [@id] reference を sentinel 化(後で <a> に展開)。
  const { transformed: t1, registry: figRegistry } = processFigureBlocks(text);
  const t2 = processFigureRefs(t1, figRegistry);
  text = t2;
  const env = {
    currentContainerId: opts.currentContainerId ?? '',
  };
  let html: string;
  if (!opts.sourceLineAnchors) {
    html = md.render(text, env);
  } else {
    // 領域 10-1 — opt-in source-line anchor stamping on block tokens.
    const tokens = md.parse(text, env);
    tagSourceLines(tokens);
    html = md.renderer.render(tokens, md.options, env);
  }
  // L-7:sentinel post-process(figure/table/equation block + [@id] refs)。
  // figRegistry が空でも post-process は冪等(マッチが無いだけ)。
  html = postProcessFigureSentinels(html);
  return html;
}

/**
 * Check if text contains markdown syntax worth rendering.
 * Used to decide whether to show rendered markdown or plain text.
 *
 * Detects: headings, emphasis, code, lists, blockquotes, links,
 * tables, horizontal rules, fenced code blocks, task lists.
 */
export function hasMarkdownSyntax(text: string): boolean {
  if (!text) return false;
  if (/^#{1,6}\s|\*\*|__|\*[^*\s]|_[^_\s]|`[^`]+`|^\d+\.\s|^[-*+]\s|^>\s|^```|^---$|^[*]{3,}$|\[.+\]\(.+\)|^\|.+\||^[-*+]\s+\[[ xX]\]/m.test(text)) return true;
  // FI-08.x: bare URLs should flow through markdown-it linkify (D-FB1=B).
  if (/\b(?:https?|ftp):\/\/[^\s<>]/i.test(text)) return true;
  return false;
}

/**
 * Get the markdown-it instance for advanced configuration.
 * Allows adapter layer to add plugins at boot time.
 */
export function getMarkdownInstance(): MarkdownIt {
  return md;
}
