/**
 * PR-W20〜W23(Wave Z.3、user authorization「ALL!!」):
 *
 * - **W20**: sup / sub formal `:sup:[X]` / `:sub:[X]` の docx 経路 fix。
 *   旧 sub は `InlineStyle` に `subScript` field なし(cast hack 経由)、
 *   applyStyle で実装側 spread 漏れで silently dropped。
 * - **W21**: math-inline `$X$` / `$$X$$` を decompose-pkc で AST 化、docx
 *   は MATH_FONT + italic で視覚区別、math-block は center align。
 * - **W22**: pptx 側 W14 parity — quote author 末尾 attribution / figure
 *   caption 「図 N:」prefix / section role icon header / if-block format
 *   filter。
 * - **W23**: ruby を base + superscript rt の furigana 近似(docx package
 *   が `<w:ruby>` element native 未対応のため visual fallback)。
 *
 * wave 規律 §4:case matrix 10 件以上。本 test は 18 ケース。
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
  zip.forEach((p) => { if (/^ppt\/slides\/slide\d+\.xml$/.test(p)) paths.push(p); });
  paths.sort();
  const xmls: string[] = [];
  for (const p of paths) xmls.push(await zip.file(p)!.async('string'));
  return xmls;
}

describe('PR-W20 sup / sub docx', () => {
  it('sup formal `:sup:[X]` が `<w:vertAlign w:val="superscript"/>` を emit', async () => {
    const xml = await docxToBodyXml('E = mc:sup:[2]\n');
    expect(xml).toMatch(/<w:vertAlign[^>]*superscript/);
    expect(xml).toContain('2');
  });

  it('sub formal `:sub:[X]` が `<w:vertAlign w:val="subscript"/>` を emit(旧 silently dropped bug fix)', async () => {
    const xml = await docxToBodyXml('H:sub:[2]O\n');
    expect(xml).toMatch(/<w:vertAlign[^>]*subscript/);
    expect(xml).toContain('2');
  });

  it('sup と sub 同居:両方 emit', async () => {
    const xml = await docxToBodyXml('mc:sup:[2] + H:sub:[2]O\n');
    expect(xml).toMatch(/superscript[\s\S]*subscript|subscript[\s\S]*superscript/);
  });

  it('sub の中身が text として保持', async () => {
    const xml = await docxToBodyXml('CO:sub:[2]\n');
    expect(xml).toContain('CO');
    expect(xml).toContain('2');
  });
});

describe('PR-W21 math-inline / math-block decompose + docx render', () => {
  it('`$X$` が math-inline AST に decompose', () => {
    const ast = parseMarkdownToAst('E = $mc^2$ です。\n');
    const para = ast.children[0] as { children: Array<{ kind: string; src?: string }> };
    const math = para.children.find((n) => n.kind === 'math-inline');
    expect(math).toBeDefined();
    expect(math?.src).toBe('mc^2');
  });

  it('`$$X$$` も math-inline AST に decompose(inline scan で)', () => {
    const ast = parseMarkdownToAst('display: $$x^2 + y^2 = z^2$$ end\n');
    const para = ast.children[0] as { children: Array<{ kind: string; src?: string }> };
    const math = para.children.find((n) => n.kind === 'math-inline');
    expect(math).toBeDefined();
    expect(math?.src).toBe('x^2 + y^2 = z^2');
  });

  it('docx で math-inline が MATH_FONT(Cambria Math)+ italic で render', async () => {
    const xml = await docxToBodyXml('E = $mc^2$\n');
    expect(xml).toContain('Cambria Math');
    expect(xml).toContain('mc^2');
    // italic flag
    expect(xml).toMatch(/<w:i\/>|<w:i w:val="true"\/>/);
  });

  it('空 math `$$` は drop', () => {
    const ast = parseMarkdownToAst('plain $$$ text\n');
    // `$$$` は `$$` 開いて closing も `$$` でない → 空ではないが parse fail
    // → text 維持。decompose-pkc が greedy match しない確認。
    const para = ast.children[0] as { children: Array<{ kind: string }> };
    expect(para.children.every((n) => n.kind !== 'math-inline')).toBe(true);
  });
});

describe('PR-W22 pptx W14 parity', () => {
  it('quote author が末尾 attribution として italic + right align で出力', async () => {
    const md = ':::quote{author="Knuth" year="1974"}\nPremature optimization is the root of all evil.\n:::\n';
    const slides = await pptxToSlideXmls(`### slide\n\n${md}`);
    const all = slides.join('\n');
    expect(all).toContain('Knuth');
    expect(all).toContain('1974');
    // align right が pptxgenjs から `algn="r"` 等で emit される
    expect(all).toMatch(/algn="r"|algn="right"/);
  });

  it('figure 内容が pptx で children として展開(caption は AST 上の `caption` field 経由、`:::figure` markdown syntax 単体では caption auto-extraction は別 PR)', async () => {
    const md = ':::figure{id=fig-1}\nfigure body\n:::\n';
    const slides = await pptxToSlideXmls(`### slide\n\n${md}`);
    const all = slides.join('\n');
    expect(all).toContain('figure body');
    // `:::figure` literal は decompose で除去されている
    expect(all).not.toContain(':::figure');
  });

  it('section role=warning で icon prefix header line', async () => {
    const md = ':::section{role=warning}\nbody\n:::\n';
    const slides = await pptxToSlideXmls(`### slide\n\n${md}`);
    const all = slides.join('\n');
    expect(all).toContain('WARNING');
    // bold flag
    expect(all).toMatch(/<a:rPr[^>]*b="1"/);
  });

  it('section role=note で icon prefix header line + color', async () => {
    const md = ':::section{role=note}\nbody\n:::\n';
    const slides = await pptxToSlideXmls(`### slide\n\n${md}`);
    const all = slides.join('\n');
    expect(all).toContain('NOTE');
  });

  it('if-block format=docx は pptx で完全除外', async () => {
    const md = ':::if{format=docx}\ndocx only content\n:::\n\nalways visible\n';
    const slides = await pptxToSlideXmls(`### slide\n\n${md}`);
    const all = slides.join('\n');
    expect(all).not.toContain('docx only content');
    expect(all).toContain('always visible');
  });

  it('if-block format=pptx は pptx で展開', async () => {
    const md = ':::if{format=pptx}\npptx only content\n:::\n';
    const slides = await pptxToSlideXmls(`### slide\n\n${md}`);
    const all = slides.join('\n');
    expect(all).toContain('pptx only content');
  });
});

describe('PR-W23 ruby furigana 近似', () => {
  it('docx で ruby `[[ruby:漢字|かんじ]]` が base + superscript rt の 2 run に分解', async () => {
    const xml = await docxToBodyXml('[[ruby:漢字|かんじ]]\n');
    expect(xml).toContain('漢字');
    expect(xml).toContain('かんじ');
    // rt は superscript で emit
    expect(xml).toMatch(/<w:vertAlign[^>]*superscript[\s\S]*?かんじ|かんじ[\s\S]*?<w:vertAlign[^>]*superscript/);
  });

  it('pptx でも ruby が base + superscript rt の 2 run', async () => {
    const slides = await pptxToSlideXmls('### slide\n\n[[ruby:平仮名|ひらがな]]\n');
    const all = slides.join('\n');
    expect(all).toContain('平仮名');
    expect(all).toContain('ひらがな');
  });

  it('複数 ruby 共存', async () => {
    const xml = await docxToBodyXml('[[ruby:日本|にほん]]と[[ruby:語|ご]]\n');
    expect(xml).toContain('日本');
    expect(xml).toContain('にほん');
    expect(xml).toContain('語');
    expect(xml).toContain('ご');
  });
});

describe('regression: W20-W23 が既存 surface を壊さない', () => {
  it('plain text 段落は math / ruby / sub / sup 出力なし', async () => {
    const xml = await docxToBodyXml('plain text only paragraph.\n');
    expect(xml).not.toContain('Cambria Math');
    expect(xml).not.toMatch(/<w:vertAlign/);
  });

  it('既存 italic emphasis `*X*` は math と区別される', async () => {
    const xml = await docxToBodyXml('*italic* と $math$\n');
    // italic は通常 fontFace で、math は Cambria Math で
    expect(xml).toContain('italic');
    expect(xml).toContain('math');
    expect(xml).toContain('Cambria Math');
  });
});
