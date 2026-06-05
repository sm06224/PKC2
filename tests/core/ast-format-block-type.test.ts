/**
 * v4 §12 stack PR 3:`AstFormatBlock` AST type 追加(types only)。
 *
 * 本 test は **type compile check + 基本 instance 生成** のみ。実 parser / renderer impl
 * は stack PR 4-6 で追加、本 PR は AST type を type system に登録する責務のみ。
 *
 * AstBlock union に追加されたことで、全 consumer(render-html / export-docx / export-pptx
 * / export-pandoc / semantic-hash)が exhaustive case を持つことが TypeScript で保証
 * される(no-op fallback case を本 PR で全件追加済)。
 */

import { describe, it, expect } from 'vitest';
import type { AstFormatBlock, AstBlock, AstParagraph, AstText } from '@core/ast';

describe('AstFormatBlock type(v4 §12 stack PR 3)', () => {
  it('case 1: basic instance — classes only', () => {
    const node: AstFormatBlock = {
      kind: 'format-block',
      classes: ['highlight'],
      children: [],
    };
    expect(node.kind).toBe('format-block');
    expect(node.classes).toEqual(['highlight']);
    expect(node.children).toEqual([]);
  });

  it('case 2: classes + styles + id', () => {
    const node: AstFormatBlock = {
      kind: 'format-block',
      classes: ['highlight', 'important'],
      styles: { color: 'red', 'background-color': 'yellow' },
      blockId: 'note-1',
      children: [],
    };
    expect(node.classes).toHaveLength(2);
    expect(node.styles?.color).toBe('red');
    expect(node.blockId).toBe('note-1');
  });

  it('case 3: indent + align + kvs', () => {
    const node: AstFormatBlock = {
      kind: 'format-block',
      classes: [],
      indent: 2,
      align: 'center',
      kvs: { 'custom-key': 'value', flag: true },
      children: [],
    };
    expect(node.indent).toBe(2);
    expect(node.align).toBe('center');
    expect(node.kvs?.['custom-key']).toBe('value');
    expect(node.kvs?.flag).toBe(true);
  });

  it('case 4: children — nested paragraph', () => {
    const para: AstParagraph = {
      kind: 'paragraph',
      children: [{ kind: 'text', value: 'inner content' } as AstText],
    };
    const node: AstFormatBlock = {
      kind: 'format-block',
      classes: ['highlight'],
      children: [para],
    };
    expect(node.children).toHaveLength(1);
    expect(node.children[0]!.kind).toBe('paragraph');
  });

  it('case 5: nested format-block(再帰 nest)', () => {
    const inner: AstFormatBlock = {
      kind: 'format-block',
      classes: ['inner'],
      children: [],
    };
    const outer: AstFormatBlock = {
      kind: 'format-block',
      classes: ['outer'],
      children: [inner],
    };
    expect(outer.children[0]!.kind).toBe('format-block');
  });

  it('case 6: AstBlock union 受け入れ', () => {
    const blocks: AstBlock[] = [
      { kind: 'format-block', classes: ['x'], children: [] },
      { kind: 'paragraph', children: [{ kind: 'text', value: 'p' } as AstText] },
    ];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.kind).toBe('format-block');
  });

  it('case 7: optional fields omitted', () => {
    // 最小 instance(classes と children のみ)が compile + runtime OK
    const node: AstFormatBlock = {
      kind: 'format-block',
      classes: [],
      children: [],
    };
    expect(node.styles).toBeUndefined();
    expect(node.blockId).toBeUndefined();
    expect(node.indent).toBeUndefined();
    expect(node.align).toBeUndefined();
    expect(node.kvs).toBeUndefined();
  });

  it('case 8: align 値の type narrowing', () => {
    // align は 4 値 union、他の値は compile fail(本 test では runtime check のみ)
    const cases: Array<AstFormatBlock['align']> = ['left', 'center', 'right', 'justify'];
    for (const a of cases) {
      const node: AstFormatBlock = { kind: 'format-block', classes: [], align: a, children: [] };
      expect(node.align).toBe(a);
    }
  });

  it('case 9: classes は readonly(immutable)', () => {
    const node: AstFormatBlock = {
      kind: 'format-block',
      classes: ['a', 'b'],
      children: [],
    };
    // readonly array は TypeScript で push 不可、runtime は freeze していないが
    // type system 上 immutable。本 test は型シグネチャの runtime 観測。
    expect(node.classes.length).toBe(2);
  });

  it('case 10: complete shape with all fields', () => {
    const node: AstFormatBlock = {
      kind: 'format-block',
      classes: ['highlight', 'important'],
      styles: { color: 'red', 'font-size': '1.2em', 'background-color': 'yellow' },
      blockId: 'box-1',
      indent: 2,
      align: 'center',
      kvs: { 'data-section-num': '1', flag: true, customKey: 'customValue' },
      children: [
        { kind: 'paragraph', children: [{ kind: 'text', value: 'A' } as AstText] },
        { kind: 'paragraph', children: [{ kind: 'text', value: 'B' } as AstText] },
      ],
    };
    expect(node.classes).toEqual(['highlight', 'important']);
    expect(node.styles?.['font-size']).toBe('1.2em');
    expect(node.blockId).toBe('box-1');
    expect(node.indent).toBe(2);
    expect(node.align).toBe('center');
    expect(node.kvs?.['data-section-num']).toBe('1');
    expect(node.children).toHaveLength(2);
  });
});
