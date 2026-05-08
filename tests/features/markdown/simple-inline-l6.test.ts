/**
 * L-6(2026-05-07、wave-10-2 Phase 1):簡易 inline 記法 `:text:attrs:`
 *
 * 仕様(spec §4.3):
 *   `:<内容>:<attrs カンマ区切り>:` で <span> に attrs 適用。
 *   vocabulary は §4.5 で統一(L-2 と整合)。
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('L-6: 簡易 inline `:text:attrs:`', () => {
  describe('基本', () => {
    it('単一 keyword `:text:bold:`', () => {
      const html = renderMarkdown(':太字:bold:');
      expect(html).toMatch(/<span class="pkc-inline-mark" style="font-weight: bold">太字<\/span>/);
    });

    it('色 keyword `:text:red:`', () => {
      const html = renderMarkdown(':赤字:red:');
      expect(html).toMatch(/<span class="pkc-inline-mark" style="color: red">赤字<\/span>/);
    });

    it('複数 attrs `:text:bold, red, bg-black:`', () => {
      const html = renderMarkdown(':混合:bold, red, bg-black:');
      expect(html).toContain('font-weight: bold');
      expect(html).toContain('color: red');
      expect(html).toContain('background-color: black');
    });

    it('順不同 OK', () => {
      const html1 = renderMarkdown(':a:bold, red:');
      const html2 = renderMarkdown(':a:red, bold:');
      // 両方とも同じ style を含む
      expect(html1).toContain('font-weight: bold');
      expect(html1).toContain('color: red');
      expect(html2).toContain('font-weight: bold');
      expect(html2).toContain('color: red');
    });

    it('size keyword `:text:lg:`(em-based、2026-05-07 size token expansion)', () => {
      const html = renderMarkdown(':大:lg:');
      expect(html).toContain('font-size: 1.25em');
    });

    it('hex 色 `:text:#ff0000:`', () => {
      const html = renderMarkdown(':色:#ff0000:');
      expect(html).toContain('color: #ff0000');
    });

    it('rgb 色 `:text:rgb(0, 128, 0):`', () => {
      const html = renderMarkdown(':色:rgb(0, 128, 0):');
      expect(html).toContain('color: rgb(0, 128, 0)');
    });

    it('bg- prefix で background-color', () => {
      const html = renderMarkdown(':背景:bg-yellow:');
      expect(html).toContain('background-color: yellow');
    });

    it('strikethrough', () => {
      const html = renderMarkdown(':消す:strikethrough:');
      expect(html).toContain('text-decoration: line-through');
    });

    it('underline', () => {
      const html = renderMarkdown(':線:underline:');
      expect(html).toContain('text-decoration: underline');
    });

    it('font-family mono', () => {
      const html = renderMarkdown(':コード:mono:');
      expect(html).toContain('font-family: monospace');
    });
  });

  describe('衝突 / false positive 回避', () => {
    it('時刻 12:30:45 は誤発火しない', () => {
      const html = renderMarkdown('時刻 12:30:45 です');
      expect(html).not.toMatch(/<span class="pkc-inline-mark"/);
      expect(html).toContain('12:30:45');
    });

    it('URL https://example.com/path:foo は誤発火しない', () => {
      const html = renderMarkdown('参照 https://example.com です');
      expect(html).not.toMatch(/<span class="pkc-inline-mark"/);
    });

    it('未知 attr は false positive 抑制(literal として残る)', () => {
      const html = renderMarkdown(':text:unknownattr:');
      expect(html).not.toMatch(/<span class="pkc-inline-mark"/);
      // literal `:text:unknownattr:` がそのまま残る
      expect(html).toContain(':text:unknownattr:');
    });

    it('内容空 `::bold:` は無効', () => {
      const html = renderMarkdown('::bold:');
      expect(html).not.toMatch(/<span class="pkc-inline-mark"/);
    });

    it('attrs 空 `:text::` は無効', () => {
      const html = renderMarkdown(':text::');
      expect(html).not.toMatch(/<span class="pkc-inline-mark"/);
    });

    it('改行を跨ぐと無効', () => {
      const html = renderMarkdown(':前\n後ろ:bold:');
      expect(html).not.toMatch(/<span class="pkc-inline-mark"/);
    });

    it('code span 内では無効', () => {
      const html = renderMarkdown('`:text:bold:`');
      expect(html).toContain('<code>');
      expect(html).not.toMatch(/<span class="pkc-inline-mark"/);
    });
  });

  describe('全 23 ケース matrix(size token expansion 2026-05-07)', () => {
    it('全件', () => {
      type Case = { input: string; expectMatch?: RegExp; expectNoMatch?: RegExp; describe: string };
      const cases: Case[] = [
        { input: ':a:bold:', expectMatch: /font-weight: bold/, describe: 'bold' },
        { input: ':a:italic:', expectMatch: /font-style: italic/, describe: 'italic' },
        { input: ':a:red:', expectMatch: /color: red/, describe: 'color name' },
        { input: ':a:#abc123:', expectMatch: /color: #abc123/, describe: 'hex' },
        { input: ':a:rgb(1,2,3):', expectMatch: /color: rgb\(1,2,3\)/, describe: 'rgb' },
        { input: ':a:bg-blue:', expectMatch: /background-color: blue/, describe: 'bg-color' },
        { input: ':a:bg-#000:', expectMatch: /background-color: #000/, describe: 'bg-hex' },
        { input: ':a:xs:', expectMatch: /font-size: 0\.75em/, describe: 'xs size(em-based)' },
        { input: ':a:lg:', expectMatch: /font-size: 1\.25em/, describe: 'lg size(em-based)' },
        { input: ':a:2xl:', expectMatch: /font-size: 1\.875em/, describe: '2xl size(em-based)' },
        { input: ':a:3xl:', expectMatch: /font-size: 2\.5em/, describe: '3xl size(em-based)' },
        { input: ':a:120%:', expectMatch: /font-size: 120%/, describe: 'percent free value' },
        { input: ':a:1.5em:', expectMatch: /font-size: 1\.5em/, describe: 'em free value' },
        { input: ':a:12px:', expectMatch: /font-size: 12px/, describe: 'px free value' },
        { input: ':a:0.75rem:', expectMatch: /font-size: 0\.75rem/, describe: 'rem free value' },
        { input: ':a:lg, red, bold:', expectMatch: /font-size: 1\.25em.*color: red.*font-weight: bold/, describe: 'size + color + bold combo' },
        { input: ':a:bold, italic, underline:', expectMatch: /font-weight: bold/, describe: '3 keyword' },
        { input: '12:30:45', expectNoMatch: /pkc-inline-mark/, describe: '時刻無視' },
        { input: ':a:invalidattr:', expectNoMatch: /pkc-inline-mark/, describe: '未知 attr 無効' },
        { input: 'プリ :重要:bold,red: ポスト', expectMatch: /<span class="pkc-inline-mark".*?>重要<\/span>/, describe: '文中混在' },
        { input: ':short:bold:', expectMatch: /<span class="pkc-inline-mark"/, describe: '短い content' },
        { input: ':content with spaces:bold:', expectMatch: /<span class="pkc-inline-mark"/, describe: 'content にスペース' },
        { input: ':a:strike:', expectMatch: /line-through/, describe: 'strike alias' },
      ];
      for (const c of cases) {
        const html = renderMarkdown(c.input);
        if (c.expectMatch) expect(html, c.describe).toMatch(c.expectMatch);
        if (c.expectNoMatch) expect(html, c.describe).not.toMatch(c.expectNoMatch);
      }
    });
  });
});
