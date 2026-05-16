/**
 * PR-W6(Wave X P0、AI review feedback):heading 章番号二重表記対応 +
 * H1/H2/H3 spacing 階段強化 + size 階段強化 + PPTX title autoFit + wrap。
 *
 * AI review(2026-05-15)で指摘された P0 issue 3 件:
 *
 * P0-a. **章番号二重表記**:markdown text 内に既に手書き numbering prefix が
 *   ある場合("# 第一章 …" / "## 1.1 …" 等)、auto-numbering が重ねて
 *   prepend して「第1章 第一章 …」「1.1 1.1 …」になる。`hasExistingHeading
 *   Prefix(text, level)` で検出して prefix を skip(counter は引き続き bump)。
 *
 * P0-b. **PPTX title autoFit + wrap + font-size 階段**:section title 44pt /
 *   subtitle 36pt / content title 28pt、autoFit + wrap で意味境界折り返し。
 *
 * P0-c. **docx 見出し spacing + size 階段**:H1 before 24pt/after 12pt +
 *   size 20pt、H2 before 18pt/after 8pt + size 16pt、H3 before 12pt/after 6pt
 *   + size 13pt。階層が一目で読めるように差を強化。
 *
 * wave 規律 §4:case matrix 10 件以上。本 test は 17 ケース。
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

/** XML 内 `<w:t>...</w:t>` を連結した plain text を返す(run 境界を無視)。 */
function docxXmlToText(xml: string): string {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .map((m) => m[1])
    .join('');
}

async function docxToText(md: string): Promise<string> {
  return docxXmlToText(await docxToXml(md));
}

async function docxToStyles(md: string): Promise<string> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToDocxBlob(ast);
  const buf = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  return await zip.file('word/styles.xml')!.async('string');
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

describe('PR-W6 P0-a: docx heading 章番号二重表記対応', () => {
  it('manual prefix なし(# はじめに)→ "第1章 はじめに" auto-prefix', async () => {
    const text = await docxToText('# はじめに\n\nbody\n');
    expect(text).toContain('第1章 はじめに');
  });

  it('manual prefix あり(# 第一章 序文)→ "第一章 序文"(auto-prefix skip)', async () => {
    const text = await docxToText('# 第一章 序文\n\nbody\n');
    expect(text).not.toContain('第1章 第一章');
    expect(text).toContain('第一章 序文');
  });

  it('H2 で manual "1.1 概要" prefix → auto-skip', async () => {
    const text = await docxToText('# はじめに\n## 1.1 概要\n\nbody\n');
    expect(text).toContain('1.1 概要');
    expect(text).not.toContain('1.1 1.1');
  });

  it('H3 で manual "1.2.3 詳細" prefix → auto-skip', async () => {
    const text = await docxToText('### 1.2.3 詳細\n\nbody\n');
    expect(text).toContain('1.2.3 詳細');
    expect(text).not.toContain('1.1.1 1.2.3');
  });

  it('H4 で manual "(1) 項目" prefix → auto-skip', async () => {
    const text = await docxToText('#### (1) 項目\n\nbody\n');
    expect(text).toContain('(1) 項目');
    expect(text.match(/\(1\)/g)?.length).toBe(1);
  });

  it('counter は manual prefix の場合でも bump され、後続が連番継続', async () => {
    const text = await docxToText('# 第一章 序文\n# 続き\n\nbody\n');
    expect(text).toContain('第2章 続き');
  });

  it('英語 "Chapter 1. Introduction" prefix も検出', async () => {
    const text = await docxToText('# Chapter 1. Introduction\n\nbody\n');
    expect(text).toContain('Chapter 1. Introduction');
    expect(text).not.toContain('第1章 Chapter 1.');
  });
});

describe('PR-W13: docx heading 階段(user 指示 h1-h6 = 16/14/12/10.5/10.5/10.5 pt)', () => {
  it('heading1 spacing before=320 (16pt)、size=32 (16pt)', async () => {
    const styles = await docxToStyles('# H1\n');
    expect(styles).toMatch(/w:before="320"/);
    expect(styles).toMatch(/w:val="32"/); // 16pt
  });

  it('heading2 spacing before=280 (14pt)、size=28 (14pt)', async () => {
    const styles = await docxToStyles('## H2\n');
    expect(styles).toMatch(/w:before="280"/);
    expect(styles).toMatch(/w:val="28"/);
  });

  it('heading3 spacing before=200 (10pt)、size=24 (12pt)', async () => {
    const styles = await docxToStyles('### H3\n');
    expect(styles).toMatch(/w:before="200"/);
    expect(styles).toMatch(/w:val="24"/);
  });

  it('heading4 size=21 (10.5pt、body と同 size)', async () => {
    const styles = await docxToStyles('#### H4\n');
    // H4 が body と同 size、bold + indent で識別
    expect(styles).toMatch(/Heading4[\s\S]*?w:val="21"/);
  });
});

describe('PR-W6 P0-b: pptx title autoFit + wrap + font-size 階段', () => {
  it('section slide title が `<a:normAutofit>` 等の autoFit marker を持つ', async () => {
    const slides = await pptxToSlideXmls('# Section Title\n');
    const all = slides.join('\n');
    // autoFit が pptxgenjs から PPTX XML へ反映される時の marker:
    // `<a:normAutofit>` / `<a:spAutoFit>` のいずれか
    expect(all).toMatch(/<a:(normAutofit|spAutoFit)/);
  });

  it('content slide title も autoFit marker を持つ', async () => {
    const slides = await pptxToSlideXmls('### Content Title\n');
    const all = slides.join('\n');
    expect(all).toMatch(/<a:(normAutofit|spAutoFit)/);
  });

  it('section title text が emit される(autoFit 適用後も text 残存)', async () => {
    const slides = await pptxToSlideXmls('# 長い長い長い長い長い長い長い長い長い長い長い title\n');
    const all = slides.join('\n');
    expect(all).toContain('長い長い長い長い長い長い長い長い長い長い長い title');
  });
});

describe('PR-W6 invariant: counter consistency across mixed manual/auto', () => {
  it('混在 manual/auto:auto は normal、manual は skip、counter は連続', async () => {
    const text = await docxToText('# はじめに\n# 第二章 続き\n# 結論\n');
    expect(text).toContain('第1章 はじめに');
    expect(text).toContain('第二章 続き');
    expect(text).toContain('第3章 結論');
  });

  it('深い nesting:H1 manual + H2 auto + H3 auto → 連番継続', async () => {
    const text = await docxToText('# 第一章 序文\n## 第一節\n### 詳細\n');
    expect(text).toContain('第一章 序文');
    expect(text).toContain('1.1 第一節');
    expect(text).toContain('1.1.1 詳細');
  });

  it('H1 なし + H3 直接:counter[0]=1, [1]=1 暗黙 bump → 1.1.1', async () => {
    const text = await docxToText('### 詳細だけ\n\nbody\n');
    expect(text).toContain('1.1.1 詳細だけ');
  });

  it('regression: regular markdown without prefix still gets auto-numbering', async () => {
    const text = await docxToText('# Section A\n## Sub 1\n## Sub 2\n');
    expect(text).toContain('第1章 Section A');
    expect(text).toContain('1.1 Sub 1');
    expect(text).toContain('1.2 Sub 2');
  });
});
