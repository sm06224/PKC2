import { describe, it, expect } from 'vitest';
import {
  parseBlockDirectiveAttrs,
  parseBlockDirectiveOpen,
  isBlockDirectiveClose,
} from '@features/markdown/block-directive-attrs';

describe('parseBlockDirectiveAttrs — Pandoc-style attrs', () => {
  it('空文字 → 全フィールド空', () => {
    expect(parseBlockDirectiveAttrs('')).toEqual({
      id: undefined,
      classes: [],
      kvs: {},
    });
  });

  it('単一 boolean flag', () => {
    expect(parseBlockDirectiveAttrs('quote')).toEqual({
      id: undefined,
      classes: [],
      kvs: { quote: true },
    });
  });

  it('複数 boolean flag', () => {
    expect(parseBlockDirectiveAttrs('quote important')).toEqual({
      id: undefined,
      classes: [],
      kvs: { quote: true, important: true },
    });
  });

  it('unquoted key=value', () => {
    expect(parseBlockDirectiveAttrs('author=Smith year=2020')).toEqual({
      id: undefined,
      classes: [],
      kvs: { author: 'Smith', year: '2020' },
    });
  });

  it('double-quoted value with whitespace', () => {
    expect(parseBlockDirectiveAttrs('author="John Smith" year=2020')).toEqual({
      id: undefined,
      classes: [],
      kvs: { author: 'John Smith', year: '2020' },
    });
  });

  it('single-quoted value with whitespace', () => {
    expect(parseBlockDirectiveAttrs("title='Hello World'")).toEqual({
      id: undefined,
      classes: [],
      kvs: { title: 'Hello World' },
    });
  });

  it('escape inside quoted value', () => {
    expect(parseBlockDirectiveAttrs('msg="say \\"hi\\""')).toEqual({
      id: undefined,
      classes: [],
      kvs: { msg: 'say "hi"' },
    });
  });

  it('id 指定 (#id)', () => {
    expect(parseBlockDirectiveAttrs('#fig-1')).toEqual({
      id: 'fig-1',
      classes: [],
      kvs: {},
    });
  });

  it('class 指定 (.class)、複数', () => {
    expect(parseBlockDirectiveAttrs('.important .visible')).toEqual({
      id: undefined,
      classes: ['important', 'visible'],
      kvs: {},
    });
  });

  it('混在(id + class + kv + flag)', () => {
    expect(parseBlockDirectiveAttrs('#fig-1 .important caption="Diagram" inline')).toEqual({
      id: 'fig-1',
      classes: ['important'],
      kvs: { caption: 'Diagram', inline: true },
    });
  });

  it('無効 key 名(数字始まり)は skip', () => {
    expect(parseBlockDirectiveAttrs('123abc=value valid_key=value2')).toEqual({
      id: undefined,
      classes: [],
      kvs: { valid_key: 'value2' },
    });
  });

  it('quote citation 用の典型 attrs', () => {
    const result = parseBlockDirectiveAttrs('author="Smith" year=2020 source="pkc://container-X/origin"');
    expect(result.kvs).toEqual({
      author: 'Smith',
      year: '2020',
      source: 'pkc://container-X/origin',
    });
  });
});

describe('parseBlockDirectiveOpen — `:::name{attrs}` 行 parse', () => {
  it(':::quote{...} を parse', () => {
    const r = parseBlockDirectiveOpen(':::quote{author="Smith" year=2020}');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('quote');
    expect(r!.attrs.kvs).toEqual({ author: 'Smith', year: '2020' });
  });

  it(':::if(attrs なし)も受理', () => {
    const r = parseBlockDirectiveOpen(':::if');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('if');
    expect(r!.attrs.kvs).toEqual({});
  });

  it(':::quote{}(空 attrs)も受理', () => {
    const r = parseBlockDirectiveOpen(':::quote{}');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('quote');
    expect(r!.attrs.kvs).toEqual({});
  });

  it('directive でない行 → null', () => {
    expect(parseBlockDirectiveOpen('not a directive')).toBeNull();
    expect(parseBlockDirectiveOpen(':::')).toBeNull();
    expect(parseBlockDirectiveOpen(':::123-bad')).toBeNull();  // name は英字始まり
    expect(parseBlockDirectiveOpen('::: quote {x}')).toBeNull(); // ::: と name の間に space は禁止
  });

  it('末尾 whitespace 許容', () => {
    const r = parseBlockDirectiveOpen(':::quote{author=Smith}   ');
    expect(r).not.toBeNull();
    expect(r!.name).toBe('quote');
  });
});

describe('isBlockDirectiveClose — `:::` 単独行の判定', () => {
  it(':::単独行は close', () => {
    expect(isBlockDirectiveClose(':::')).toBe(true);
    expect(isBlockDirectiveClose('  :::  ')).toBe(true);
  });

  it('directive open は close でない', () => {
    expect(isBlockDirectiveClose(':::quote{}')).toBe(false);
    expect(isBlockDirectiveClose(':::if')).toBe(false);
  });

  it('一般の行は close でない', () => {
    expect(isBlockDirectiveClose('hello')).toBe(false);
    expect(isBlockDirectiveClose('::')).toBe(false);
    expect(isBlockDirectiveClose('::::')).toBe(false);  // 4 個は close でない(spec strict)
  });
});
