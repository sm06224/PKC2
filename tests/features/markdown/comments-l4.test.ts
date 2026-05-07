/**
 * L-4(2026-05-07、wave-10-2 Phase 1):Comments syntax の unit test。
 *
 * 仕様(spec §3.4):
 *   - `%% inline %%` は同一行 inline comment、HTML から完全 strip
 *   - `%%% block %%%` は複数行 block comment、HTML から完全 strip
 *   - render 後の HTML に comment 内容が含まれないこと
 *   - 周辺の本文には影響しないこと
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('L-4: Comments(%% inline / %%% block)', () => {
  it('inline `%% comment %%` は HTML から完全に削除される', () => {
    const html = renderMarkdown('前 %% 隠しメモ %% 後');
    expect(html).not.toContain('隠しメモ');
    expect(html).toContain('前');
    expect(html).toContain('後');
  });

  it('block `%%% multi-line %%%` は HTML から完全に削除される', () => {
    const src = `通常の段落 1。

%%%
TODO: ここに表を入れる
担当: user
%%%

通常の段落 2。`;
    const html = renderMarkdown(src);
    expect(html).not.toContain('TODO');
    expect(html).not.toContain('担当');
    expect(html).toContain('通常の段落 1');
    expect(html).toContain('通常の段落 2');
  });

  it('inline コメントが複数あっても全て削除される', () => {
    const html = renderMarkdown('A %% c1 %% B %% c2 %% C');
    expect(html).not.toContain('c1');
    expect(html).not.toContain('c2');
    expect(html).toContain('A');
    expect(html).toContain('B');
    expect(html).toContain('C');
  });

  it('inline comment は同一行限定(改行を跨がない)', () => {
    // %% で始まり、同一行内に閉じない場合 → そのまま literal として残る
    const src = '前 %% これは閉じてない\n後';
    const html = renderMarkdown(src);
    // %% literal が残っている(escape されていてもよい)
    expect(html).toMatch(/%/);
    expect(html).toContain('閉じてない');
  });

  it('block comment は複数行に対応', () => {
    const src = `%%%
line 1
line 2
line 3
%%%
本文`;
    const html = renderMarkdown(src);
    expect(html).not.toContain('line 1');
    expect(html).not.toContain('line 2');
    expect(html).not.toContain('line 3');
    expect(html).toContain('本文');
  });

  it('inline と block が混在しても両方 strip される', () => {
    const src = `通常 1 %% inline c %% 通常 2

%%%
block c
%%%

通常 3`;
    const html = renderMarkdown(src);
    expect(html).not.toContain('inline c');
    expect(html).not.toContain('block c');
    expect(html).toContain('通常 1');
    expect(html).toContain('通常 2');
    expect(html).toContain('通常 3');
  });

  it('comment の中に markdown 構文があっても render されない', () => {
    const html = renderMarkdown('%% **bold inside** %%');
    expect(html).not.toContain('bold inside');
    expect(html).not.toContain('<strong');
  });

  it('comment 周辺の inline markup には影響なし', () => {
    const html = renderMarkdown('**bold** %% c %% *italic*');
    expect(html).toContain('<strong');
    expect(html).toContain('<em');
    expect(html).not.toContain('c %%');
  });

  it('全 12 ケース matrix:文字種 / 構造 / 境界値', () => {
    const cases: { input: string; expectGone: string[]; expectKept: string[]; describe: string }[] = [
      { input: '%% ASCII comment %%', expectGone: ['ASCII comment'], expectKept: [], describe: 'ASCII inline' },
      { input: '%% 日本語コメント %%', expectGone: ['日本語コメント'], expectKept: [], describe: 'CJK inline' },
      { input: '%% 🎉絵文字 %%', expectGone: ['絵文字'], expectKept: [], describe: 'emoji inline' },
      { input: 'a %% c %% b', expectGone: ['c'], expectKept: ['a', 'b'], describe: 'inline 周辺' },
      { input: '%%%\nblock 1\nblock 2\n%%%', expectGone: ['block 1', 'block 2'], expectKept: [], describe: 'block multi-line' },
      { input: '%% [link](url) %%', expectGone: ['link', 'url'], expectKept: [], describe: 'link inside comment' },
      { input: '%% **bold** %%', expectGone: ['bold'], expectKept: [], describe: 'inline markup inside' },
      { input: '%%%\n# 見出し inside\n%%%', expectGone: ['見出し inside'], expectKept: [], describe: 'heading inside block' },
      { input: 'a%%no space%%b', expectGone: ['no space'], expectKept: ['a', 'b'], describe: 'no space delimiter' },
      { input: '%%%\n%%%', expectGone: [], expectKept: [], describe: '空 block' },
      { input: '%%%nested %% inner %% nested%%%', expectGone: ['nested', 'inner'], expectKept: [], describe: 'block contains inline-like content' },
      { input: '%%a%% %%b%%', expectGone: ['a', 'b'], expectKept: [], describe: 'multiple inline 隣接' },
    ];
    for (const c of cases) {
      const html = renderMarkdown(c.input);
      for (const g of c.expectGone) {
        expect(html, `${c.describe}: should NOT contain "${g}"`).not.toContain(g);
      }
      for (const k of c.expectKept) {
        expect(html, `${c.describe}: should contain "${k}"`).toContain(k);
      }
    }
  });
});
