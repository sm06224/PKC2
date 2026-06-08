/**
 * v4 §12 stack PR 6:Tier 0 vocabulary form `:::red,bg-yellow,1.2em`(Q3 priority)。
 *
 * inline `:T:red,bg-yellow,1.2em:`(catalog #9)と完全対称、style mapping 経路で
 * `<div style="color:red; background-color:yellow; font-size:1.2em">` に展開。
 *
 * Q7 separator policy 統一(comma / 空白 / 混在 全部 accept)も適用。
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('v4 §12: Tier 0 vocabulary `:::red,bg-yellow,1.2em`(stack PR 6、Q3 priority)', () => {
  describe('basic vocabulary → style mapping', () => {
    it('case 1: 単 vocab `red` → color', () => {
      const html = renderMarkdown(':::red\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block"[^>]*style="color: red"[^>]*>/);
    });

    it('case 2: 単 vocab `bg-yellow` → background', () => {
      const html = renderMarkdown(':::bg-yellow\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block"[^>]*style="background-color: yellow"[^>]*>/);
    });

    it('case 3: 単 vocab `1.2em` → font-size', () => {
      const html = renderMarkdown(':::1.2em\nbody\n:::');
      expect(html).toMatch(/style="font-size: 1\.2em"/);
    });

    it('case 4: 単 keyword `bold` → font-weight', () => {
      const html = renderMarkdown(':::bold\nbody\n:::');
      expect(html).toMatch(/style="font-weight: bold"/);
    });

    it('case 5: 単 size keyword `lg`', () => {
      const html = renderMarkdown(':::lg\nbody\n:::');
      expect(html).toMatch(/style="font-size: 1\.25em"/);
    });

    it('case 6: 複合 `red,bg-yellow,1.2em`(comma 区切り)', () => {
      const html = renderMarkdown(':::red,bg-yellow,1.2em\nbody\n:::');
      // ABC 順:background-color → color → font-size
      expect(html).toMatch(/style="background-color: yellow; color: red; font-size: 1\.2em"/);
    });

    it('case 7: 複合 `bold, red`(comma + space)', () => {
      const html = renderMarkdown(':::bold, red\nbody\n:::');
      expect(html).toMatch(/style="color: red; font-weight: bold"/);
    });

    it('case 8: 複合 `bold red`(Q7 space-only)', () => {
      const html = renderMarkdown(':::bold red\nbody\n:::');
      expect(html).toMatch(/style="color: red; font-weight: bold"/);
    });
  });

  describe('inline ↔ block 完全対称', () => {
    it('case 9: inline `:T:red,bg-yellow,1.2em:` と block `:::red,bg-yellow,1.2em` が同じ style', () => {
      const inlineHtml = renderMarkdown(':text:red,bg-yellow,1.2em:');
      const blockHtml = renderMarkdown(':::red,bg-yellow,1.2em\nbody\n:::');
      // inline は span、block は div だが、style 属性の内容は同じ
      const inlineStyle = inlineHtml.match(/style="([^"]+)"/)?.[1];
      const blockStyle = blockHtml.match(/style="([^"]+)"/)?.[1];
      expect(inlineStyle).toBe(blockStyle);
    });

    it('case 10: inline `:T:bold red:` と block `:::bold red` が同じ style(Q7)', () => {
      const inlineHtml = renderMarkdown(':text:bold red:');
      const blockHtml = renderMarkdown(':::bold red\nbody\n:::');
      const inlineStyle = inlineHtml.match(/style="([^"]+)"/)?.[1];
      const blockStyle = blockHtml.match(/style="([^"]+)"/)?.[1];
      expect(inlineStyle).toBe(blockStyle);
    });
  });

  describe('==highlight== の block 対応(Q4 vocabulary 経路で吸収)', () => {
    it('case 11: `:::bg-yellow` が `==text==` の block 等価', () => {
      const html = renderMarkdown(':::bg-yellow\nblock 黄色マーカー\n:::');
      expect(html).toMatch(/background-color: yellow/);
      expect(html).toMatch(/<p>block 黄色マーカー<\/p>/);
    });

    it('case 12: `:::bg-red` で任意背景色(inline `==` の色固定制約を block で解消)', () => {
      const html = renderMarkdown(':::bg-red\n赤背景\n:::');
      expect(html).toMatch(/background-color: red/);
    });

    it('case 13: `:::bg-yellow,1.2em` で背景 + サイズ', () => {
      const html = renderMarkdown(':::bg-yellow,1.2em\n複合\n:::');
      expect(html).toMatch(/background-color: yellow; font-size: 1\.2em/);
    });
  });

  describe('Tier 0 / 1 / 2 priority + fallthrough', () => {
    it('case 14: vocab match なら Tier 0(Q3 priority)、`bold` は vocab', () => {
      const html = renderMarkdown(':::bold\nbody\n:::');
      // class ではなく style 適用
      expect(html).toMatch(/style="font-weight: bold"/);
      expect(html).not.toMatch(/class="pkc-format-block bold"/);
    });

    it('case 15: vocab match しない bare → Tier 1 class chain にフォールスルー(space-prefix 経路)', () => {
      const html = renderMarkdown('::: nonvocab-class\nbody\n:::');
      // Tier 1 class として扱われる(`::: ` 空白前置は Tier 1 variant)
      expect(html).toMatch(/class="pkc-format-block nonvocab-class"/);
      expect(html).not.toMatch(/style="/);
    });

    it('case 16: dot 前置 `.cls` は常に Tier 1 class、vocab match しても dot 優先', () => {
      const html = renderMarkdown(':::.bold\nbody\n:::');
      // dot 付きは class 扱い
      expect(html).toMatch(/class="pkc-format-block bold"/);
      expect(html).not.toMatch(/style="font-weight/);
    });
  });

  describe('canonical style attr 順序(ABC sorted)', () => {
    it('case 17: ABC 順 — background → color → font-size → font-weight', () => {
      const html = renderMarkdown(':::1.2em,bold,red,bg-yellow\nbody\n:::');
      expect(html).toMatch(/style="background-color: yellow; color: red; font-size: 1\.2em; font-weight: bold"/);
    });
  });

  describe('content 内側 parse', () => {
    it('case 18: 複段落 + vocab', () => {
      const html = renderMarkdown(':::red\npara 1\n\npara 2\n:::');
      expect(html).toMatch(/<div class="pkc-format-block"[^>]*style="color: red"/);
      expect(html).toMatch(/<p>para 1<\/p>/);
      expect(html).toMatch(/<p>para 2<\/p>/);
    });

    it('case 19: list 内包 + vocab', () => {
      const html = renderMarkdown(':::bg-yellow\n- item 1\n- item 2\n:::');
      expect(html).toMatch(/<div class="pkc-format-block"[^>]*style="background-color: yellow"/);
      expect(html).toMatch(/<ul>/);
    });

    it('case 20: inline markup と vocab block の組合せ', () => {
      const html = renderMarkdown(':::bg-yellow\n**bold inside** styled block\n:::');
      expect(html).toMatch(/background-color: yellow/);
      expect(html).toMatch(/<strong>bold inside<\/strong>/);
    });
  });
});
