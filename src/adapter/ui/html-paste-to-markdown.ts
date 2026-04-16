/**
 * HTML-clipboard → Markdown-friendly text.
 *
 * Narrow scope: preserve anchor elements as `[label](url)` Markdown
 * links when the user pastes text/html into a TEXT body textarea.
 * This is **not** a general HTML→Markdown converter. Inline formatting
 * (bold, italic, lists, tables, etc.) is intentionally flattened to
 * plain text — only anchors are normalized.
 *
 * Returns `null` when no anchor would be lost by a plain-text paste,
 * letting the caller defer to the browser's default text/plain paste
 * (which preserves the user's native paste behavior byte-for-byte).
 *
 * See `docs/development/html-paste-link-markdown.md`.
 */

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
