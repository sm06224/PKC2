/**
 * @vitest-environment happy-dom
 *
 * PR-2GG(2026-05-12):window.PKC.ast 公開 API の test。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { exposeAstApi, getAstApi } from '@adapter/public-ast-api';

describe('PR-2GG window.PKC.ast 公開 API', () => {
  beforeEach(() => {
    const w = window as unknown as { PKC?: unknown };
    delete w.PKC;
  });

  it('exposeAstApi() で window.PKC.ast に設置', () => {
    exposeAstApi();
    const w = window as unknown as { PKC?: { ast?: unknown } };
    expect(w.PKC?.ast).toBeDefined();
  });

  it('idempotent:複数回呼んでも上書きしない', () => {
    exposeAstApi();
    const w = window as unknown as { PKC?: { ast?: unknown } };
    const first = w.PKC?.ast;
    exposeAstApi();
    expect(w.PKC?.ast).toBe(first);
  });

  it('既存 window.PKC に別 namespace があっても保持', () => {
    const w = window as unknown as {
      PKC?: { ast?: unknown; other?: unknown };
    };
    w.PKC = { other: 'preserved' };
    exposeAstApi();
    expect(w.PKC?.other).toBe('preserved');
    expect(w.PKC?.ast).toBeDefined();
  });

  describe('API surface', () => {
    it('parseMarkdown(text) → AstDocument', () => {
      const api = getAstApi();
      const ast = api.parseMarkdown('# Title');
      expect(ast.kind).toBe('document');
      expect(ast.children.length).toBe(1);
      expect(ast.children[0]?.kind).toBe('heading');
    });

    it('renderHtml(ast) → HTML 文字列', () => {
      const api = getAstApi();
      const ast = api.parseMarkdown('**bold**');
      const html = api.renderHtml(ast);
      expect(html).toContain('<strong>bold</strong>');
    });

    it('canonicalize(ast) は idempotent', () => {
      const api = getAstApi();
      const ast = api.parseMarkdown('# A\n\nparagraph');
      const c1 = api.canonicalize(ast);
      const c2 = api.canonicalize(c1);
      expect(JSON.stringify(c1)).toBe(JSON.stringify(c2));
    });

    it('toPandocJson(ast) → Pandoc Native JSON', () => {
      const api = getAstApi();
      const ast = api.parseMarkdown('# Title');
      const pandoc = api.toPandocJson(ast) as { 'pandoc-api-version': unknown; blocks: unknown };
      expect(pandoc['pandoc-api-version']).toBeDefined();
      expect(pandoc.blocks).toBeDefined();
    });

    it('markdownToPandoc(text) 1 step convenience', () => {
      const api = getAstApi();
      const pandoc = api.markdownToPandoc('# Hello\n\n_world_') as { blocks: Array<{ t: string }> };
      expect(pandoc.blocks[0]?.t).toBe('Header');
      expect(pandoc.blocks[1]?.t).toBe('Para');
    });

    it('version 文字列', () => {
      const api = getAstApi();
      expect(typeof api.version).toBe('string');
      expect(api.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
