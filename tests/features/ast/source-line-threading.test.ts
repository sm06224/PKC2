/**
 * @vitest-environment node
 *
 * 領域 10-3 IR 残課題(2026-05-28、user direction 「3 IR 行 sync」):
 * `decompose-pkc.ts` で構築される block(`:::section` / `:::format` /
 * `:::figure` / `:::quote` / `:::if` / `%%%` comment / `:::break`)が
 * opener paragraph の `pos` を thread して構築 block の `pos` に転記、
 * render-html.ts の `sourceLineAttr` が AST 経路でも `data-pkc-source-line`
 * を block element に emit できることを確認。
 *
 * markdown-it 経路と AST 経路の 2 系統で source-preview-sync が同精度で
 * 機能するための前提整備。
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdownToAst } from '@features/ast/parse';
import { renderAstToHtml } from '@features/ast/render-html';
import type { AstSection, AstFigure, AstIfBlock, AstQuote, AstFormatBlock, AstCommentBlock, AstParagraph } from '@core/ast';

describe('AST source-line threading via decompose-pkc(領域 10-3 IR 残)', () => {
  it('case 1: `:::section{role=tip}` の構築 AstSection に opener 行の pos が転記される', () => {
    const md = [
      'first paragraph',
      '',
      ':::section{role=tip}',
      'hint content',
      ':::',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const section = ast.children.find((b) => b.kind === 'section') as AstSection | undefined;
    expect(section).toBeDefined();
    expect(section!.pos).toBeDefined();
    // opener `:::section{...}` は 3 行目(1-based)
    expect(section!.pos!.line).toBe(3);
  });

  it('case 2: `:::figure` の構築 AstFigure にも pos が転記される', () => {
    const md = [
      'p1',
      '',
      ':::figure{kind=table}',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      ':::',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const figure = ast.children.find((b) => b.kind === 'figure') as AstFigure | undefined;
    expect(figure).toBeDefined();
    expect(figure!.pos?.line).toBe(3);
  });

  it('case 3: `:::if{format=docx}` の構築 AstIfBlock にも pos が転記される', () => {
    const md = [
      'before',
      '',
      ':::if{format=docx}',
      'word-only',
      ':::',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const ifBlock = ast.children.find((b) => b.kind === 'if-block') as AstIfBlock | undefined;
    expect(ifBlock).toBeDefined();
    expect(ifBlock!.pos?.line).toBe(3);
  });

  it('case 4: `:::quote{author=...}` の構築 AstQuote にも pos が転記される', () => {
    const md = [
      ':::quote{author=Aristotle}',
      'we are what we repeatedly do.',
      ':::',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const quote = ast.children.find((b) => b.kind === 'quote') as AstQuote | undefined;
    expect(quote).toBeDefined();
    expect(quote!.pos?.line).toBe(1);
  });

  it('case 5: `:::format{.cls}` の構築 AstFormatBlock にも pos が転記される', () => {
    const md = [
      'header',
      '',
      ':::format{.highlight}',
      'wrapped',
      ':::',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const fb = ast.children.find((b) => b.kind === 'format-block') as AstFormatBlock | undefined;
    expect(fb).toBeDefined();
    expect(fb!.pos?.line).toBe(3);
  });

  it('case 6: `%%% ... %%%` の構築 AstCommentBlock にも opener 行の pos が転記される', () => {
    const md = [
      'visible',
      '',
      '%%%',
      'hidden content',
      '%%%',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const cb = ast.children.find((b) => b.kind === 'comment-block') as AstCommentBlock | undefined;
    expect(cb).toBeDefined();
    expect(cb!.pos?.line).toBe(3);
  });

  it('case 7: render-html が AstSection.pos から `data-pkc-source-line` を emit', () => {
    const md = [
      'p1',
      '',
      ':::section{role=warning}',
      'careful',
      ':::',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const html = renderAstToHtml(ast, { sourceLineAnchors: true });
    // section の opener 行は 3 行目(1-based)→ pos.line-1 = 2 を emit
    expect(html).toMatch(/<section[^>]*data-pkc-source-line="2"/);
  });

  it('case 8: render-html が AstQuote.pos からも emit', () => {
    const md = [
      ':::quote{author=Lao Tzu}',
      'A journey of a thousand miles begins with a single step.',
      ':::',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const html = renderAstToHtml(ast, { sourceLineAnchors: true });
    expect(html).toMatch(/<blockquote[^>]*data-pkc-source-line="0"/);
  });

  it('case 9: sourceLineAnchors: false なら data-pkc-source-line は出ない(opt-in)', () => {
    const md = ':::section{role=tip}\nhint\n:::';
    const ast = parseMarkdownToAst(md);
    const html = renderAstToHtml(ast, { sourceLineAnchors: false });
    expect(html).not.toMatch(/data-pkc-source-line/);
  });

  it('case 10: single-line block(`:::section{role=tip} ... :::`)も pos 転記', () => {
    const md = [
      'p1',
      '',
      ':::section{role=tip} inline content :::',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const section = ast.children.find((b) => b.kind === 'section') as AstSection | undefined;
    expect(section).toBeDefined();
    expect(section!.pos?.line).toBe(3);
  });

  it('case 11: html_block にも pos が stamped', () => {
    const md = [
      '<div class="custom">',
      'hello',
      '</div>',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const p = ast.children[0] as AstParagraph | undefined;
    expect(p).toBeDefined();
    expect(p!.pos?.line).toBe(1);
  });

  it('case 12: 通常 paragraph / heading / list は既存 stamp 経路で pos 維持', () => {
    const md = [
      '# heading 1',
      '',
      'paragraph at line 3',
      '',
      '- list at line 5',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    expect(ast.children[0]?.pos?.line).toBe(1);
    expect(ast.children[1]?.pos?.line).toBe(3);
    expect(ast.children[2]?.pos?.line).toBe(5);
  });
});
