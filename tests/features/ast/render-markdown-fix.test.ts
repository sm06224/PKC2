/**
 * @vitest-environment happy-dom
 *
 * PR-2JJ v2 critical bug fix(2026-05-13、PR #432 stack):
 *   - render-markdown の escape が過剰で `Hello (world)` が
 *     `Hello \(world\)` になる致命的バグ
 *   - GFM mode で PKC 拡張(==text==, ..text.., :::section, %%comment%%
 *     等)が AST text node に raw 文字列として入ったとき、plain 化されず
 *     出力に残る
 *
 * このテストは fail を期待する形で実装し、修正完了後に green になる。
 */
import { describe, it, expect } from 'vitest';
import { getAstApi } from '@adapter/public-ast-api';

describe('PR-2JJ v2 critical fix: renderMarkdown over-escape', () => {
  const api = getAstApi();

  it('plain text with parentheses must NOT be escaped', () => {
    const src = 'Hello (world) and [bracket] test';
    const ast = api.parseMarkdown(src);
    const gfm = api.renderMarkdown(ast, { mode: 'gfm' });
    // `(` `)` `]` は inline で markup を trigger しないので escape 不要
    expect(gfm).not.toContain('\\(');
    expect(gfm).not.toContain('\\)');
    expect(gfm).not.toContain('\\]');
    // 元の text が semantic に保存される
    expect(gfm).toContain('Hello (world) and');
  });

  it('plain text with # / + / - / ! / | / > は inline で escape されない', () => {
    const src = 'C# vs C++ — !important | pipe > arrow';
    const ast = api.parseMarkdown(src);
    const gfm = api.renderMarkdown(ast, { mode: 'gfm' });
    expect(gfm).not.toContain('\\#');
    expect(gfm).not.toContain('\\+');
    expect(gfm).not.toContain('\\!');
    expect(gfm).not.toContain('\\|');
    // > は行頭で blockquote だが、行中なら escape 不要
    expect(gfm).toContain('C# vs C++');
    expect(gfm).toContain('!important');
    expect(gfm).toContain('| pipe');
  });

  it('既存 markdown 構文(*emphasis* / **strong** / `code`)は AST 経由で復元される', () => {
    const src = '**bold** and *italic* and `code`';
    const ast = api.parseMarkdown(src);
    const gfm = api.renderMarkdown(ast, { mode: 'gfm' });
    expect(gfm).toContain('**bold**');
    expect(gfm).toContain('*italic*');
    expect(gfm).toContain('`code`');
    // 過剰 escape されていない
    expect(gfm).not.toContain('\\*\\*');
  });

  it('日本語の plain text は escape されない', () => {
    const src = 'こんにちは(世界)、今日はいい天気ですね!';
    const ast = api.parseMarkdown(src);
    const gfm = api.renderMarkdown(ast, { mode: 'gfm' });
    expect(gfm).toContain('こんにちは(世界)');
    expect(gfm).toContain('今日はいい天気ですね!');
    // 全角の括弧 / ! は ASCII でないので元から escape 対象外、but 念のため
    expect(gfm).not.toContain('\\(');
  });
});

describe('PR-2JJ v2 critical fix: GFM mode で PKC marker が plain 化される', () => {
  const api = getAstApi();

  it('==mark== は GFM で <mark> または plain text に変換される', () => {
    const src = 'これは==重要==な文。';
    const ast = api.parseMarkdown(src);
    const gfm = api.renderMarkdown(ast, { mode: 'gfm' });
    // 期待:`==重要==` が GFM では <mark>重要</mark> もしくは plain 「重要」に
    // なり、raw な `==重要==` marker が出力に残らない。
    expect(gfm).not.toMatch(/==[^=]+==/);
  });

  it('..em-dot.. は GFM で plain text に変換される', () => {
    const src = 'これは..強調..点の例。';
    const ast = api.parseMarkdown(src);
    const gfm = api.renderMarkdown(ast, { mode: 'gfm' });
    expect(gfm).not.toMatch(/\.\.[^.]+\.\./);
  });

  it(':::section{role=note} は GFM で plain 化される(role marker は drop)', () => {
    const src = ':::section{role=note}\nNote 本文\n:::';
    const ast = api.parseMarkdown(src);
    const gfm = api.renderMarkdown(ast, { mode: 'gfm' });
    // GFM では :::section marker は剥がして中身だけ残す
    expect(gfm).not.toContain(':::section');
    expect(gfm).not.toContain(':::');
    expect(gfm).toContain('Note 本文');
  });

  it('%%comment%% は GFM で削除される(hidden 既定)', () => {
    const src = 'Visible %%hidden%% text';
    const ast = api.parseMarkdown(src);
    const gfm = api.renderMarkdown(ast, { mode: 'gfm' });
    // hidden comment は GFM では消える
    expect(gfm).not.toContain('%%hidden%%');
    expect(gfm).toContain('Visible');
    expect(gfm).toContain('text');
  });
});

describe('PR-2JJ v2 critical fix: PKC mode round-trip', () => {
  const api = getAstApi();

  it('plain text round-trip(escape 過剰なし)', () => {
    const src = 'Hello (world) [test] !exclaim';
    const ast = api.parseMarkdown(src);
    const pkc = api.renderMarkdown(ast, { mode: 'pkc' });
    expect(pkc).not.toContain('\\(');
    expect(pkc).not.toContain('\\)');
    expect(pkc).not.toContain('\\[');
    expect(pkc).toContain('Hello (world)');
  });

  it('PKC marker は PKC mode では維持される', () => {
    const src = '==marked==';
    const ast = api.parseMarkdown(src);
    const pkc = api.renderMarkdown(ast, { mode: 'pkc' });
    // PKC mode では == marker を維持(canonical PKC MD)
    expect(pkc).toContain('==marked==');
  });
});
