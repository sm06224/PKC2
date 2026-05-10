/**
 * reform-2026-05 Phase 2 PR-2C:`:caption:[…]` formal marker。
 *
 * 仕様(01-notation-catalog.md §1.4):
 *   - `:::figure` block 内で `:caption:[caption text]` が `^^^ caption` と等価
 *   - AI / ChatGPT が IR-driven で emit する形(formal-only、simple は `^^^` のまま)
 *   - 行頭 `:caption:[…]` のみ marker 扱い(行中は無視)
 *   - `:caption:[…]{attrs}` の attrs は今のところ ignore(将来 lang / id 等で拡張余地)
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe(':caption:[…] formal marker(reform-2026-05 Phase 2 PR-2C)', () => {
  it('既存 `^^^ caption` 旧形は引き続き動作(regression)', () => {
    const src = ':::figure{#fig1}\n![](https://example.com/x.png)\n^^^ 旧形\n:::';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<figcaption[^>]*>図 1: 旧形<\/figcaption>/);
  });

  it(':caption:[text] 新形が `^^^` と等価で動作', () => {
    const src = ':::figure{#fig1}\n![](https://example.com/x.png)\n:caption:[新形 caption]\n:::';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<figcaption[^>]*>図 1: 新形 caption<\/figcaption>/);
  });

  it(':caption:[text]{attrs} の attrs は無視、text のみ caption に', () => {
    const src = ':::figure{#fig1}\n![](https://example.com/x.png)\n:caption:[attr 付き]{class=foo lang=ja}\n:::';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<figcaption[^>]*>図 1: attr 付き<\/figcaption>/);
  });

  it('両形混在 `^^^` + `:caption:[]`:後勝ち', () => {
    const src = ':::figure{#fig1}\n^^^ 旧形\n:caption:[新形が後勝ち]\n:::';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<figcaption[^>]*>図 1: 新形が後勝ち<\/figcaption>/);
  });

  it('table block でも :caption: 動作', () => {
    const src = ':::table{#tab1}\n| a | b |\n|---|---|\n| 1 | 2 |\n:caption:[表 caption]\n:::';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<figcaption[^>]*>表 1: 表 caption<\/figcaption>/);
  });

  it('equation block でも :caption: 動作', () => {
    const src = ':::equation{#eq1}\n$$x = 1$$\n:caption:[式 caption]\n:::';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<figcaption[^>]*>式 1: 式 caption<\/figcaption>/);
  });

  it('行頭以外の `:caption:[…]` は marker 扱いせず(figure content として残る)', () => {
    const src = ':::figure{#fig1}\n本文 :caption:[これは inline] 続き\n:::';
    const html = renderMarkdown(src);
    // figcaption は出ない(行頭でないため)
    expect(html).not.toMatch(/<figcaption[^>]*>/);
    // inline :caption:[...] は L-6 / inline-role に該当しないため literal 残置
    expect(html).toContain(':caption:');
  });

  it(':caption:[] 空 content は caption 設定されない(空文字 caption)', () => {
    const src = ':::figure{#fig1}\n![](x)\n:caption:[]\n:::';
    const html = renderMarkdown(src);
    // 空 caption は figcaption 出さない(既存 ^^^ 空文字と同じ挙動)
    // または figcaption は出るが空文字 — どちらでも regression なし
    // 重要なのは literal `:caption:[]` が残らないこと
    expect(html).not.toContain(':caption:[]');
  });
});
