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
import { renderMarkdown } from '../../../src/features/markdown/markdown-render';

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
});
