/**
 * PR-W7(Wave X P1、AI review feedback):typography bilingual font stack +
 * line-height + inline code shading の case matrix。
 *
 * AI review P1 全 3 件:
 * - **P1-4 フォントスタック明示**:和文 Noto Sans CJK JP、欧文 Inter、
 *   コード JetBrains Mono / Source Han Code JP を docx の bilingual font
 *   stack(`IFontAttributesProperties` の ascii + eastAsia + hAnsi + cs)で
 *   分離指定、pptx は欧文 fontFace 主体で CJK は自動 fallback。
 * - **P1-5 本文 line-height 1.5(twip 360)**:docx の default paragraph
 *   spacing.line を 360 + lineRule: 'auto' に設定。
 * - **P1-6 inline code `#F4F4F5` 背景**:docx は applyStyle 内で TextRun
 *   shading を追加、pptx は `highlight: INLINE_CODE_SHADING_HEX` で灰色
 *   擬似ボックス化。
 *
 * wave 規律 §4:case matrix 10 件以上。本 test は 14 ケース。
 */
import { describe, it, expect } from 'vitest';
import { astToDocxBlob } from '@features/ast/export-docx';
import { astToPptxBlob } from '@features/ast/export-pptx';
import { parseMarkdownToAst } from '@features/ast/parse';
import JSZip from 'jszip';

async function docxToZip(md: string): Promise<JSZip> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToDocxBlob(ast);
  const buf = Buffer.from(await blob.arrayBuffer());
  return await JSZip.loadAsync(buf);
}

async function docxToStyles(md: string): Promise<string> {
  const zip = await docxToZip(md);
  return await zip.file('word/styles.xml')!.async('string');
}

async function docxToBodyXml(md: string): Promise<string> {
  const zip = await docxToZip(md);
  return await zip.file('word/document.xml')!.async('string');
}

async function pptxToSlideXmls(md: string): Promise<string[]> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToPptxBlob(ast);
  const buf = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const paths: string[] = [];
  zip.forEach((path) => {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) paths.push(path);
  });
  paths.sort();
  const xmls: string[] = [];
  for (const p of paths) xmls.push(await zip.file(p)!.async('string'));
  return xmls;
}

describe('PR-W7 P1-4: docx bilingual font stack', () => {
  it('default body font に欧文 Inter + 和文 Noto Sans CJK JP が両方記載', async () => {
    const styles = await docxToStyles('Plain text body.\n');
    // docx の rFonts element は `w:ascii="X" w:eastAsia="Y"` 形式
    expect(styles).toContain('w:ascii="Inter"');
    expect(styles).toContain('w:eastAsia="Noto Sans CJK JP"');
  });

  it('hAnsi も Inter(欧文 fallback の High-ANSI region)', async () => {
    const styles = await docxToStyles('Body text.\n');
    expect(styles).toContain('w:hAnsi="Inter"');
  });

  it('inline code が JetBrains Mono(欧文)+ Source Han Code JP(和文)', async () => {
    const body = await docxToBodyXml('Para with `code text` inline.\n');
    expect(body).toContain('w:ascii="JetBrains Mono"');
    expect(body).toContain('w:eastAsia="Source Han Code JP"');
  });

  it('code block も bilingual monospace', async () => {
    const md = '```ts\nconst x = 1;\n```\n';
    const body = await docxToBodyXml(md);
    expect(body).toContain('w:ascii="JetBrains Mono"');
  });

  it('regression: heading にも bilingual font が継承される', async () => {
    const styles = await docxToStyles('# Heading\n');
    // heading1 style 内に Inter / Noto Sans CJK JP 両方記載
    expect(styles).toMatch(/Heading1[\s\S]+?Inter/);
    expect(styles).toMatch(/Heading1[\s\S]+?Noto Sans CJK JP/);
  });
});

describe('PR-W12 確定: docx body line-height 1.0(twip 240、真の 0pt 寄り)', () => {
  it('default paragraph に w:line="240"(1.0)+ w:lineRule="auto"', async () => {
    const styles = await docxToStyles('Body paragraph.\n');
    expect(styles).toMatch(/w:line="240"/);
    expect(styles).toMatch(/w:lineRule="auto"/);
  });

  it('line spacing は heading でも上書きされない(heading は own spacing)', async () => {
    const styles = await docxToStyles('# Heading\nBody.\n');
    expect(styles).toMatch(/w:line="240"/);
  });
});

describe('PR-W7 P1-6: docx inline code shading #F4F4F5', () => {
  it('inline code が `w:shd` で `#F4F4F5` 背景を持つ', async () => {
    const body = await docxToBodyXml('Para with `code` inline.\n');
    expect(body).toContain('w:fill="F4F4F5"');
  });

  it('inline code text "code" が emit される', async () => {
    const body = await docxToBodyXml('Para with `magic_word_123` inline.\n');
    expect(body).toContain('magic_word_123');
  });

  it('plain text には shading が**つかない**(inline code 限定)', async () => {
    const body = await docxToBodyXml('Just plain text without any code.\n');
    expect(body).not.toContain('w:fill="F4F4F5"');
  });
});

describe('PR-W7 P1-6: pptx inline code shading', () => {
  it('inline code が JetBrains Mono fontFace を持つ', async () => {
    const slides = await pptxToSlideXmls('### Slide\n\nPara with `code` inline.\n');
    const all = slides.join('\n');
    expect(all).toContain('JetBrains Mono');
  });

  it('inline code が `#F4F4F5` highlight を持つ', async () => {
    const slides = await pptxToSlideXmls('### Slide\n\nPara with `code` inline.\n');
    const all = slides.join('\n');
    // pptxgenjs highlight は `<a:highlight>` か `highlight="F4F4F5"` 形式
    expect(all).toMatch(/F4F4F5/);
  });

  it('code block も JetBrains Mono', async () => {
    const md = '### Slide\n\n```ts\nconst x = 1;\n```\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    expect(all).toContain('JetBrains Mono');
  });

  it('mark(==X==)は `#FFF3A0` soft yellow(PR-W8 tone-down)、inline code `#F4F4F5` とは別の色', async () => {
    const slides = await pptxToSlideXmls('### Slide\n\n==marked== と `code` 両方。\n');
    const all = slides.join('\n');
    expect(all).toContain('FFF3A0'); // mark soft yellow
    expect(all).toContain('F4F4F5'); // inline code grey
  });
});
