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
    // h1–h3 carry a slug `id` attribute (see A-3 TOC). h4–h6 do not.
    expect(renderMarkdown('# Title')).toMatch(/<h1[ >]/);
    expect(renderMarkdown('## Sub')).toMatch(/<h2[ >]/);
    expect(renderMarkdown('### H3')).toMatch(/<h3[ >]/);
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
    // After highlighting, `const` and `1` are wrapped in spans; strip tags
    // to recover the visible source text.
    const text = html.replace(/<[^>]+>/g, '');
    expect(text).toContain('const x = 1;');
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
    expect(html).toMatch(/<h1[ >]/);
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

  // ── Fenced code block syntax highlighting ──
  // Inner-HTML spans are produced by the code-highlight helper;
  // these tests just verify the markdown-it wire-up is live and
  // that unknown / absent languages still fall back cleanly.
  it('highlights fenced code blocks for known languages (js)', () => {
    const html = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('class="language-js"');
    expect(html).toContain('pkc-tok-keyword'); // const
    expect(html).toContain('pkc-tok-number');  // 1
  });

  it('highlights fenced code blocks via language aliases (ts)', () => {
    const html = renderMarkdown('```ts\ninterface Foo { bar: string }\n```');
    expect(html).toContain('class="language-ts"');
    expect(html).toContain('pkc-tok-keyword'); // interface
    expect(html).toContain('pkc-tok-type');    // string
  });

  it('falls back to plain <pre><code> for unknown languages (no tokens emitted)', () => {
    const html = renderMarkdown('```brainfuck\n++>++<-\n```');
    expect(html).toContain('class="language-brainfuck"');
    expect(html).not.toContain('pkc-tok-');
  });

  it('falls back to plain <pre><code> when no language is specified', () => {
    const html = renderMarkdown('```\nplain line\n```');
    expect(html).not.toContain('pkc-tok-');
  });

  it('still escapes HTML inside highlighted fenced blocks (no XSS leak)', () => {
    const html = renderMarkdown('```js\nconst s = "<script>alert(1)</script>";\n```');
    // Raw `<script>` must NOT be present anywhere in the output —
    // only its escaped form.
    expect(html).not.toMatch(/<script>alert/);
    expect(html).toContain('&lt;script&gt;');
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

describe('heading id injection (A-3 TOC)', () => {
  it('stamps slug `id` on h1/h2/h3', () => {
    const html = renderMarkdown('# Introduction\n\n## Details\n\n### Notes');
    expect(html).toContain('<h1 id="introduction">');
    expect(html).toContain('<h2 id="details">');
    expect(html).toContain('<h3 id="notes">');
  });

  it('does not stamp id on h4/h5/h6', () => {
    const html = renderMarkdown('#### Deep\n\n##### Deeper\n\n###### Deepest');
    expect(html).toContain('<h4>');
    expect(html).toContain('<h5>');
    expect(html).toContain('<h6>');
  });

  it('disambiguates duplicate heading slugs within a single render', () => {
    const html = renderMarkdown('# Overview\n\n# Overview');
    expect(html).toContain('<h1 id="overview">');
    expect(html).toContain('<h1 id="overview-1">');
  });

  it('resets slug collision scope across independent renders', () => {
    const a = renderMarkdown('# Title');
    const b = renderMarkdown('# Title');
    expect(a).toContain('<h1 id="title">');
    expect(b).toContain('<h1 id="title">');
  });
});

// ── P1 Slice 5-A: entry: link interception attribute stamping ──
//
// The renderer must pass `entry:` hrefs through validateLink and
// tag the resulting <a> with `data-pkc-action="navigate-entry-ref"`
// plus a verbatim `data-pkc-entry-ref` carrying the raw href. This
// attribute pair is the contract that `action-binder`'s navigator
// relies on (see the `navigate-entry-ref` case in action-binder.ts).

describe('entry: link interception (P1 Slice 5-A)', () => {
  it('keeps the entry: href — validateLink must not strip it', () => {
    const html = renderMarkdown('[go](entry:lid-1)');
    expect(html).toContain('href="entry:lid-1"');
  });

  it('stamps data-pkc-action="navigate-entry-ref" on entry: links', () => {
    const html = renderMarkdown('[go](entry:lid-1)');
    expect(html).toContain('data-pkc-action="navigate-entry-ref"');
  });

  it('carries the raw href on data-pkc-entry-ref for action-binder parsing', () => {
    const html = renderMarkdown('[go](entry:lid-1#log/abc)');
    expect(html).toContain('data-pkc-entry-ref="entry:lid-1#log/abc"');
  });

  it('does NOT add target=_blank to entry: links (they stay in-app)', () => {
    const html = renderMarkdown('[go](entry:lid-1)');
    // Isolate the entry: anchor open tag.
    const m = html.match(/<a[^>]*href="entry:[^"]*"[^>]*>/);
    expect(m).not.toBeNull();
    expect(m![0]).not.toContain('target="_blank"');
    expect(m![0]).not.toContain('rel="noopener');
  });

  it('continues to add target=_blank/rel on regular https links', () => {
    const html = renderMarkdown('[x](https://example.com) and [y](entry:lid-1)');
    // The https anchor keeps the hardened attributes.
    const httpsOpen = html.match(/<a[^>]*href="https:\/\/example\.com"[^>]*>/)![0];
    expect(httpsOpen).toContain('target="_blank"');
    expect(httpsOpen).toContain('rel="noopener noreferrer"');
    // The entry anchor still gets its interception attrs.
    const entryOpen = html.match(/<a[^>]*href="entry:lid-1"[^>]*>/)![0];
    expect(entryOpen).toContain('data-pkc-action="navigate-entry-ref"');
  });

  it('stamps interception attrs on heading-form and day-form refs too', () => {
    const h = renderMarkdown('[h](entry:lid-1#log/abc/intro)');
    expect(h).toContain('data-pkc-action="navigate-entry-ref"');
    expect(h).toContain('data-pkc-entry-ref="entry:lid-1#log/abc/intro"');

    const d = renderMarkdown('[d](entry:lid-1#day/2026-04-09)');
    expect(d).toContain('data-pkc-action="navigate-entry-ref"');
    expect(d).toContain('data-pkc-entry-ref="entry:lid-1#day/2026-04-09"');
  });
});

describe('B-1 / S-16 — CSV / TSV fenced block → <table>', () => {
  it('renders a ```csv block as <table> with thead by default', () => {
    const md = '```csv\nname,qty\napple,3\nbanana,5\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<table class="pkc-md-rendered-csv">');
    expect(html).toContain('<thead>');
    expect(html).toContain('<th>name</th>');
    expect(html).toContain('<th>qty</th>');
    expect(html).toContain('<td>apple</td>');
    expect(html).toContain('<td>banana</td>');
    // Must NOT also wrap the source as a code block.
    expect(html).not.toContain('class="language-csv"');
  });

  it('renders ```csv noheader without thead', () => {
    const md = '```csv noheader\na,b\n1,2\n```';
    const html = renderMarkdown(md);
    expect(html).not.toContain('<thead>');
    expect(html).toContain('<td>a</td>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders ```tsv with the tab delimiter', () => {
    const md = '```tsv\na\tb\n1\t2\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>2</td>');
  });

  it('preserves classic markdown pipe-tables (no regression on existing GFM tables)', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = renderMarkdown(md);
    expect(html).toContain('<table>'); // pipe-table has no csv class
    expect(html).not.toContain('pkc-md-rendered-csv');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>2</td>');
  });

  it('falls back to default fence rendering for non-csv langs (B-2 syntax highlight intact)', () => {
    const md = '```ts\nconst x = 1;\n```';
    const html = renderMarkdown(md);
    // B-2 syntax-highlight tokens still emitted; no CSV table class.
    expect(html).toContain('class="language-ts"');
    expect(html).toContain('pkc-tok-keyword');
    expect(html).not.toContain('pkc-md-rendered-csv');
  });

  it('escapes HTML inside CSV cells (XSS safety)', () => {
    const md = '```csv\nraw\n<script>alert(1)</script>\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // No raw <script> in the rendered output.
    expect(html.toLowerCase()).not.toContain('<script>alert(1)</script>');
  });

  it('handles quoted cells with embedded comma + newline + escaped quote', () => {
    const md = '```csv\nname,note\n"Smith, Jr.","line1\nline2"\n"He said ""hi""",ok\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<td>Smith, Jr.</td>');
    expect(html).toContain('line1');
    expect(html).toContain('line2');
    // `"` is HTML-escaped to `&quot;` per the rowsToHtml safety contract.
    expect(html).toContain('<td>He said &quot;hi&quot;</td>');
  });

  it('falls back to default fence behaviour for empty csv block', () => {
    const md = '```csv\n```';
    const html = renderMarkdown(md);
    // Empty CSV → renderer returns null → default fence renders the
    // (empty) `<pre><code>` instead. The table class must not appear.
    expect(html).not.toContain('pkc-md-rendered-csv');
    // Some kind of code block wrapper is present (pre or code).
    expect(html).toMatch(/<(pre|code)/);
  });
});
