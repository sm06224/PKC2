/**
 * L-5(2026-05-07、wave-10-2 Phase 1):行頭 align prefix の unit test。
 *
 * 仕様:
 *   - `||` line-prefix → text-align: center
 *   - `|>` line-prefix → text-align: right
 *   - `<|` line-prefix → text-align: left
 *   - 段落全体に適用(空行 / 構造区切りまで継続行に伝播)
 *   - 継続行の prefix 省略可
 *   - heading / list / blockquote / table / fence 等の構造要素には適用不可
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('L-5: 行頭 align prefix', () => {
  it('|| prefix で paragraph が center 寄せ', () => {
    const html = renderMarkdown('|| センターの段落');
    expect(html).toContain('data-pkc-align="center"');
    expect(html).toContain('センターの段落');
    // prefix 自身は本文から削除される
    expect(html).not.toContain('||');
  });

  it('|> prefix で paragraph が right 寄せ', () => {
    const html = renderMarkdown('|> 右寄せの段落');
    expect(html).toContain('data-pkc-align="right"');
    expect(html).toContain('右寄せの段落');
  });

  it('<| prefix で paragraph が left 寄せ', () => {
    const html = renderMarkdown('<| 左寄せの段落');
    expect(html).toContain('data-pkc-align="left"');
    expect(html).toContain('左寄せの段落');
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

  it('複数の align block が混在できる', () => {
    const src = `|| センターブロック

|> 右ブロック

<| 左ブロック

通常段落`;
    const html = renderMarkdown(src);
    expect(html).toContain('data-pkc-align="center"');
    expect(html).toContain('data-pkc-align="right"');
    expect(html).toContain('data-pkc-align="left"');
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
<| 左寄せ
|> 右寄せ`;
    const html = renderMarkdown(src);
    // 各 prefix 行は前後で paragraph 分離される
    expect(html).toContain('<p data-pkc-align="center">中央寄せ</p>');
    expect(html).toContain('<p data-pkc-align="left">左寄せ</p>');
    expect(html).toContain('<p data-pkc-align="right">右寄せ</p>');
  });

  it('全 13 ケース matrix:文字種 / 構造 / 境界値', () => {
    const cases: { input: string; expectAlign?: 'center' | 'right' | 'left' | null; describe: string }[] = [
      { input: '|| ASCII', expectAlign: 'center', describe: 'ASCII center' },
      { input: '|> 日本語', expectAlign: 'right', describe: 'CJK right' },
      { input: '<| 🎉絵文字混在🎊', expectAlign: 'left', describe: 'emoji left' },
      { input: '|| **bold inside**', expectAlign: 'center', describe: 'inline markup inside aligned' },
      { input: '|| [link](https://example.com)', expectAlign: 'center', describe: 'link inside aligned' },
      { input: '|| `code`', expectAlign: 'center', describe: 'inline code inside aligned' },
      { input: '||', expectAlign: null, describe: '空内容(prefix のみ → 空段落、<p>生成されず)' },
      { input: 'no prefix', expectAlign: null, describe: 'prefix なし' },
      { input: '   || インデント前置', expectAlign: 'center', describe: 'leading whitespace 許容(2026-05-08 統一方針)' },
      { input: '|||| 4 連続', expectAlign: 'center', describe: '|| が 2 連続後に内容' },
      { input: '|| line1\n|| line2\n|| line3', expectAlign: 'center', describe: '全行に prefix(冗長)' },
      { input: 'normal\n|| then center', expectAlign: 'center', describe: '途中行の prefix は新 paragraph として center 化(2026-05-07 hotfix で前後を強制分離)' },
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
});
