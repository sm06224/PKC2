/**
 * PR-2BB(2026-05-12):`astToPandocNative` の Pandoc JSON 構造 test。
 */
import { describe, it, expect } from 'vitest';
import { parseMarkdownToAst } from '@features/ast/parse';
import { astToPandocNative } from '@features/ast/export-pandoc';

describe('PR-2BB astToPandocNative — Pandoc Native JSON 雛形', () => {
  it('top-level に pandoc-api-version + meta + blocks', () => {
    const out = astToPandocNative(parseMarkdownToAst('# Title'));
    expect(out['pandoc-api-version']).toBeDefined();
    expect(out.meta).toBeDefined();
    expect(out.blocks).toBeDefined();
  });

  it('heading → Header', () => {
    const out = astToPandocNative(parseMarkdownToAst('# Title'));
    expect(out.blocks[0]?.t).toBe('Header');
  });

  it('paragraph → Para', () => {
    const out = astToPandocNative(parseMarkdownToAst('plain'));
    expect(out.blocks[0]?.t).toBe('Para');
  });

  it('strong → Strong', () => {
    const out = astToPandocNative(parseMarkdownToAst('**bold**'));
    const block = out.blocks[0]!;
    const inlines = (block.c as Array<{ t: string }>) ?? [];
    expect(inlines.some((x) => x.t === 'Strong')).toBe(true);
  });

  it('emphasis → Emph', () => {
    const out = astToPandocNative(parseMarkdownToAst('_em_'));
    const block = out.blocks[0]!;
    const inlines = (block.c as Array<{ t: string }>) ?? [];
    expect(inlines.some((x) => x.t === 'Emph')).toBe(true);
  });

  it('strike → Strikeout', () => {
    const out = astToPandocNative(parseMarkdownToAst('~~strike~~'));
    const block = out.blocks[0]!;
    const inlines = (block.c as Array<{ t: string }>) ?? [];
    expect(inlines.some((x) => x.t === 'Strikeout')).toBe(true);
  });

  it('inline-code → Code', () => {
    const out = astToPandocNative(parseMarkdownToAst('`code`'));
    const block = out.blocks[0]!;
    const inlines = (block.c as Array<{ t: string }>) ?? [];
    expect(inlines.some((x) => x.t === 'Code')).toBe(true);
  });

  it('link → Link with href', () => {
    const out = astToPandocNative(parseMarkdownToAst('[X](https://example.com)'));
    const block = out.blocks[0]!;
    const inlines = (block.c as Array<{ t: string; c?: unknown }>) ?? [];
    const link = inlines.find((x) => x.t === 'Link');
    expect(link).toBeDefined();
    if (link?.c) {
      const tuple = link.c as unknown[];
      const [, , target] = tuple;
      expect((target as [string, string])[0]).toBe('https://example.com');
    }
  });

  it('image → Image with src', () => {
    const out = astToPandocNative(parseMarkdownToAst('![a](img.png)'));
    const block = out.blocks[0]!;
    const inlines = (block.c as Array<{ t: string; c?: unknown }>) ?? [];
    const img = inlines.find((x) => x.t === 'Image');
    expect(img).toBeDefined();
  });

  it('bullet list → BulletList', () => {
    const out = astToPandocNative(parseMarkdownToAst('- a\n- b'));
    expect(out.blocks[0]?.t).toBe('BulletList');
  });

  it('ordered list → OrderedList', () => {
    const out = astToPandocNative(parseMarkdownToAst('1. x\n2. y'));
    expect(out.blocks[0]?.t).toBe('OrderedList');
  });

  it('blockquote → BlockQuote', () => {
    const out = astToPandocNative(parseMarkdownToAst('> quoted'));
    expect(out.blocks[0]?.t).toBe('BlockQuote');
  });

  it('fenced code → CodeBlock with lang class', () => {
    const out = astToPandocNative(parseMarkdownToAst('```ts\nconst x = 1;\n```'));
    const block = out.blocks[0]!;
    expect(block.t).toBe('CodeBlock');
    const tuple = block.c as [unknown[], string];
    const [, content] = tuple;
    expect(content).toContain('const x = 1;');
    const [, classes] = tuple[0] as [string, string[], unknown];
    expect(classes).toContain('ts');
  });

  it('hr → HorizontalRule', () => {
    const out = astToPandocNative(parseMarkdownToAst('A\n\n---\n\nB'));
    const hrIdx = out.blocks.findIndex((b) => b.t === 'HorizontalRule');
    expect(hrIdx).toBeGreaterThan(-1);
  });

  it('frontmatter globals → meta', () => {
    const md = `---\nwriting: vertical\nnotation: pkc-markdown-1.0\nvars:\n  x: 198\n---\n\nbody`;
    const out = astToPandocNative(parseMarkdownToAst(md));
    expect(out.meta.writing).toBeDefined();
    expect(out.meta.notation).toBeDefined();
    expect(out.meta.vars).toBeDefined();
  });

  it('JSON serializable (no circular)', () => {
    const out = astToPandocNative(parseMarkdownToAst('# A\n\nparagraph\n\n- list'));
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it('pandoc-api-version は readonly tuple', () => {
    const out = astToPandocNative(parseMarkdownToAst('x'));
    expect(out['pandoc-api-version'].length).toBe(3);
    expect(typeof out['pandoc-api-version'][0]).toBe('number');
  });
});
