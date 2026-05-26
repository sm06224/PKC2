/**
 * v4 §12 stack PR 8:render-markdown 逆経路(canonicalize Q6 simple → formal)。
 *
 * `AstFormatBlock` を canonical formal `:::format{...}` で markdown 出力。
 */

import { describe, it, expect } from 'vitest';
import { renderAstToMarkdown } from '@features/ast/render-markdown';
import type { AstDocument, AstFormatBlock, AstParagraph, AstText } from '@core/ast';

function mkDoc(blocks: AstFormatBlock[]): AstDocument {
  return {
    kind: 'document',
    children: blocks,
  } as AstDocument;
}

function mkParagraph(text: string): AstParagraph {
  return { kind: 'paragraph', children: [{ kind: 'text', value: text } as AstText] };
}

describe('v4 §12 stack PR 8: AstFormatBlock → markdown(canonical Q6 formal 寄せ)', () => {
  it('case 1: class only', () => {
    const doc = mkDoc([
      {
        kind: 'format-block',
        classes: ['highlight'],
        children: [mkParagraph('body')],
      },
    ]);
    const md = renderAstToMarkdown(doc, { mode: 'pkc' });
    expect(md).toContain(':::format{.highlight}');
    expect(md).toContain('body');
    expect(md).toMatch(/:::\s*$/);
  });

  it('case 2: 複数 class、ABC sorted', () => {
    const doc = mkDoc([
      {
        kind: 'format-block',
        classes: ['alpha', 'beta', 'zeta'],
        children: [mkParagraph('body')],
      },
    ]);
    const md = renderAstToMarkdown(doc, { mode: 'pkc' });
    expect(md).toContain(':::format{.alpha .beta .zeta}');
  });

  it('case 3: class + id', () => {
    const doc = mkDoc([
      {
        kind: 'format-block',
        classes: ['highlight'],
        blockId: 'note-1',
        children: [mkParagraph('body')],
      },
    ]);
    const md = renderAstToMarkdown(doc, { mode: 'pkc' });
    expect(md).toMatch(/:::format\{\.highlight #note-1\}/);
  });

  it('case 4: indent + align', () => {
    const doc = mkDoc([
      {
        kind: 'format-block',
        classes: [],
        indent: 2,
        align: 'center',
        children: [mkParagraph('body')],
      },
    ]);
    const md = renderAstToMarkdown(doc, { mode: 'pkc' });
    expect(md).toMatch(/indent=2/);
    expect(md).toMatch(/align=center/);
  });

  it('case 5: kvs(boolean flag + string)', () => {
    const doc = mkDoc([
      {
        kind: 'format-block',
        classes: [],
        kvs: { flag: true, customKey: 'value' },
        children: [mkParagraph('body')],
      },
    ]);
    const md = renderAstToMarkdown(doc, { mode: 'pkc' });
    expect(md).toMatch(/customKey="value"/);
    expect(md).toMatch(/flag/);
  });

  it('case 6: 複合 — class + id + indent + align + kvs(ABC sorted)', () => {
    const doc = mkDoc([
      {
        kind: 'format-block',
        classes: ['highlight', 'important'],
        blockId: 'note-1',
        indent: 2,
        align: 'center',
        kvs: { custom: 'value' },
        children: [mkParagraph('body')],
      },
    ]);
    const md = renderAstToMarkdown(doc, { mode: 'pkc' });
    expect(md).toMatch(
      /:::format\{\.highlight \.important #note-1 indent=2 align=center custom="value"\}/
    );
  });

  it('case 7: GFM mode は children のみ出力(format-block 装飾は失われる)', () => {
    const doc = mkDoc([
      {
        kind: 'format-block',
        classes: ['highlight'],
        children: [mkParagraph('plain body')],
      },
    ]);
    const md = renderAstToMarkdown(doc, { mode: 'gfm' });
    expect(md).toContain('plain body');
    expect(md).not.toMatch(/:::format/);
  });

  it('case 8: 入れ子 format-block(再帰)', () => {
    const inner: AstFormatBlock = {
      kind: 'format-block',
      classes: ['inner'],
      children: [mkParagraph('nested')],
    };
    const outer: AstFormatBlock = {
      kind: 'format-block',
      classes: ['outer'],
      children: [inner],
    };
    const doc = mkDoc([outer]);
    const md = renderAstToMarkdown(doc, { mode: 'pkc' });
    expect(md).toMatch(/:::format\{\.outer\}/);
    expect(md).toMatch(/:::format\{\.inner\}/);
    expect(md).toMatch(/nested/);
  });

  it('case 9: styles ABC sorted、key=value 形式で attr 化', () => {
    const doc = mkDoc([
      {
        kind: 'format-block',
        classes: [],
        styles: { color: 'red', 'font-size': '1.2em' },
        children: [mkParagraph('body')],
      },
    ]);
    const md = renderAstToMarkdown(doc, { mode: 'pkc' });
    // color="red" と font-size="1.2em" が attr に含まれる
    expect(md).toMatch(/color="red"/);
    expect(md).toMatch(/font-size="1\.2em"/);
  });

  it('case 10: 完全 attrs 順序(class → id → indent → align → styles → kvs)', () => {
    const doc = mkDoc([
      {
        kind: 'format-block',
        classes: ['a'],
        blockId: 'i',
        indent: 1,
        align: 'left',
        styles: { color: 'red' },
        kvs: { x: 'y' },
        children: [mkParagraph('body')],
      },
    ]);
    const md = renderAstToMarkdown(doc, { mode: 'pkc' });
    // 順序:.a → #i → indent=1 → align=left → color="red" → x="y"
    expect(md).toMatch(
      /:::format\{\.a #i indent=1 align=left color="red" x="y"\}/
    );
  });
});
