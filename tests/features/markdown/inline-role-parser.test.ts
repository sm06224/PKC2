import { describe, it, expect } from 'vitest';
import { parseInlineRoleAt } from '@features/markdown/inline-role-parser';

describe('parseInlineRoleAt — formal inline role parser', () => {
  it('content のみ(:sup:[2])を parse', () => {
    const r = parseInlineRoleAt(':sup:[2]', 0);
    expect(r).not.toBeNull();
    expect(r!.role).toBe('sup');
    expect(r!.content).toBe('2');
    expect(r!.attrs.kvs).toEqual({});
    expect(r!.length).toBe(8);
  });

  it('content + attrs(:span:[hi]{class=warn})を parse', () => {
    const src = ':span:[hi]{class=warn}';
    const r = parseInlineRoleAt(src, 0);
    expect(r).not.toBeNull();
    expect(r!.role).toBe('span');
    expect(r!.content).toBe('hi');
    expect(r!.attrs.kvs).toEqual({ class: 'warn' });
    expect(r!.length).toBe(src.length);
  });

  it('self-closing(:autoref:{id="fig1"})を parse', () => {
    const src = ':autoref:{id="fig1"}';
    const r = parseInlineRoleAt(src, 0);
    expect(r).not.toBeNull();
    expect(r!.role).toBe('autoref');
    expect(r!.content).toBeNull();
    expect(r!.attrs.kvs).toEqual({ id: 'fig1' });
    expect(r!.length).toBe(src.length);
  });

  it('複数 attrs(:span:[x]{class="a b" id=foo data-key=val})を parse', () => {
    const src = ':span:[x]{class="a b" id=foo data-key=val}';
    const r = parseInlineRoleAt(src, 0);
    expect(r).not.toBeNull();
    expect(r!.role).toBe('span');
    expect(r!.content).toBe('x');
    expect(r!.attrs.kvs).toEqual({
      class: 'a b',
      id: 'foo',
      'data-key': 'val',
    });
  });

  it('空 content(:span:[])は受理、content は空文字', () => {
    const r = parseInlineRoleAt(':span:[]', 0);
    expect(r).not.toBeNull();
    expect(r!.content).toBe('');
  });

  it('空 attrs(:span:[x]{})は受理、attrs は空', () => {
    const r = parseInlineRoleAt(':span:[x]{}', 0);
    expect(r).not.toBeNull();
    expect(r!.attrs.kvs).toEqual({});
  });

  it(':role: だけ(content も attrs もなし)は null(L-6 fall-through)', () => {
    expect(parseInlineRoleAt(':sup:', 0)).toBeNull();
    expect(parseInlineRoleAt(':bold:', 0)).toBeNull();
  });

  it('L-6 風 :text:attrs: は inline role として match しない', () => {
    // `:bold:red:` は L-6 simple-inline、`[` も `{` も無いので role parse は null
    expect(parseInlineRoleAt(':bold:red:', 0)).toBeNull();
  });

  it('role 名は英字始まり(数字 / 記号始まりは null)', () => {
    expect(parseInlineRoleAt(':123:[x]', 0)).toBeNull();
    expect(parseInlineRoleAt(':-bad:[x]', 0)).toBeNull();
  });

  it('role 名 underscore / hyphen 許容', () => {
    expect(parseInlineRoleAt(':my_role:[x]', 0)?.role).toBe('my_role');
    expect(parseInlineRoleAt(':my-role:[x]', 0)?.role).toBe('my-role');
  });

  it('content 内 `[` `]` は escape `\\[` `\\]` で透過', () => {
    const r = parseInlineRoleAt(':span:[a\\[b\\]c]', 0);
    expect(r).not.toBeNull();
    expect(r!.content).toBe('a\\[b\\]c');
  });

  it('content 内 nested `[` (バランス)は受理', () => {
    const r = parseInlineRoleAt(':span:[a [b] c]', 0);
    expect(r).not.toBeNull();
    expect(r!.content).toBe('a [b] c');
  });

  it('閉じ `]` 無し → null(parse 不能)', () => {
    expect(parseInlineRoleAt(':span:[unclosed', 0)).toBeNull();
  });

  it('閉じ `}` 無し → null', () => {
    expect(parseInlineRoleAt(':span:[x]{key=val', 0)).toBeNull();
  });

  it('content 内 single newline は受理(PR-2J、multi-line content)', () => {
    // PR-2J(2026-05-10):scanBracketBalanced で blank line 以外は受理。
    const r = parseInlineRoleAt(':span:[a\nb]', 0);
    expect(r).not.toBeNull();
    expect(r!.content).toBe('a\nb');
  });

  it('content 内 blank line(\\n\\n)は引き続き reject', () => {
    expect(parseInlineRoleAt(':span:[a\n\nb]', 0)).toBeNull();
  });

  it('attrs 内 `}` を quoted value で透過', () => {
    const r = parseInlineRoleAt(':span:[x]{key="a}b"}', 0);
    expect(r).not.toBeNull();
    expect(r!.attrs.kvs).toEqual({ key: 'a}b' });
  });

  it('id (#cite-1) も parse', () => {
    const r = parseInlineRoleAt(':span:[x]{#cite-1}', 0);
    expect(r).not.toBeNull();
    expect(r!.attrs.id).toBe('cite-1');
  });

  it('class (.warn) も parse', () => {
    const r = parseInlineRoleAt(':span:[x]{.warn}', 0);
    expect(r).not.toBeNull();
    expect(r!.attrs.classes).toEqual(['warn']);
  });

  it('boolean flag(:span:[x]{important})を parse', () => {
    const r = parseInlineRoleAt(':span:[x]{important}', 0);
    expect(r).not.toBeNull();
    expect(r!.attrs.kvs).toEqual({ important: true });
  });

  it('start offset > 0 でも動作', () => {
    const src = 'hello :sup:[2] world';
    const r = parseInlineRoleAt(src, 6);
    expect(r).not.toBeNull();
    expect(r!.role).toBe('sup');
    expect(r!.content).toBe('2');
    expect(r!.length).toBe(8);
  });

  it('start 位置が `:` でない → null', () => {
    expect(parseInlineRoleAt('xsup:[2]', 0)).toBeNull();
  });
});
