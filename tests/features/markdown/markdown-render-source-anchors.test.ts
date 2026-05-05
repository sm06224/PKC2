/**
 * 領域 10-1 PR 1 — `renderMarkdown(text, { sourceLineAnchors: true })`
 * の anchor 生成テスト。
 *
 * 検証範囲: pure HTML 出力に `data-pkc-source-line="<n>"` および
 * `data-pkc-source-end="<m>"` が、対応する block-level token に
 * 付与されていること。view-only 経路(opt-in 無し)では従来通り
 * 属性が付かないことも guard する。
 */
import { describe, it, expect } from 'vitest';
import {
  renderMarkdown,
  makeSourceLineAttrs,
} from '../../../src/features/markdown/markdown-render';

describe('renderMarkdown — sourceLineAnchors opt-in (PR 1, 領域 10-1)', () => {
  it('opt-in なしでは anchor 属性を一切付けない(既存挙動)', () => {
    const md = 'Hello\n\nWorld';
    const html = renderMarkdown(md);
    expect(html).not.toContain('data-pkc-source-line');
    expect(html).not.toContain('data-pkc-source-end');
  });

  it('単純な段落で paragraph_open に source-line=0 を付与する', () => {
    const html = renderMarkdown('Hello world', { sourceLineAnchors: true });
    expect(html).toMatch(/<p[^>]*data-pkc-source-line="0"/);
    // single-line paragraph: end == start == 0
    expect(html).toMatch(/<p[^>]*data-pkc-source-end="0"/);
  });

  it('複数段落で各 paragraph に異なる source-line を付与する', () => {
    const html = renderMarkdown('para A\n\npara B\n\npara C', {
      sourceLineAnchors: true,
    });
    expect(html).toMatch(/<p[^>]*data-pkc-source-line="0"/);
    expect(html).toMatch(/<p[^>]*data-pkc-source-line="2"/);
    expect(html).toMatch(/<p[^>]*data-pkc-source-line="4"/);
  });

  it('heading_open に source-line を付与する', () => {
    const html = renderMarkdown('# Title\n\nbody', { sourceLineAnchors: true });
    expect(html).toMatch(/<h1[^>]*data-pkc-source-line="0"/);
  });

  it('fence(code block)に source-line + source-end を付与する(複数行 span)', () => {
    const md = '```js\nlet x = 1;\nlet y = 2;\nlet z = 3;\n```';
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    // fence は line 0 から始まり line 4 で閉じる(map = [0, 5])
    // → source-end = max(0, 5-1) = 4
    expect(html).toMatch(/data-pkc-source-line="0"/);
    expect(html).toMatch(/data-pkc-source-end="4"/);
  });

  it('list_item に source-line を付与する', () => {
    const md = '- item A\n- item B\n- item C';
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    expect(html).toMatch(/data-pkc-source-line="0"/);
    expect(html).toMatch(/data-pkc-source-line="1"/);
    expect(html).toMatch(/data-pkc-source-line="2"/);
  });

  it('blockquote_open に source-line を付与する', () => {
    const html = renderMarkdown('> quoted line', { sourceLineAnchors: true });
    expect(html).toMatch(/<blockquote[^>]*data-pkc-source-line="0"/);
  });

  it('hr に source-line を付与する', () => {
    const html = renderMarkdown('para\n\n---\n\nafter', {
      sourceLineAnchors: true,
    });
    expect(html).toMatch(/<hr[^>]*data-pkc-source-line="2"/);
  });

  it('table_open に source-line を付与する', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |';
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    expect(html).toMatch(/data-pkc-source-line="0"/);
  });

  it('ネストしたリストでも各 list_item に anchor が付く', () => {
    const md = '- outer A\n  - nested A1\n  - nested A2\n- outer B';
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    // 4 つの list_item があるはず(outer × 2 + nested × 2)
    const matches = html.match(/<li[^>]*data-pkc-source-line=/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(4);
  });

  it('空文字列では空文字列を返す(early return)', () => {
    expect(renderMarkdown('', { sourceLineAnchors: true })).toBe('');
  });

  // 領域 10-1 PR 2 hotfix specs ─────────────────────────────

  it('CSV fence(custom renderer 経由)に source-line attrs を付与する', () => {
    // markdown-it default fence renderer は token.attrs を copy する
    // ので anchor が出るが、CSV fence は renderCsvFence が独自 HTML
    // を return するため bypass する。collectSourceLineAttrs を
    // outermost wrapper に splice する hotfix の regression guard。
    const md = '```csv\na,b\n1,2\n```';
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    // The pkc-md-block wrapper around the CSV table must carry the
    // anchor (start line 0, end inclusive line 3).
    expect(html).toMatch(/<div class="pkc-md-block"[^>]*data-pkc-source-line="0"/);
    expect(html).toMatch(/<div class="pkc-md-block"[^>]*data-pkc-source-end="3"/);
  });

  it('table の outer wrapper(pkc-md-block)にも source-line attrs を付与する', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |';
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    // The wrapper div carries the same anchor as the inner <table>
    // so click on the wrapper chrome (copy button etc.) still finds
    // the right source line via closest('[data-pkc-source-line]').
    expect(html).toMatch(/<div class="pkc-md-block"[^>]*data-pkc-md-block-kind="table"[^>]*data-pkc-source-line="0"/);
  });

  it('table 行(tr_open)に source-line attrs を付与する', () => {
    // Without per-row anchors, click-on-row jumps to the table_open
    // line for every row, which is surprising for a long table. The
    // hotfix added tr_open to SOURCE_LINE_TOKEN_TYPES.
    const md = '| col |\n|---|\n| a |\n| b |\n| c |';
    const html = renderMarkdown(md, { sourceLineAnchors: true });
    // The 3 data rows are on source lines 2, 3, 4 (0-indexed).
    // Header row (line 0) and separator (line 1) — markdown-it's
    // table tokenizer wraps the header into thead/tr at line 0 and
    // each data row tr_open at lines 2, 3, 4.
    expect(html).toMatch(/<tr[^>]*data-pkc-source-line="2"/);
    expect(html).toMatch(/<tr[^>]*data-pkc-source-line="3"/);
    expect(html).toMatch(/<tr[^>]*data-pkc-source-line="4"/);
  });
});

describe('makeSourceLineAttrs — token-agnostic helper(IR 経路への入口)', () => {
  it('start = null / undefined では空文字列', () => {
    expect(makeSourceLineAttrs(null)).toBe('');
    expect(makeSourceLineAttrs(undefined)).toBe('');
    expect(makeSourceLineAttrs(null, 5)).toBe('');
  });

  it('start のみ指定で source-line のみ', () => {
    expect(makeSourceLineAttrs(3)).toBe(' data-pkc-source-line="3"');
    expect(makeSourceLineAttrs('5')).toBe(' data-pkc-source-line="5"');
  });

  it('start と end の両方指定で両方', () => {
    expect(makeSourceLineAttrs(0, 12)).toBe(
      ' data-pkc-source-line="0" data-pkc-source-end="12"',
    );
  });

  it('end が null / undefined なら省略', () => {
    expect(makeSourceLineAttrs(2, null)).toBe(' data-pkc-source-line="2"');
    expect(makeSourceLineAttrs(2, undefined)).toBe(' data-pkc-source-line="2"');
  });
});
