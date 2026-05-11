/**
 * L-2(2026-05-07、wave-10-2 Phase 1):Inline 修飾(highlight / ruby / em-dot)。
 *
 * 仕様(spec §4.1):
 *   - `==text==` → <mark>text</mark>
 *   - `==[red]text==` → <mark style="background-color: red;">text</mark>
 *   - `[[ruby:漢字|かんじ]]` → <ruby>漢字<rt>かんじ</rt></ruby>
 *   - `[[em:重要]]` → <em class="pkc-em-dot">重要</em>
 *
 * Code span / fence 内では適用されない(markdown-it の自然 escape)。
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('L-2: Inline 修飾(highlight / ruby / em-dot)', () => {
  describe('==text== highlight', () => {
    it('シンプルな ==text==', () => {
      const html = renderMarkdown('前 ==注目== 後');
      expect(html).toMatch(/<mark>注目<\/mark>/);
      expect(html).toContain('前');
      expect(html).toContain('後');
    });

    it('色付き ==[red]text==', () => {
      const html = renderMarkdown('==[red]強調==');
      expect(html).toMatch(/<mark style="background-color: red;">強調<\/mark>/);
    });

    it('色 hex ==[#ff8800]text==', () => {
      const html = renderMarkdown('==[#ff8800]オレンジ==');
      expect(html).toContain('background-color: #ff8800');
      expect(html).toContain('オレンジ');
    });

    it('色 rgb ==[rgb(0, 128, 0)]text==', () => {
      const html = renderMarkdown('==[rgb(0, 128, 0)]緑==');
      expect(html).toContain('background-color: rgb(0, 128, 0)');
    });

    it('改行を跨ぐ == は無視(literal として残る)', () => {
      const src = '==hl\nopen==';
      const html = renderMarkdown(src);
      expect(html).not.toMatch(/<mark>/);
    });

    it('閉じない == は literal として残る', () => {
      const html = renderMarkdown('==open without close');
      expect(html).not.toMatch(/<mark/);
    });

    it('reform-2026-05 hotfix:==**bold**== nested で `<mark><strong>` に展開', () => {
      const html = renderMarkdown('==**bold**==');
      expect(html).toMatch(/<mark><strong>bold<\/strong><\/mark>/);
    });

    it('reform-2026-05 hotfix:==[red]**bold**== は color + bold 共存', () => {
      const html = renderMarkdown('==[red]**126,853**==');
      expect(html).toMatch(/<mark style="background-color: red;"><strong>126,853<\/strong><\/mark>/);
    });

    it('reform-2026-05 hotfix:==**bold** *italic* `code`== 複数 inline 共存', () => {
      const html = renderMarkdown('==**bold** *italic* `code`==');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
      expect(html).toContain('<code>code</code>');
      expect(html).toContain('<mark>');
    });

    it('reform-2026-05 hotfix:plain content は引き続き plain text(regression)', () => {
      const html = renderMarkdown('==普通の hl==');
      expect(html).toMatch(/<mark>普通の hl<\/mark>/);
    });
  });

  describe('[[ruby:base|reading]]', () => {
    it('シンプルな ruby', () => {
      const html = renderMarkdown('[[ruby:漢字|かんじ]]');
      expect(html).toMatch(/<ruby>漢字<rt>かんじ<\/rt><\/ruby>/);
    });

    it('文中で ruby', () => {
      const html = renderMarkdown('文中の [[ruby:単語|たんご]] 表記');
      expect(html).toMatch(/<ruby>単語<rt>たんご<\/rt><\/ruby>/);
    });

    it('separator なしは無視(literal として残る)', () => {
      const html = renderMarkdown('[[ruby:漢字]]');
      expect(html).not.toMatch(/<ruby>/);
    });
  });

  describe('[[em:text]] 圏点', () => {
    it('シンプルな em-dot', () => {
      const html = renderMarkdown('[[em:重要]]');
      expect(html).toMatch(/<em class="pkc-em-dot">重要<\/em>/);
    });

    it('文中で em-dot', () => {
      const html = renderMarkdown('これが [[em:本質]] です');
      expect(html).toContain('class="pkc-em-dot"');
      expect(html).toContain('本質');
    });
  });

  describe('reform-2026-05 hotfix:`^^text^^` em-dot 新形(deprecated [[em:..]] の後継)', () => {
    it('シンプルな ^^...^^', () => {
      const html = renderMarkdown('^^重要^^');
      expect(html).toMatch(/<em class="pkc-em-dot">重要<\/em>/);
    });

    it('文中で ^^', () => {
      const html = renderMarkdown('これが ^^本質^^ です');
      expect(html).toContain('class="pkc-em-dot"');
      expect(html).toContain('本質');
    });

    it('^^^^(空 content)は em-dot 化しない', () => {
      const html = renderMarkdown('^^^^');
      expect(html).not.toContain('pkc-em-dot');
    });

    it('`^^^ caption`(figure caption marker)とは衝突しない', () => {
      const html = renderMarkdown('^^^ caption');
      expect(html).not.toContain('pkc-em-dot');
    });

    it('^^.. と [[em:..]] が共存', () => {
      const html = renderMarkdown('^^新形^^ と [[em:旧形]] 共存');
      const matches = html.match(/<em class="pkc-em-dot">/g);
      expect(matches?.length ?? 0).toBe(2);
      expect(html).toContain('新形');
      expect(html).toContain('旧形');
    });

    it('改行を跨ぐ ^^ は em-dot 化しない(inline 制約)', () => {
      const html = renderMarkdown('^^改行\n含む^^');
      expect(html).not.toContain('pkc-em-dot');
    });

    // 2026-05-10 user バグレポ修正:^^...^^ 内 nested inline markup の処理
    describe('nested inline markup 内部処理(2026-05-10 hotfix、user バグレポ)', () => {
      it('^^**bold**^^ で内側 ** が <strong> として render', () => {
        const html = renderMarkdown('^^**最重要**^^');
        expect(html).toMatch(/<em class="pkc-em-dot"><strong>最重要<\/strong><\/em>/);
      });

      it('^^*emphasis*^^ で内側 * が <em> として render', () => {
        const html = renderMarkdown('^^*斜体*^^');
        expect(html).toMatch(/<em class="pkc-em-dot"><em>斜体<\/em><\/em>/);
      });

      it('^^==hl==^^ で内側 highlight も render', () => {
        const html = renderMarkdown('^^==黄背景==^^');
        expect(html).toMatch(/<em class="pkc-em-dot"><mark>黄背景<\/mark><\/em>/);
      });

      it('^^`code`^^ で内側 inline code も render', () => {
        const html = renderMarkdown('^^`code`^^');
        expect(html).toMatch(/<em class="pkc-em-dot"><code>code<\/code><\/em>/);
      });

      it('^^**bold** plain^^ 部分混在', () => {
        const html = renderMarkdown('^^**強調** plain^^');
        const m = html.match(/<em class="pkc-em-dot">(.*)<\/em>/);
        expect(m).not.toBeNull();
        expect(m![1]).toContain('<strong>強調</strong>');
        expect(m![1]).toContain('plain');
      });

      it('^^*X**^^ asymmetric は markdown 規則通り(`*` open + `*` close + literal `*`)', () => {
        // user typo case:single `*` open、`**` close は emphasis 1 個 + literal `*`
        const html = renderMarkdown('^^*198,853**^^');
        expect(html).toContain('class="pkc-em-dot"');
        // 内側 <em> が 1 個 + literal `*` 残る
        expect(html).toMatch(/<em class="pkc-em-dot"><em>198,853<\/em>\*<\/em>/);
      });
    });
  });

  describe('Code span / fence 内では作動しない', () => {
    it('inline code 内の == は literal', () => {
      const html = renderMarkdown('`==no mark==`');
      expect(html).toMatch(/<code>==no mark==<\/code>/);
      expect(html).not.toMatch(/<mark>no mark<\/mark>/);
    });

    it('fenced code 内の [[ruby:|]] は literal', () => {
      const src = '```\n[[ruby:漢字|かんじ]]\n```';
      const html = renderMarkdown(src);
      expect(html).not.toMatch(/<ruby>/);
      expect(html).toContain('[[ruby:');
    });
  });

  it('全 14 ケース matrix:文字種 / 構造 / 境界値', () => {
    type Case = { input: string; expectMatch?: RegExp; expectNoMatch?: RegExp; describe: string };
    const cases: Case[] = [
      { input: '==ASCII==', expectMatch: /<mark>ASCII<\/mark>/, describe: 'ASCII highlight' },
      { input: '==日本語==', expectMatch: /<mark>日本語<\/mark>/, describe: 'CJK highlight' },
      { input: '==🎉絵文字==', expectMatch: /<mark>🎉絵文字<\/mark>/, describe: 'emoji highlight' },
      { input: '==[blue]色==', expectMatch: /background-color: blue/, describe: '色付き highlight' },
      { input: '前 ==中== 後', expectMatch: /<mark>中<\/mark>/, describe: '文中 highlight' },
      { input: '== leading space==', expectNoMatch: /<mark>/, describe: 'leading space で発火しない' },
      { input: '==trailing space ==', expectNoMatch: /<mark>/, describe: 'trailing space で発火しない' },
      { input: '[[ruby:山|やま]]', expectMatch: /<ruby>山<rt>やま<\/rt><\/ruby>/, describe: 'ruby short' },
      { input: '[[ruby:複数文字|ふくすうもじ]]', expectMatch: /<ruby>複数文字<rt>ふくすうもじ<\/rt><\/ruby>/, describe: 'ruby longer' },
      { input: '[[em:単語]]', expectMatch: /class="pkc-em-dot">単語/, describe: 'em-dot single word' },
      { input: '通常 ==hl== と [[em:dot]] と [[ruby:R|r]]', expectMatch: /<mark>hl<\/mark>.*pkc-em-dot.*<ruby>R<rt>r/, describe: '混在' },
      { input: '`==in code==`', expectNoMatch: /<mark>/, describe: 'code 内では無効' },
      { input: '==空内容==' /* 空ではないので発火する */, expectMatch: /<mark>空内容<\/mark>/, describe: '日本語のみ content' },
      { input: '====', expectNoMatch: /<mark>/, describe: '空 == == は無効' },
    ];
    for (const c of cases) {
      const html = renderMarkdown(c.input);
      if (c.expectMatch) expect(html, c.describe).toMatch(c.expectMatch);
      if (c.expectNoMatch) expect(html, c.describe).not.toMatch(c.expectNoMatch);
    }
  });
});
