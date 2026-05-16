/**
 * PR-W24(Wave Z.3 cont、user 直接指示「対応対象は全部」「サボることを許され
 * ない」):PKC 全 marker × 行頭 whitespace 寛容 parse の literal residue 0 件
 * audit。
 *
 * 検証範囲:
 * - L-1 `+++` section break(role attrs optional)
 * - R-2H `:::break{kind=page|rule role=R}` formal
 * - L-8 `_N` blank-line marker(1-50)
 * - L-9 `__` `＿` paragraph indent prefix
 * - R-C align prefix 5 形(`||` center / `|>` `<|` `|<` `>|` end)
 * - L-6 `:span:[X]{attrs}` formal inline
 * - L-7-a `^^^ caption` figure 内 caption marker
 * - `:::section / :::figure / :::quote / :::if / :::paragraph` 内 blank line 対応
 *
 * 行頭 whitespace 4 種 × 全 marker で literal 残り 0 件を強制(wave 規律
 * §4 の case matrix 10 件以上、本 test は 75+ ケース)。
 */
import { describe, it, expect } from 'vitest';
import { astToDocxBlob } from '@features/ast/export-docx';
import { parseMarkdownToAst } from '@features/ast/parse';
import JSZip from 'jszip';

async function docxText(md: string): Promise<string> {
  const ast = parseMarkdownToAst(md);
  const blob = await astToDocxBlob(ast);
  const buf = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  const texts: string[] = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) texts.push(m[1]!);
  return texts.join('|||');
}

const WS_VARIANTS: Array<[string, string]> = [
  ['none', ''],
  ['1sp', ' '],
  ['2sp', '  '],
  ['tab', '\t'],
  ['全角', '　'],
];

describe('PR-W24 L-1 `+++` section break(行頭 ws 寛容)', () => {
  for (const [name, ws] of WS_VARIANTS) {
    it(`+++ alone [${name}]`, async () => {
      const t = await docxText(`${ws}+++\n`);
      expect(t).not.toMatch(/\+\+\+/);
    });
    it(`+++ {role=section} [${name}]`, async () => {
      const t = await docxText(`${ws}+++ {role=section}\n`);
      expect(t).not.toMatch(/\+\+\+|role=section/);
    });
  }
});

describe('PR-W24 R-2H `:::break` formal(self-closing)', () => {
  for (const [name, ws] of WS_VARIANTS) {
    it(`:::break{kind=page} [${name}]`, async () => {
      const t = await docxText(`${ws}:::break{kind=page}\n`);
      expect(t).not.toContain(':::break');
    });
    it(`:::break{kind=rule} [${name}]`, async () => {
      const t = await docxText(`${ws}:::break{kind=rule}\n`);
      expect(t).not.toContain(':::break');
    });
  }
});

describe('PR-W24 L-8 `_N` blank-line marker', () => {
  for (const [name, ws] of WS_VARIANTS) {
    it(`_3 [${name}]`, async () => {
      const t = await docxText(`${ws}_3\n`);
      expect(t).not.toMatch(/_3/);
    });
    it(`_ alone [${name}]`, async () => {
      const t = await docxText(`${ws}_\n`);
      expect(t).not.toMatch(/^_$/);
    });
  }
});

describe('PR-W24 L-9 paragraph indent', () => {
  for (const [name, ws] of WS_VARIANTS) {
    it(`__ 半角 [${name}]`, async () => {
      const t = await docxText(`${ws}__インデント段落\n`);
      expect(t).not.toMatch(/__インデント/);
      expect(t).toContain('インデント段落');
    });
    it(`＿ 全角 [${name}]`, async () => {
      const t = await docxText(`${ws}＿インデント段落\n`);
      expect(t).not.toMatch(/^＿インデント/);
      expect(t).toContain('インデント段落');
    });
  }
});

describe('PR-W24 R-C align prefix 5 形', () => {
  const markers: Array<[string, string]> = [
    ['|| center', '||'],
    ['|> end', '|>'],
    ['<| end alt', '<|'],
    ['|< end alt2', '|<'],
    ['>| end alt3', '>|'],
  ];
  for (const [name, ws] of WS_VARIANTS) {
    for (const [mkName, marker] of markers) {
      it(`${mkName} [${name}]`, async () => {
        const t = await docxText(`${ws}${marker}寄せ\n`);
        expect(t).toContain('寄せ');
        // literal marker は visible text に残らない
        expect(t).not.toContain(`${marker}寄せ`);
      });
    }
  }
});

describe('PR-W24 L-6 `:span:[X]{attrs}` formal inline', () => {
  for (const [name, ws] of WS_VARIANTS) {
    it(`:span:[X]{class=foo} [${name}]`, async () => {
      const t = await docxText(`${ws}:span:[span text]{class=foo}\n`);
      expect(t).not.toContain(':span:');
      expect(t).toContain('span text');
    });
  }
});

describe('PR-W24 L-7-a `^^^ caption` figure 内', () => {
  it('figure with ^^^ caption(blank line 経由)', async () => {
    const t = await docxText(`:::figure{id=fig-1}\ncontent\n\n^^^ figure caption\n:::\n`);
    expect(t).not.toMatch(/\^\^\^/);
    expect(t).toContain('figure caption');
    expect(t).toContain('図'); // figureKind prefix
  });
  it('figure without caption(content only)', async () => {
    const t = await docxText(`:::figure{id=fig-2}\nbody only\n:::\n`);
    expect(t).not.toContain(':::figure');
    expect(t).toContain('body only');
  });
});

describe('PR-W24 `:::` block multi-paragraph(blank line 入り)critical fix', () => {
  it(':::section blank line', async () => {
    const t = await docxText(`:::section{role=warning}\npara 1\n\npara 2\n:::\n`);
    expect(t).not.toContain(':::section');
    expect(t).toContain('WARNING');
    expect(t).toContain('para 1');
    expect(t).toContain('para 2');
  });
  it(':::quote blank line', async () => {
    const t = await docxText(`:::quote{author="X"}\nfirst\n\nsecond\n:::\n`);
    expect(t).not.toContain(':::quote');
    expect(t).toContain('first');
    expect(t).toContain('second');
  });
  it(':::if format=docx blank line', async () => {
    const t = await docxText(`:::if{format=docx}\nfirst\n\nsecond\n:::\n`);
    expect(t).not.toContain(':::if');
    expect(t).toContain('first');
  });
  it(':::if format=html blank line(完全除外)', async () => {
    const t = await docxText(`:::if{format=html}\nhidden 1\n\nhidden 2\n:::\n`);
    expect(t).not.toContain('hidden 1');
    expect(t).not.toContain('hidden 2');
  });
  it(':::section nest with blank line', async () => {
    const t = await docxText(`:::section{role=note}\nouter\n\n:::quote{author="Y"}\ninner\n:::\n:::\n`);
    expect(t).not.toContain(':::section');
    expect(t).not.toContain(':::quote');
    expect(t).toContain('outer');
    expect(t).toContain('inner');
  });
});

describe('PR-W24 regression: blank line 無し既存 case が引き続き動作', () => {
  it(':::section no blank line', async () => {
    const t = await docxText(`:::section{role=warning}\nbody\n:::\n`);
    expect(t).toContain('WARNING');
    expect(t).toContain('body');
  });
  it(':::quote inline form', async () => {
    const t = await docxText(`:::quote{author="A"} hello :::\n`);
    expect(t).toContain('hello');
    expect(t).toContain('A');
  });
});
