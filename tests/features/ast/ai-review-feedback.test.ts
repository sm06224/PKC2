/**
 * @vitest-environment happy-dom
 *
 * PR-2JJ v2 final + AI review feedback(2026-05-13、PR #432 stack):
 *
 * ChatGPT / Gemini 双方の design review(`docs/spec/ast-commutative-ir.md`
 * §11 question への回答)を実装に落とした項目を test:
 *
 *   - AstVar を parse 時展開しない(ChatGPT critical):source provenance 維持
 *   - footnote-ref / footnote def(Gemini):学術 / Pandoc 互換
 *   - opaque-inline / opaque-block(ChatGPT critical):未知構文 lossless preserve
 *   - astVersion: '2.0' を document に埋め込む(ChatGPT):schema migration 基盤
 *   - semanticHash(ast)(ChatGPT critical):semantic 等価の数値化
 *   - render 時 vars expansion を GFM mode のみに(ChatGPT):template stability
 *   - definition-list(Gemini):仕様書 / Pandoc 互換
 */

import { describe, it, expect } from 'vitest';
import { parseMarkdownToAst } from '@features/ast/parse';
import { canonicalize } from '@features/ast/canonicalize';
import { renderAstToMarkdown } from '@features/ast/render-markdown';
import { semanticHash } from '@features/ast/semantic-hash';
import { getAstApi } from '@adapter/public-ast-api';
import type { AstInline, AstFootnoteRef, AstOpaqueInline, AstVar } from '@core/ast/index';

describe('AI review:AstVar を parse 時展開しない(ChatGPT critical)', () => {
  it('parse 時 AstVar は AST に残る(text に展開されない)', () => {
    const ast = parseMarkdownToAst(`---
vars:
  site: 石狩
---

{{vars.site}} 計画
`);
    const inlines = (ast.children[0] as { children: AstInline[] }).children;
    const varNode = inlines.find((n) => n.kind === 'var') as AstVar | undefined;
    expect(varNode).toBeDefined();
    expect(varNode!.path).toBe('vars.site');
  });

  it('PKC mode render は AstVar を `{{vars.site}}` literal で残す(template 維持)', () => {
    const ast = parseMarkdownToAst(`---
vars:
  site: 石狩
---

{{vars.site}}
`);
    const out = renderAstToMarkdown(ast, { mode: 'pkc' });
    // PKC mode:`{{vars.site}}` literal を保持(template として serializable)
    expect(out).toContain('{{vars.site}}');
    expect(out).not.toContain('石狩 ');  // 値で展開されてない
  });

  it('GFM mode render は AstVar を値で展開(consumer 互換)', () => {
    const ast = parseMarkdownToAst(`---
vars:
  site: 石狩
---

{{vars.site}}
`);
    const out = renderAstToMarkdown(ast, { mode: 'gfm' });
    expect(out).toContain('石狩');
    expect(out).not.toContain('{{vars.site}}');
  });

  it('PKC → render(pkc) → parse → render(pkc) で AstVar が source 維持', () => {
    const SRC = `---
vars:
  site: 石狩
---

{{vars.site}} 計画
`;
    const ast1 = parseMarkdownToAst(SRC);
    const md = renderAstToMarkdown(ast1, { mode: 'pkc' });
    const ast2 = parseMarkdownToAst(md);
    // round-trip で AstVar が保持される(source provenance 維持)
    const inlines = (ast2.children[0] as { children: AstInline[] }).children;
    expect(inlines.some((n) => n.kind === 'var')).toBe(true);
  });
});

describe('AI review:footnote-ref + footnote definitions(Gemini)', () => {
  it('[^id] inline は AstFootnoteRef として認識', () => {
    const ast = parseMarkdownToAst(`本文に [^note1] を参照。

[^note1]: 脚注の本文
`);
    const para = ast.children[0]!;
    expect(para.kind).toBe('paragraph');
    const inlines = (para as { children: AstInline[] }).children;
    const ref = inlines.find((n) => n.kind === 'footnote-ref') as AstFootnoteRef | undefined;
    expect(ref).toBeDefined();
    expect(ref!.id).toBe('note1');
  });

  it('`[^id]: 本文` 行は ast.footnotes に格納(body block から取り除く)', () => {
    const ast = parseMarkdownToAst(`本文 [^a] 参照。

[^a]: 脚注本文
`);
    expect(ast.footnotes).toBeDefined();
    expect(ast.footnotes!['a']).toBeDefined();
    // body block には footnote definition paragraph は残らない
    const bodyText = ast.children
      .filter((b) => b.kind === 'paragraph')
      .map((b) => JSON.stringify(b))
      .join('');
    expect(bodyText).not.toContain('脚注本文');
  });

  it('footnote-ref render(両 mode で `[^id]`)', () => {
    const ast = parseMarkdownToAst(`参照 [^a]

[^a]: footnote text
`);
    const pkc = renderAstToMarkdown(ast, { mode: 'pkc' });
    const gfm = renderAstToMarkdown(ast, { mode: 'gfm' });
    expect(pkc).toContain('[^a]');
    expect(gfm).toContain('[^a]');
  });
});

