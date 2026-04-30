/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  caretSourceLine,
  findPreviewElementForLine,
  findSourceLineForElement,
  syncPreviewToCaret,
  syncCaretToPreview,
} from '@adapter/ui/source-preview-sync';
import { renderMarkdown } from '@features/markdown/markdown-render';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('caretSourceLine — count newlines before caret', () => {
  function ta(value: string, pos: number): HTMLTextAreaElement {
    const el = document.createElement('textarea');
    el.value = value;
    el.selectionStart = el.selectionEnd = pos;
    return el;
  }

  it('returns 0 when caret is on the first line', () => {
    expect(caretSourceLine(ta('hello\nworld', 3))).toBe(0);
  });

  it('returns 1 when caret is on the second line', () => {
    expect(caretSourceLine(ta('hello\nworld', 6))).toBe(1);
  });

  it('returns 2 when caret is on the third line', () => {
    expect(caretSourceLine(ta('a\nb\nc', 4))).toBe(2);
  });

  it('returns 0 for empty value', () => {
    expect(caretSourceLine(ta('', 0))).toBe(0);
  });
});

describe('renderMarkdown — emits data-pkc-source-line on block tokens', () => {
  it('paragraph carries source line', () => {
    const html = renderMarkdown('hello world', { sourceLineAnchors: true });
    expect(html).toContain('data-pkc-source-line="0"');
    expect(html).toContain('<p');
  });

  it('default (no opt-in) emits NO source-line attrs', () => {
    const html = renderMarkdown('hello world');
    expect(html).not.toContain('data-pkc-source-line');
  });

  it('multiple blocks carry their own line numbers', () => {
    const src = '# Heading\n\npara one\n\npara two';
    const html = renderMarkdown(src, { sourceLineAnchors: true });
    // Heading is line 0
    expect(html).toMatch(/<h1[^>]*data-pkc-source-line="0"/);
    // First paragraph starts at line 2 (after heading + blank line)
    expect(html).toMatch(/<p[^>]*data-pkc-source-line="2"/);
    // Second paragraph starts at line 4
    expect(html).toMatch(/<p[^>]*data-pkc-source-line="4"/);
  });

  it('list items each carry their own line', () => {
    const src = '- alpha\n- beta\n- gamma';
    const html = renderMarkdown(src, { sourceLineAnchors: true });
    expect(html).toMatch(/<li[^>]*data-pkc-source-line="0"/);
    expect(html).toMatch(/<li[^>]*data-pkc-source-line="1"/);
    expect(html).toMatch(/<li[^>]*data-pkc-source-line="2"/);
  });

  it('fenced code block: source-line is on the .pkc-md-block wrapper', () => {
    const src = 'before\n\n```\ncode\n```';
    const html = renderMarkdown(src, { sourceLineAnchors: true });
    // Wrapper carries the line; inner code does not need it (kept off
    // to avoid double-anchoring the same logical block).
    expect(html).toMatch(
      /<div class="pkc-md-block" data-pkc-md-block-kind="code" data-pkc-source-line="2"/,
    );
  });

  it('table: source-line is on the .pkc-md-block wrapper', () => {
    const src = 'intro\n\n| H1 | H2 |\n| --- | --- |\n| A | B |';
    const html = renderMarkdown(src, { sourceLineAnchors: true });
    expect(html).toMatch(
      /<div class="pkc-md-block" data-pkc-md-block-kind="table" data-pkc-source-line="2"/,
    );
  });

  it('blockquote and hr each carry their line', () => {
    const src = 'top\n\n> quoted\n\n---';
    const html = renderMarkdown(src, { sourceLineAnchors: true });
    expect(html).toMatch(/<blockquote[^>]*data-pkc-source-line="2"/);
    expect(html).toMatch(/<hr[^>]*data-pkc-source-line="4"/);
  });

  it('per-line anchors: fence content has data-pkc-source-line on each line span', () => {
    const src = 'pre\n\n```\nfoo\nbar\nbaz\n```';
    const html = renderMarkdown(src, { sourceLineAnchors: true });
    // Fence opens at source line 2 (0-indexed); content starts at 3.
    expect(html).toMatch(
      /<span class="pkc-md-fence-line" data-pkc-source-line="3">foo<\/span>/,
    );
    expect(html).toMatch(
      /<span class="pkc-md-fence-line" data-pkc-source-line="4">bar<\/span>/,
    );
    expect(html).toMatch(
      /<span class="pkc-md-fence-line" data-pkc-source-line="5">baz<\/span>/,
    );
  });
});

