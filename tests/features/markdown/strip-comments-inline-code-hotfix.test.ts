/**
 * PR-2X hotfix(2026-05-12):`stripComments` の inline code mask regression test。
 *
 * user バグレポ(2026-05-12 朝):
 *   表 cell に `` `%%%` `` を含むと、`stripComments` が inline code 内の
 *   `%%%` を block comment 開始と誤検出して、closing `%%%` を後続行で
 *   探し続け、結果的に **後続の table 行が全部食われる**。
 *
 * 修正:`stripComments` の `%%%` scan の前に inline backtick code を
 *   sentinel(U+E170 / U+E171)で mask、scan 後に restore。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('PR-2X hotfix:inline code 内 `%%%` を block comment 開始と誤検出しない', () => {
  it('user fixture(table cell の `` `%%%` ``)で 19 行 table が全部 render される', () => {
    const md = `| # | PR | scope |
|---|----|-------|
| 5 | PR-2V | \`:::toc{depth=N}\` 正式実装 |
| 6 | PR-2W | \`:::frontmatter\` / \`:::body\` 正式実装 |
| 7 | PR-2X | \`%%%\` block comment LineMap thread |
| 8 | PR-2Y | AST parse |
| 9 | PR-2Z | AST render |`;
    const html = renderMarkdown(md);
    const trCount = (html.match(/<tr>/g) || []).length;
    // header + 5 data rows = 6 tr
    expect(trCount).toBe(6);
    // 行 7 以降が消えていないこと
    expect(html).toContain('PR-2X');
    expect(html).toContain('PR-2Y');
    expect(html).toContain('PR-2Z');
    expect(html).toContain('AST parse');
    expect(html).toContain('AST render');
  });

  it('inline `%%%` を含む paragraph も後続段落を食わない', () => {
    const md = `前段落 \`%%%\` 中段落

後段落`;
    const html = renderMarkdown(md);
    expect(html).toContain('前段落');
    expect(html).toContain('中段落');
    expect(html).toContain('後段落');
  });

  it('複数 `%%%` inline code が同行にあっても誤検出しない', () => {
    const md = '行 A `%%%` と `%%%` の組合せ\n\n行 B';
    const html = renderMarkdown(md);
    expect(html).toContain('行 A');
    expect(html).toContain('行 B');
  });

  it('真の `%%%` block comment は依然として strip される(regression なし)', () => {
    const md = `A

%%%
hidden block
%%%

B`;
    const html = renderMarkdown(md);
    expect(html).toContain('A');
    expect(html).toContain('B');
    expect(html).not.toContain('hidden block');
  });

  it('inline `` ` `` + literal `%%%` 混在(片方は inline、片方は block)', () => {
    const md = `paragraph with \`%%%\` inline

%%%
real block
%%%

after`;
    const html = renderMarkdown(md);
    expect(html).toContain('paragraph with');
    expect(html).toContain('inline'); // `%%%` inline は code として残る
    expect(html).not.toContain('real block');
    expect(html).toContain('after');
  });
});
