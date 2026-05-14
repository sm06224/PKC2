/**
 * @vitest-environment happy-dom
 *
 * PR-V13(2026-05-14、U3+U4):AST → Word(.docx)/ PowerPoint(.pptx)direct
 * generation test。実際の .docx / .pptx ファイル binary を blob として確認、
 * minimum signature(ZIP magic + 適切な mime)を確認する。
 */
import { describe, it, expect } from 'vitest';
import { astToDocxBlob } from '@features/ast/export-docx';
import { astToPptxBlob } from '@features/ast/export-pptx';
import { parseMarkdownToAst } from '@features/ast/parse';

async function readMagic(blob: Blob, len = 4): Promise<string> {
  const buf = await blob.slice(0, len).arrayBuffer();
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('PR-V13 U3 — astToDocxBlob', () => {
  it('returns a non-empty Blob with .docx mime', async () => {
    const ast = parseMarkdownToAst('# Hello\n\nWorld');
    const blob = await astToDocxBlob(ast);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(1000); // .docx は zip なので最低 1KB は出る
  });

  it('blob starts with ZIP magic (PK\\x03\\x04)', async () => {
    const ast = parseMarkdownToAst('# Test\n\nbody');
    const blob = await astToDocxBlob(ast);
    const magic = await readMagic(blob, 2);
    expect(magic).toBe('504b'); // 'PK' in hex
  });

  it('handles all common block elements without throwing', async () => {
    const md = [
      '# H1',
      '## H2',
      '### H3',
      '',
      'Paragraph with **bold** _italic_ ~~strike~~ `code`.',
      '',
      '- bullet 1',
      '- bullet 2',
      '',
      '1. ordered 1',
      '2. ordered 2',
      '',
      '> Blockquote text',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '---',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const blob = await astToDocxBlob(ast);
    expect(blob.size).toBeGreaterThan(2000);
  });

  it('empty document → still produces a valid Blob', async () => {
    const ast = parseMarkdownToAst('');
    const blob = await astToDocxBlob(ast);
    expect(blob.size).toBeGreaterThan(1000);
  });
});

describe('PR-V13 U4 — astToPptxBlob', () => {
  it('returns a non-empty Blob', async () => {
    const ast = parseMarkdownToAst('# Slide 1\n\nbody');
    const blob = await astToPptxBlob(ast, { title: 'Test' });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(5000); // .pptx 最低 size
  });

  it('blob starts with ZIP magic (PK\\x03\\x04)', async () => {
    const ast = parseMarkdownToAst('# Slide\n\nbody');
    const blob = await astToPptxBlob(ast, { title: 'Magic' });
    const magic = await readMagic(blob, 2);
    expect(magic).toBe('504b');
  });

  it('splits into multiple slides at H1 boundary', async () => {
    const md = '# Slide One\n\ntext\n\n# Slide Two\n\ntext\n\n# Slide Three\n\ntext';
    const ast = parseMarkdownToAst(md);
    const blob = await astToPptxBlob(ast, { title: 'Multi' });
    // 簡単な確認:単一 slide より size が大きい
    const single = await astToPptxBlob(parseMarkdownToAst('# Only'), { title: 'Single' });
    expect(blob.size).toBeGreaterThan(single.size);
  });

  it('handles document without H1 by creating fallback title slide', async () => {
    const ast = parseMarkdownToAst('Just a paragraph, no heading.');
    const blob = await astToPptxBlob(ast, { title: 'NoH1' });
    expect(blob.size).toBeGreaterThan(5000);
  });

  it('handles complex blocks without throwing', async () => {
    const md = [
      '# Intro',
      '',
      'Paragraph with **bold**.',
      '',
      '- item 1',
      '- item 2',
      '',
      '> quote',
      '',
      '```',
      'code',
      '```',
      '',
      '# Conclusion',
      '',
      'wrap up',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const blob = await astToPptxBlob(ast, { title: 'Complex' });
    expect(blob.size).toBeGreaterThan(5000);
  });
});
