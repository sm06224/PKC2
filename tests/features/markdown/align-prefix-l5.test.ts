/**
 * L-5(2026-05-07、wave-10-2 Phase 1)+ reform-2026-05 PR-C(typo 寛容化):
 * 行頭 align prefix の unit test。
 *
 * **reform 後の仕様**(本 PR で変更):
 *   - `||` line-prefix → text-align: center(物理中央、書字方向 不変)
 *   - `|>` `<|` `|<` `>|`(全 4 形)→ text-align: end(logical、default flow の反対)
 *   - 段落全体に適用(空行 / 構造区切りまで継続行に伝播)
 *   - 継続行の prefix 省略可
 *   - heading / list / blockquote / table / fence 等の構造要素には適用不可
 *
 * **breaking change**(reform-2026-05):
 *   - reform 前は `|>` → 'right'、`<|` → 'left' の物理マッピング
 *   - reform 後は `|>` も `<|` も `|<` `>|` も全部 'end' logical(同一動作)
 *   - 物理 left / right が必要な場合は formal `:::paragraph{align=left|right}` を使う
 *
 * Postel's law(受信寛容)で 4 形 typo を全部 `end` として正規化。
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('L-5: 行頭 align prefix(reform-2026-05 PR-C: typo 寛容化 + logical alignment)', () => {
  it('|| prefix で paragraph が center 寄せ', () => {
    const html = renderMarkdown('|| センターの段落');
    expect(html).toContain('data-pkc-align="center"');
    expect(html).toContain('センターの段落');
    // prefix 自身は本文から削除される
    expect(html).not.toContain('||');
  });

  it('|> prefix(canonical end)で paragraph が end 寄せ', () => {
    const html = renderMarkdown('|> end の段落');
    expect(html).toContain('data-pkc-align="end"');
    expect(html).toContain('end の段落');
  });

  it('<| prefix(typo 1)も end として正規化', () => {
    const html = renderMarkdown('<| typo 1');
    expect(html).toContain('data-pkc-align="end"');
    expect(html).toContain('typo 1');
  });

  it('|< prefix(typo 2)も end として正規化', () => {
    const html = renderMarkdown('|< typo 2');
    expect(html).toContain('data-pkc-align="end"');
    expect(html).toContain('typo 2');
  });

  it('>| prefix(typo 3)も end として正規化', () => {
    const html = renderMarkdown('>| typo 3');
    expect(html).toContain('data-pkc-align="end"');
    expect(html).toContain('typo 3');
  });

  it('typo 寛容化:全 4 形が同じ end semantic に正規化される', () => {
    const forms = ['|>', '<|', '|<', '>|'];
    for (const form of forms) {
      const html = renderMarkdown(`${form} text-${form}`);
      expect(html, `form ${form}`).toContain('data-pkc-align="end"');
      // 旧 'right' / 'left' は出さない(reform breaking change)
      expect(html, `form ${form}`).not.toContain('data-pkc-align="right"');
      expect(html, `form ${form}`).not.toContain('data-pkc-align="left"');
    }
  });

  it('継続行は prefix 省略可、paragraph 全体に align が適用される', () => {
    const src = `|| センターの 1 行目
継続行も同じ align`;
    const html = renderMarkdown(src);
    expect(html).toContain('data-pkc-align="center"');
    expect(html).toContain('センターの 1 行目');
    expect(html).toContain('継続行も同じ align');
  });

  it('空行で align が解除される', () => {
    const src = `|| センターの段落

通常の段落(align なし)`;
    const html = renderMarkdown(src);
    // 1 つ目だけ align center、2 つ目は align 属性なし
    const paragraphs = html.match(/<p[^>]*>/g) ?? [];
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0]).toContain('data-pkc-align="center"');
    expect(paragraphs[1]).not.toContain('data-pkc-align');
  });

  it('複数の align block が混在できる(center + end のみ、reform 後)', () => {
    const src = `|| センターブロック

|> end ブロック A

<| end ブロック B(typo 形 も同じ end)

通常段落`;
    const html = renderMarkdown(src);
    expect(html).toContain('data-pkc-align="center"');
    // reform 後:`|>` も `<|` も同じ end に正規化される
    expect(html).toContain('data-pkc-align="end"');
    // 旧 'right' / 'left' は出ない(breaking change)
    expect(html).not.toContain('data-pkc-align="right"');
    expect(html).not.toContain('data-pkc-align="left"');
  });

  it('heading には align が適用されない(構造要素は除外)', () => {
    const src = `|| センター段落
# 見出し
通常段落`;
    const html = renderMarkdown(src);
    // heading に data-pkc-align が付かない
    expect(html).toMatch(/<h1[^>]*>見出し<\/h1>/);
    expect(html).not.toMatch(/<h1[^>]*data-pkc-align/);
  });

  it('list 行で align 解除', () => {
    const src = `|| センター段落
- list item 1
- list item 2`;
    const html = renderMarkdown(src);
    // list item は align 属性なし
    expect(html).toMatch(/<li[^>]*>list item 1<\/li>/);
    expect(html).not.toMatch(/<li[^>]*data-pkc-align/);
  });

  it('prefix のあとのスペース有無 両方許容', () => {
    const html1 = renderMarkdown('|| センター(空白あり)');
    const html2 = renderMarkdown('||センター(空白なし)');
    expect(html1).toContain('data-pkc-align="center"');
    expect(html2).toContain('data-pkc-align="center"');
    // どちらの場合も prefix は本文から削除される
    expect(html1).toContain('センター(空白あり)');
    expect(html2).toContain('センター(空白なし)');
  });

  it('prefix 無しの通常 paragraph には data-pkc-align 属性が付かない', () => {
    const html = renderMarkdown('普通の段落');
    expect(html).not.toContain('data-pkc-align');
  });

  it('table 内の cell は align prefix の対象外(GFM table 維持)', () => {
    const src = `| 列 1 | 列 2 |
| --- | --- |
| 値 1 | 値 2 |`;
    const html = renderMarkdown(src);
    expect(html).toContain('<table');
    // table に data-pkc-align は付与されない
    expect(html).not.toMatch(/<td[^>]*data-pkc-align/);
  });

  it('blockquote 内では prefix が無効化される', () => {
    const src = `> 引用内容
> もう 1 行`;
    const html = renderMarkdown(src);
    expect(html).toContain('<blockquote');
    expect(html).not.toContain('data-pkc-align');
  });

  it('連続する prefix 行(空行なし)は **異 align ごとに別 paragraph** として render される(2026-05-07 hotfix)', () => {
    const src = `|| 中央寄せ
<| end 1(reform 後 typo)
|> end 2(canonical)`;
    const html = renderMarkdown(src);
    // 各 prefix 行は前後で paragraph 分離される
    expect(html).toContain('<p data-pkc-align="center">中央寄せ</p>');
    // reform 後:`<|` と `|>` は同じ end に正規化(別 paragraph で 2 つ出る)
    const endParagraphs = html.match(/<p data-pkc-align="end">/g) ?? [];
    expect(endParagraphs.length).toBe(2);
  });

  it('全 14 ケース matrix:reform 仕様での文字種 / 構造 / 境界値 / typo 寛容', () => {
    const cases: { input: string; expectAlign?: 'center' | 'end' | null; describe: string }[] = [
      { input: '|| ASCII', expectAlign: 'center', describe: 'ASCII center' },
      { input: '|> 日本語', expectAlign: 'end', describe: 'CJK end(canonical)' },
      { input: '<| 🎉絵文字混在🎊', expectAlign: 'end', describe: 'emoji end(typo 1)' },
      { input: '|< typo case 2', expectAlign: 'end', describe: 'end(typo 2)' },
      { input: '>| typo case 3', expectAlign: 'end', describe: 'end(typo 3)' },
      { input: '|| **bold inside**', expectAlign: 'center', describe: 'inline markup inside aligned' },
      { input: '|| [link](https://example.com)', expectAlign: 'center', describe: 'link inside aligned' },
      { input: '|| `code`', expectAlign: 'center', describe: 'inline code inside aligned' },
      { input: '||', expectAlign: null, describe: '空内容(prefix のみ → 空段落、<p>生成されず)' },
      { input: 'no prefix', expectAlign: null, describe: 'prefix なし' },
      { input: '   || インデント前置', expectAlign: 'center', describe: 'leading whitespace 許容' },
      { input: '|||| 4 連続', expectAlign: 'center', describe: '|| が 2 連続後に内容' },
      { input: '|| line1\n|| line2\n|| line3', expectAlign: 'center', describe: '全行に prefix(冗長)' },
      { input: 'normal\n|| then center', expectAlign: 'center', describe: '途中行の prefix は新 paragraph' },
      { input: '|| start\n\n通常', expectAlign: 'center', describe: '空行で reset、後続は通常' },
    ];
    for (const c of cases) {
      const html = renderMarkdown(c.input);
      if (c.expectAlign) {
        expect(html, c.describe).toContain(`data-pkc-align="${c.expectAlign}"`);
      } else {
        expect(html, c.describe).not.toContain('data-pkc-align');
      }
    }
  });

  it('reform breaking change: 旧 `right` / `left` 物理 align は simple では出ない', () => {
    // reform 前は `|>` → right、`<|` → left。
    // reform 後は両方 end に統一、物理は formal `:::paragraph{align=...}` のみ。
    const src1 = renderMarkdown('|> end の段落');
    const src2 = renderMarkdown('<| end の段落 typo');
    expect(src1).not.toContain('data-pkc-align="right"');
    expect(src1).not.toContain('data-pkc-align="left"');
    expect(src2).not.toContain('data-pkc-align="right"');
    expect(src2).not.toContain('data-pkc-align="left"');
    expect(src1).toContain('data-pkc-align="end"');
    expect(src2).toContain('data-pkc-align="end"');
  });
});
