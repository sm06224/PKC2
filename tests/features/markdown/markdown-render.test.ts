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

  it('renders links with target=_blank and hardened rel', () => {
    const html = renderMarkdown('[Click here](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
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

  // ── Phase 2: fenced code block language class ──
  it('adds language- class to fenced code blocks', () => {
    const html = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('class="language-js"');
  });

  it('does not add language class when no language specified', () => {
    const html = renderMarkdown('```\nplain\n```');
    expect(html).not.toContain('class="language-');
  });

  // ── Phase 2: task lists ──
  it('renders unchecked task list items', () => {
    const html = renderMarkdown('- [ ] todo item');
    expect(html).toContain('class="pkc-task-item"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('data-pkc-task-index="0"');
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('checked>');
    expect(html).toContain('todo item');
  });

  it('renders checked task list items', () => {
    const html = renderMarkdown('- [x] done item');
    expect(html).toContain('class="pkc-task-item"');
    expect(html).toContain('checked');
    expect(html).toContain('done item');
  });

  it('supports uppercase X in task markers', () => {
    const html = renderMarkdown('- [X] done');
    expect(html).toContain('checked');
  });

  it('renders mixed task and regular list items', () => {
    const md = '- [ ] task 1\n- regular item\n- [x] task 2';
    const html = renderMarkdown(md);
    // Three <li> tags; only the task items get the class
    const taskItems = html.match(/class="pkc-task-item"/g) ?? [];
    expect(taskItems.length).toBe(2);
    expect(html).toContain('regular item');
  });

  it('does not treat plain brackets as task marker', () => {
    const html = renderMarkdown('- [not a task]');
    expect(html).not.toContain('pkc-task-item');
    expect(html).not.toContain('type="checkbox"');
  });

  it('strips task marker from rendered text', () => {
    const html = renderMarkdown('- [ ] buy milk');
    expect(html).not.toContain('[ ] buy milk');
    expect(html).toContain('buy milk');
  });

  it('assigns sequential data-pkc-task-index to multiple tasks', () => {
    const md = '- [ ] first\n- [x] second\n- [ ] third';
    const html = renderMarkdown(md);
    expect(html).toContain('data-pkc-task-index="0"');
    expect(html).toContain('data-pkc-task-index="1"');
    expect(html).toContain('data-pkc-task-index="2"');
  });

  it('resets task index counter per renderMarkdown call', () => {
    // First call produces index 0,1
    const html1 = renderMarkdown('- [ ] a\n- [ ] b');
    expect(html1).toContain('data-pkc-task-index="0"');
    expect(html1).toContain('data-pkc-task-index="1"');
    // Second call also starts from 0
    const html2 = renderMarkdown('- [ ] c');
    expect(html2).toContain('data-pkc-task-index="0"');
    expect(html2).not.toContain('data-pkc-task-index="1"');
  });

  // ── Phase 2: link safety ──
  it('blocks javascript: URIs', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('href="javascript:');
  });

  it('blocks vbscript: URIs', () => {
    const html = renderMarkdown('[click](vbscript:msgbox)');
    expect(html).not.toContain('href="vbscript:');
  });

  it('blocks file: URIs', () => {
    const html = renderMarkdown('[click](file:///etc/passwd)');
    expect(html).not.toContain('href="file:');
  });

  it('blocks data:text/html URIs', () => {
    const html = renderMarkdown('[click](data:text/html,<script>alert(1)</script>)');
    expect(html).not.toContain('href="data:text/html');
  });

  it('allows data:image/png URIs for images', () => {
    const html = renderMarkdown('![img](data:image/png;base64,iVBORw0KGgo=)');
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
  });

  it('allows https, http, mailto, tel URIs', () => {
    expect(renderMarkdown('[a](https://example.com)')).toContain('href="https://example.com"');
    expect(renderMarkdown('[a](http://example.com)')).toContain('href="http://example.com"');
    expect(renderMarkdown('[a](mailto:a@b.com)')).toContain('href="mailto:a@b.com"');
    expect(renderMarkdown('[a](tel:+1234)')).toContain('href="tel:+1234"');
  });

  it('allows relative paths and fragments', () => {
    expect(renderMarkdown('[a](./page.html)')).toContain('href="./page.html"');
    expect(renderMarkdown('[a](#section)')).toContain('href="#section"');
  });

  it('auto-linked URLs also get noopener noreferrer', () => {
    const html = renderMarkdown('Visit https://example.com');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  // ── Office URI schemes ──
  //
  // Allow ms-word:, ms-excel:, ms-powerpoint:, ms-visio:, ms-access:,
  // ms-project:, ms-publisher:, ms-officeapp:, ms-spd:, ms-infopath:,
  // and onenote: so that Office deep links work from rendered notes.

  it('allows ms-word: Office URI scheme', () => {
    const html = renderMarkdown('[Edit](ms-word:ofe|u|https://example.com/a.docx)');
    expect(html).toContain('href="ms-word:');
    expect(html).toContain('>Edit</a>');
  });

  it('allows ms-excel: Office URI scheme', () => {
    const html = renderMarkdown('[Open](ms-excel:ofv|u|https://example.com/a.xlsx)');
    expect(html).toContain('href="ms-excel:');
  });

  it('allows ms-powerpoint: Office URI scheme', () => {
    const html = renderMarkdown('[Slides](ms-powerpoint:ofe|u|https://example.com/a.pptx)');
    expect(html).toContain('href="ms-powerpoint:');
  });

  it('allows ms-visio: Office URI scheme', () => {
    const html = renderMarkdown('[Diagram](ms-visio:ofe|u|https://example.com/a.vsdx)');
    expect(html).toContain('href="ms-visio:');
  });

  it('allows ms-access: Office URI scheme', () => {
    const html = renderMarkdown('[DB](ms-access:ofe|u|https://example.com/a.accdb)');
    expect(html).toContain('href="ms-access:');
  });

  it('allows ms-project: Office URI scheme', () => {
    const html = renderMarkdown('[Plan](ms-project:ofe|u|https://example.com/a.mpp)');
    expect(html).toContain('href="ms-project:');
  });

  it('allows ms-publisher: Office URI scheme', () => {
    const html = renderMarkdown('[Pub](ms-publisher:ofe|u|https://example.com/a.pub)');
    expect(html).toContain('href="ms-publisher:');
  });

  it('allows ms-officeapp: Office URI scheme', () => {
    const html = renderMarkdown('[App](ms-officeapp:launch)');
    expect(html).toContain('href="ms-officeapp:');
  });

  it('allows ms-spd: SharePoint Designer scheme', () => {
    const html = renderMarkdown('[Site](ms-spd:edit|https://sp.example.com)');
    expect(html).toContain('href="ms-spd:');
  });

  it('allows ms-infopath: Office URI scheme', () => {
    const html = renderMarkdown('[Form](ms-infopath:ofe|u|https://example.com/a.xsn)');
    expect(html).toContain('href="ms-infopath:');
  });

  it('allows onenote: scheme', () => {
    const html = renderMarkdown('[Note](onenote:https://example.com/notebook.one)');
    expect(html).toContain('href="onenote:');
  });

  it('Office scheme links still get target=_blank and hardened rel', () => {
    const html = renderMarkdown('[Edit](ms-word:ofe|u|https://example.com/a.docx)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('blocks unknown ms-* schemes outside the Office allowlist', () => {
    const html = renderMarkdown('[x](ms-evil:payload)');
    expect(html).not.toContain('href="ms-evil:');
  });

  it('Office URI scheme matching is case-insensitive', () => {
    const html = renderMarkdown('[Edit](MS-WORD:ofe|u|https://example.com/a.docx)');
    expect(html).toContain('href="MS-WORD:');
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

  it('detects task lists', () => {
    expect(hasMarkdownSyntax('- [ ] todo')).toBe(true);
    expect(hasMarkdownSyntax('- [x] done')).toBe(true);
  });
});

describe('getMarkdownInstance', () => {
  it('returns the markdown-it instance', () => {
    const instance = getMarkdownInstance();
    expect(instance).toBeDefined();
    expect(typeof instance.render).toBe('function');
  });
});
