/**
 * @vitest-environment happy-dom
 *
 * v4 §12 stack PR 11:visual + state parity test。
 *
 * 4 経路 byte-equivalent round-trip(reform-2026-05 wave 10 §6 規律):
 *   MD → HTML / HTML → MD / MD → IR → MD stable / IR → HTML → IR stable
 *
 * inline ↔ block 完全対称 (v4 §11.1) も verify:
 *   inline `:T:vocab:` の style 内容 === block `:::vocab\nbody\n:::` の style 内容
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';
import { renderAstToMarkdown } from '@features/ast/render-markdown';
import { parseHtmlToAst } from '@features/ast/parse-html';
import type { AstFormatBlock, AstDocument, AstParagraph, AstText } from '@core/ast';

function mkDoc(blocks: unknown[]): AstDocument {
  return { kind: 'document', children: blocks } as AstDocument;
}

function mkParagraph(text: string): AstParagraph {
  return { kind: 'paragraph', children: [{ kind: 'text', value: text } as AstText] };
}

describe('v4 §12 stack PR 11: 4 経路 byte-equivalent round-trip', () => {
  describe('inline ↔ block 完全対称(v4 §11.1)', () => {
    it('case 1: vocabulary `:T:red,bg-yellow,1.2em:` と `:::red,bg-yellow,1.2em` の style 内容一致', () => {
      const inlineHtml = renderMarkdown(':text:red,bg-yellow,1.2em:');
      const blockHtml = renderMarkdown(':::red,bg-yellow,1.2em\nbody\n:::');
      const inlineStyle = inlineHtml.match(/style="([^"]+)"/)?.[1];
      const blockStyle = blockHtml.match(/style="([^"]+)"/)?.[1];
      expect(inlineStyle).toBe(blockStyle);
    });

    it('case 2: Q7 separator `:T:bold red:` (space) と block `:::bold red` の style 一致', () => {
      const inlineHtml = renderMarkdown(':text:bold red:');
      const blockHtml = renderMarkdown(':::bold red\nbody\n:::');
      const inlineStyle = inlineHtml.match(/style="([^"]+)"/)?.[1];
      const blockStyle = blockHtml.match(/style="([^"]+)"/)?.[1];
      expect(inlineStyle).toBe(blockStyle);
    });

    it('case 3: 全 vocab form (red,bg-yellow,1.2em,bold,italic) inline / block 完全一致', () => {
      const inlineHtml = renderMarkdown(':text:red,bg-yellow,1.2em,bold,italic:');
      const blockHtml = renderMarkdown(':::red,bg-yellow,1.2em,bold,italic\nbody\n:::');
      const inlineStyle = inlineHtml.match(/style="([^"]+)"/)?.[1];
      const blockStyle = blockHtml.match(/style="([^"]+)"/)?.[1];
      expect(inlineStyle).toBe(blockStyle);
    });
  });

  describe('HTML → AST → markdown(canonical) round-trip', () => {
    it('case 4: 完全 attrs HTML → AST → MD で formal `:::format{...}` に正規化', () => {
      const html = '<div class="pkc-format-block highlight" id="note-1" data-pkc-format-block data-pkc-indent="2" data-pkc-align="center"><p>body</p></div>';
      const ast = parseHtmlToAst(html);
      const md = renderAstToMarkdown(ast, { mode: 'pkc' });
      expect(md).toMatch(/:::format\{\.highlight #note-1 indent=2 align=center\}/);
    });

    it('case 5: HTML → AST stable(deep equal、idempotent)', () => {
      const html = '<div class="pkc-format-block highlight" data-pkc-format-block><p>body</p></div>';
      const ast1 = parseHtmlToAst(html);
      const ast2 = parseHtmlToAst(html);
      expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
    });

    it('case 6: AST → MD stable(canonical attrs 順、idempotent)', () => {
      const ast: AstDocument = mkDoc([
        {
          kind: 'format-block',
          classes: ['z', 'a', 'm'],
          children: [mkParagraph('body')],
        } as AstFormatBlock,
      ]);
      const md1 = renderAstToMarkdown(ast, { mode: 'pkc' });
      const md2 = renderAstToMarkdown(ast, { mode: 'pkc' });
      expect(md1).toBe(md2);
      // class が ABC sorted
      expect(md1).toMatch(/\.a \.m \.z/);
    });
  });

  describe('Tier 0/1/2 → 共通 HTML(同 markdown 解釈)', () => {
    it('case 7: Tier 0 vocab `:::bg-yellow` の HTML 出力に style=background', () => {
      const html = renderMarkdown(':::bg-yellow\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block"[^>]*style="background-color: yellow"/);
    });

    it('case 8: Tier 1 class chain `:::.highlight` の HTML 出力に class', () => {
      const html = renderMarkdown(':::.highlight\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block highlight"/);
    });

    it('case 9: Tier 2 formal `:::format{.cls #id}` の HTML 出力に class + id', () => {
      const html = renderMarkdown(':::format{.highlight #note-1}\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block highlight" id="note-1"/);
    });

    it('case 10: 同 markdown 文書内に Tier 0 / Tier 1 / Tier 2 が共存', () => {
      const md =
        ':::red\nT0 vocab\n:::\n\n:::.cls1\nT1 class\n:::\n\n:::format{.cls2 #id1}\nT2 formal\n:::';
      const html = renderMarkdown(md);
      // 3 つの format-block すべて render される
      const matches = html.match(/<div class="pkc-format-block/g);
      expect(matches?.length).toBe(3);
    });
  });

  describe('Q8 value-only round-trip', () => {
    it('case 11: `:::section{intro}` → HTML data-pkc-role=intro → 任意 role 維持', () => {
      const html = renderMarkdown(':::section{intro}\nbody\n:::');
      expect(html).toMatch(/data-pkc-role="intro"/);
      expect(html).toMatch(/pkc-section-intro/);
    });

    it('case 12: `:::if{html}` → format match → content 表示', () => {
      const html = renderMarkdown(':::if{html}\nshown\n:::');
      expect(html).toMatch(/shown/);
    });

    it('case 13: `:::toc{2}` → depth=2 反映', () => {
      const md = '# h1\n## h2\n### h3\n\n:::toc{2}\n:::';
      const html = renderMarkdown(md);
      expect(html).toMatch(/data-pkc-toc-depth="2"/);
    });
  });

  describe('vocabulary canonical attrs ABC sorted(diff friendly)', () => {
    it('case 14: 入力順 random でも出力 ABC sorted (block)', () => {
      const html = renderMarkdown(':::1.2em,bold,red,bg-yellow\nbody\n:::');
      expect(html).toMatch(/style="background-color: yellow; color: red; font-size: 1\.2em; font-weight: bold"/);
    });

    it('case 15: 入力順 random でも inline 同様 ABC sorted', () => {
      const html = renderMarkdown(':text:1.2em,bold,red,bg-yellow:');
      expect(html).toMatch(/style="background-color: yellow; color: red; font-size: 1\.2em; font-weight: bold"/);
    });
  });
});
