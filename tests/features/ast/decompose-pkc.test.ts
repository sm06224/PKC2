/**
 * @vitest-environment happy-dom
 *
 * PR-2JJ v2 final(2026-05-13、PR #432 stack、user direction「実装できるまでを
 * 終わりとします」):decompose-pkc(PKC 拡張の真 AST decomposition)を unit test。
 *
 * Block / Inline 両方の case matrix で AST 構造が正しく生成されることを fix。
 * これは「AST が可換」要件の根拠 test。
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdownToAst } from '@features/ast/parse';
import { canonicalize } from '@features/ast/canonicalize';
import type { AstBlock, AstInline, AstSection, AstCommentBlock, AstFigure, AstIfBlock } from '@core/ast/index';

function blockKinds(blocks: readonly AstBlock[]): string[] {
  return blocks.map((b) => b.kind);
}

function findFirst<T extends AstBlock>(blocks: readonly AstBlock[], kind: T['kind']): T | undefined {
  for (const b of blocks) {
    if (b.kind === kind) return b as T;
    const childBlocks = (b as unknown as { children?: AstBlock[] }).children;
    if (Array.isArray(childBlocks) && childBlocks.length > 0 && typeof childBlocks[0] === 'object') {
      const found = findFirst(childBlocks as readonly AstBlock[], kind);
      if (found) return found;
    }
  }
  return undefined;
}

function collectInlineKinds(inlines: readonly AstInline[]): string[] {
  const out: string[] = [];
  for (const n of inlines) {
    out.push(n.kind);
    const childInlines = (n as unknown as { children?: AstInline[] }).children;
    if (Array.isArray(childInlines)) {
      out.push(...collectInlineKinds(childInlines));
    }
  }
  return out;
}

describe('decompose-pkc:Block 拡張の AST decomposition', () => {
  it(':::section{role=summary} ... ::: → AstSection(role=summary)', () => {
    const ast = parseMarkdownToAst(`:::section{role=summary}

## 概要

本文段落

:::
`);
    const section = findFirst<AstSection>(ast.children, 'section');
    expect(section).toBeDefined();
    expect(section!.role).toBe('summary');
    expect(blockKinds(section!.children)).toContain('heading');
    expect(blockKinds(section!.children)).toContain('paragraph');
  });

  it(':::comment ... ::: → AstCommentBlock(content も AST に source として保持)', () => {
    const ast = parseMarkdownToAst(`:::comment

internal note

複数行

:::
`);
    const cb = findFirst<AstCommentBlock>(ast.children, 'comment-block');
    expect(cb).toBeDefined();
    expect(cb!.source).toContain('internal note');
  });

  it(':::figure{id=fig-1} ... ::: → AstFigure(figureKind=figure)', () => {
    const ast = parseMarkdownToAst(`:::figure{id=fig-1}

![alt](https://example.com/img.png)

:::
`);
    const fig = findFirst<AstFigure>(ast.children, 'figure');
    expect(fig).toBeDefined();
    expect(fig!.figureKind).toBe('figure');
    expect(fig!.attrs?.id).toBe('fig-1');
  });

  it(':::if{format=html} ... ::: → AstIfBlock(format=html)', () => {
    const ast = parseMarkdownToAst(`:::if{format=html}

HTML 限定内容

:::
`);
    const ifb = findFirst<AstIfBlock>(ast.children, 'if-block');
    expect(ifb).toBeDefined();
    expect(ifb!.format).toBe('html');
  });

  it(':::if{format=pdf} は AST 構造として保持(render 側で drop)', () => {
    const ast = parseMarkdownToAst(`:::if{format=pdf}

PDF 限定内容

:::
`);
    const ifb = findFirst<AstIfBlock>(ast.children, 'if-block');
    expect(ifb).toBeDefined();
    expect(ifb!.format).toBe('pdf');
  });

  it('ネスト:::section 内の :::comment は別ノードに正しく展開', () => {
    const ast = parseMarkdownToAst(`:::section{role=note}

外側

:::comment

内部メモ

:::

:::
`);
    const section = findFirst<AstSection>(ast.children, 'section');
    expect(section).toBeDefined();
    const cb = findFirst<AstCommentBlock>(section!.children, 'comment-block');
    expect(cb).toBeDefined();
  });

  it('単一行 :::comment content ::: form(markdown-it が paragraph 結合)も decompose 可能', () => {
    // markdown-it は blank-line なしの :::comment\ncontent\n::: を 1 paragraph に
    // まとめるが、decompose-pkc は paragraph 内の単一行 :::role{...} content :::
    // パターンも認識する。
    const ast = parseMarkdownToAst(`text before

:::comment
single-line-ish content
:::

text after
`);
    // CommentBlock either as top-level or replacing the paragraph
    const cb = findFirst<AstCommentBlock>(ast.children, 'comment-block');
    expect(cb).toBeDefined();
  });
});

describe('decompose-pkc:Inline 拡張の AST decomposition', () => {
  it(':strong:[X] → AstStrong', () => {
    const ast = parseMarkdownToAst(`段落に :strong:[強調] テキスト。`);
    const para = ast.children[0]!;
    expect(para.kind).toBe('paragraph');
    const kinds = collectInlineKinds((para as unknown as { children: AstInline[] }).children);
    expect(kinds).toContain('strong');
  });

  it(':emphasis:[X] → AstEmphasis', () => {
    const ast = parseMarkdownToAst(`:emphasis:[斜体] です。`);
    const kinds = collectInlineKinds((ast.children[0]! as unknown as { children: AstInline[] }).children);
    expect(kinds).toContain('emphasis');
  });

  it(':code:[X] → AstInlineCode', () => {
    const ast = parseMarkdownToAst(`:code:[const x = 1]`);
    const kinds = collectInlineKinds((ast.children[0]! as unknown as { children: AstInline[] }).children);
    expect(kinds).toContain('inline-code');
  });

  it(':strike:[X] → AstStrike', () => {
    const ast = parseMarkdownToAst(`:strike:[削除]`);
    const kinds = collectInlineKinds((ast.children[0]! as unknown as { children: AstInline[] }).children);
    expect(kinds).toContain('strike');
  });

  it(':lead:[X] → AstSpan(class=lead)', () => {
    const ast = parseMarkdownToAst(`:lead:[リード文]`);
    const inlines = (ast.children[0]! as unknown as { children: AstInline[] }).children;
    const span = inlines.find((n) => n.kind === 'span');
    expect(span).toBeDefined();
    expect((span as unknown as { attrs: { classes: readonly string[] } }).attrs.classes).toContain('lead');
  });

  it('==text== → AstMark', () => {
    const ast = parseMarkdownToAst(`これは ==重要== です。`);
    const kinds = collectInlineKinds((ast.children[0]! as unknown as { children: AstInline[] }).children);
    expect(kinds).toContain('mark');
  });

  it('..text.. → AstEmDot', () => {
    const ast = parseMarkdownToAst(`..em-dot..`);
    const kinds = collectInlineKinds((ast.children[0]! as unknown as { children: AstInline[] }).children);
    expect(kinds).toContain('em-dot');
  });

  it('^^text^^ → AstEmDot(alt form)', () => {
    const ast = parseMarkdownToAst(`^^新形圏点^^`);
    const kinds = collectInlineKinds((ast.children[0]! as unknown as { children: AstInline[] }).children);
    expect(kinds).toContain('em-dot');
  });

  it('[[em:X]] → AstEmDot(formal form)', () => {
    const ast = parseMarkdownToAst(`[[em:formal em-dot]]`);
    const kinds = collectInlineKinds((ast.children[0]! as unknown as { children: AstInline[] }).children);
    expect(kinds).toContain('em-dot');
  });

  it('[[ruby:base|rt]] → AstRuby', () => {
    const ast = parseMarkdownToAst(`[[ruby:漢字|かんじ]]`);
    const kinds = collectInlineKinds((ast.children[0]! as unknown as { children: AstInline[] }).children);
    expect(kinds).toContain('ruby');
  });

  it('%%hidden%% → AstCommentInline(visibility=hidden)', () => {
    const ast = parseMarkdownToAst(`通常 %%hidden text%% 続き。`);
    const inlines = (ast.children[0]! as unknown as { children: AstInline[] }).children;
    const cmt = inlines.find((n) => n.kind === 'comment-inline');
    expect(cmt).toBeDefined();
    expect((cmt as { visibility: string }).visibility).toBe('hidden');
  });

  it('[@id] → AstAutoRef', () => {
    const ast = parseMarkdownToAst(`参照 [@fig-1] を見よ。`);
    const kinds = collectInlineKinds((ast.children[0]! as unknown as { children: AstInline[] }).children);
    expect(kinds).toContain('auto-ref');
  });

  it('{{vars.x}} が定義済 → text に展開', () => {
    const ast = parseMarkdownToAst(`---
vars:
  site: 石狩
---

{{vars.site}} 計画
`);
    const inlines = (ast.children[0]! as unknown as { children: AstInline[] }).children;
    const text = inlines.map((n) => (n.kind === 'text' ? n.value : '')).join('');
    expect(text).toContain('石狩');
    // No AstVar should remain (defined → expanded)
    const kinds = collectInlineKinds(inlines);
    expect(kinds).not.toContain('var');
  });

  it('{{vars.x}} が未定義 → AstVar(literal は維持)', () => {
    const ast = parseMarkdownToAst(`{{vars.unknown}}`);
    const inlines = (ast.children[0]! as unknown as { children: AstInline[] }).children;
    const kinds = collectInlineKinds(inlines);
    expect(kinds).toContain('var');
  });
});

describe('decompose-pkc:idempotent + canonicalize 統合', () => {
  it('parse は idempotent(2 回 parse しても同じ AST)', () => {
    const SRC = `:::section{role=warning}

:emphasis:[Warning] 文。

:::
`;
    const ast1 = parseMarkdownToAst(SRC);
    const ast2 = parseMarkdownToAst(SRC);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });

  it('canonicalize は idempotent(2 回 canonicalize しても同じ)', () => {
    const ast = parseMarkdownToAst(`:strong:[bold] と ==mark== の混在。`);
    const c1 = canonicalize(ast);
    const c2 = canonicalize(c1);
    expect(JSON.stringify(c1)).toBe(JSON.stringify(c2));
  });
});
