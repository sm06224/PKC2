/**
 * PR-W4(2026-05-15、v23 stack follow-up wave):AstTable cell 内 inline
 * formatting drop fix の case matrix。
 *
 * 修正前の挙動:
 * - docx:`inlinesToRuns(...).filter((x): x is TextRun)` で
 *   ExternalHyperlink を drop(bold / italic は TextRun の field で保持)
 * - pptx:`inlinesToPlainText` で cell を完全 flat text 化 → bold / italic /
 *   code / strike / mark / em-dot / sup / sub / link すべて drop
 *
 * 修正後:
 * - docx:filter を `TextRun | ExternalHyperlink` まで広げて hyperlink を保持
 * - pptx:`tableRowsRuns` 経由で run-level formatting を addTable に渡す
 *
 * wave 規律 §4(2026-05-15):case matrix 最低 10 件 + user 提供ケース必須。
 * 本 test は 14 ケースで網羅(docx 5 + pptx 6 + CSV regression 2 + plain text 1)。
 */
import { describe, it, expect } from 'vitest';
import { astToDocxBlob } from '@features/ast/export-docx';
import { astToPptxBlob } from '@features/ast/export-pptx';
import { parseMarkdownToAst } from '@features/ast/parse';
import JSZip from 'jszip';

async function docxToXml(md: string): Promise<string> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToDocxBlob(ast);
  const buf = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  return await zip.file('word/document.xml')!.async('string');
}

async function pptxToSlideXmls(md: string): Promise<string[]> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToPptxBlob(ast);
  const buf = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const out: string[] = [];
  zip.forEach((path) => {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) out.push(path);
  });
  out.sort();
  const xmls: string[] = [];
  for (const p of out) xmls.push(await zip.file(p)!.async('string'));
  return xmls;
}

describe('docx: AstTable cell 内 inline formatting 保持(PR-W4)', () => {
  it('bold cell renders `<w:b/>` inside cell', async () => {
    const md = '| header |\n| --- |\n| **bold cell** |\n';
    const xml = await docxToXml(md);
    // cell text + bold marker が both 含まれる
    expect(xml).toContain('bold cell');
    expect(xml).toContain('<w:b/>');
  });

  it('italic cell renders `<w:i/>`', async () => {
    const md = '| h |\n| --- |\n| _italic cell_ |\n';
    const xml = await docxToXml(md);
    expect(xml).toContain('italic cell');
    expect(xml).toContain('<w:i/>');
  });

  it('inline code cell renders monospace bilingual font(PR-W7 で JetBrains Mono に更新)', async () => {
    const md = '| h |\n| --- |\n| `code cell` |\n';
    const xml = await docxToXml(md);
    expect(xml).toContain('code cell');
    expect(xml).toContain('JetBrains Mono');
  });

  it('strike cell renders `<w:strike/>`', async () => {
    const md = '| h |\n| --- |\n| ~~strike cell~~ |\n';
    const xml = await docxToXml(md);
    expect(xml).toContain('strike cell');
    expect(xml).toContain('<w:strike/>');
  });

  it('external link cell renders <w:hyperlink>', async () => {
    const md = '| h |\n| --- |\n| [click here](https://example.com) |\n';
    const xml = await docxToXml(md);
    expect(xml).toContain('click here');
    // ExternalHyperlink が cell 内に保持される(filter で drop されない)
    expect(xml).toContain('w:hyperlink');
  });
});

describe('pptx: AstTable cell 内 inline formatting 保持(PR-W4)', () => {
  it('bold cell renders cell text(formatting drop 解消)', async () => {
    const md = '| header |\n| --- |\n| **bold cell** |\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    expect(all).toContain('bold cell');
  });

  it('italic cell renders italic marker', async () => {
    const md = '| h |\n| --- |\n| _italic cell_ |\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    expect(all).toContain('italic cell');
    // pptx で italic は `<a:rPr i="1"` 形式で出る
    expect(all).toMatch(/i="1"/);
  });

  it('inline code cell renders monospace font(PR-W7 で JetBrains Mono に更新)', async () => {
    const md = '| h |\n| --- |\n| `code cell` |\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    expect(all).toContain('code cell');
    expect(all).toContain('JetBrains Mono');
  });

  it('strike cell renders strike marker', async () => {
    const md = '| h |\n| --- |\n| ~~strike cell~~ |\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    expect(all).toContain('strike cell');
    expect(all).toMatch(/strike="(sngStrike|dblStrike)"|<a:strikethrough/);
  });

  it('mark cell renders yellow highlight FFFF00', async () => {
    const md = '| h |\n| --- |\n| ==marked text== |\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    expect(all).toContain('marked text');
    expect(all).toMatch(/FFFF00|highlight/);
  });

  it('header row cells get bold + EEEEEE fill', async () => {
    const md = '| Header A | Header B |\n| --- | --- |\n| body | body |\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    expect(all).toContain('Header A');
    expect(all).toContain('Header B');
    // bold marker(b="1")and shading(EEEEEE)
    expect(all).toMatch(/b="1"/);
    expect(all).toContain('EEEEEE');
  });
});

describe('CSV/TSV fence regression(plain text 経路は不変)', () => {
  it('CSV fence renders plain text cells(tableRows path still works)', async () => {
    const md = '```csv\na,b\n1,2\n```\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    expect(all).toContain('a');
    expect(all).toContain('b');
    expect(all).toContain('1');
    expect(all).toContain('2');
  });

  it('CSV docx fence renders plain text cells(table 経路は別)', async () => {
    const md = '```csv\na,b\n1,2\n```\n';
    const xml = await docxToXml(md);
    expect(xml).toContain('a');
    expect(xml).toContain('b');
    expect(xml).toContain('1');
    expect(xml).toContain('2');
  });
});

describe('plain text cell(regression)', () => {
  it('plain text cell still renders unchanged', async () => {
    const md = '| h |\n| --- |\n| plain text |\n';
    const xml = await docxToXml(md);
    expect(xml).toContain('plain text');
  });
});
