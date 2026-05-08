/**
 * L-8(2026-05-07、wave-10-2 Phase 1):空行マーカー(`_` / `_<N>`)。
 *
 * Spec §3.10:
 *   - `_` 単独行 → 1 空行ぶん高さの `<div class="pkc-blank-line">`
 *   - `_<N>` 単独行 → N 空行ぶん高さ
 *   - `<N>` は 1〜20 で clip、外れたら通常テキスト扱い
 *   - leading whitespace 付き(`   _`)はマーカー無効
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('L-8: 空行マーカー `_` / `_<N>`', () => {
  it('単独 `_` → 1 空行ぶんの blank-line div', () => {
    const html = renderMarkdown('_');
    expect(html).toMatch(/<div class="pkc-blank-line" data-pkc-blank-count="1" aria-hidden="true"><\/div>/);
  });

  it('`_3` → count=3 の blank-line div', () => {
    const html = renderMarkdown('_3');
    expect(html).toMatch(/<div class="pkc-blank-line" data-pkc-blank-count="3" aria-hidden="true"><\/div>/);
  });

  it('paragraph に挟まれて使える', () => {
    const html = renderMarkdown('上の段落\n\n_2\n\n下の段落');
    expect(html).toContain('上の段落');
    expect(html).toContain('下の段落');
    expect(html).toContain('data-pkc-blank-count="2"');
  });

  it('上限 20 で clip(`_50` → count=20)', () => {
    const html = renderMarkdown('_50');
    expect(html).toContain('data-pkc-blank-count="20"');
    expect(html).not.toContain('data-pkc-blank-count="50"');
  });

  it('`_0` はマーカー扱いされない(通常テキスト)', () => {
    const html = renderMarkdown('_0');
    expect(html).not.toContain('pkc-blank-line');
  });

  it('leading whitespace 付き `   _` はマーカー無効', () => {
    const html = renderMarkdown('   _');
    expect(html).not.toContain('pkc-blank-line');
  });

  it('行内に他の文字が混じる `_word` は無効', () => {
    const html = renderMarkdown('_word');
    expect(html).not.toContain('pkc-blank-line');
  });

  it('行内に他の文字が混じる `word_` は無効', () => {
    const html = renderMarkdown('word_');
    expect(html).not.toContain('pkc-blank-line');
  });

  it('文末スペース許容 `_  ` も 1 空行ぶん', () => {
    const html = renderMarkdown('_  ');
    expect(html).toContain('data-pkc-blank-count="1"');
  });

  it('連続マーカーはそれぞれ独立した div', () => {
    const html = renderMarkdown('_\n\n_2\n\n_3');
    expect(html).toMatch(/data-pkc-blank-count="1"/);
    expect(html).toMatch(/data-pkc-blank-count="2"/);
    expect(html).toMatch(/data-pkc-blank-count="3"/);
  });

  it('sourceLineAnchors: true(Split View 経路)でも sentinel 漏れない(2026-05-08 user 報告)', () => {
    // Split View の preview は `{ sourceLineAnchors: true }` で render する。
    // tagSourceLines が <p> に `data-pkc-source-line-*` 属性を付与するため、
    // post-process regex が `<p>SENT</p>` 期待だと当たらず PUA char が
    // 残って glyph 漏れする bug の regression guard。
    const src = ['本文 1', '', '_', '', '本文 2'].join('\n');
    const html = renderMarkdown(src, { sourceLineAnchors: true });
    expect(html).not.toContain('\u{E130}');
    expect(html).not.toContain('\u{E131}');
    expect(html).toContain('data-pkc-blank-count="1"');
  });

  it('連続 prefix 行 + `_` 混在(2026-05-08 user 報告ケース、PUA glyph 漏れ防止)', () => {
    const src = [
      '|> 2026年5月8日 発信',
      '<| To:どこどこのほにゃららへ',
      '|> From:へのへののモニャモニャから',
      '_',
      '|| ほにゃららのシステムについて、制約事項と対策予定の通知',
      '_',
      '|| 記',
    ].join('\n');
    const html = renderMarkdown(src);
    // sentinel char(U+E130 / U+E131)が HTML に残っていない
    expect(html).not.toContain('\u{E130}');
    expect(html).not.toContain('\u{E131}');
    // blank-line div が 2 個出ている
    const blankCount = (html.match(/pkc-blank-line/g) ?? []).length;
    expect(blankCount).toBe(2);
  });

  it('全 13 ケース matrix:数値範囲 / 構造 / 境界値', () => {
    const cases: { input: string; expectCount?: string; describe: string }[] = [
      { input: '_', expectCount: '1', describe: 'default 1 行' },
      { input: '_1', expectCount: '1', describe: '明示 1' },
      { input: '_5', expectCount: '5', describe: '中間値 5' },
      { input: '_20', expectCount: '20', describe: '上限ぴったり' },
      { input: '_21', expectCount: '20', describe: '上限超え clip' },
      { input: '_999', expectCount: '20', describe: '極大 clip' },
      { input: '_0', describe: 'ゼロ無効' },
      { input: '   _', describe: 'インデント無効' },
      { input: '_word', describe: '混在無効' },
      { input: 'word _', describe: '行頭以外無効' },
      { input: '__', describe: '`__` 単独はマーカー扱いせず markdown emphasis' },
      { input: '_3a', describe: '数値後文字混在で無効' },
      { input: '通常段落\n\n_\n\n別段落', expectCount: '1', describe: 'paragraph 間で動作' },
    ];
    for (const c of cases) {
      const html = renderMarkdown(c.input);
      if (c.expectCount) {
        expect(html, c.describe).toContain(`data-pkc-blank-count="${c.expectCount}"`);
      } else {
        expect(html, c.describe).not.toContain('pkc-blank-line');
      }
    }
  });
});
