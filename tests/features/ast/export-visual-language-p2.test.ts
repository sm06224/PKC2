/**
 * PR-W8(Wave X P2、AI review feedback):visual language 改善の case
 * matrix。
 *
 * AI review P2 全 4 件:
 * - P2-7 H2/H3 左 border 3pt accent line(`#2F6FED`)
 * - P2-8 表 padding 8pt + ヘッダー shading `#F4F4F5` + 罫線 hairline `#CCCCCC`
 * - P2-9 marker tone-down `#FFFF00` → `#FFF3A0` + shading.fill 経路
 * - P2-10 task list glyph 色化(未完 grey ☐ / 完 緑 ☑)
 *
 * wave 規律 §4:case matrix 10 件以上。本 test は 17 ケース。
 */
import { describe, it, expect } from 'vitest';
import { astToDocxBlob } from '@features/ast/export-docx';
import { astToPptxBlob } from '@features/ast/export-pptx';
import { parseMarkdownToAst } from '@features/ast/parse';
import JSZip from 'jszip';

async function docxToBodyXml(md: string): Promise<string> {
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
  const paths: string[] = [];
  zip.forEach((path) => {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) paths.push(path);
  });
  paths.sort();
  const xmls: string[] = [];
  for (const p of paths) xmls.push(await zip.file(p)!.async('string'));
  return xmls;
}

describe('PR-W8 P2-7: docx H2/H3 accent left border', () => {
  it('H2 段落に left border `#2F6FED` accent', async () => {
    const xml = await docxToBodyXml('# H1\n## H2\n');
    // H2 paragraph に `w:pBdr` > `w:left ... w:color="2F6FED"`
    expect(xml).toMatch(/w:pStyle w:val="Heading2"[\s\S]*?w:color="2F6FED"/);
  });

  it('H3 段落に left border accent', async () => {
    const xml = await docxToBodyXml('### H3\n');
    expect(xml).toMatch(/w:pStyle w:val="Heading3"[\s\S]*?w:color="2F6FED"/);
  });

  it('H1 段落には accent border が**つかない**(pageBreakBefore で chapter separator)', async () => {
    const xml = await docxToBodyXml('# H1 first\n');
    // H1 段落自身に left border color="2F6FED" がない
    const h1Para = xml.match(/<w:p>[\s\S]*?Heading1[\s\S]*?<\/w:p>/);
    expect(h1Para).toBeTruthy();
    if (h1Para) expect(h1Para[0]).not.toContain('w:color="2F6FED"');
  });

  it('border size = 24(3pt)', async () => {
    const xml = await docxToBodyXml('## H2\n');
    expect(xml).toMatch(/w:sz="24"/);
  });
});

describe('PR-W8 P2-8: docx table padding + hairline border', () => {
  it('table cell に padding 8pt(twip 160)', async () => {
    const xml = await docxToBodyXml('| a |\n| --- |\n| body |\n');
    // tcMar(table cell margin)に top/bottom/left/right = 160
    expect(xml).toMatch(/w:w="160"/);
  });

  it('table の罫線 color = `CCCCCC` hairline', async () => {
    const xml = await docxToBodyXml('| h |\n| --- |\n| body |\n');
    expect(xml).toContain('w:color="CCCCCC"');
  });

  it('table header shading が `F4F4F5`(`EEEEEE` から更新)', async () => {
    const xml = await docxToBodyXml('| h1 | h2 |\n| --- | --- |\n| a | b |\n');
    expect(xml).toContain('w:fill="F4F4F5"');
    // 旧 EEEEEE は emit されない
    expect(xml).not.toContain('w:fill="EEEEEE"');
  });

  it('CSV fence table も同様に padding + hairline border', async () => {
    const md = '```csv\na,b\n1,2\n```\n';
    const xml = await docxToBodyXml(md);
    expect(xml).toMatch(/w:w="160"/);
    expect(xml).toContain('w:color="CCCCCC"');
  });
});

describe('PR-W8 P2-9: marker tone-down #FFF3A0', () => {
  it('docx mark `==X==` が `shading.fill = "FFF3A0"`(yellow named から変更)', async () => {
    const xml = await docxToBodyXml('==marked text==\n');
    expect(xml).toContain('w:fill="FFF3A0"');
    expect(xml).toContain('marked text');
    // 旧 named highlight `w:val="yellow"` がない
    expect(xml).not.toMatch(/<w:highlight w:val="yellow"/);
  });

  it('pptx mark `==X==` も `#FFF3A0` highlight(`#FFFF00` から変更)', async () => {
    const slides = await pptxToSlideXmls('### slide\n\n==marked== text\n');
    const all = slides.join('\n');
    expect(all).toContain('FFF3A0');
    expect(all).toContain('marked');
    expect(all).not.toContain('FFFF00');
  });

  it('inline code shading `#F4F4F5` は別色で共存(mark と区別)', async () => {
    const xml = await docxToBodyXml('==mark== と `code` 両方。\n');
    expect(xml).toContain('w:fill="FFF3A0"'); // mark
    expect(xml).toContain('w:fill="F4F4F5"'); // inline code
  });
});

describe('PR-W8 P2-10: task list glyph color', () => {
  it('docx 未完 ☐ が grey `#888888`', async () => {
    const xml = await docxToBodyXml('- [ ] open task\n');
    expect(xml).toContain('☐');
    expect(xml).toMatch(/☐[\s\S]*?w:color w:val="888888"|w:color w:val="888888"[\s\S]*?☐/);
  });

  it('docx 完 ☑ が green `#22C55E`', async () => {
    const xml = await docxToBodyXml('- [x] done task\n');
    expect(xml).toContain('☑');
    expect(xml).toMatch(/22C55E/);
  });

  it('docx 未完と完が両方ある場合、両色 emit', async () => {
    const xml = await docxToBodyXml('- [ ] open\n- [x] done\n');
    expect(xml).toContain('w:val="888888"');
    expect(xml).toContain('22C55E');
  });

  it('pptx 未完 ☐ glyph に grey color', async () => {
    const slides = await pptxToSlideXmls('### slide\n\n- [ ] open task\n');
    const all = slides.join('\n');
    expect(all).toContain('☐');
    expect(all).toContain('888888');
  });

  it('pptx 完 ☑ glyph に green color', async () => {
    const slides = await pptxToSlideXmls('### slide\n\n- [x] done task\n');
    const all = slides.join('\n');
    expect(all).toContain('☑');
    expect(all).toContain('22C55E');
  });
});

describe('PR-W8 invariant: 既存 surface への regression なし', () => {
  it('plain text 段落には accent border / cell padding / shading なし', async () => {
    const xml = await docxToBodyXml('just plain text.\n');
    expect(xml).not.toContain('w:color="2F6FED"');
    expect(xml).not.toContain('w:fill="FFF3A0"');
    expect(xml).not.toContain('w:val="888888"');
  });

  it('既存 heading numbering と accent border が共存(章番号 fix と互換)', async () => {
    const xml = await docxToBodyXml('## 1.1 既存 prefix の場合\n');
    // accent border は emit、numbering prefix は二重ではない
    expect(xml).toContain('w:color="2F6FED"');
    expect(xml).toContain('1.1 既存 prefix の場合');
    expect(xml.split('1.1').length - 1).toBe(1);
  });
});
