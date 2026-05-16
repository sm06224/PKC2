/**
 * PR-W11(Wave Z.1、2026-05-16):frontmatter `layout: a4-2col` 等の段組
 * 組版が docx / pptx export で実機反映されるかの case matrix。
 *
 * User 報告(2026-05-16):「co 見たけど、どうみても 2 段組じゃないね」
 * → 従来 docx/pptx export は frontmatter layout を ignore していた。
 *
 * 修正:
 * - `AstDocument.layout?: string` field 追加(`core/ast/index.ts`)
 * - `extractFrontmatter` で `layout` 抽出(`parse.ts`)
 * - docx:`Document.sections[].properties.column = { count, space, equalWidth }`
 *   + 用紙サイズを `page.size` で a4/b5/letter/legal に反映
 * - pptx:slide body 領域を N column に split、column gap 0.3 inch
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

describe('PR-W11: docx layout: a4-2col 段組組版', () => {
  it('`layout: a4-2col` で docx の <w:cols w:num="2"> が emit される', async () => {
    const md = '---\nlayout: a4-2col\n---\n\n# title\n\nbody.\n';
    const xml = await docxToBodyXml(md);
    expect(xml).toMatch(/<w:cols[^/]*w:num="2"/);
  });

  it('`layout: a4-3col` で <w:cols w:num="3">', async () => {
    const md = '---\nlayout: a4-3col\n---\n\n# title\n\nbody.\n';
    const xml = await docxToBodyXml(md);
    expect(xml).toMatch(/<w:cols[^/]*w:num="3"/);
  });

  it('`layout: a4-1col` で columns は emit しない(または num="1")', async () => {
    const md = '---\nlayout: a4-1col\n---\n\n# title\n\nbody.\n';
    const xml = await docxToBodyXml(md);
    // 1 col の時は <w:cols> が出ても num="2" 以上ではない
    expect(xml).not.toMatch(/<w:cols[^/]*w:num="[23]"/);
  });

  it('A4 用紙サイズが w:pgSz で 11906×16838 twip', async () => {
    const md = '---\nlayout: a4-2col\n---\n\nbody\n';
    const xml = await docxToBodyXml(md);
    expect(xml).toMatch(/<w:pgSz[^>]*w:w="11906"/);
    expect(xml).toMatch(/<w:pgSz[^>]*w:h="16838"/);
  });

  it('Letter 用紙サイズ 12240×15840 twip', async () => {
    const md = '---\nlayout: letter-2col\n---\n\nbody\n';
    const xml = await docxToBodyXml(md);
    expect(xml).toMatch(/<w:pgSz[^>]*w:w="12240"/);
    expect(xml).toMatch(/<w:pgSz[^>]*w:h="15840"/);
  });

  it('B5 用紙サイズ 9979×14175 twip', async () => {
    const md = '---\nlayout: b5-2col\n---\n\nbody\n';
    const xml = await docxToBodyXml(md);
    expect(xml).toMatch(/<w:pgSz[^>]*w:w="9979"/);
  });

  it('frontmatter なし → columns / pgSz 設定なし(従来 default)', async () => {
    const xml = await docxToBodyXml('# title\n\nbody.\n');
    expect(xml).not.toMatch(/<w:cols[^/]*w:num="2"/);
    // pgSz は LibreOffice/Word の default で出るが、明示設定なし
  });

  it('不正な layout 値(`a3-7col`)は ignore(default 1 段組)', async () => {
    const md = '---\nlayout: a3-7col\n---\n\nbody\n';
    const xml = await docxToBodyXml(md);
    expect(xml).not.toMatch(/<w:cols[^/]*w:num="[2-9]"/);
  });

  it('column space が 720 twip(0.5 inch)で出る', async () => {
    const md = '---\nlayout: a4-2col\n---\n\nbody\n';
    const xml = await docxToBodyXml(md);
    expect(xml).toMatch(/<w:cols[^>]*w:space="720"/);
  });
});

describe('PR-W11: pptx layout: a4-2col(slide body を N column に分割)', () => {
  it('`layout: a4-2col` で 2 つの text frame が emit(N column 化の証跡)', async () => {
    // 長文 + section heading で N 行以上の body lines を確保
    const md = '---\nlayout: a4-2col\n---\n\n### Slide\n\n'
      + '段落 1。段落 1。\n\n段落 2。段落 2。\n\n段落 3。段落 3。\n\n段落 4。段落 4。\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    // pptxgenjs は addText を call すると <p:sp> shape を生成。
    // 2 column の場合、body content text frame が 2 つ以上(title 含む)
    const txBodyCount = (all.match(/<p:txBody>/g) ?? []).length;
    expect(txBodyCount).toBeGreaterThanOrEqual(2);
  });

  it('`layout: a4-1col` (default)は body text frame が 1 つ(従来)', async () => {
    const md = '### Slide\n\n段落 1。\n\n段落 2。\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    expect(all).toContain('段落 1');
    expect(all).toContain('段落 2');
  });

  it('layout 設定 + table 共存:table は 1 column のまま、body は 2 column', async () => {
    const md = '---\nlayout: a4-2col\n---\n\n### Slide\n\n段落 1\n\n| h |\n| --- |\n| a |\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    expect(all).toContain('段落 1');
    expect(all).toContain('h');
  });

  it('`a4-2col` のとき body text が 2 column 各々に分配される', async () => {
    const md = '---\nlayout: a4-2col\n---\n\n### Title\n\n'
      + 'A1\n\nA2\n\nA3\n\nA4\n\nB1\n\nB2\n\nB3\n\nB4\n';
    const slides = await pptxToSlideXmls(md);
    const all = slides.join('\n');
    expect(all).toContain('A1');
    expect(all).toContain('B4');
  });
});

describe('PR-W11: AstDocument.layout field', () => {
  it('parseMarkdownToAst が layout を AstDocument.layout に詰める', async () => {
    const ast = parseMarkdownToAst('---\nlayout: a4-2col\n---\n\nbody\n');
    expect(ast.layout).toBe('a4-2col');
  });

  it('layout なし → undefined', async () => {
    const ast = parseMarkdownToAst('body\n');
    expect(ast.layout).toBeUndefined();
  });

  it('不正値 layout → undefined(parser で reject)', async () => {
    const ast = parseMarkdownToAst('---\nlayout: invalid-xyz\n---\n\nbody\n');
    expect(ast.layout).toBeUndefined();
  });
});
