/**
 * @vitest-environment happy-dom
 *
 * PR-2JJ v2 final(2026-05-13、PR #432 stack、user direction「実装できるまでを
 * 終わりとします、新しい世界を作るつもりで」):
 *
 * PKC 拡張 14 inline + 7 block 全 21 種類について、AST decomposition 経由の
 * round-trip(parse → render → parse → render)が **N 反復で stable**(可換
 * 世界の証明)であることを fix する full-coverage test。
 *
 * 「AST 内部に PKC 拡張が raw 文字列として残る」制約が真に解消されたことの
 * 根拠 test。
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdownToAst } from '@features/ast/parse';
import { canonicalize } from '@features/ast/canonicalize';
import { renderAstToMarkdown } from '@features/ast/render-markdown';
import { renderAstToHtml } from '@features/ast/render-html';

type Mode = 'gfm' | 'pkc';

function render(src: string, mode: Mode): string {
  const ast = mode === 'pkc' ? canonicalize(parseMarkdownToAst(src)) : parseMarkdownToAst(src);
  return renderAstToMarkdown(ast, { mode });
}

function iterate(src: string, mode: Mode, n: number): string[] {
  const outs: string[] = [];
  let cur = src;
  for (let i = 0; i < n; i++) {
    cur = render(cur, mode);
    outs.push(cur);
  }
  return outs;
}

describe('PR-2JJ v2 final:PKC 拡張全 21 種の round-trip 安定性 + AST decomposition', () => {
  describe('Inline 拡張 14 種(parse → AST → render)', () => {
    const cases: { name: string; src: string; expectPkcKind?: string }[] = [
      { name: ':strong:[X] → AstStrong', src: ':strong:[太字]' },
      { name: ':emphasis:[X] → AstEmphasis', src: ':emphasis:[斜体]' },
      { name: ':code:[X] → AstInlineCode', src: ':code:[const x = 1]' },
      { name: ':strike:[X] → AstStrike', src: ':strike:[削除]' },
      { name: ':lead:[X] → AstSpan(class=lead)', src: ':lead:[リード文]' },
      { name: ':caption:[X] → AstSpan(class=caption)', src: ':caption:[キャプション]' },
      { name: ':sup:[X] → AstSup', src: ':sup:[2]' },
      { name: ':sub:[X] → AstSub', src: ':sub:[n]' },
      { name: '==X== → AstMark', src: 'これは ==重要== な部分' },
      { name: '..X.. → AstEmDot', src: '..em-dot..' },
      { name: '^^X^^ → AstEmDot(alt)', src: '^^新形圏点^^' },
      { name: '[[em:X]] → AstEmDot(formal)', src: '[[em:formal em-dot]]' },
      { name: '[[ruby:base|rt]] → AstRuby', src: '[[ruby:漢字|かんじ]]' },
      { name: '%%X%% → AstCommentInline(hidden)', src: '通常 %%hidden%% 続き' },
      { name: '[@id] → AstAutoRef', src: '参照 [@fig-1] を見よ' },
      { name: '{{vars.x}} 定義済 → text(展開)', src: '---\nvars:\n  x: 値\n---\n\n{{vars.x}}' },
    ];

    for (const c of cases) {
      it(`${c.name}:5 反復 PKC mode で stable`, () => {
        const outs = iterate(c.src, 'pkc', 5);
        // 2 回目以降は同一(idempotent)
        expect(outs[1]).toBe(outs[2]);
        expect(outs[2]).toBe(outs[3]);
        expect(outs[3]).toBe(outs[4]);
      });

      it(`${c.name}:5 反復 GFM mode で stable`, () => {
        const outs = iterate(c.src, 'gfm', 5);
        expect(outs[1]).toBe(outs[2]);
        expect(outs[2]).toBe(outs[3]);
        expect(outs[3]).toBe(outs[4]);
      });
    }
  });

  describe('Block 拡張 7 種(parse → AST → render)', () => {
    const cases: { name: string; src: string }[] = [
      { name: ':::section{role=summary}', src: ':::section{role=summary}\n\n本文\n\n:::' },
      { name: ':::comment', src: ':::comment\n\ninternal\n\n:::' },
      { name: '%%% block comment', src: '%%%\n\ninternal note\n\n%%%' },
      { name: ':::figure{kind=figure id=fig-1}', src: ':::figure{kind=figure id=fig-1}\n\n![alt](url)\n\n:::' },
      { name: ':::if{format=html}', src: ':::if{format=html}\n\nHTML 限定\n\n:::' },
      { name: ':::if{format=pdf}', src: ':::if{format=pdf}\n\nPDF 限定\n\n:::' },
      { name: ':::quote{author=Smith year=2020}', src: ':::quote{author=Smith year=2020}\n\n本文引用\n\n:::' },
    ];

    for (const c of cases) {
      it(`${c.name}:5 反復 PKC mode で stable`, () => {
        const outs = iterate(c.src, 'pkc', 5);
        expect(outs[1]).toBe(outs[2]);
        expect(outs[2]).toBe(outs[3]);
        expect(outs[3]).toBe(outs[4]);
      });

      it(`${c.name}:5 反復 GFM mode で stable`, () => {
        const outs = iterate(c.src, 'gfm', 5);
        expect(outs[1]).toBe(outs[2]);
        expect(outs[2]).toBe(outs[3]);
        expect(outs[3]).toBe(outs[4]);
      });
    }
  });

  describe('混在 + ネスト:複雑 fixture でも stable', () => {
    const COMPLEX_FIXTURE = `---
vars:
  product: PKC
  version: "2.2"
  manager: 佐藤
---

# {{vars.product}} {{vars.version}} 計画

:lead:[本書は {{vars.product}} {{vars.version}} の計画]

:::section{role=summary}

## 概要

- 担当: {{vars.manager}}
- 形式 ==重要== :emphasis:[一時停止]

:::

:::comment

internal: Phase-3 で実施

:::

%%%

block hidden

%%%

:::figure{id=fig-1 kind=figure}

![alt](url)

:::

参照 [@fig-1]

:::if{format=html}

HTML 限定

:::

:::if{format=pdf}

PDF 限定

:::

通常 %%inline-hidden%% と ^^em-dot^^、..emdot..、[[em:formal]]、[[ruby:漢|かん]]。

## 表

| 機器 | 値 |
|---|---|
| CoreSW | v18 |
`;

    it('PKC mode 5 反復で stable + 内容保全', () => {
      const outs = iterate(COMPLEX_FIXTURE, 'pkc', 5);
      expect(outs[1]).toBe(outs[2]);
      expect(outs[2]).toBe(outs[3]);
      expect(outs[3]).toBe(outs[4]);
      // 内容保全
      expect(outs[4]).toContain('PKC');
      expect(outs[4]).toContain('佐藤');
      expect(outs[4]).toContain('CoreSW');
      expect(outs[4]).toContain(':::section{role=summary}');
      expect(outs[4]).toContain('%%%');
    });

    it('GFM mode 5 反復で stable + 内容保全', () => {
      const outs = iterate(COMPLEX_FIXTURE, 'gfm', 5);
      expect(outs[1]).toBe(outs[2]);
      expect(outs[2]).toBe(outs[3]);
      expect(outs[3]).toBe(outs[4]);
      // 内容保全 + PKC marker 除去
      expect(outs[4]).toContain('PKC');
      expect(outs[4]).toContain('佐藤');
      expect(outs[4]).toContain('CoreSW');
      // GFM では PKC marker は剥がれる
      expect(outs[4]).not.toContain(':::section');
      expect(outs[4]).not.toContain('%%%');
      expect(outs[4]).not.toContain(':lead:');
      expect(outs[4]).not.toContain(':emphasis:');
      // {{vars}} は展開済
      expect(outs[4]).not.toContain('{{vars.');
      // :::if{format=pdf} は drop
      expect(outs[4]).not.toContain('PDF 限定');
      // :::if{format=html} は passthrough
      expect(outs[4]).toContain('HTML 限定');
    });

    it('双方向(PKC ↔ GFM)5 cycle で安定', () => {
      let cur = COMPLEX_FIXTURE;
      let prevP = '';
      let prevG = '';
      for (let i = 0; i < 5; i++) {
        cur = render(cur, 'pkc');
        if (i >= 2) expect(cur).toBe(prevP);
        prevP = cur;
        cur = render(cur, 'gfm');
        if (i >= 2) expect(cur).toBe(prevG);
        prevG = cur;
      }
    });
  });

  describe('AST 構造の真正性(可換性の根拠)', () => {
    it(':::section + :::comment + :::if が全部 AST node として decompose されている', () => {
      const ast = parseMarkdownToAst(`:::section{role=note}

中身

:::comment

内部メモ

:::

:::if{format=html}

HTML

:::

:::
`);
      function collectKinds(blocks: ReadonlyArray<{ kind: string; children?: ReadonlyArray<{ kind: string }> }>): string[] {
        const out: string[] = [];
        for (const b of blocks) {
          out.push(b.kind);
          if (b.children) out.push(...collectKinds(b.children as ReadonlyArray<{ kind: string }>));
        }
        return out;
      }
      const kinds = collectKinds(ast.children);
      expect(kinds).toContain('section');
      expect(kinds).toContain('comment-block');
      expect(kinds).toContain('if-block');
      // PKC marker 文字列が text node に残ってない
      const text = JSON.stringify(ast);
      expect(text).not.toContain(':::section{role');
      expect(text).not.toContain(':::if{format');
    });

    it('inline marker 14 種が全部 AST node として decompose されている', () => {
      const ast = parseMarkdownToAst(`:strong:[s] :emphasis:[e] :code:[c] :strike:[t] :lead:[l] :caption:[cap] :sup:[2] :sub:[n] ==m== ..em.. ^^new^^ [[em:f]] [[ruby:漢|かん]] %%h%% [@a]`);
      function collectKinds(inlines: ReadonlyArray<{ kind: string; children?: ReadonlyArray<{ kind: string }> }>): string[] {
        const out: string[] = [];
        for (const n of inlines) {
          out.push(n.kind);
          if (n.children) out.push(...collectKinds(n.children as ReadonlyArray<{ kind: string }>));
        }
        return out;
      }
      const para = ast.children[0]!;
      expect(para.kind).toBe('paragraph');
      const kinds = collectKinds((para as { children: ReadonlyArray<{ kind: string }> }).children);
      expect(kinds).toContain('strong');
      expect(kinds).toContain('emphasis');
      expect(kinds).toContain('inline-code');
      expect(kinds).toContain('strike');
      expect(kinds).toContain('span');     // :lead: と :caption: 両方
      expect(kinds).toContain('sup');
      expect(kinds).toContain('sub');
      expect(kinds).toContain('mark');
      expect(kinds).toContain('em-dot');   // .. ^^ [[em:]] の 3 種すべて
      expect(kinds).toContain('ruby');
      expect(kinds).toContain('comment-inline');
      expect(kinds).toContain('auto-ref');
    });
  });

  describe('HTML render も AST node 経由で正しく出る', () => {
    it(':::section / :::comment / :::if が HTML として正しく render', () => {
      const ast = parseMarkdownToAst(`:::section{role=summary}

content

:::

:::comment

hidden

:::

:::if{format=html}

visible

:::
`);
      const html = renderAstToHtml(ast);
      expect(html).toContain('<section class="pkc-section-callout');
      expect(html).toContain('data-pkc-role="summary"');
      // comment-block は render に出ない
      expect(html).not.toContain('hidden');
      // if-block は wrapper div で format attr
      expect(html).toContain('data-pkc-if-format="html"');
      expect(html).toContain('visible');
    });

    it('inline ==mark==, ^^em-dot^^, [[ruby:base|rt]] が HTML で正しく render', () => {
      const ast = parseMarkdownToAst(`==重要== と ^^圏点^^ と [[ruby:漢字|かんじ]]`);
      const html = renderAstToHtml(ast);
      expect(html).toContain('<mark>重要</mark>');
      expect(html).toContain('<em class="pkc-em-dot">圏点</em>');
      expect(html).toContain('<ruby>漢字<rt>かんじ</rt></ruby>');
    });
  });
});
