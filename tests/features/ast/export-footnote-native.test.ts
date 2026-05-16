/**
 * PR-W18(Wave Z.2、user「footnote 機能してない、前々から実装した気になって
 * 実装されてない機能の代表、HTML 側もできてない」):docx / HTML footnote
 * native 実装 case matrix。
 *
 * AST 経路:`[^id]` を parse.ts の shieldFootnotes で sentinel 化 →
 * decompose-pkc が AstFootnoteRef + ast.footnotes に分解。
 *
 * docx 経路:`FootnoteReferenceRun(num)` + Document.footnotes Record で
 *           native footnote 領域(末尾 / page 下部に superscript 数字 + 定義)。
 *
 * HTML 経路:`markdown-it-footnote` plugin で `<sup class="footnote-ref">` +
 *           末尾 `<section class="footnotes">`。
 *
 * 旧:`[^id]` を superscript text として literal 出力(参照リンクとして
 * 機能していなかった)。
 *
 * wave 規律 §4:case matrix 10 件以上。本 test は 12 ケース。
 */
import { describe, it, expect } from 'vitest';
import { astToDocxBlob } from '@features/ast/export-docx';
import { parseMarkdownToAst } from '@features/ast/parse';
import { renderMarkdown } from '@features/markdown/markdown-render';
import JSZip from 'jszip';

async function docxToZip(md: string): Promise<JSZip> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToDocxBlob(ast);
  const buf = Buffer.from(await blob.arrayBuffer());
  return await JSZip.loadAsync(buf);
}

describe('PR-W18 docx footnote native(FootnoteReferenceRun + footnotes.xml)', () => {
  it('単一 footnote ref → body に `w:footnoteReference w:id="1"`', async () => {
    const zip = await docxToZip('参照 [^a] 後続。\n\n[^a]: footnote 本文 a。\n');
    const body = await zip.file('word/document.xml')!.async('string');
    expect(body).toMatch(/w:footnoteReference[^/]*w:id="1"/);
    // 旧 literal `[^a]` 表記が body から消えている
    expect(body).not.toContain('[^a]');
  });

  it('word/footnotes.xml が生成され、定義 text が格納', async () => {
    const zip = await docxToZip('参照 [^a]\n\n[^a]: footnote 本文 a。\n');
    const fn = zip.file('word/footnotes.xml');
    expect(fn).toBeTruthy();
    const xml = await fn!.async('string');
    expect(xml).toContain('footnote 本文 a。');
  });

  it('複数 footnote が挿入順で 1, 2, 3 番号化', async () => {
    const md = '本文 [^x] と [^y] と [^z]\n\n[^x]: x 本文\n[^y]: y 本文\n[^z]: z 本文\n';
    const zip = await docxToZip(md);
    const body = await zip.file('word/document.xml')!.async('string');
    expect(body).toMatch(/w:footnoteReference[^/]*w:id="1"/);
    expect(body).toMatch(/w:footnoteReference[^/]*w:id="2"/);
    expect(body).toMatch(/w:footnoteReference[^/]*w:id="3"/);
    const fnXml = await zip.file('word/footnotes.xml')!.async('string');
    expect(fnXml).toContain('x 本文');
    expect(fnXml).toContain('y 本文');
    expect(fnXml).toContain('z 本文');
  });

  it('orphan ref(定義なし)は literal `[^id]` superscript で残す', async () => {
    const zip = await docxToZip('参照 [^missing] だけ\n');
    const body = await zip.file('word/document.xml')!.async('string');
    // FootnoteReferenceRun は出ない
    expect(body).not.toMatch(/w:footnoteReference/);
    // literal が superscript で残る
    expect(body).toContain('[^missing]');
    expect(body).toMatch(/w:vertAlign[^/]*superscript/);
  });

  it('footnote 未使用 document は word/footnotes.xml の主要 entry を持たない', async () => {
    const zip = await docxToZip('# 普通の文章\n\n本文だけ。\n');
    const body = await zip.file('word/document.xml')!.async('string');
    expect(body).not.toMatch(/w:footnoteReference/);
    // footnotes.xml が出ても中身は default(separator のみ)
    const fnFile = zip.file('word/footnotes.xml');
    if (fnFile) {
      const xml = await fnFile.async('string');
      // user-defined footnote 番号 1+ は出ない
      expect(xml).not.toMatch(/w:id="1"[^/]*\/>[\s\S]*?w:footnote[\s\S]*?footnote/);
    }
  });

  it('同 id の重複参照は同番号(1 つの定義に集約)', async () => {
    const md = '初出 [^k] と再度 [^k]\n\n[^k]: k 本文\n';
    const zip = await docxToZip(md);
    const body = await zip.file('word/document.xml')!.async('string');
    const matches = body.match(/w:footnoteReference[^/]*w:id="(\d+)"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // 全て id="1"(同 footnote 定義を参照)
    for (const m of matches) expect(m).toContain('w:id="1"');
  });
});

describe('PR-W18 HTML footnote(markdown-it-footnote plugin)', () => {
  it('`[^id]` → `<sup class="footnote-ref">` + ref link', () => {
    const html = renderMarkdown('参照 [^a]\n\n[^a]: footnote 本文\n');
    expect(html).toContain('footnote-ref');
    expect(html).toMatch(/<a[^>]*href="#fn[\d-]*a?"/);
  });

  it('末尾に `<section class="footnotes">` 領域が出力', () => {
    const html = renderMarkdown('参照 [^a]\n\n[^a]: 本文\n');
    expect(html).toMatch(/<section class="footnotes"/);
  });

  it('定義本文が footnote 領域に embed', () => {
    const html = renderMarkdown('参照 [^a]\n\n[^a]: 脚注の本文 ABC\n');
    expect(html).toContain('脚注の本文 ABC');
    // section の中に本文が embedded
    expect(html).toMatch(/<section class="footnotes"[\s\S]*?脚注の本文 ABC[\s\S]*?<\/section>/);
  });

  it('複数 footnote が numbered list として render', () => {
    const html = renderMarkdown('参照 [^a] [^b]\n\n[^a]: A\n[^b]: B\n');
    expect(html).toContain('footnote-ref');
    expect(html).toContain('A');
    expect(html).toContain('B');
  });

  it('orphan ref(定義なし)はそのまま literal text(plugin が認識しない)', () => {
    const html = renderMarkdown('参照 [^missing] のみ\n');
    // section.footnotes は出ない
    expect(html).not.toMatch(/<section class="footnotes"/);
    // literal `[^missing]` が text として残る
    expect(html).toContain('[^missing]');
  });

  it('regression: 通常 link `[label](url)` は影響を受けない', () => {
    const html = renderMarkdown('[Google](https://example.com/)\n');
    expect(html).toContain('href="https://example.com/"');
    expect(html).not.toContain('footnote-ref');
  });
});
