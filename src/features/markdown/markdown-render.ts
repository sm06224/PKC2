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
 */

import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,          // Disable HTML tags in source (XSS safety)
  linkify: true,        // Auto-convert URL-like text to links
  typographer: true,    // Smart quotes, em-dash, etc.
  breaks: true,         // Convert \n to <br> for easier editing
});

// Add target="_blank" and rel="noopener" to all links
const defaultRender = md.renderer.rules.link_open ??
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  tokens[idx]!.attrSet('target', '_blank');
  tokens[idx]!.attrSet('rel', 'noopener');
  return defaultRender(tokens, idx, options, env, self);
};

/**
 * Render markdown text to an HTML string.
 *
 * HTML tags in source are escaped (not rendered) for XSS safety.
 * Returns safe HTML suitable for innerHTML assignment.
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';
  return md.render(text);
}

/**
 * Check if text contains markdown syntax worth rendering.
 * Used to decide whether to show rendered markdown or plain text.
 *
 * Detects: headings, emphasis, code, lists, blockquotes, links,
 * tables, horizontal rules, fenced code blocks.
 */
export function hasMarkdownSyntax(text: string): boolean {
  if (!text) return false;
  return /^#{1,6}\s|\*\*|__|\*[^*\s]|_[^_\s]|`[^`]+`|^\d+\.\s|^[-*+]\s|^>\s|^```|^---$|^[*]{3,}$|\[.+\]\(.+\)|^\|.+\|/m.test(text);
}

/**
 * Get the markdown-it instance for advanced configuration.
 * Allows adapter layer to add plugins at boot time.
 */
export function getMarkdownInstance(): MarkdownIt {
  return md;
}
