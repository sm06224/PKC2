/**
 * HTML-clipboard → Markdown-friendly text.
 *
 * 2 段構え:
 *
 * 1. `htmlPasteToMarkdown`(S-25、従来): anchor だけを `[label](url)` に
 *    正規化し、他は平文化する narrow scope。
 * 2. `htmlPasteToRichMarkdown`(2026-07-15、user 報告「AI チャットの回答を
 *    コピペすると書式付きでいい感じに貼付できない」): text/html に構造
 *    (見出し / リスト / コードブロック / 表 / 引用)があるとき、既存の
 *    可換変換器(`parseHtmlToAst` → `renderAstToMarkdown`)で **markdown
 *    まるごと復元**する。flag `editor.html_paste_to_markdown`(opt-in)
 *    配下で action-binder から呼ばれる。text/plain が既に markdown らしい
 *    場合(AI の「コピー」ボタン経由 = markdown 原文が text/plain に載る)
 *    は null を返して native paste を優先する — 二重変換を防ぐ。
 *
 * どちらも `null` = 「介入しない」で、呼び出し側はブラウザ既定の
 * text/plain paste に委ねる。
 *
 * See `docs/development/html-paste-link-markdown.md`.
 */

import { parseHtmlToAst } from '@features/ast/parse-html';
import { renderAstToMarkdown } from '@features/ast/render-markdown';

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'aside',
  'header', 'footer', 'nav', 'main',
  'li', 'tr', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'pre', 'figure', 'figcaption',
]);

const SKIP_TAGS = new Set([
  'script', 'style', 'noscript', 'head',
  'meta', 'link', 'title', 'template',
]);

/**
 * Return true when the href points at a scheme that must not appear
 * inside a Markdown link target. `javascript:` is the classic XSS
 * vector; `data:` and `vbscript:` are excluded out of caution. Empty
 * or whitespace-only hrefs are also treated as unsafe so we fall
 * back to plain-text labels.
 */
export function isSafeHref(href: string): boolean {
  const trimmed = href.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.startsWith('javascript:')) return false;
  if (trimmed.startsWith('vbscript:')) return false;
  if (trimmed.startsWith('data:')) return false;
  return true;
}

/**
 * Collapse runs of whitespace in a text node. Leaves single spaces
 * and newlines intact so that block-level insertions can decide
 * whether to add surrounding newlines.
 */
