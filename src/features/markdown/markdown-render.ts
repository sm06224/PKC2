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
import { parsePermalink } from '../link/permalink';

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
  const html = renderCsvFence(token.content, token.info);
  if (html !== null) return html;
  return defaultFence(tokens, idx, options, env, self);
};

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
    // `pkc://` permalink — spec/pkc-link-unification-v0.md §4.
    // Paste conversion normally demotes same-container permalinks
    // to `entry:` internal refs, so any `pkc://` that lands in
    // a rendered body is almost always cross-container. We tag
    // it with placeholder data-attributes so CSS can render it
    // as an external badge, and keep the raw href so a future
    // resolver (P2P / import) can pick it up verbatim.
    //
    // Malformed `pkc://...` values fall back to the default
    // external-link treatment below so the body isn't silently
    // suppressed.
    const parsed = parsePermalink(href);
    const rawEnv = (env ?? {}) as { currentContainerId?: unknown };
    const currentContainerId =
      typeof rawEnv.currentContainerId === 'string' ? rawEnv.currentContainerId : '';
    if (parsed && currentContainerId && parsed.containerId === currentContainerId) {
      // Same-container permalink left behind in the body (rare —
      // paste conversion should have already demoted it). Render
      // as an ordinary anchor with the raw href; a follow-up
      // slice may promote this to an `entry:` internal link.
      token.attrSet('rel', 'noopener noreferrer');
    } else if (parsed) {
      // Cross-container (or currentContainerId is unknown — treat as
      // cross for safety): emit the external-PKC placeholder.
      const cls = token.attrGet('class');
      token.attrSet('class', cls ? `${cls} pkc-permalink-external` : 'pkc-permalink-external');
      token.attrSet('data-pkc-permalink-container', parsed.containerId);
      token.attrSet('data-pkc-permalink-kind', parsed.kind);
      token.attrSet('data-pkc-permalink-target', parsed.targetId);
      if (parsed.fragment !== undefined) {
        token.attrSet('data-pkc-permalink-fragment', parsed.fragment);
      }
      token.attrSet(
        'title',
        `External PKC ${parsed.kind} · container ${parsed.containerId} · target ${parsed.targetId}`,
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
  const env = {
    currentContainerId: opts.currentContainerId ?? '',
  };
  return md.render(text, env);
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
