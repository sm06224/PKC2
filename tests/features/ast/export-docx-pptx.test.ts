/**
 * @vitest-environment happy-dom
 *
 * PR-V13(2026-05-14、U3+U4):AST → Word(.docx)/ PowerPoint(.pptx)direct
 * generation test。
 *
 * **PR-V18(2026-05-14、user audit 反映)で output 検証を strict 化**:
 * blob.size > 1000 だけでは「中身が空でも pass」してしまい、PR-V13 初版で
 * list / quote / code-block の本文が .docx / .pptx に出ていなかった bug を
 * 見落としていた。本 test set は unzip して word/document.xml /
 * ppt/slides/slide*.xml の中身に対し、heading style / list marker / blockquote
 * style / code-block lang / table cell の存在を assert する。
 */
import { describe, it, expect } from 'vitest';
import { astToDocxBlob } from '@features/ast/export-docx';
import { astToPptxBlob } from '@features/ast/export-pptx';
import { parseMarkdownToAst } from '@features/ast/parse';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

async function unzipBlob(blob: Blob, dirName: string): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer());
  const dir = `/tmp/${dirName}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/out.bin`, buf);
  execSync(`cd ${dir} && rm -rf u && unzip -q out.bin -d u`);
  return `${dir}/u`;
}

function readXml(path: string): string {
  return readFileSync(path, 'utf-8');
}

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

  // PR-V18(2026-05-14、user audit 反映):output 検証を strict 化
  it('strict output: word/document.xml に **全 block 要素の本文 + 適切な style** が含まれる', async () => {
    const md = [
      '# Heading One',
      '## Heading Two',
      '',
      'Paragraph plain.',
      '',
      '- bullet alpha',
      '- bullet beta',
      '',
      '1. ordered first',
      '2. ordered second',
      '',
      '> Block quote content',
      '',
      '```js',
      'const code = 1;',
      '```',
      '',
      '| ColA | ColB |',
      '|------|------|',
      '| r1c1 | r1c2 |',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const blob = await astToDocxBlob(ast);
    const root = await unzipBlob(blob, 'docx-test-strict');
    const docXml = readXml(`${root}/word/document.xml`);
    // Heading 1 / 2 の style が emit されている
    expect(docXml).toMatch(/pStyle w:val="Heading1"/);
    expect(docXml).toMatch(/pStyle w:val="Heading2"/);
    // List items は ListParagraph style + numId
    expect(docXml).toMatch(/pStyle w:val="ListParagraph"/);
    // Quote style
    expect(docXml).toMatch(/pStyle w:val="Quote"/);
    // 各 block の本文 text run が含まれる
    expect(docXml).toContain('Heading One');
    expect(docXml).toContain('Heading Two');
    expect(docXml).toContain('Paragraph plain.');
    expect(docXml).toContain('bullet alpha');
    expect(docXml).toContain('bullet beta');
    expect(docXml).toContain('ordered first');
    expect(docXml).toContain('ordered second');
    expect(docXml).toContain('Block quote content');
    expect(docXml).toContain('const code = 1;');
    // Table cells
    expect(docXml).toContain('ColA');
    expect(docXml).toContain('ColB');
    expect(docXml).toContain('r1c1');
    expect(docXml).toContain('r1c2');
    // table tag
    expect(docXml).toMatch(/<w:tbl>/);
  });

  it('strict output: inline 強調(bold / italic / strike / code)が style 付き runで出力', async () => {
    const md = 'Plain **bold** and _ital_ and ~~strike~~ and `code`.';
    const ast = parseMarkdownToAst(md);
    const blob = await astToDocxBlob(ast);
    const root = await unzipBlob(blob, 'docx-test-inline');
    const docXml = readXml(`${root}/word/document.xml`);
    expect(docXml).toContain('bold');
    expect(docXml).toContain('ital');
    expect(docXml).toContain('strike');
    expect(docXml).toContain('code');
    // bold は `<w:b/>` を持つ run、italic は `<w:i/>`、strike は `<w:strike/>`
    expect(docXml).toMatch(/<w:b\/>/);
    expect(docXml).toMatch(/<w:i\/>/);
    expect(docXml).toMatch(/<w:strike\/>/);
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

  // PR-V18(2026-05-14、user audit 反映):output 検証を strict 化
  it('strict output: 各 slide の slide<N>.xml に title + 全 body 要素が出る', async () => {
    const md = [
      '# Slide One',
      '',
      'Body of slide one.',
      '',
      '- bullet alpha',
      '- bullet beta',
      '',
      '# Slide Two',
      '',
      'Body of slide two.',
      '',
      '```',
      'const code = 1;',
      '```',
      '',
      '# Slide Three',
      '',
      '> Quote on slide three',
    ].join('\n');
    const ast = parseMarkdownToAst(md);
    const blob = await astToPptxBlob(ast, { title: 'Strict' });
    const root = await unzipBlob(blob, 'pptx-test-strict');
    const s1 = readXml(`${root}/ppt/slides/slide1.xml`);
    const s2 = readXml(`${root}/ppt/slides/slide2.xml`);
    const s3 = readXml(`${root}/ppt/slides/slide3.xml`);
    // slide 1:title + body + bullets
    expect(s1).toContain('Slide One');
    expect(s1).toContain('Body of slide one.');
    expect(s1).toContain('bullet alpha');
    expect(s1).toContain('bullet beta');
    // slide 2:title + body + code-block(critical:PR-V13 初版で消えていた)
    expect(s2).toContain('Slide Two');
    expect(s2).toContain('Body of slide two.');
    expect(s2).toContain('const code = 1;');
    // slide 3:title + quote(critical:PR-V13 初版で消えていた)
    expect(s3).toContain('Slide Three');
    expect(s3).toContain('Quote on slide three');
  });

  it('strict output: H1 無しの文書は fallback title slide 1 枚に集約', async () => {
    const md = 'Just a paragraph and **bold**.';
    const ast = parseMarkdownToAst(md);
    const blob = await astToPptxBlob(ast, { title: 'Fallback' });
    const root = await unzipBlob(blob, 'pptx-test-fallback');
    const s1 = readXml(`${root}/ppt/slides/slide1.xml`);
    expect(s1).toContain('Fallback'); // title から fallback
    // PR-V24:**bold** が独立 run に分離されるため、串刺し連結 string では無く
    // 各 run の text fragment 単位で存在確認する。
    expect(s1).toContain('Just a paragraph and');
    expect(s1).toContain('bold');
  });
});
