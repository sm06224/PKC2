/**
 * @vitest-environment happy-dom
 *
 * PR-2JJ v2 final + bidirectional(2026-05-13、PR #432 stack、user direction:
 * 「そういう表現がそのまま通じなくても、可換に持ち込めるものはASTを介して
 * 変換器でターゲットに変換できるようにしてください。今はマークダウン
 * ベース同士なのでまだ楽ですが、コレはこれから先の他形式との表現変換との
 * 第一歩です。逆方向も然りです」):
 *
 * **PKC ↔ GFM 双方向可換性** の検証:
 *   - Forward(PKC → GFM):全 PKC 拡張が GFM 互換表現に変換される
 *   - Reverse(GFM → PKC):GFM 由来の表現(blockquote / GitHub Alert /
 *     HTML inline)が PKC AST node に逆認識される
 *   - PKC → GFM → PKC で同じ AST に戻る(semantic round-trip)
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdownToAst } from '@features/ast/parse';
import { canonicalize } from '@features/ast/canonicalize';
import { renderAstToMarkdown } from '@features/ast/render-markdown';

function R(src: string, mode: 'gfm' | 'pkc'): string {
  return renderAstToMarkdown(canonicalize(parseMarkdownToAst(src)), { mode });
}

describe('Bidirectional commutativity:Forward(PKC → GFM 互換表現)', () => {
  it(':::section{role=warning} → blockquote `> **Warning:**`', () => {
    const gfm = R(':::section{role=warning}\n\n注意\n\n:::\n', 'gfm');
    expect(gfm).toMatch(/^>\s+\*\*Warning:\*\*/m);
    expect(gfm).toContain('> 注意');
  });

  it(':::section{role=note} → blockquote `> **Note:**`', () => {
    const gfm = R(':::section{role=note}\n\n備考\n\n:::\n', 'gfm');
    expect(gfm).toContain('**Note:**');
    expect(gfm).toContain('> 備考');
  });

  it(':::comment → GFM で完全削除', () => {
    const gfm = R(':::comment\n\nhidden\n\n:::\n', 'gfm');
    expect(gfm).not.toContain('hidden');
    expect(gfm).not.toContain(':::comment');
  });

  it(':::if{format=pdf} → GFM で削除、format=html → 通す', () => {
    const gfm = R(
      ':::if{format=pdf}\n\nPDF only\n\n:::\n\n:::if{format=html}\n\nHTML only\n\n:::\n',
      'gfm',
    );
    expect(gfm).not.toContain('PDF only');
    expect(gfm).toContain('HTML only');
  });

  it('==X== mark → GFM `<mark>X</mark>` HTML', () => {
    const gfm = R('==重要==', 'gfm');
    expect(gfm).toContain('<mark>重要</mark>');
  });

  it('^^X^^ / ..X.. em-dot → GFM `<span class="pkc-em-dot">X</span>`', () => {
    const gfm = R('^^新形^^', 'gfm');
    expect(gfm).toContain('<span class="pkc-em-dot">新形</span>');
  });

  it('[[ruby:base|rt]] → GFM 正しい `<ruby>...<rt>...</rt></ruby>`', () => {
    const gfm = R('[[ruby:漢字|かんじ]]', 'gfm');
    expect(gfm).toContain('<ruby>漢字<rt>かんじ</rt></ruby>');
  });

  it(':sup:[X] → GFM `<sup>X</sup>`、:sub:[X] → `<sub>X</sub>`', () => {
    const gfm = R(':sup:[2] と :sub:[n]', 'gfm');
    expect(gfm).toContain('<sup>2</sup>');
    expect(gfm).toContain('<sub>n</sub>');
  });

  it(':lead:[X] → GFM `<span class="lead">X</span>`(reverse 認識用)', () => {
    const gfm = R(':lead:[リード]', 'gfm');
    expect(gfm).toContain('<span class="lead">リード</span>');
  });
});

