import { describe, it, expect } from 'vitest';
import { renderMarkdown, hasMarkdownSyntax, getMarkdownInstance } from '../../../src/features/markdown/markdown-render';

describe('renderMarkdown (markdown-it)', () => {
  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('renders plain text as paragraph', () => {
    const html = renderMarkdown('Hello world');
    expect(html).toContain('<p>');
    expect(html).toContain('Hello world');
  });

  it('renders headings h1 through h6', () => {
    expect(renderMarkdown('# Title')).toContain('<h1>');
    expect(renderMarkdown('## Sub')).toContain('<h2>');
    expect(renderMarkdown('### H3')).toContain('<h3>');
    expect(renderMarkdown('#### H4')).toContain('<h4>');
    expect(renderMarkdown('##### H5')).toContain('<h5>');
    expect(renderMarkdown('###### H6')).toContain('<h6>');
  });

  it('renders bold text', () => {
    const html = renderMarkdown('This is **bold** text');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders italic text', () => {
    const html = renderMarkdown('This is *italic* text');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders inline code', () => {
    const html = renderMarkdown('Use `console.log` here');
    expect(html).toContain('<code>console.log</code>');
  });

  it('renders fenced code blocks', () => {
    const md = '```js\nconst x = 1;\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
  });

  it('renders unordered lists', () => {
    const md = '- item 1\n- item 2\n- item 3';
    const html = renderMarkdown(md);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    expect(html).toContain('item 1');
    expect(html).toContain('item 3');
  });

  it('renders ordered lists', () => {
    const md = '1. first\n2. second';
    const html = renderMarkdown(md);
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>');
    expect(html).toContain('first');
    expect(html).toContain('second');
  });

  it('renders blockquotes', () => {
    const html = renderMarkdown('> This is a quote');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('This is a quote');
  });

  it('renders horizontal rules', () => {
    expect(renderMarkdown('---')).toContain('<hr>');
  });

  it('renders links with target=_blank', () => {
    const html = renderMarkdown('[Click here](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain('>Click here</a>');
  });

  it('renders images', () => {
    const html = renderMarkdown('![alt text](image.png)');
    expect(html).toContain('<img');
    expect(html).toContain('src="image.png"');
    expect(html).toContain('alt="alt text"');
  });

  it('escapes HTML to prevent XSS', () => {
    const html = renderMarkdown('<script>alert("xss")</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in headings', () => {
    const html = renderMarkdown('# <b>Title</b>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('renders tables', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = renderMarkdown(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>');
    expect(html).toContain('<td>');
  });

  it('renders strikethrough', () => {
    const html = renderMarkdown('~~deleted~~');
    expect(html).toContain('<s>deleted</s>');
  });

  it('auto-links URLs', () => {
    const html = renderMarkdown('Visit https://example.com today');
    expect(html).toContain('href="https://example.com"');
  });

  it('renders multiple block types', () => {
    const md = '# Heading\n\nA paragraph.\n\n- list item\n\n> quote';
    const html = renderMarkdown(md);
    expect(html).toContain('<h1>');
    expect(html).toContain('<p>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<blockquote>');
  });

  it('handles code block without language', () => {
    const md = '```\nplain code\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<pre>');
    expect(html).toContain('plain code');
  });

  it('escapes HTML inside code blocks', () => {
    const md = '```\n<div>test</div>\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('&lt;div&gt;');
  });

  it('converts newlines to breaks', () => {
    const html = renderMarkdown('line1\nline2');
    expect(html).toContain('<br>');
  });
});

describe('hasMarkdownSyntax', () => {
  it('returns false for empty text', () => {
    expect(hasMarkdownSyntax('')).toBe(false);
  });

  it('returns false for plain text', () => {
    expect(hasMarkdownSyntax('Just regular text with no formatting')).toBe(false);
  });

  it('detects headings', () => {
    expect(hasMarkdownSyntax('# Title')).toBe(true);
  });

  it('detects bold', () => {
    expect(hasMarkdownSyntax('some **bold** text')).toBe(true);
  });

  it('detects inline code', () => {
    expect(hasMarkdownSyntax('use `code` here')).toBe(true);
  });

  it('detects unordered lists', () => {
    expect(hasMarkdownSyntax('- item')).toBe(true);
  });

  it('detects ordered lists', () => {
    expect(hasMarkdownSyntax('1. item')).toBe(true);
  });

  it('detects blockquotes', () => {
    expect(hasMarkdownSyntax('> quote')).toBe(true);
  });

  it('detects links', () => {
    expect(hasMarkdownSyntax('[text](url)')).toBe(true);
  });

  it('detects code blocks', () => {
    expect(hasMarkdownSyntax('```\ncode\n```')).toBe(true);
  });

  it('detects tables', () => {
    expect(hasMarkdownSyntax('| a | b |')).toBe(true);
  });
});

describe('getMarkdownInstance', () => {
  it('returns the markdown-it instance', () => {
    const instance = getMarkdownInstance();
    expect(instance).toBeDefined();
    expect(typeof instance.render).toBe('function');
  });
});
