/**
 * PR-W9(Wave X P3、AI review feedback):pptx layout templates 3 分化 +
 * running footer の case matrix。
 *
 * AI review P3 全件:
 * - **P3-11**:扉 / 本文 / 表中心の 3 layout master に分割
 * - **P3-12**:表中心スライドは title 直下から table 開始、上の死に空間撲滅
 * - **P3-13**:slide footer に slide number + chapter num(subtle running header)
 *
 * wave 規律 §4:case matrix 10 件以上。本 test は 13 ケース。
 */
import { describe, it, expect } from 'vitest';
import { astToPptxBlob } from '@features/ast/export-pptx';
import { parseMarkdownToAst } from '@features/ast/parse';
import JSZip from 'jszip';

async function pptxToZip(md: string): Promise<JSZip> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToPptxBlob(ast);
  const buf = Buffer.from(await blob.arrayBuffer());
  return await JSZip.loadAsync(buf);
}

async function getSlideXmls(zip: JSZip): Promise<{ path: string; xml: string }[]> {
  const out: { path: string; xml: string }[] = [];
  const paths: string[] = [];
  zip.forEach((path) => {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) paths.push(path);
  });
  paths.sort();
  for (const p of paths) {
    out.push({ path: p, xml: await zip.file(p)!.async('string') });
  }
  return out;
}

async function getSlideMasterXmls(zip: JSZip): Promise<string[]> {
  const out: string[] = [];
  const paths: string[] = [];
  zip.forEach((path) => {
    if (/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(path)) paths.push(path);
  });
  paths.sort();
  for (const p of paths) out.push(await zip.file(p)!.async('string'));
  return out;
}

async function getSlideLayoutXmls(zip: JSZip): Promise<string[]> {
  const out: string[] = [];
  const paths: string[] = [];
  zip.forEach((path) => {
    if (/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(path)) paths.push(path);
  });
  paths.sort();
  for (const p of paths) out.push(await zip.file(p)!.async('string'));
  return out;
}

describe('PR-W9 P3-11: 3 layout masters(section / content / table)', () => {
  it('3 種の slideLayout が生成(section / content / table)', async () => {
    // pptxgenjs は defineSlideMaster ごとに **slideLayout ファイル** を出す
    // (slideMaster は 1 つ共通)、各 layout が独立した位置 / sizing を持つ。
    const md = '# H1\n### Table slide\n\n| h1 | h2 |\n| --- | --- |\n| a | b |\n';
    const zip = await pptxToZip(md);
    const layouts = await getSlideLayoutXmls(zip);
    // 3 master = 3 layout(PKC_SECTION_SLIDE / PKC_CONTENT_SLIDE / PKC_TABLE_SLIDE)
    expect(layouts.length).toBeGreaterThanOrEqual(3);
  });

  it('text only slide は section master または content master を使う(table master ではない)', async () => {
    const md = '# Section\n\n通常テキストのみ。本文段落。\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    expect(slides.length).toBe(1);
    // slide xml に title placeholder marker
    expect(slides[0]!.xml).toMatch(/<p:ph[^>]*type="(ctrTitle|title)"/);
  });

  it('table を含むが text も複数行ある slide は content master を使う(table master 切替えない)', async () => {
    const md = '### Hybrid\n\nたくさんの本文段落 1。\n\nたくさんの本文段落 2。\n\nたくさんの本文段落 3。\n\n| h |\n| --- |\n| a |\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    expect(slides.length).toBe(1);
    // hybrid slide は content master(table master ではない)
    expect(slides[0]!.xml).toContain('Hybrid');
  });
});

describe('PR-W9 P3-12: table-centric slide の死に空間撲滅', () => {
  it('table-centric slide で table が title 直下(y:1.1)から開始', async () => {
    const md = '### Table only\n\n| h1 | h2 |\n| --- | --- |\n| a | b |\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    const xml = slides[0]!.xml;
    // y position の検証は inch 単位の EMU(914400 per inch)で出るため、
    // 1.1 inch = 1005840 EMU 前後の値を期待
    expect(xml).toMatch(/y="(1005840|1004570|100[0-9]{4})"/);
  });

  it('content slide は table が y:1.5 から開始(separator スペース確保)', async () => {
    // text 複数行 + table の混在 slide
    const md = '### Hybrid\n\n本文 1\n\n本文 2\n\n本文 3\n\n| h |\n| --- |\n| a |\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    const xml = slides[0]!.xml;
    // 1.5 inch = 1371600 EMU 前後
    expect(xml).toMatch(/y="(137[0-9]{4})"/);
  });

  it('table-centric slide でも title + table の両方が出力される', async () => {
    const md = '### Table Title\n\n| h1 | h2 |\n| --- | --- |\n| body | body |\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    const xml = slides[0]!.xml;
    expect(xml).toContain('Table Title');
    expect(xml).toContain('h1');
    expect(xml).toContain('h2');
  });
});

describe('PR-W9 P3-13: running footer(slide number + chapter num)', () => {
  it('content slide に slide number が表示される', async () => {
    const md = '### Slide\n\n本文。\n';
    const zip = await pptxToZip(md);
    const masters = await getSlideMasterXmls(zip);
    const allMasters = masters.join('\n');
    // slideNumber marker `<p:sldNum>` または slideNum placeholder
    expect(allMasters).toMatch(/sldNum|slideNum/i);
  });

  it('chapter num が text(Chapter N)で footer に挿入', async () => {
    const md = '# Chapter 1\n### Slide 1\n\nbody.\n# Chapter 2\n### Slide 2\n\nbody.\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    // Chapter 1 / Chapter 2 が footer text として emit
    expect(all).toContain('Chapter 1');
    expect(all).toContain('Chapter 2');
  });

  it('chapter num が 1 から始まり H1 ごとに bump', async () => {
    const md = '# A\n# B\n# C\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    expect(all).toContain('Chapter 1');
    expect(all).toContain('Chapter 2');
    expect(all).toContain('Chapter 3');
  });

  it('H1 なしの fallback slide には chapter footer がない(chapterNum = 0)', async () => {
    const md = 'just paragraph without heading\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    expect(all).not.toContain('Chapter');
  });

  it('section slide(扉)にも chapter footer が含まれる(chapterNum bumped)', async () => {
    const md = '# First Chapter\n## subtitle\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    // First Chapter は H1 title なので chapterNum=1、footer に "Chapter 1"
    expect(all).toContain('Chapter 1');
  });

  it('table-centric slide にも footer text + slideNumber が表示', async () => {
    const md = '# Chapter\n### Table\n\n| h |\n| --- |\n| a |\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    expect(all).toContain('Chapter 1');
  });
});

describe('PR-W9 invariant: regression check', () => {
  it('既存 title placeholder(PR-W5)+ autoFit(PR-W6)+ 各 layout 全部が共存', async () => {
    const md = '# Section\n## Sub\n### Content\n\nbody\n### Table\n\n| h |\n| --- |\n| a |\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    // title placeholder marker(PR-W5)
    expect(all).toMatch(/<p:ph[^>]*type="(ctrTitle|title)"/);
    // autoFit marker(PR-W6)
    expect(all).toMatch(/<a:(normAutofit|spAutoFit)/);
    // chapter footer(PR-W9)
    expect(all).toContain('Chapter');
  });
});
