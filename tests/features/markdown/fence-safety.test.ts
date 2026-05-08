/**
 * Fenced code block 内では PKC 拡張 markup(L-1 / L-4 / L-5 / L-7 / L-8 / L-9)
 * の preprocessor を **発火させない** ことを確認する regression test。
 *
 * Bug 由来:
 *   2026-05-08 user 報告。``` で囲まれた code block 内に `_` / `||` / `+++` /
 *   `__` / `:::figure` 等を文字列として含むと、preprocessor がそれを marker
 *   と誤認、sentinel に置換 → markdown-it が <pre><code> 内に literal sentinel
 *   を流す → post-process regex が当たらず PUA glyph(数字 box)が code block
 *   の見た目に残る。
 *
 * Fix:
 *   各 preprocessor に fenceTransition ベースの state machine を追加、fence
 *   開閉行 + fence 中身行 はマーカー検出を skip。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('Fence safety:fenced code 内では PKC 拡張 marker を発火しない', () => {
  it('L-8 `_` が code block 内で literal 表示される', () => {
    const src = '```\n_\n_3\n```';
    const html = renderMarkdown(src);
    // PUA char が漏れない
    expect(html).not.toContain('\u{E130}');
    expect(html).not.toContain('\u{E131}');
    // <pre><code> 内に literal `_` / `_3` がある(escape 後の `_` でも OK)
    expect(html).toMatch(/<pre><code[^>]*>[\s\S]*_[\s\S]*_3[\s\S]*<\/code><\/pre>/);
    // blank-line div は出ない
    expect(html).not.toContain('pkc-blank-line');
  });

  it('L-5 `||` 等が code block 内で literal 表示', () => {
    const src = '```\n|| centered\n|> right\n<| left\n```';
    const html = renderMarkdown(src);
    // align attr が paragraph に付かない(code 内なので)
    expect(html).not.toContain('data-pkc-align');
    expect(html).toContain('|| centered');
  });

  it('L-1 `+++` が code block 内で literal 表示', () => {
    const src = '```\n+++ {role=section}\n+++\n```';
    const html = renderMarkdown(src);
    expect(html).not.toContain('pkc-section-break');
    expect(html).toContain('+++');
  });

  it('L-9 `__段落` が code block 内で literal 表示', () => {
    const src = '```\n__段落本文\n＿全角字下げ\n```';
    const html = renderMarkdown(src);
    expect(html).not.toContain('data-pkc-indent');
  });

  it('L-7 `:::figure{#id}` が code block 内で literal 表示', () => {
    const src = '```\n:::figure{#fig-1}\nimage\n^^^ caption\n:::\n```';
    const html = renderMarkdown(src);
    expect(html).not.toContain('<figure');
    expect(html).toContain(':::figure');
    expect(html).toContain('^^^ caption');
  });

  it('L-4 `%% comment %%` も code block 内では削除されない', () => {
    const src = '```\n%% inline comment %%\n%%%\nblock comment\n%%%\n```';
    const html = renderMarkdown(src);
    // code 内では comment が literal text として残る
    expect(html).toContain('%% inline comment %%');
    expect(html).toContain('%%%');
    expect(html).toContain('block comment');
  });

  it('複合:user 報告ケース(template fixture)で sentinel 漏れなし', () => {
    // user 提供 fixture と同じ構造:fenced template の中に複数のマーカー
    const src = [
      '```',
      'YYYY年MM月DD日 HH:MM 発信',
      'To: ほにゃらら',
      'From: へのへの',
      '_',
      'ほにゃららシステムに関する障害発生の一次連絡',
      '_',
      '__本文の段落字下げ',
      '|| 中央寄せ',
      '+++ {role=body}',
      ':::figure{#x}',
      'inner',
      ':::',
      '以上',
      '```',
    ].join('\n');
    const html = renderMarkdown(src);
    // 5 種の sentinel char(U+E110-E121, E130-E131)が **すべて** HTML に
    // 残っていない
    for (const c of ['\u{E110}', '\u{E120}', '\u{E121}', '\u{E130}', '\u{E131}']) {
      expect(html, `sentinel ${c.codePointAt(0)?.toString(16)} not leaked`).not.toContain(c);
    }
    // PKC 拡張要素も生成されていない(全部 code 内 literal)
    expect(html).not.toContain('pkc-blank-line');
    expect(html).not.toContain('data-pkc-align');
    expect(html).not.toContain('data-pkc-indent');
    expect(html).not.toContain('pkc-section-break');
    expect(html).not.toContain('<figure');
  });

  it('境界:`~~~` fence でも同じく skip', () => {
    const src = '~~~\n_\n|| center\n~~~';
    const html = renderMarkdown(src);
    expect(html).not.toContain('pkc-blank-line');
    expect(html).not.toContain('data-pkc-align');
    expect(html).toContain('|| center');
  });

  it('境界:fence の **外** では marker は通常通り発火', () => {
    const src = [
      '|| 通常 paragraph(発火する)',
      '',
      '```',
      '|| code 内(発火しない)',
      '```',
      '',
      '|| また通常 paragraph(発火する)',
    ].join('\n');
    const html = renderMarkdown(src);
    const aligns = html.match(/data-pkc-align="center"/g) ?? [];
    expect(aligns.length).toBe(2);  // fence 外の 2 件のみ
  });

  it('境界:fence 開閉が同種 marker(``` vs ~~~)じゃないと閉じない', () => {
    const src = '```\ninside\n~~~\nstill inside\n```';
    const html = renderMarkdown(src);
    // `~~~` は ``` 開きに対して閉じ marker にならないため、最後の ``` で閉じる
    expect(html).toContain('inside');
    expect(html).toContain('still inside');
  });
});
