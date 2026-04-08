/**
 * Minimal Markdown-to-HTML renderer.
 *
 * Pure function — no browser APIs.
 * Supports a practical subset of CommonMark:
 *   - Headings (# to ######)
 *   - Bold (**text**), Italic (*text*), Bold+Italic (***text***)
 *   - Inline code (`code`)
 *   - Fenced code blocks (``` ... ```)
 *   - Unordered lists (- item, * item)
 *   - Ordered lists (1. item)
 *   - Blockquotes (> text)
 *   - Horizontal rules (--- or ***)
 *   - Links [text](url)
 *   - Images ![alt](url)
 *   - Line breaks (two trailing spaces or \)
 *   - Paragraphs
 *
 * All output is HTML-escaped first, then markdown syntax is applied.
 * This prevents XSS from user-controlled content.
 */

/** Escape HTML special characters to prevent XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render inline markdown syntax on already-escaped text. */
function renderInline(text: string): string {
  // Images: ![alt](url) — must come before links
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="pkc-md-img">');

  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Inline code: `code` — escape backtick pairs
  text = text.replace(/`([^`]+)`/g, '<code class="pkc-md-code">$1</code>');

  // Bold+Italic: ***text***
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic: *text* (but not inside words with multiple *)
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Line break: two trailing spaces or backslash at end
  text = text.replace(/ {2,}$/gm, '<br>');
  text = text.replace(/\\$/gm, '<br>');

  return text;
}

interface Block {
  type: 'heading' | 'code' | 'blockquote' | 'ul' | 'ol' | 'hr' | 'paragraph';
  level?: number;       // heading level 1-6
  content: string;      // rendered HTML content
  items?: string[];     // list items
  lang?: string;        // code block language hint
}

/** Parse markdown text into blocks. */
function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block
    const codeMatch = line.match(/^```(\w*)$/);
    if (codeMatch) {
      const lang = codeMatch[1] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.match(/^```$/)) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code', content: escapeHtml(codeLines.join('\n')), lang });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      blocks.push({ type: 'heading', level, content: renderInline(escapeHtml(headingMatch[2]!)) });
      i++;
      continue;
    }

    // Blockquote (gather consecutive > lines)
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        quoteLines.push(lines[i]!.replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', content: renderInline(escapeHtml(quoteLines.join('\n'))) });
      continue;
    }

    // Unordered list (gather consecutive - or * lines)
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
        items.push(renderInline(escapeHtml(lines[i]!.replace(/^[-*]\s+/, ''))));
        i++;
      }
      blocks.push({ type: 'ul', content: '', items });
      continue;
    }

    // Ordered list (gather consecutive 1. 2. lines)
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i]!)) {
        items.push(renderInline(escapeHtml(lines[i]!.replace(/^\d+\.\s+/, ''))));
        i++;
      }
      blocks.push({ type: 'ol', content: '', items });
      continue;
    }

    // Empty line → skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: gather consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !/^(#{1,6}\s|```|>\s?|[-*]\s+|\d+\.\s+|(-{3,}|[*]{3,}|_{3,})$)/.test(lines[i]!)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: renderInline(escapeHtml(paraLines.join('\n'))) });
    }
  }

  return blocks;
}

/** Convert blocks to HTML string. */
function blocksToHtml(blocks: Block[]): string {
  return blocks.map((block) => {
    switch (block.type) {
      case 'heading':
        return `<h${block.level} class="pkc-md-h${block.level}">${block.content}</h${block.level}>`;
      case 'code':
        return `<pre class="pkc-md-pre"><code${block.lang ? ` class="language-${block.lang}"` : ''}>${block.content}</code></pre>`;
      case 'blockquote':
        return `<blockquote class="pkc-md-blockquote">${block.content}</blockquote>`;
      case 'ul':
        return `<ul class="pkc-md-list">${block.items!.map((item) => `<li>${item}</li>`).join('')}</ul>`;
      case 'ol':
        return `<ol class="pkc-md-list">${block.items!.map((item) => `<li>${item}</li>`).join('')}</ol>`;
      case 'hr':
        return '<hr class="pkc-md-hr">';
      case 'paragraph':
        return `<p class="pkc-md-p">${block.content}</p>`;
    }
  }).join('\n');
}

/**
 * Render markdown text to an HTML string.
 *
 * All input is HTML-escaped before markdown processing to prevent XSS.
 * Returns safe HTML suitable for innerHTML assignment.
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';
  const blocks = parseBlocks(text);
  return blocksToHtml(blocks);
}

/**
 * Check if text contains markdown syntax worth rendering.
 * Used to decide whether to show rendered markdown or plain text.
 */
export function hasMarkdownSyntax(text: string): boolean {
  if (!text) return false;
  return /^#{1,6}\s|^\*\*|^\*\s|\*\*|`[^`]+`|^\d+\.\s|^>\s|^```|^---$|^\*\*\*$|\[.+\]\(.+\)/m.test(text);
}
