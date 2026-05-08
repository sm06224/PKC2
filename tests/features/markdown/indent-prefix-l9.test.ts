/**
 * L-9(2026-05-08、wave-10-2 Phase 1 補完):段落先頭 1 字下げ。
 *
 * Spec(同 PR で `markdown-dialect-extensions-spec-2026-05.md` §3.11 追記):
 *   行頭 `__`(半角 _ × 2)or `＿`(全角 _、U+FF3F)を 1 字下げプレフィックス
 *   として認識。後続 paragraph 全体に `data-pkc-indent="1"` 属性が付与され、
 *   CSS で `text-indent: 1em`(1 文字幅)を適用。
 *
 *   日本語文書の段落字下げ慣習を表現する markup。
 *
 * 衝突回避:
 *   - `___text`(3 連続以上)は markdown horizontal rule なので skip
 *   - `__bold__`(末尾 `__` 閉じ)は markdown bold の単独行と解釈、skip
 *   - 行頭スペース許容(2026-05-08 user 統一方針)
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('L-9: 段落先頭 1 字下げ `__` / `＿`', () => {
  it('半角 `__段落本文` → data-pkc-indent="1"', () => {
    const html = renderMarkdown('__段落本文');
    expect(html).toMatch(/<p[^>]*data-pkc-indent="1"[^>]*>段落本文<\/p>/);
  });

  it('半角 `__ 段落本文`(空白あり)も同様', () => {
    const html = renderMarkdown('__ 段落本文');
    expect(html).toContain('data-pkc-indent="1"');
    expect(html).toContain('段落本文');
  });

  it('全角 `＿段落本文` も同様', () => {
    const html = renderMarkdown('＿段落本文');
    expect(html).toMatch(/<p[^>]*data-pkc-indent="1"[^>]*>段落本文<\/p>/);
  });

  it('行頭スペース許容(`   __段落`)', () => {
    const html = renderMarkdown('   __段落');
    expect(html).toContain('data-pkc-indent="1"');
  });

  it('行頭タブ許容(`\\t__段落`)', () => {
    const html = renderMarkdown('\t__段落');
    expect(html).toContain('data-pkc-indent="1"');
  });

  it('`___text`(3 連続)は indent 扱いせず markdown emphasis に流す', () => {
    const html = renderMarkdown('___text___');
    expect(html).not.toContain('data-pkc-indent');
  });

  it('`__bold__`(末尾 `__` 閉じ)は bold として残し indent 化しない', () => {
    const html = renderMarkdown('__bold__');
    expect(html).not.toContain('data-pkc-indent');
    expect(html).toContain('<strong>bold</strong>');
  });

  it('align prefix と併用可(`|| __センター字下げ`)', () => {
    const html = renderMarkdown('|| __センター字下げ');
    expect(html).toContain('data-pkc-align="center"');
    expect(html).toContain('data-pkc-indent="1"');
  });

  it('通常段落と混在', () => {
    const src = '通常段落 1\n\n__字下げ段落\n\n通常段落 2';
    const html = renderMarkdown(src);
    const ps = html.match(/<p[^>]*>/g) ?? [];
    expect(ps.length).toBe(3);
    expect(ps[0]).not.toContain('data-pkc-indent');
    expect(ps[1]).toContain('data-pkc-indent="1"');
    expect(ps[2]).not.toContain('data-pkc-indent');
  });

  it('空行で indent 解除(継続行に伝播しない)', () => {
    const src = '__字下げ段落 1 行目\n\n通常段落';
    const html = renderMarkdown(src);
    const ps = html.match(/<p[^>]*>/g) ?? [];
    expect(ps[0]).toContain('data-pkc-indent="1"');
    expect(ps[1]).not.toContain('data-pkc-indent');
  });

  it('全 11 ケース matrix:文字種 / 衝突 / 境界値', () => {
    const cases: { input: string; expectIndent: boolean; describe: string }[] = [
      { input: '__段落', expectIndent: true, describe: '半角 _ × 2 + 内容' },
      { input: '＿段落', expectIndent: true, describe: '全角 ＿ + 内容' },
      { input: '__ 段落', expectIndent: true, describe: '半角 + 半角 SP + 内容' },
      { input: '＿ 段落', expectIndent: true, describe: '全角 + 半角 SP + 内容' },
      { input: '   __段落', expectIndent: true, describe: '行頭 SP + 内容' },
      { input: '\t__段落', expectIndent: true, describe: '行頭 TAB + 内容' },
      { input: '__bold__', expectIndent: false, describe: '末尾 __ で markdown bold' },
      { input: '___sep___', expectIndent: false, describe: '3 連続は indent ではない' },
      { input: '_single', expectIndent: false, describe: '_ 単一は L-8 blank ではないし L-9 でもない' },
      { input: '本文の中の __強調__ は通常', expectIndent: false, describe: '行頭以外 __ は emphasis' },
      { input: '通常段落\n__次は字下げ', expectIndent: true, describe: '途中行から indent 開始' },
    ];
    for (const c of cases) {
      const html = renderMarkdown(c.input);
      if (c.expectIndent) {
        expect(html, c.describe).toContain('data-pkc-indent="1"');
      } else {
        expect(html, c.describe).not.toContain('data-pkc-indent');
      }
    }
  });
});
