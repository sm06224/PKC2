/**
 * reform-2026-05 Phase 2 PR-2I:AST module skeleton type 検証 test。
 *
 * 本 test は **type 定義の structural correctness** のみを assert(skeleton)。
 * 実装(parse / render / canonicalize)は post-reform Phase Z で着手予定。
 */
import { describe, it, expect } from 'vitest';
import type {
  AstDocument,
  AstBlock,
  AstInline,
  AstStrong,
  AstParagraph,
  AstSection,
  AstAttrs,
} from '@core/ast';
import { isCanonical } from '@core/ast';

describe('AST skeleton type 定義(reform Phase 2 PR-2I)', () => {
  it('AstStrong は strong + children を持つ', () => {
    const node: AstStrong = {
      kind: 'strong',
      children: [{ kind: 'text', value: 'bold' }],
    };
    expect(node.kind).toBe('strong');
    expect(node.children.length).toBe(1);
  });

  it('AstParagraph は children + 任意 align / indent', () => {
    const para: AstParagraph = {
      kind: 'paragraph',
      align: 'end',
      indent: 1,
      children: [{ kind: 'text', value: 'A' }],
    };
    expect(para.align).toBe('end');
  });

  it('AstSection は role + children(block list)', () => {
    const sec: AstSection = {
      kind: 'section',
      role: 'warning',
      children: [
        { kind: 'paragraph', children: [{ kind: 'text', value: '注意' }] },
      ],
    };
    expect(sec.role).toBe('warning');
    expect(sec.children.length).toBe(1);
  });

  it('AstDocument に globals + body が乗る', () => {
    const doc: AstDocument = {
      kind: 'document',
      writing: 'vertical',
      direction: 'rtl',
      align: 'top',
      notation: 'pkc-markdown-1.0',
      vars: { product: 'PKC2' },
      children: [],
    };
    expect(doc.kind).toBe('document');
    expect(doc.writing).toBe('vertical');
    expect(doc.vars?.product).toBe('PKC2');
  });

  it('AstAttrs は id / classes / kvs', () => {
    const attrs: AstAttrs = {
      id: 'my-id',
      classes: ['warn', 'highlight'],
      kvs: { author: 'Smith', year: '2020' },
    };
    expect(attrs.id).toBe('my-id');
    expect(attrs.classes.length).toBe(2);
  });

  it('AstInline / AstBlock union は discriminator で絞り込める', () => {
    const inline: AstInline = { kind: 'text', value: 'A' };
    if (inline.kind === 'text') {
      // 型レベルで AstText に絞り込まれる
      expect(typeof inline.value).toBe('string');
    }

    const block: AstBlock = { kind: 'paragraph', children: [] };
    if (block.kind === 'paragraph') {
      expect(Array.isArray(block.children)).toBe(true);
    }
  });

  it('isCanonical は skeleton 段階では常に true(post-reform で実装)', () => {
    expect(isCanonical({ kind: 'strong' })).toBe(true);
  });
});
