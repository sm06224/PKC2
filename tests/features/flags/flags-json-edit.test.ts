/**
 * flags JSON 一括編集の純関数(flags-json-edit.ts)contract。
 * code-edit-lite-design-2026-07 §3。
 */
import { describe, it, expect } from 'vitest';
import {
  seedFlagsJson,
  validateFlagsJson,
  diffFlagsValues,
} from '../../../src/features/flags/flags-json-edit';
import type { FlagDescriptor } from '../../../src/core/flags';

function desc(over: Partial<FlagDescriptor> & { key: string }): FlagDescriptor {
  return {
    defaultValue: false,
    currentValue: over.defaultValue ?? false,
    source: 'default',
    options: {},
    ...over,
  } as FlagDescriptor;
}

const DESCRIPTORS: FlagDescriptor[] = [
  desc({ key: 'test.bool', defaultValue: false, currentValue: false }),
  desc({ key: 'test.num', defaultValue: 10, currentValue: 10, options: { range: [1, 60] } }),
  desc({ key: 'test.mode', defaultValue: 'a', currentValue: 'a', options: { enum: ['a', 'b'] } }),
  desc({ key: 'test.locked', defaultValue: true, currentValue: true, options: { tier: 2 } }),
  desc({ key: 'test.url', defaultValue: 1, currentValue: 5, source: 'url' }),
];

describe('seedFlagsJson', () => {
  it('key sort + 2-space pretty + 末尾改行', () => {
    expect(seedFlagsJson({ b: 1, a: true })).toBe('{\n  "a": true,\n  "b": 1\n}\n');
  });
  it('空 values は {}', () => {
    expect(seedFlagsJson({})).toBe('{}\n');
  });
});

describe('validateFlagsJson', () => {
  it('valid: values を返し issues なし', () => {
    const r = validateFlagsJson('{ "test.bool": true, "test.num": 30 }', DESCRIPTORS);
    expect(r.issues).toEqual([]);
    expect(r.values).toEqual({ 'test.bool': true, 'test.num': 30 });
  });

  it('JSON parse エラー: 行番号つき error、values は null', () => {
    const r = validateFlagsJson('{\n  "test.bool": true,,\n}', DESCRIPTORS);
    expect(r.values).toBeNull();
    expect(r.issues[0]!.severity).toBe('error');
    expect(r.issues[0]!.line).toBe(2);
  });

  it('オブジェクト以外(配列 / null)は error', () => {
    expect(validateFlagsJson('[1]', DESCRIPTORS).values).toBeNull();
    expect(validateFlagsJson('null', DESCRIPTORS).values).toBeNull();
  });

  it('未知 key は warning(保存可、values に含める)', () => {
    const r = validateFlagsJson('{\n  "gone.flag": 1\n}', DESCRIPTORS);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]!.severity).toBe('warning');
    expect(r.issues[0]!.line).toBe(2);
    expect(r.values).toEqual({ 'gone.flag': 1 });
  });

  it('型違い / 範囲外 / enum 違反 / 非 primitive は error', () => {
    expect(validateFlagsJson('{ "test.bool": 1 }', DESCRIPTORS).values).toBeNull();
    expect(validateFlagsJson('{ "test.num": 999 }', DESCRIPTORS).values).toBeNull();
    expect(validateFlagsJson('{ "test.mode": "z" }', DESCRIPTORS).values).toBeNull();
    expect(validateFlagsJson('{ "test.bool": {} }', DESCRIPTORS).values).toBeNull();
  });

  it('tier 2 は現在値と違う値にすると error、同値なら通る', () => {
    expect(validateFlagsJson('{ "test.locked": false }', DESCRIPTORS).values).toBeNull();
    const same = validateFlagsJson('{ "test.locked": true }', DESCRIPTORS);
    expect(same.values).toEqual({ 'test.locked': true });
  });

  it('URL override 中の key は warning(保存可)', () => {
    const r = validateFlagsJson('{ "test.url": 2 }', DESCRIPTORS);
    expect(r.issues[0]!.severity).toBe('warning');
    expect(r.issues[0]!.message).toContain('URL');
    expect(r.values).toEqual({ 'test.url': 2 });
  });

  it('error と warning が混在したら values は null(error 優先)', () => {
    const r = validateFlagsJson('{ "gone.flag": 1, "test.bool": 1 }', DESCRIPTORS);
    expect(r.values).toBeNull();
    expect(r.issues.some((i) => i.severity === 'warning')).toBe(true);
    expect(r.issues.some((i) => i.severity === 'error')).toBe(true);
  });
});

describe('diffFlagsValues', () => {
  it('変更 = set / 消えた key = reset / 同値は無視', () => {
    const d = diffFlagsValues(
      { a: 1, b: 'x', c: true },
      { a: 1, b: 'y', d: false },
    );
    expect(d.set).toEqual([
      { key: 'b', value: 'y' },
      { key: 'd', value: false },
    ]);
    expect(d.reset).toEqual(['c']);
  });

  it('無変更なら両方空', () => {
    const d = diffFlagsValues({ a: 1 }, { a: 1 });
    expect(d.set).toEqual([]);
    expect(d.reset).toEqual([]);
  });
});
