/**
 * PR-W24 cont(user 直接提供 sample):
 *
 * User が「文字化けがやたら発生」と報告した Simple 記法網羅 sample を
 * canonical fixture(`tests/features/ast/fixtures/simple-notation-sample.md`)
 * として保存、docx export 全数 audit で literal residue 0 件を強制。
 *
 * 検証項目(全 PKC notation × user sample real-world 利用):
 *  - L-9 `__` / `＿` indent(連続行 paragraph 結合対応)
 *  - L-8 `_N` blank-line(N=1 / 3 / 100 cap)
 *  - R-C `||` `|>` `<|` align prefix(連続行)
 *  - L-2-a `==X==` mark / L-2-a' `==[red]X==` `==[#fde68a]X==` color mark
 *  - L-2-c `^^X^^` em-dot / L-2-b `[[ruby:base|rt]]`
 *  - L-6 Simple inline `:text:attrs:`(`bold,red` / `lg,bg-yellow` / `1.5em`)
 *  - L-3 `> X` blockquote / L-4-a `%% X %%` inline comment
 *  - L-7-a `:::figure{#id} ... ^^^ caption :::`
 *  - L-7-b `[@id]` auto-ref / M-7 `{{vars.x}}` variable
 *
 * Sentinel raw 漏れ全 5 種(`ind:` / `bl:` / `al:` / `sb:` / `fcap:`)が
 * visible text に出ないこと、PKC marker 全 14 種が AST 経由で decompose
 * されることを assertion。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { astToDocxBlob } from '@features/ast/export-docx';
import { parseMarkdownToAst } from '@features/ast/parse';
import JSZip from 'jszip';

async function fixtureDocxTexts(): Promise<string[]> {
  const fixturePath = resolve(__dirname, 'fixtures/simple-notation-sample.md');
  const md = readFileSync(fixturePath, 'utf8');
  const ast = parseMarkdownToAst(md);
  const blob = await astToDocxBlob(ast);
  const buf = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  const texts: string[] = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1]!) texts.push(m[1]!);
  }
  return texts;
}

describe('PR-W24 user real-world sample:文字化け 0 件 audit', () => {
  it('全 sentinel raw が visible text に漏れない', async () => {
    const texts = await fixtureDocxTexts();
    const joined = texts.join('§');
    expect(joined).not.toMatch(/\bind:/);
    expect(joined).not.toMatch(/\bbl:\d/);
    expect(joined).not.toMatch(/\bal:(center|end)\|/);
    expect(joined).not.toMatch(/\bsb:/);
    expect(joined).not.toMatch(/\bfcap:/);
  });

  it('PKC marker 全 14 種が AST 経由で decompose(literal 残り 0)', async () => {
    const texts = await fixtureDocxTexts();
    const joined = texts.join('§');
    // `^^^` figure caption marker
    expect(joined).not.toMatch(/\^\^\^/);
    // `[[ruby:base|rt]]` literal
    expect(joined).not.toMatch(/\[\[ruby:/);
    // `{{vars.x}}` literal(展開済)
    expect(joined).not.toMatch(/\{\{vars/);
    // `==X==` literal(decompose 済)
    expect(joined).not.toMatch(/==[^=\s]+==/);
    // `==[color]X==` literal
    expect(joined).not.toMatch(/==\[[a-z#]/);
    // `[@id]` literal(参照は @id 形に decompose 済)
    expect(joined).not.toMatch(/\[@[\w-]+\]/);
    // `:::role` block literal
    expect(joined).not.toMatch(/:::[a-z]+\b/);
    // formal `:role:[X]` literal
    expect(joined).not.toMatch(/:(strong|emphasis|code|strike|sup|sub|lead|caption|span):\[/);
    // L-6 Simple inline `:text:attrs:` literal
    expect(joined).not.toMatch(/:[^:\s]+:[a-z0-9_.,#-]+:/);
  });

  it('vars 展開:`{{vars.mode}}` → "Simple" に展開', async () => {
    const texts = await fixtureDocxTexts();
    const joined = texts.join('§');
    expect(joined).toContain('Simple');
    expect(joined).not.toContain('{{');
  });

  it('図番号 auto-numbering:figure caption に「図 1:」prefix', async () => {
    const texts = await fixtureDocxTexts();
    const joined = texts.join('§');
    expect(joined).toMatch(/図 1:/);
    expect(joined).toContain('シンプルな図表キャプション');
  });

  it('`_100` over-cap:50 行 + visible 警告 note 注入', async () => {
    const texts = await fixtureDocxTexts();
    const joined = texts.join('§');
    expect(joined).toContain('[blank-line cap: 100 → 50]');
  });

  it('Ruby furigana(W23):base + superscript rt', async () => {
    const texts = await fixtureDocxTexts();
    expect(texts).toContain('漢字');
    expect(texts).toContain('かんじ');
  });

  it('Simple inline:`:太字で赤:bold,red:` の text 部分が残り attrs は span class に', async () => {
    const texts = await fixtureDocxTexts();
    expect(texts).toContain('太字で赤');
    expect(texts).toContain('大きく背景黄');
    expect(texts).toContain('1.5emサイズ');
  });

  it('Color mark:`==[red]赤==` / `==[#fde68a]hex==` の color が brackets 込みで literal にならない', async () => {
    const texts = await fixtureDocxTexts();
    expect(texts).toContain('赤');
    expect(texts).toContain('hex');
    const joined = texts.join('§');
    expect(joined).not.toContain('[red]');
    expect(joined).not.toContain('[#fde68a]');
  });

  it('align prefix 3 形が連続行で正しく decompose', async () => {
    const texts = await fixtureDocxTexts();
    expect(texts).toContain('中央寄せの段落（Simple形: R-C）');
    expect(texts).toContain('右寄せ（end）の段落（Simple形: R-C）');
    expect(texts).toContain('これも end に正規化される typo 寛容記法');
  });

  it('indent prefix `__` / `＿` 連続行が paragraph 結合 → 各行が独立 indent paragraph に分解', async () => {
    const texts = await fixtureDocxTexts();
    // user 本文に literal `__` `＿` を含むため strict not.toMatch ではなく、
    // 「行頭 indent marker が結合せず各行が独立 paragraph に出てる」を assert
    expect(texts).toContain('この行は __ で字下げされています。');
    expect(texts).toContain('全角の ＿ でも字下げできるはずです。');
  });
});
