/**
 * v4 §12 stack PR 5:Tier 1 class chain simple `:::.cls.cls(#id)?` 寛容 6 variation。
 *
 * 全 6 variation が同 AST に正規化、formal `:::format{.cls #id}` と等価な HTML 出力。
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('v4 §12: Tier 1 class chain `:::.cls.cls`(stack PR 5、寛容 6 variation)', () => {
  describe('6 variation 同 AST 正規化', () => {
    it('variation 1: packed `:::.highlight.important`', () => {
      const html = renderMarkdown(':::.highlight.important\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block highlight important"[^>]*data-pkc-format-block[^>]*>/);
      expect(html).toMatch(/<p>body<\/p>/);
    });

    it('variation 2: space-separated `::: .highlight .important`', () => {
      const html = renderMarkdown('::: .highlight .important\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block highlight important"[^>]*>/);
      expect(html).toMatch(/<p>body<\/p>/);
    });

    it('variation 3: Pandoc brace `::: {.highlight .important}`', () => {
      const html = renderMarkdown('::: {.highlight .important}\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block highlight important"[^>]*>/);
      expect(html).toMatch(/<p>body<\/p>/);
    });

    it('variation 4: 単 class with dot `:::.highlight`', () => {
      const html = renderMarkdown(':::.highlight\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block highlight"[^>]*>/);
    });

    it('variation 5: 単 class bare `::: highlight`(dot 省略可)', () => {
      const html = renderMarkdown('::: highlight\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block highlight"[^>]*>/);
    });

    it('variation 6: class + id packed `:::.highlight#myid`', () => {
      const html = renderMarkdown(':::.highlight#myid\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block highlight"[^>]*id="myid"[^>]*>/);
    });

    it('variation 7: class + id space-separated `::: .highlight #myid`', () => {
      const html = renderMarkdown('::: .highlight #myid\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block highlight"[^>]*id="myid"[^>]*>/);
    });
  });

  describe('canonical 正規化(class ABC sort)', () => {
    it('case 8: 入力 `.z.a.m` → ABC sorted `a m z`', () => {
      const html = renderMarkdown(':::.z.a.m\nbody\n:::');
      expect(html).toMatch(/class="pkc-format-block a m z"/);
    });

    it('case 9: 入力 `::: .z .a .m` → 同 ABC sorted', () => {
      const html = renderMarkdown('::: .z .a .m\nbody\n:::');
      expect(html).toMatch(/class="pkc-format-block a m z"/);
    });

    it('case 10: brace `{.z .a .m}` → 同 ABC sorted', () => {
      const html = renderMarkdown('::: {.z .a .m}\nbody\n:::');
      expect(html).toMatch(/class="pkc-format-block a m z"/);
    });
  });

  describe('content 内側 parse', () => {
    it('case 11: 複段落', () => {
      const html = renderMarkdown(':::.box\nparagraph 1\n\nparagraph 2\n:::');
      expect(html).toMatch(/<div class="pkc-format-block box"/);
      expect(html).toMatch(/<p>paragraph 1<\/p>/);
      expect(html).toMatch(/<p>paragraph 2<\/p>/);
    });

    it('case 12: list 内包', () => {
      const html = renderMarkdown(':::.box\n- item 1\n- item 2\n:::');
      expect(html).toMatch(/<div class="pkc-format-block box"/);
      expect(html).toMatch(/<ul>/);
      expect(html).toMatch(/<li>item 1<\/li>/);
    });

    it('case 13: inline markup', () => {
      const html = renderMarkdown(':::.box\n**bold** and *italic*\n:::');
      expect(html).toMatch(/<strong>bold<\/strong>/);
      expect(html).toMatch(/<em>italic<\/em>/);
    });
  });

  describe('Tier 1 / Tier 2 formal の共存', () => {
    it('case 14: 同文書内に Tier 1 と Tier 2 が共存', () => {
      const md =
        ':::.highlight\ntier 1 simple\n:::\n\n:::format{.important #id-1}\ntier 2 formal\n:::';
      const html = renderMarkdown(md);
      expect(html).toMatch(/<div class="pkc-format-block highlight"[^>]*>/);
      expect(html).toMatch(/<div class="pkc-format-block important"[^>]*id="id-1"[^>]*>/);
    });
  });

  describe('reject(invalid form)', () => {
    it('case 15: 完全空 `:::` 単独はクロース扱い、format opener にしない', () => {
      const html = renderMarkdown(':::\nbody\n:::');
      // どちらの ::: も close 扱い、body は plain paragraph
      expect(html).not.toMatch(/<div class="pkc-format-block/);
    });

    it('case 16: `::: invalid.dot` は match 失敗', () => {
      const html = renderMarkdown('::: invalid.dot\nbody\n:::');
      // invalid token、format opener にならない
      expect(html).not.toMatch(/<div class="pkc-format-block/);
    });
  });
});
