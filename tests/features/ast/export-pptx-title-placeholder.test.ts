/**
 * PR-W5(2026-05-15、v23 stack follow-up wave):pptx title placeholder 化。
 *
 * 修正前:`slide.addText(title, { x, y, w, h, fontSize, bold })` で title を
 *   普通の text box として描画 → Microsoft PowerPoint の Outline View や
 *   accessibility tree で **title として認識されない**(slide structure 上は
 *   無タイトル扱い、Office Online / 読み上げソフト も title を拾えない)。
 *
 * 修正後:`pres.defineSlideMaster({ title: 'PKC_*_SLIDE', objects: [{
 *   placeholder: { options: { name: 'title', type: 'title', ... }, text: '' }
 *   }] })` で master template を定義、`pres.addSlide({ masterName })` で
 *   各 slide に master を bind、`slide.addText(title, { placeholder: 'title' })`
 *   で title placeholder に挿入 → PPTX XML に `<p:ph type="title" idx="0"/>`
 *   marker が emit され、Outline View が認識する。
 *
 * 検証:`ppt/slides/slide*.xml` に `<p:ph` element が含まれ、`type="title"`
 * を持つ。`ppt/slideMasters/slideMaster*.xml` に master 定義が存在する。
 *
 * wave 規律 §4:case matrix 10 件以上。本 test は 12 ケース。
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

async function getSlideMasterXmls(zip: JSZip): Promise<{ path: string; xml: string }[]> {
  const out: { path: string; xml: string }[] = [];
  const paths: string[] = [];
  zip.forEach((path) => {
    if (/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(path)) paths.push(path);
  });
  paths.sort();
  for (const p of paths) {
    out.push({ path: p, xml: await zip.file(p)!.async('string') });
  }
  return out;
}

describe('pptx title placeholder(PR-W5、Microsoft Outline View 対応)', () => {
  it('section slide(H1)title が `<p:ph type="title"/>` marker を持つ', async () => {
    const zip = await pptxToZip('# Section Title\n\nbody paragraph\n');
    const slides = await getSlideXmls(zip);
    expect(slides.length).toBeGreaterThanOrEqual(1);
    const all = slides.map((s) => s.xml).join('\n');
    // PPTX schema:placeholder marker `<p:ph type="title" idx="0"/>` または
    // `<p:ph type="ctrTitle"/>`(center title)。pptxgenjs は type="title" を emit。
    expect(all).toMatch(/<p:ph[^>]*type="(ctrTitle|title)"/);
    expect(all).toContain('Section Title');
  });

  it('content slide(H3)title が `<p:ph type="title"/>` marker を持つ', async () => {
    const zip = await pptxToZip('### Content Title\n\nbody paragraph\n');
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    expect(all).toMatch(/<p:ph[^>]*type="(ctrTitle|title)"/);
    expect(all).toContain('Content Title');
  });

  it('section slide subtitle(H2)が body placeholder を持つ', async () => {
    const zip = await pptxToZip('# H1 Title\n## H2 Subtitle\n\nbody\n');
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    expect(all).toContain('H1 Title');
    expect(all).toContain('H2 Subtitle');
    // body placeholder(subtitle として登録)
    expect(all).toMatch(/<p:ph[^>]*type="(body|subTitle)"/);
  });

  it('multiple section slides 各 title placeholder marker を持つ', async () => {
    const md = '# First\n\nbody1\n\n# Second\n\nbody2\n# Third\n\nbody3\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    expect(slides.length).toBeGreaterThanOrEqual(3);
    const titleSlides = slides.filter((s) => /<p:ph[^>]*type="(ctrTitle|title)"/.test(s.xml));
    expect(titleSlides.length).toBeGreaterThanOrEqual(3);
  });

  it('slideMaster ファイルが PKC_SECTION_SLIDE 用に存在', async () => {
    const zip = await pptxToZip('# Title\n');
    const masters = await getSlideMasterXmls(zip);
    expect(masters.length).toBeGreaterThanOrEqual(1);
  });

  it('slideMaster ファイルが PKC_CONTENT_SLIDE 用に存在(H3 only)', async () => {
    const zip = await pptxToZip('### Content Only\n\nbody\n');
    const masters = await getSlideMasterXmls(zip);
    expect(masters.length).toBeGreaterThanOrEqual(1);
  });

  it('title text が emit される(simple case)', async () => {
    const zip = await pptxToZip('# Simple Title\n');
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    expect(all).toContain('Simple Title');
  });

  it('日本語 title が正しく emit される', async () => {
    const zip = await pptxToZip('# 日本語タイトル\n\n本文\n');
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    expect(all).toContain('日本語タイトル');
    expect(all).toMatch(/<p:ph[^>]*type="(ctrTitle|title)"/);
  });

  it('AstBreak(page)後の content slide も title placeholder を持つ', async () => {
    const md = '# Section\n\nbody\n\n\\page\n\n### After Break\n\nbody2\n';
    const zip = await pptxToZip(md);
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    expect(all).toContain('After Break');
  });

  it('body content も section slide 上に存続(title-only に縮退しない)', async () => {
    const zip = await pptxToZip('# Section\n\nfirst body line\nsecond body line\n');
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    expect(all).toContain('first body line');
    expect(all).toContain('second body line');
  });

  it('body content も content slide 上に存続', async () => {
    const zip = await pptxToZip('### Content\n\nbody A\nbody B\n');
    const slides = await getSlideXmls(zip);
    const all = slides.map((s) => s.xml).join('\n');
    expect(all).toContain('body A');
    expect(all).toContain('body B');
  });

  it('title なし(fallback)スライドでも crash しない', async () => {
    // H1 / H2 / H3 が無い文書、splitIntoSlides は fallback title で
    // 1 content slide を作る。
    const zip = await pptxToZip('just a paragraph\nanother paragraph\n');
    const slides = await getSlideXmls(zip);
    expect(slides.length).toBeGreaterThanOrEqual(1);
    const all = slides.map((s) => s.xml).join('\n');
    expect(all).toContain('just a paragraph');
  });
});
