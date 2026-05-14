/**
 * @vitest-environment happy-dom
 *
 * PR-V2(2026-05-14):AstCitation 専用 node 格上げ test。
 * Gemini review(2026-05-13)推奨で AstQuote.citation 属性から専用 node
 * への格上げを着地。`[@id]` syntax を auto-ref と citation に分岐し、
 * BibTeX / Pandoc citation processor 連携の起点とする。
 */
import { describe, it, expect } from 'vitest';
import { parseMarkdownToAst } from '@features/ast/parse';
import { renderAstToHtml } from '@features/ast/render-html';
import { renderAstToMarkdown } from '@features/ast/render-markdown';
import { astToPandocNative } from '@features/ast/export-pandoc';
import type { AstCitation, AstInline } from '@core/ast/index';

function getInlines(text: string): AstInline[] {
  const ast = parseMarkdownToAst(text);
  return (ast.children[0] as unknown as { children: AstInline[] }).children;
}

describe('PR-V2 AstCitation', () => {
  it('`[@smith2020]` → AstCitation(書誌的 id)', () => {
    const inlines = getInlines('参照 [@smith2020] あり');
    const cite = inlines.find((n) => n.kind === 'citation') as
      | AstCitation
      | undefined;
    expect(cite).toBeDefined();
    expect(cite!.id).toBe('smith2020');
  });

  it('`[@fig-1]` → AstAutoRef(図表参照)', () => {
    const inlines = getInlines('図 [@fig-1] 参照');
    const ref = inlines.find((n) => n.kind === 'auto-ref');
    expect(ref).toBeDefined();
    const cite = inlines.find((n) => n.kind === 'citation');
    expect(cite).toBeUndefined();
  });

  it('`[@table-2]` → AstAutoRef(表参照)', () => {
    const inlines = getInlines('表 [@table-2] 参照');
    const ref = inlines.find((n) => n.kind === 'auto-ref');
    expect(ref).toBeDefined();
  });

  it('`[@eq-pythagoras]` → AstAutoRef(数式参照)', () => {
    const inlines = getInlines('式 [@eq-pythagoras] 参照');
    const ref = inlines.find((n) => n.kind === 'auto-ref');
    expect(ref).toBeDefined();
  });

  it('`[see @smith2020, p. 42]` → AstCitation with prefix + suffix', () => {
    const inlines = getInlines('参照 [see @smith2020, p. 42] あり');
    const cite = inlines.find((n) => n.kind === 'citation') as
      | AstCitation
      | undefined;
    expect(cite).toBeDefined();
    expect(cite!.id).toBe('smith2020');
    expect(cite!.prefix).toBe('see');
    expect(cite!.suffix).toBe('p. 42');
  });

  it('AstCitation render(HTML)— `<cite class="pkc-citation" data-pkc-cite-id="..."`', () => {
    const ast = parseMarkdownToAst('[@kuhn1962]');
    const html = renderAstToHtml(ast);
    expect(html).toContain('<cite class="pkc-citation"');
    expect(html).toContain('data-pkc-cite-id="kuhn1962"');
  });

  it('AstCitation render(PKC MD)— `[@id]` 形を復元', () => {
    const ast = parseMarkdownToAst('[@smith2020]');
    const md = renderAstToMarkdown(ast, { mode: 'pkc' });
    expect(md).toContain('[@smith2020]');
  });

  it('AstCitation render(GFM)— Pandoc citation syntax 互換', () => {
    const ast = parseMarkdownToAst('[@smith2020]');
    const md = renderAstToMarkdown(ast, { mode: 'gfm' });
    expect(md).toContain('[@smith2020]');
  });

  it('AstCitation → Pandoc Cite node', () => {
    const ast = parseMarkdownToAst('参照 [@smith2020]');
    const pandoc = astToPandocNative(ast) as {
      blocks: Array<{ t: string; c?: unknown }>;
    };
    const json = JSON.stringify(pandoc);
    expect(json).toContain('"Cite"');
    expect(json).toContain('smith2020');
  });

  it('round-trip:`[@smith2020]` が parse → render(pkc)→ parse で stable', () => {
    const src1 = '本文 [@smith2020] 引用';
    const ast1 = parseMarkdownToAst(src1);
    const md = renderAstToMarkdown(ast1, { mode: 'pkc' });
    const ast2 = parseMarkdownToAst(md);
    const inlines = (ast2.children[0] as unknown as { children: AstInline[] })
      .children;
    expect(inlines.some((n) => n.kind === 'citation')).toBe(true);
  });
});