describe('findPreviewElementForLine — closest anchor at or before line', () => {
  function previewWith(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  }

  it('returns the element whose source line equals targetLine', () => {
    const preview = previewWith(
      '<p data-pkc-source-line="0">a</p>'
      + '<p data-pkc-source-line="2">b</p>'
      + '<p data-pkc-source-line="4">c</p>',
    );
    const el = findPreviewElementForLine(preview, 2);
    expect(el?.textContent).toBe('b');
  });

  it('falls back to the latest anchor before the target line', () => {
    const preview = previewWith(
      '<p data-pkc-source-line="0">a</p>'
      + '<p data-pkc-source-line="2">b</p>'
      + '<p data-pkc-source-line="4">c</p>',
    );
    // line 3 has no exact anchor — should fall back to line 2.
    const el = findPreviewElementForLine(preview, 3);
    expect(el?.textContent).toBe('b');
  });

  it('returns null when target is before the first anchor', () => {
    const preview = previewWith('<p data-pkc-source-line="5">later</p>');
    expect(findPreviewElementForLine(preview, 2)).toBeNull();
  });

  it('returns the last anchor when target is past the end', () => {
    const preview = previewWith(
      '<p data-pkc-source-line="0">a</p>'
      + '<p data-pkc-source-line="2">b</p>',
    );
    const el = findPreviewElementForLine(preview, 99);
    expect(el?.textContent).toBe('b');
  });
});

describe('findSourceLineForElement — climb to the closest anchored ancestor', () => {
  it('reads line from self if anchored', () => {
    const el = document.createElement('p');
    el.setAttribute('data-pkc-source-line', '7');
    expect(findSourceLineForElement(el)).toBe(7);
  });

  it('reads line from anchored ancestor when called on a descendant', () => {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-pkc-source-line', '3');
    const inner = document.createElement('span');
    inner.textContent = 'x';
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    expect(findSourceLineForElement(inner)).toBe(3);
  });

  it('returns null when no anchor exists in ancestor chain', () => {
    const el = document.createElement('span');
    document.body.appendChild(el);
    expect(findSourceLineForElement(el)).toBeNull();
  });
});

describe('syncPreviewToCaret — set active attribute', () => {
  function setup(value: string, pos: number, html: string) {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.selectionStart = ta.selectionEnd = pos;
    const preview = document.createElement('div');
    preview.innerHTML = html;
    document.body.appendChild(preview);
    return { ta, preview };
  }

  it('marks the matching block with data-pkc-active-source', () => {
    const { ta, preview } = setup(
      'first line\n\nsecond para',
      11, // caret at start of line 1 (after \n)
      '<p data-pkc-source-line="0">first line</p>'
      + '<p data-pkc-source-line="2">second para</p>',
    );
    syncPreviewToCaret(ta, preview);
    const active = preview.querySelectorAll('[data-pkc-active-source]');
    expect(active.length).toBe(1);
    expect(active[0]!.textContent).toBe('first line');
  });

  it('switches active marker when caret jumps to a later line', () => {
    const { ta, preview } = setup(
      'a\nb\nc\nd',
      6, // start of line 3
      '<p data-pkc-source-line="0">a</p>'
      + '<p data-pkc-source-line="1">b</p>'
      + '<p data-pkc-source-line="2">c</p>'
      + '<p data-pkc-source-line="3">d</p>',
    );
    syncPreviewToCaret(ta, preview);
    const active = preview.querySelectorAll('[data-pkc-active-source]');
    expect(active.length).toBe(1);
    expect(active[0]!.textContent).toBe('d');
  });

  it('clears active marker when no anchored block matches', () => {
    const { ta, preview } = setup(
      'top\n\ncontent',
      0,
      '<p data-pkc-source-line="5">unreachable</p>',
    );
    // Set a stale active first
    preview.querySelector('p')!.setAttribute('data-pkc-active-source', '');
    syncPreviewToCaret(ta, preview);
    expect(preview.querySelectorAll('[data-pkc-active-source]').length).toBe(0);
  });
});

describe('syncCaretToPreview — move textarea caret to a preview line', () => {
  it('moves caret to the start of the corresponding source line', () => {
    const ta = document.createElement('textarea');
    ta.value = 'line0\nline1\nline2\nline3';
    ta.selectionStart = ta.selectionEnd = 0;
    document.body.appendChild(ta);

    const block = document.createElement('p');
    block.setAttribute('data-pkc-source-line', '2');
    block.textContent = 'rendered line2';

    const moved = syncCaretToPreview(ta, block);
    expect(moved).toBe(true);
    // Line 2 starts at offset 12 (5 + 1 + 5 + 1 = 12)
    expect(ta.selectionStart).toBe(12);
  });

  it('returns false when element has no anchor', () => {
    const ta = document.createElement('textarea');
    ta.value = 'whatever';
    ta.selectionStart = ta.selectionEnd = 0;
    document.body.appendChild(ta);

    const el = document.createElement('span');
    expect(syncCaretToPreview(ta, el)).toBe(false);
    expect(ta.selectionStart).toBe(0);
  });

  it('caret line 0 maps to offset 0', () => {
    const ta = document.createElement('textarea');
    ta.value = 'a\nb';
    ta.selectionStart = ta.selectionEnd = 3;
    document.body.appendChild(ta);

    const el = document.createElement('p');
    el.setAttribute('data-pkc-source-line', '0');
    syncCaretToPreview(ta, el);
    expect(ta.selectionStart).toBe(0);
  });
});
