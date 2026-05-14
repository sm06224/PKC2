/**
 * @vitest-environment happy-dom
 *
 * PR-V3(2026-05-14):AstLayoutHint 専用 test。
 * Gemini review(2026-05-13)推奨で AST attrs に layout-* / slide-layout 等の
 * 多目的 hint を **semantic attrs から名前空間分離** して expose し、target
 * lowering(HTML / DOCX / Beamer / Reveal / Pandoc)で衝突しない設計を着地。
 */
import { describe, it, expect } from 'vitest';
import { parseMarkdownToAst } from '@features/ast/parse';
import { renderAstToHtml } from '@features/ast/render-html';
import { renderAstToMarkdown } from '@features/ast/render-markdown';
import { semanticHash } from '@features/ast/semantic-hash';
import type { AstBlock, AstFigure, AstIfBlock, AstQuote, AstSection } from '@core/ast/index';

function findFirst<T extends AstBlock>(
  blocks: readonly AstBlock[],
  kind: T['kind'],
): T | undefined {
  return blocks.find((b) => b.kind === kind) as T | undefined;
}

describe('PR-V3 AstLayoutHint', () => {
  it('`:::section{role=hero layout-columns=2}` → section.layout.columns=2', () => {
    const ast = parseMarkdownToAst(':::section{role=hero layout-columns=2}\n\n本文\n\n:::');
    const section = findFirst<AstSection>(ast.children, 'section');
    expect(section).toBeDefined();
    expect(section!.layout?.columns).toBe(2);
    // semantic attrs(role)は保持、layout-* は kvs から除外
    expect(section!.role).toBe('hero');
    expect(section!.attrs?.kvs?.['layout-columns']).toBeUndefined();
  });

  it('`:::figure{kind=figure layout-float=right}` → figure.layout.float=right', () => {
    const ast = parseMarkdownToAst(':::figure{kind=figure layout-float=right}\n\n![](x.png)\n\n:::');
    const fig = findFirst<AstFigure>(ast.children, 'figure');
    expect(fig).toBeDefined();
    expect(fig!.layout?.float).toBe('right');
  });

  it('`:::if{format=html layout-region=sidebar}` → if-block.layout.region=sidebar', () => {
    const ast = parseMarkdownToAst(':::if{format=html layout-region=sidebar}\n\n本文\n\n:::');
    const ifb = findFirst<AstIfBlock>(ast.children, 'if-block');
    expect(ifb).toBeDefined();
    expect(ifb!.layout?.region).toBe('sidebar');
  });

  it('`:::quote{author=X layout-text-align=center}` → quote.layout.textAlign=center', () => {
    const ast = parseMarkdownToAst(':::quote{author="Smith" layout-text-align=center}\n\n引用\n\n:::');
    const q = findFirst<AstQuote>(ast.children, 'quote');
    expect(q).toBeDefined();
    expect(q!.layout?.textAlign).toBe('center');
    // citation は保持
    expect(q!.citation?.author).toBe('Smith');
  });

  it('`slide-layout=title` → section.layout.slideLayout=title', () => {
    const ast = parseMarkdownToAst(':::section{role=slide slide-layout=title}\n\nTitle\n\n:::');
    const section = findFirst<AstSection>(ast.children, 'section');
    expect(section!.layout?.slideLayout).toBe('title');
  });

  it('HTML render — `data-pkc-layout-columns="2"` を emit', () => {
    const ast = parseMarkdownToAst(':::section{role=hero layout-columns=2 layout-float=left}\n\n本文\n\n:::');
    const html = renderAstToHtml(ast);
    expect(html).toContain('data-pkc-layout-columns="2"');
    expect(html).toContain('data-pkc-layout-float="left"');
  });

  it('PKC MD render — layout-* を round-trip 保持', () => {
    const src = ':::section{role=hero layout-columns=2}\n\n本文\n\n:::';
    const ast1 = parseMarkdownToAst(src);
    const md = renderAstToMarkdown(ast1, { mode: 'pkc' });
    expect(md).toContain('layout-columns=2');
    // 2 周目 parse で再現
    const ast2 = parseMarkdownToAst(md);
    const section = findFirst<AstSection>(ast2.children, 'section');
    expect(section!.layout?.columns).toBe(2);
  });

  it('GFM MD render — layout-* は drop(GFM consumer に不要)', () => {
    const ast = parseMarkdownToAst(':::section{role=note layout-columns=2}\n\n本文\n\n:::');
    const md = renderAstToMarkdown(ast, { mode: 'gfm' });
    expect(md).not.toContain('layout-columns');
  });

  it('semanticHash — layout 差は semantic 差', () => {
    const a = parseMarkdownToAst(':::section{role=hero layout-columns=2}\n\n本文\n\n:::');
    const b = parseMarkdownToAst(':::section{role=hero layout-columns=3}\n\n本文\n\n:::');
    expect(semanticHash(a)).not.toBe(semanticHash(b));
  });

  it('semanticHash — layout 同一は同 hash', () => {
    const a = parseMarkdownToAst(':::section{role=hero layout-columns=2}\n\n本文\n\n:::');
    const b = parseMarkdownToAst(':::section{role=hero layout-columns=2}\n\n本文\n\n:::');
    expect(semanticHash(a)).toBe(semanticHash(b));
  });

  it('layout 無し block:semanticHash は layout key を hash に含めない', () => {
    const a = parseMarkdownToAst(':::section{role=hero}\n\n本文\n\n:::');
    const b = parseMarkdownToAst(':::section{role=hero}\n\n本文\n\n:::');
    expect(semanticHash(a)).toBe(semanticHash(b));
  });

  it('alias `columns` も layout-columns と同等に capture', () => {
    const ast = parseMarkdownToAst(':::section{role=hero columns=3}\n\n本文\n\n:::');
    const section = findFirst<AstSection>(ast.children, 'section');
    expect(section!.layout?.columns).toBe(3);
  });
});