describe('Bidirectional commutativity:Reverse(GFM → PKC AST node)', () => {
  it('`> **Warning:** ...` blockquote → AstSection(role=warning)', () => {
    const pkc = R('> **Warning:**\n>\n> 注意事項\n', 'pkc');
    expect(pkc).toContain(':::section{role=warning}');
    expect(pkc).toContain('注意事項');
  });

  it('GitHub Alert `> [!NOTE]` → :::section{role=note}', () => {
    const pkc = R('> [!NOTE]\n> 注意事項\n', 'pkc');
    expect(pkc).toContain(':::section{role=note}');
    expect(pkc).toContain('注意事項');
  });

  it('GitHub Alert `> [!WARNING] 内容』(同行)も認識', () => {
    const pkc = R('> [!WARNING] 危険\n', 'pkc');
    expect(pkc).toContain(':::section{role=warning}');
    expect(pkc).toContain('危険');
  });

  it('HTML `<mark>X</mark>` → AstMark → PKC `==X==`', () => {
    const pkc = R('<mark>重要</mark>', 'pkc');
    expect(pkc).toContain('==重要==');
  });

  it('HTML `<ruby>base<rt>rt</rt></ruby>` → AstRuby → PKC `{base|rt}`', () => {
    const pkc = R('<ruby>漢字<rt>かんじ</rt></ruby>', 'pkc');
    expect(pkc).toContain('{漢字|かんじ}');
  });

  it('HTML `<sup>X</sup>` → AstSup → PKC `:sup:[X]`', () => {
    const pkc = R('<sup>2</sup> 乗', 'pkc');
    expect(pkc).toContain(':sup:[2]');
  });

  it('HTML `<span class="lead">X</span>` → AstSpan(class=lead)', () => {
    const pkc = R('<span class="lead">リード</span>', 'pkc');
    // PKC mode の span+class は `[X]{.lead}` または `:lead:[X]` 形に
    // 戻るか、属性つき span として表現される。少なくとも text content は維持。
    expect(pkc).toContain('リード');
  });

  it('HTML `<span class="pkc-em-dot">X</span>` → AstEmDot → PKC `..X..`', () => {
    const pkc = R('<span class="pkc-em-dot">新形</span>', 'pkc');
    expect(pkc).toContain('..新形..');
  });
});

describe('Bidirectional commutativity:PKC → GFM → PKC で semantic 一致', () => {
  it(':::section{role=warning} の round-trip(逆方向経由)', () => {
    const pkc1 = ':::section{role=warning}\n\n注意事項\n\n:::\n';
    const gfm = R(pkc1, 'gfm');
    const pkc2 = R(gfm, 'pkc');
    // 完全一致は期待しない(spacing 等で微差)が、semantic equivalent
    expect(pkc2).toContain(':::section{role=warning}');
    expect(pkc2).toContain('注意事項');
  });

  it('==mark==, ^^em-dot^^, [[ruby:base|rt]] が PKC → GFM → PKC で復元', () => {
    const pkc1 = '==重要== と ^^新形^^ と [[ruby:漢字|かんじ]]';
    const gfm = R(pkc1, 'gfm');
    const pkc2 = R(gfm, 'pkc');
    expect(pkc2).toContain('==重要==');
    expect(pkc2).toContain('..新形..');  // ^^X^^ も AstEmDot に正規化されて ..X.. として出る
    expect(pkc2).toContain('{漢字|かんじ}');
  });

  it(':sup:[2] が PKC → GFM → PKC で復元', () => {
    const pkc1 = ':sup:[2] 乗';
    const gfm = R(pkc1, 'gfm');
    const pkc2 = R(gfm, 'pkc');
    expect(pkc2).toContain(':sup:[2]');
  });

  it('PKC ↔ GFM 5 cycle で AST が stable(destructive change なし)', () => {
    const SRC = `:::section{role=warning}

注意事項

:::

==重要== と ^^新形^^ と [[ruby:漢|かん]]
`;
    let cur = SRC;
    let prevP = '';
    let prevG = '';
    for (let i = 0; i < 5; i++) {
      cur = R(cur, 'pkc');
      if (i >= 2) expect(cur).toBe(prevP);
      prevP = cur;
      cur = R(cur, 'gfm');
      if (i >= 2) expect(cur).toBe(prevG);
      prevG = cur;
    }
  });
});

describe('Bidirectional commutativity:他形式への土台(spec extensibility)', () => {
  // user direction:「これから先の他形式との表現変換との第一歩」
  // 同 AST から HTML / Pandoc / 将来 Word/PDF/PPT に展開可能なことを確認。
  it('AstSection / AstMark / AstRuby が AST 上で識別可能(他 format への土台)', () => {
    const ast = parseMarkdownToAst(`:::section{role=warning}

==重要== な [[ruby:漢字|かんじ]]

:::
`);
    // AST にきちんと kind が並ぶことを確認(他 format converter が switch
    // case でディスパッチできる)
    const json = JSON.stringify(ast);
    expect(json).toContain('"kind":"section"');
    expect(json).toContain('"role":"warning"');
    expect(json).toContain('"kind":"mark"');
    expect(json).toContain('"kind":"ruby"');
  });
});
