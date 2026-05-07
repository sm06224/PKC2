/**
 * L-7(2026-05-07、wave-10-2 Phase 1):図 / 表 / 式 caption + 自動採番。
 *
 * 仕様(spec §3.5):
 *   - `:::figure{#id}` ... `^^^ caption` ... `:::` で図表番号を自動採番
 *   - `:::table{#id}` / `:::equation{#id}` も同様
 *   - `[@id]` で「図 N」「表 N」「式 N」展開 + リンク
 *   - 番号は doc 全体の出現順、kind ごとに独立 counter
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('L-7: 図 / 表 / 式 caption + 自動採番', () => {
  describe('基本', () => {
    it(':::figure{#id} block を <figure> に展開', () => {
      const src = `:::figure{#fig-flow}
画像
^^^ 全体フロー
:::`;
      const html = renderMarkdown(src);
      expect(html).toContain('<figure id="fig-flow"');
      expect(html).toContain('class="pkc-fig pkc-fig-figure"');
      expect(html).toContain('data-pkc-fig-kind="figure"');
      expect(html).toContain('data-pkc-fig-num="1"');
      expect(html).toContain('<figcaption');
      expect(html).toContain('図 1: 全体フロー');
      expect(html).toContain('</figure>');
    });

    it(':::table{#id} block を <figure>(kind=table)に展開', () => {
      const src = `:::table{#tab-perf}
| 列 1 |
| --- |
| 値 1 |
^^^ 性能比較
:::`;
      const html = renderMarkdown(src);
      expect(html).toContain('id="tab-perf"');
      expect(html).toContain('data-pkc-fig-kind="table"');
      expect(html).toContain('表 1: 性能比較');
      // 内部 table も render される
      expect(html).toContain('<table');
      expect(html).toContain('値 1');
    });

    it(':::equation{#id} block を <figure>(kind=equation)に展開', () => {
      const src = `:::equation{#eq-energy}
E = mc^2
^^^ アインシュタインの式
:::`;
      const html = renderMarkdown(src);
      expect(html).toContain('id="eq-energy"');
      expect(html).toContain('data-pkc-fig-kind="equation"');
      expect(html).toContain('式 1: アインシュタインの式');
    });

    it('caption 行 `^^^` 無しでも block は展開される(caption なし)', () => {
      const src = `:::figure{#fig-no-cap}
画像のみ
:::`;
      const html = renderMarkdown(src);
      expect(html).toContain('<figure id="fig-no-cap"');
      expect(html).not.toContain('<figcaption');
    });
  });

  describe('自動採番', () => {
    it('複数 figure は順番に 1, 2, 3 と採番', () => {
      const src = `:::figure{#a}
画像 A
^^^ A
:::

:::figure{#b}
画像 B
^^^ B
:::

:::figure{#c}
画像 C
^^^ C
:::`;
      const html = renderMarkdown(src);
      expect(html).toContain('data-pkc-fig-num="1"');
      expect(html).toContain('data-pkc-fig-num="2"');
      expect(html).toContain('data-pkc-fig-num="3"');
      expect(html).toContain('図 1: A');
      expect(html).toContain('図 2: B');
      expect(html).toContain('図 3: C');
    });

    it('figure / table / equation はそれぞれ独立 counter', () => {
      const src = `:::figure{#f1}
^^^ F1
:::

:::table{#t1}
^^^ T1
:::

:::figure{#f2}
^^^ F2
:::

:::table{#t2}
^^^ T2
:::

:::equation{#e1}
^^^ E1
:::`;
      const html = renderMarkdown(src);
      expect(html).toContain('図 1: F1');
      expect(html).toContain('表 1: T1');
      expect(html).toContain('図 2: F2');
      expect(html).toContain('表 2: T2');
      expect(html).toContain('式 1: E1');
    });
  });

  describe('[@id] reference', () => {
    it('`[@id]` を <a href="#id"> + label に展開', () => {
      const src = `:::figure{#fig-a}
^^^ Alpha
:::

本文 [@fig-a] 参照。`;
      const html = renderMarkdown(src);
      expect(html).toMatch(/<a href="#fig-a" class="pkc-fig-ref">図 1<\/a>/);
    });

    it('table / equation の reference', () => {
      const src = `:::table{#t1}
^^^ T1
:::
:::equation{#e1}
^^^ E1
:::

[@t1] と [@e1]。`;
      const html = renderMarkdown(src);
      expect(html).toMatch(/<a href="#t1" class="pkc-fig-ref">表 1<\/a>/);
      expect(html).toMatch(/<a href="#e1" class="pkc-fig-ref">式 1<\/a>/);
    });

    it('未定義 id への [@id] は literal として残る', () => {
      const html = renderMarkdown('参照 [@undefined-id] です');
      expect(html).toContain('[@undefined-id]');
      expect(html).not.toMatch(/<a href="#undefined-id"/);
    });

    it('1 つの id に対する複数 reference', () => {
      const src = `:::figure{#a}
^^^ caption A
:::

[@a] を見て、[@a] も参照する。`;
      const html = renderMarkdown(src);
      const matches = html.match(/<a href="#a" class="pkc-fig-ref">図 1<\/a>/g);
      expect(matches?.length).toBe(2);
    });
  });

  describe('全 12 ケース matrix', () => {
    it('全件', () => {
      type Case = { input: string; expectMatch?: RegExp; expectNoMatch?: RegExp; describe: string };
      const cases: Case[] = [
        { input: ':::figure{#a}\n^^^ A\n:::', expectMatch: /図 1: A/, describe: 'figure 基本' },
        { input: ':::table{#a}\n^^^ T\n:::', expectMatch: /表 1: T/, describe: 'table 基本' },
        { input: ':::equation{#a}\n^^^ E\n:::', expectMatch: /式 1: E/, describe: 'equation 基本' },
        { input: ':::figure{#a}\n^^^ Caption with **bold**\n:::', expectMatch: /図 1: Caption with <strong>bold<\/strong>/, describe: 'caption の inline markup は render される' },
        { input: ':::figure{#a}\n^^^ A\n:::\n:::figure{#b}\n^^^ B\n:::', expectMatch: /図 2: B/, describe: '2 つ目 figure' },
        { input: ':::figure{#a}\n^^^ A\n:::\n[@a]', expectMatch: /<a href="#a"/, describe: 'self-ref' },
        { input: 'no figure', expectNoMatch: /<figure/, describe: '通常テキストは無影響' },
        { input: ':::figure{#a}\nasset\n:::', expectNoMatch: /<figcaption/, describe: 'caption 無し' },
        { input: '[@nonexistent]', expectMatch: /\[@nonexistent\]/, describe: '未定義 id literal' },
        { input: ':::figure{#fig-1}\n^^^ A\n:::', expectMatch: /id="fig-1"/, describe: 'id にハイフン' },
        { input: ':::figure{#fig_1}\n^^^ A\n:::', expectMatch: /id="fig_1"/, describe: 'id にアンダースコア' },
        { input: ':::FIGURE{#a}\n^^^ A\n:::', expectNoMatch: /<figure id="a"/, describe: '大文字 kind は無効(case-sensitive)' },
      ];
      for (const c of cases) {
        const html = renderMarkdown(c.input);
        if (c.expectMatch) expect(html, c.describe).toMatch(c.expectMatch);
        if (c.expectNoMatch) expect(html, c.describe).not.toMatch(c.expectNoMatch);
      }
    });
  });
});