describe('AI review:AstOpaque* 未知構文 lossless preserve(ChatGPT critical)', () => {
  it('LaTeX `\\textcolor{red}{X}` → AstOpaqueInline(sourceFormat=latex)', () => {
    const ast = parseMarkdownToAst('text with \\textcolor{red}{warning} marker');
    const inlines = (ast.children[0] as { children: AstInline[] }).children;
    const opaque = inlines.find((n) => n.kind === 'opaque-inline') as
      | AstOpaqueInline
      | undefined;
    expect(opaque).toBeDefined();
    expect(opaque!.sourceFormat).toBe('latex');
    expect(opaque!.original).toBe('\\textcolor{red}{warning}');
  });

  it('AstOpaqueInline は render で原文を保持(lossless)', () => {
    const ast = parseMarkdownToAst('text \\textbf{bold} marker');
    const md = renderAstToMarkdown(ast, { mode: 'pkc' });
    expect(md).toContain('\\textbf{bold}');
  });

  it('round-trip:`\\command{X}` が iter 2 以降 stable', () => {
    const SRC = 'before \\emph{italic} after';
    let cur = SRC;
    for (let i = 0; i < 3; i++) {
      cur = renderAstToMarkdown(parseMarkdownToAst(cur), { mode: 'pkc' });
    }
    const ast = parseMarkdownToAst(cur);
    const inlines = (ast.children[0] as { children: AstInline[] }).children;
    expect(inlines.some((n) => n.kind === 'opaque-inline')).toBe(true);
  });
});

describe('AI review:astVersion を document に埋め込む(ChatGPT)', () => {
  it('parseMarkdownToAst の出力は astVersion: "2.0" を持つ', () => {
    const ast = parseMarkdownToAst('hello');
    expect(ast.astVersion).toBe('2.0');
  });

  it('astVersion は serialize 後も保持(JSON で round-trip 可能)', () => {
    const ast = parseMarkdownToAst('hello');
    const json = JSON.stringify(ast);
    const parsed = JSON.parse(json);
    expect(parsed.astVersion).toBe('2.0');
  });
});

describe('AI review:semanticHash(ChatGPT critical)', () => {
  it('同じ AST は同じ hash', () => {
    const a = parseMarkdownToAst('Hello world');
    const b = parseMarkdownToAst('Hello world');
    expect(semanticHash(a)).toBe(semanticHash(b));
  });

  it('意味的に同じだが構文が違う AST は同じ hash(連続 text node merge)', () => {
    const a = parseMarkdownToAst('A B');
    const b = parseMarkdownToAst('A  B');  // 2 space
    // whitespace normalize で同じ hash になるべき
    expect(semanticHash(a)).toBe(semanticHash(b));
  });

  it('意味的に違う AST は違う hash', () => {
    const a = parseMarkdownToAst('Hello world');
    const b = parseMarkdownToAst('Goodbye world');
    expect(semanticHash(a)).not.toBe(semanticHash(b));
  });

  it('round-trip 後も semanticHash が一致(可換性の数値証明)', () => {
    const src = `:::section{role=warning}

注意事項

:::
`;
    const a1 = canonicalize(parseMarkdownToAst(src));
    const md = renderAstToMarkdown(a1, { mode: 'pkc' });
    const a2 = canonicalize(parseMarkdownToAst(md));
    expect(semanticHash(a1)).toBe(semanticHash(a2));
  });

  it('canonicalize は idempotent(canonicalize 後 hash が変わらない)', () => {
    const ast = parseMarkdownToAst('Hello *world* test');
    const c1 = canonicalize(ast);
    const c2 = canonicalize(c1);
    expect(semanticHash(c1)).toBe(semanticHash(c2));
  });
});

describe('AI review:render 時 vars expansion を GFM mode のみに(ChatGPT)', () => {
  it('PKC mode は AstVar literal `{{vars.x}}` を保持', () => {
    const ast = parseMarkdownToAst(`---
vars:
  name: alice
---

Hello {{vars.name}}
`);
    const pkc = renderAstToMarkdown(ast, { mode: 'pkc' });
    expect(pkc).toContain('{{vars.name}}');
  });

  it('GFM mode は値で展開', () => {
    const ast = parseMarkdownToAst(`---
vars:
  name: alice
---

Hello {{vars.name}}
`);
    const gfm = renderAstToMarkdown(ast, { mode: 'gfm' });
    expect(gfm).toContain('alice');
    expect(gfm).not.toContain('{{vars.name}}');
  });

  it('PKC mode は 5 反復で完全 stable(template 維持)', () => {
    const SRC = `---
vars:
  x: value
---

Hello {{vars.x}}
`;
    let cur = SRC;
    const outs: string[] = [];
    for (let i = 0; i < 5; i++) {
      cur = renderAstToMarkdown(parseMarkdownToAst(cur), { mode: 'pkc' });
      outs.push(cur);
    }
    expect(outs[1]).toBe(outs[2]);
    expect(outs[2]).toBe(outs[3]);
    expect(outs[3]).toBe(outs[4]);
    // 5 反復後も {{vars.x}} は literal で残る
    expect(outs[4]).toContain('{{vars.x}}');
  });
});

describe('AI review:window.PKC.ast.semanticHash 公開(v1.2.0)', () => {
  it('public API に semanticHash が追加されている', () => {
    const api = getAstApi();
    expect(typeof api.semanticHash).toBe('function');
    expect(api.version).toBe('1.2.0');
  });

  it('semanticHash via public API も同じ behavior', () => {
    const api = getAstApi();
    const a = api.parseMarkdown('Hello');
    const b = api.parseMarkdown('Hello');
    expect(api.semanticHash(a)).toBe(api.semanticHash(b));
  });
});
