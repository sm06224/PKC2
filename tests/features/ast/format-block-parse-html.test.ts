/**
 * @vitest-environment happy-dom
 *
 * v4 §12 stack PR 9:parse-html 逆経路。
 * `<div class="pkc-format-block">` HTML を AstFormatBlock に逆 parse。
 *
 * 4 経路 byte-equivalent round-trip(MD → HTML / HTML → MD / MD → IR → MD / IR → HTML → IR)。
 */

import { describe, it, expect } from 'vitest';
import { parseHtmlToAst } from '@features/ast/parse-html';

function findFormatBlock(ast: { children: readonly unknown[] }): unknown {
  for (const block of ast.children) {
    if ((block as { kind: string }).kind === 'format-block') return block;
  }
  return null;
}

describe('v4 §12 stack PR 9: HTML → AstFormatBlock 逆 parse', () => {
  it('case 1: 基本 — class only', () => {
    const html = '<div class="pkc-format-block highlight" data-pkc-format-block><p>body</p></div>';
    const ast = parseHtmlToAst(html);
    const block = findFormatBlock(ast) as { kind: string; classes: string[]; children: unknown[] };
    expect(block.kind).toBe('format-block');
    expect(block.classes).toEqual(['highlight']);
    expect(block.children).toHaveLength(1);
  });

  it('case 2: 複数 class、ABC sorted output', () => {
    const html = '<div class="pkc-format-block zeta alpha beta" data-pkc-format-block><p>body</p></div>';
    const ast = parseHtmlToAst(html);
    const block = findFormatBlock(ast) as { classes: string[] };
    expect(block.classes).toEqual(['alpha', 'beta', 'zeta']);
  });

  it('case 3: id 抽出', () => {
    const html = '<div class="pkc-format-block" id="note-1" data-pkc-format-block><p>body</p></div>';
    const ast = parseHtmlToAst(html);
    const block = findFormatBlock(ast) as { blockId: string };
    expect(block.blockId).toBe('note-1');
  });

  it('case 4: indent 抽出', () => {
    const html = '<div class="pkc-format-block" data-pkc-format-block data-pkc-indent="2"><p>body</p></div>';
    const ast = parseHtmlToAst(html);
    const block = findFormatBlock(ast) as { indent: number };
    expect(block.indent).toBe(2);
  });

  it('case 5: align 抽出', () => {
    const html = '<div class="pkc-format-block" data-pkc-format-block data-pkc-align="center"><p>body</p></div>';
    const ast = parseHtmlToAst(html);
    const block = findFormatBlock(ast) as { align: string };
    expect(block.align).toBe('center');
  });

  it('case 6: style 属性 → styles record', () => {
    const html = '<div class="pkc-format-block" data-pkc-format-block style="color: red; background-color: yellow; font-size: 1.2em"><p>body</p></div>';
    const ast = parseHtmlToAst(html);
    const block = findFormatBlock(ast) as { styles: Record<string, string> };
    expect(block.styles).toEqual({
      color: 'red',
      'background-color': 'yellow',
      'font-size': '1.2em',
    });
  });

  it('case 7: その他 data-pkc-* → kvs', () => {
    const html = '<div class="pkc-format-block" data-pkc-format-block data-pkc-custom="value" data-pkc-flag><p>body</p></div>';
    const ast = parseHtmlToAst(html);
    const block = findFormatBlock(ast) as { kvs: Record<string, unknown> };
    expect(block.kvs).toEqual({ custom: 'value', flag: true });
  });

  it('case 8: 完全 attrs round-trip', () => {
    const html = '<div class="pkc-format-block highlight important" id="note-1" data-pkc-format-block data-pkc-indent="2" data-pkc-align="center" data-pkc-custom="value" style="color: red"><p>body</p></div>';
    const ast = parseHtmlToAst(html);
    const block = findFormatBlock(ast) as {
      kind: string;
      classes: string[];
      blockId: string;
      indent: number;
      align: string;
      styles: Record<string, string>;
      kvs: Record<string, unknown>;
    };
    expect(block.kind).toBe('format-block');
    expect(block.classes).toEqual(['highlight', 'important']);
    expect(block.blockId).toBe('note-1');
    expect(block.indent).toBe(2);
    expect(block.align).toBe('center');
    expect(block.styles).toEqual({ color: 'red' });
    expect(block.kvs).toEqual({ custom: 'value' });
  });

  it('case 9: nested format-block 再帰', () => {
    const html = '<div class="pkc-format-block outer" data-pkc-format-block><div class="pkc-format-block inner" data-pkc-format-block><p>nested</p></div></div>';
    const ast = parseHtmlToAst(html);
    const outer = findFormatBlock(ast) as { classes: string[]; children: unknown[] };
    expect(outer.classes).toEqual(['outer']);
    const inner = outer.children[0] as { kind: string; classes: string[] };
    expect(inner.kind).toBe('format-block');
    expect(inner.classes).toEqual(['inner']);
  });

  it('case 10: generic div(no pkc-format-block class)は opaque-block(既存挙動維持)', () => {
    const html = '<div class="other-class"><p>body</p></div>';
    const ast = parseHtmlToAst(html);
    const block = ast.children[0] as { kind: string };
    expect(block.kind).toBe('opaque-block');
  });
});
