import { describe, it, expect } from 'vitest';
import { renderMarkdown, hasMarkdownSyntax } from '../../../src/features/markdown/markdown-render';

describe('renderMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('renders plain text as paragraph', () => {
    const html = renderMarkdown('Hello world');
    expect(html).toContain('<p class="pkc-md-p">Hello world</p>');
  });

  it('renders headings h1 through h6', () => {
    expect(renderMarkdown('# Title')).toContain('<h1');
    expect(renderMarkdown('## Sub')).toContain('<h2');
    expect(renderMarkdown('### H3')).toContain('<h3');
    expect(renderMarkdown('#### H4')).toContain('<h4');
    expect(renderMarkdown('##### H5')).toContain('<h5');
    expect(renderMarkdown('###### H6')).toContain('<h6');
  });

  it('renders bold text', () => {
    const html = renderMarkdown('This is **bold** text');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('renders italic text', () => {
    const html = renderMarkdown('This is *italic* text');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders bold+italic text', () => {
    const html = renderMarkdown('This is ***both*** text');
    expect(html).toContain('<strong><em>both</em></strong>');
  });

  it('renders inline code', () => {
    const html = renderMarkdown('Use `console.log` here');
    expect(html).toContain('<code class="pkc-md-code">console.log</code>');
  });

  it('renders fenced code blocks', () => {
    const md = '```js\nconst x = 1;\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<pre class="pkc-md-pre">');
    expect(html).toContain('const x = 1;');
    expect(html).toContain('language-js');
  });

  it('renders unordered lists', () => {
    const md = '- item 1\n- item 2\n- item 3';
    const html = renderMarkdown(md);
    expect(html).toContain('<ul class="pkc-md-list">');
    expect(html).toContain('<li>item 1</li>');
    expect(html).toContain('<li>item 2</li>');
    expect(html).toContain('<li>item 3</li>');
  });

  it('renders ordered lists', () => {
    const md = '1. first\n2. second';
    const html = renderMarkdown(md);
    expect(html).toContain('<ol class="pkc-md-list">');
    expect(html).toContain('<li>first</li>');
    expect(html).toContain('<li>second</li>');
  });

  it('renders blockquotes', () => {
    const html = renderMarkdown('> This is a quote');
    expect(html).toContain('<blockquote class="pkc-md-blockquote">');
    expect(html).toContain('This is a quote');
  });

  it('renders horizontal rules', () => {
    expect(renderMarkdown('---')).toContain('<hr class="pkc-md-hr">');
    expect(renderMarkdown('***')).toContain('<hr class="pkc-md-hr">');
  });

  it('renders links', () => {
    const html = renderMarkdown('[Click here](https://example.com)');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('>Click here</a>');
  });

  it('renders images', () => {
    const html = renderMarkdown('![alt text](image.png)');
    expect(html).toContain('<img src="image.png" alt="alt text"');
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

  it('renders multiple block types', () => {
    const md = '# Heading\n\nA paragraph.\n\n- list item\n\n> quote';
    const html = renderMarkdown(md);
    expect(html).toContain('<h1');
    expect(html).toContain('<p');
    expect(html).toContain('<ul');
    expect(html).toContain('<blockquote');
  });

  it('handles code block without language', () => {
    const md = '```\nplain code\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<pre class="pkc-md-pre"><code>plain code</code></pre>');
  });

  it('escapes HTML inside code blocks', () => {
    const md = '```\n<div>test</div>\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('&lt;div&gt;');
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
    expect(hasMarkdownSyntax('* item')).toBe(true);
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
});
