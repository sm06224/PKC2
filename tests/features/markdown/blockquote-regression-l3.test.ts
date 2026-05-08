/**
 * L-3(2026-05-07、wave-10-2 Phase 1):Blockquote 通常 `>` 強化 + future-guard。
 *
 * 仕様(spec §4.2):
 *   - `>` は CommonMark 標準 `<blockquote>`(既存挙動維持)
 *   - `>>` `>>>` の semantic role 別解釈(callout / warning)は **defer**
 *     (spec OQ-5、具体ユースケース待ち)
 *   - 現状は `>>` `>>>` も既存 markdown-it の nested blockquote として render
 *
 * 本 test は Phase 1 〜 後続 wave で `>>` の挙動が変わる可能性に対する
 * **regression guard** として位置付け。`>>` を callout として解釈する
 * future PR で本 test を更新し、当時の挙動転換を明示する。
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('L-3: Blockquote `>` 通常挙動 + future-guard', () => {
  it('単一 `>` は <blockquote> に展開', () => {
    const html = renderMarkdown('> 引用テキスト');
    expect(html).toMatch(/<blockquote>[^<]*<p>引用テキスト<\/p>/);
  });

  it('`>>` は nested blockquote(現状の markdown-it 挙動、defer)', () => {
    const html = renderMarkdown('>> 二重引用');
    // 現状は nested blockquote としてレンダリング
    const blockquoteCount = (html.match(/<blockquote>/g) ?? []).length;
    expect(blockquoteCount).toBe(2);
  });

  it('`>>>` は triple-nested blockquote(現状の markdown-it 挙動、defer)', () => {
    const html = renderMarkdown('>>> 三重引用');
    const blockquoteCount = (html.match(/<blockquote>/g) ?? []).length;
    expect(blockquoteCount).toBe(3);
  });

  it('複数行 `>` 引用は連続段落として一つの blockquote 内', () => {
    const src = `> 1 行目
> 2 行目
> 3 行目`;
    const html = renderMarkdown(src);
    const blockquoteCount = (html.match(/<blockquote>/g) ?? []).length;
    expect(blockquoteCount).toBe(1);
    expect(html).toContain('1 行目');
    expect(html).toContain('2 行目');
    expect(html).toContain('3 行目');
  });

  it('`>` 内 inline markup(**bold**)は render される', () => {
    const html = renderMarkdown('> **重要** な引用');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<strong>重要</strong>');
  });

  it('`>` 行と通常段落を混ぜた case', () => {
    const src = `通常 1

> 引用
> 引用 2

通常 2`;
    const html = renderMarkdown(src);
    expect(html).toContain('<p>通常 1</p>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<p>通常 2</p>');
  });

  it('blockquote 内に list', () => {
    const src = `> リスト:
> - item 1
> - item 2`;
    const html = renderMarkdown(src);
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<ul>');
    expect(html).toContain('item 1');
    expect(html).toContain('item 2');
  });

  it('blockquote 内に code span', () => {
    const html = renderMarkdown('> `code` あり');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<code>code</code>');
  });

  it('`> ` のみで終わる空 blockquote は 何も render しない or 空 blockquote', () => {
    const html = renderMarkdown('> ');
    // markdown-it は空 blockquote を rendering 可能、空かどうかは内容次第
    // 主に regression なしの確認(crash しないこと)
    expect(html).toBeDefined();
  });

  it('全 11 ケース matrix:基本 / nested / 構造 / inline / 境界', () => {
    type Case = { input: string; expectMatch?: RegExp; expectNoMatch?: RegExp; describe: string };
    const cases: Case[] = [
      { input: '> 単一行', expectMatch: /<blockquote>/, describe: '単一行' },
      { input: '>> nested', expectMatch: /<blockquote>\s*<blockquote>/, describe: 'nested 2 重' },
      { input: '>>> deep nested', expectMatch: /<blockquote>\s*<blockquote>\s*<blockquote>/, describe: 'nested 3 重' },
      { input: '> a\n> b', expectMatch: /<blockquote>[^<]*<p>a/, describe: '複数行 1 段落' },
      { input: '> a\n>\n> b', expectMatch: /<blockquote>/, describe: '複数段落 in blockquote' },
      { input: '> **bold**', expectMatch: /<strong>bold<\/strong>/, describe: 'inline markup' },
      { input: '> [link](https://example.com)', expectMatch: /<a href="https:\/\/example\.com"/, describe: 'link inside' },
      { input: '> `code`', expectMatch: /<code>code<\/code>/, describe: 'code inside' },
      { input: '> > deep', expectMatch: /<blockquote>\s*<blockquote>/, describe: 'space で nested 表記も OK' },
      { input: 'プリ\n> 引用\nポスト', expectMatch: /<blockquote>/, describe: '段落間 blockquote' },
      { input: '通常 > 文中の > は引用とみなさない', expectNoMatch: /<blockquote>/, describe: '行頭でない `>` は無視' },
    ];
    for (const c of cases) {
      const html = renderMarkdown(c.input);
      if (c.expectMatch) expect(html, c.describe).toMatch(c.expectMatch);
      if (c.expectNoMatch) expect(html, c.describe).not.toMatch(c.expectNoMatch);
    }
  });
});