function collapseTextWhitespace(text: string): string {
  return text.replace(/[ \t\r\n\f\v]+/g, ' ');
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

/**
 * Sanitize the URL so it cannot break Markdown link syntax. Parens
 * and whitespace inside the URL are percent-encoded; the rest is
 * left untouched so common URL shapes stay human-readable.
 */
function sanitizeHref(href: string): string {
  return href
    .trim()
    .replace(/[ \t]/g, '%20')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function walkNode(node: Node): string {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    return collapseTextWhitespace(node.textContent ?? '');
  }
  if (node.nodeType !== 1 /* ELEMENT_NODE */) {
    return '';
  }
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (SKIP_TAGS.has(tag)) return '';
  if (tag === 'br') return '\n';
  if (tag === 'hr') return '\n\n';

  if (tag === 'a') {
    const href = el.getAttribute('href') ?? '';
    // Flatten the anchor's children to a one-line label. Anchors
    // wrapping images or other anchors are rare in clipboard HTML
    // and fall back gracefully to their textContent.
    const label = collapseTextWhitespace(el.textContent ?? '').trim();
    if (!isSafeHref(href)) {
      // Dangerous or empty href → drop the link, keep the label as
      // plain text so the user still sees what they copied.
      return label;
    }
    if (!label) {
      // Empty label → use the URL itself so the link is not lost.
      return sanitizeHref(href);
    }
    if (label.trim() === href.trim()) {
      // Label is the URL itself — bare URL avoids redundant [url](url).
      return sanitizeHref(href);
    }
    return `[${escapeMarkdownLabel(label)}](${sanitizeHref(href)})`;
  }

  let inner = '';
  for (const child of Array.from(el.childNodes)) {
    inner += walkNode(child);
  }

  if (BLOCK_TAGS.has(tag)) {
    return `\n${inner}\n`;
  }
  return inner;
}

/**
 * Transform a text/html clipboard payload into Markdown-friendly
 * text. Returns `null` when the payload contains no anchor elements
 * worth preserving — callers should then let the browser's default
 * text/plain paste proceed untouched.
 */
export function htmlPasteToMarkdown(html: string): string | null {
  if (!html) return null;
  if (typeof DOMParser === 'undefined') return null;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }

  // Only intervene when at least one anchor needs preserving.
  // A plain-text paste already captures everything else correctly.
  const anchors = doc.querySelectorAll('a[href]');
  if (anchors.length === 0) return null;

  let text = '';
  for (const child of Array.from(doc.body.childNodes)) {
    text += walkNode(child);
  }

  // Collapse excessive whitespace without touching intentional
  // line breaks: trim line-internal runs of spaces to one space,
  // cap blank-line runs at a single blank line.
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

// ── rich HTML → markdown(2026-07-15)──────────────────────────────

/** 巨大 HTML の paste を parse しない上限(AI 回答は通常 数十 KB)。 */
export const RICH_PASTE_HTML_MAX = 1024 * 1024;

/**
 * text/plain が「既に markdown 原文」らしいかの保守的ヒューリスティック。
 * AI チャットの「コピー」ボタンは markdown 原文を text/plain に載せるため、
 * この場合は HTML からの再構成より原文を貼るほうが常に正確。
 * リスト記号(`- `)単独は平文でも頻出するので根拠にしない — フェンス /
 * 見出し / 表 pipe 行 / リンク・強調記法だけを強いシグナルとして扱う。
 */
export function plainLooksLikeMarkdown(plain: string): boolean {
  if (!plain) return false;
  return (
    plain.includes('```')
    || /^#{1,6} \S/m.test(plain)
    || /^\|[^\n]+\|\s*$/m.test(plain)
    || /\[[^\]\n]+\]\([^)\s]+\)/.test(plain)
    || /\*\*[^*\n]+\*\*/.test(plain)
  );
}

/** 変換に値する「構造」を持つか(anchor だけなら従来経路で十分)。 */
const STRUCTURAL_SELECTOR = 'h1, h2, h3, h4, h5, h6, ul, ol, pre, table, blockquote';

/**
 * text/html を構造ごと markdown に復元する。介入しないときは null:
 *   - html が空 / 上限超過 / parse 不能
 *   - text/plain が既に markdown らしい(原文優先)
 *   - 構造要素が無い(→ 従来の anchor 正規化に fallthrough)
 *   - 変換結果が空
 *
 * 変換は既存の可換変換器を流用: `parseHtmlToAst`(見出し / 入れ子リスト /
 * `<pre><code class="language-X">` / 表 / 引用 / インライン装飾、未知
 * 要素は opaque として原文保持)→ `renderAstToMarkdown`(GFM mode =
 * 方言最小の共通分母。外部 HTML 由来の AST は frontmatter を持たない)。
 */
export function htmlPasteToRichMarkdown(html: string, plain: string): string | null {
  if (!html || html.length > RICH_PASTE_HTML_MAX) return null;
  if (typeof DOMParser === 'undefined') return null;
  if (plainLooksLikeMarkdown(plain)) return null;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }
  if (!doc.body || !doc.body.querySelector(STRUCTURAL_SELECTOR)) return null;

  let markdown: string;
  try {
    const ast = parseHtmlToAst(html);
    markdown = renderAstToMarkdown(ast, { mode: 'gfm' });
  } catch {
    return null; // 変換不能なら黙って native paste に委ねる
  }
  const trimmed = markdown.replace(/\n{3,}/g, '\n\n').trim();
  return trimmed === '' ? null : trimmed;
}
