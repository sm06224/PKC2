import { describe, it, expect } from 'vitest';
import { extractDocumentGlobals, globalsToDataAttrs } from '@features/markdown/document-globals';

describe('extractDocumentGlobals — frontmatter writing/direction/align', () => {
  it('frontmatter 不在 → 全 undefined + warnings 空', () => {
    const r = extractDocumentGlobals('本文だけ');
    expect(r.writing).toBeUndefined();
    expect(r.direction).toBeUndefined();
    expect(r.align).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it('全 key 省略 → 全 undefined + warnings 空', () => {
    const body = `---
title: Foo
---

本文`;
    const r = extractDocumentGlobals(body);
    expect(r.writing).toBeUndefined();
    expect(r.direction).toBeUndefined();
    expect(r.align).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it('writing: horizontal を抽出', () => {
    const r = extractDocumentGlobals(`---
writing: horizontal
---
`);
    expect(r.writing).toBe('horizontal');
  });

  it('writing: vertical を抽出', () => {
    const r = extractDocumentGlobals(`---
writing: vertical
---
`);
    expect(r.writing).toBe('vertical');
  });

  it('writing: bogus は warning + undefined', () => {
    const r = extractDocumentGlobals(`---
writing: diagonal
---
`);
    expect(r.writing).toBeUndefined();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]?.kind).toBe('invalid_value');
    expect(r.warnings[0]?.key).toBe('writing');
  });

  it('direction: ltr / rtl を抽出', () => {
    expect(extractDocumentGlobals(`---\ndirection: ltr\n---\n`).direction).toBe('ltr');
    expect(extractDocumentGlobals(`---\ndirection: rtl\n---\n`).direction).toBe('rtl');
  });

  it('direction: bogus は warning', () => {
    const r = extractDocumentGlobals(`---\ndirection: sideways\n---\n`);
    expect(r.direction).toBeUndefined();
    expect(r.warnings[0]?.key).toBe('direction');
  });

  it('horizontal × align=left/right/center は valid', () => {
    for (const align of ['left', 'right', 'center'] as const) {
      const r = extractDocumentGlobals(`---\nwriting: horizontal\nalign: ${align}\n---\n`);
      expect(r.align).toBe(align);
      expect(r.warnings).toEqual([]);
    }
  });

  it('vertical × align=top/bottom/center は valid', () => {
    for (const align of ['top', 'bottom', 'center'] as const) {
      const r = extractDocumentGlobals(`---\nwriting: vertical\nalign: ${align}\n---\n`);
      expect(r.align).toBe(align);
      expect(r.warnings).toEqual([]);
    }
  });

  it('horizontal × align=top は invalid_combo warning + align undefined', () => {
    const r = extractDocumentGlobals(`---\nwriting: horizontal\nalign: top\n---\n`);
    expect(r.align).toBeUndefined();
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]?.kind).toBe('invalid_combo');
    expect(r.warnings[0]?.key).toBe('align');
  });

  it('vertical × align=left は invalid_combo warning + align undefined', () => {
    const r = extractDocumentGlobals(`---\nwriting: vertical\nalign: left\n---\n`);
    expect(r.align).toBeUndefined();
    expect(r.warnings[0]?.kind).toBe('invalid_combo');
  });

  it('writing 省略時の align は horizontal default として valid 化', () => {
    const r = extractDocumentGlobals(`---\nalign: center\n---\n`);
    expect(r.align).toBe('center');
    expect(r.warnings).toEqual([]);
  });

  it('writing 省略時に align=top は invalid(default horizontal で不正)', () => {
    const r = extractDocumentGlobals(`---\nalign: top\n---\n`);
    expect(r.align).toBeUndefined();
    expect(r.warnings[0]?.kind).toBe('invalid_combo');
  });

  it('全 3 key 同時(vertical / rtl / center)', () => {
    const r = extractDocumentGlobals(`---
writing: vertical
direction: rtl
align: center
---
`);
    expect(r.writing).toBe('vertical');
    expect(r.direction).toBe('rtl');
    expect(r.align).toBe('center');
    expect(r.warnings).toEqual([]);
  });

  it('align: bogus は invalid_value warning', () => {
    const r = extractDocumentGlobals(`---\nalign: justify\n---\n`);
    expect(r.align).toBeUndefined();
    expect(r.warnings[0]?.kind).toBe('invalid_value');
  });

  it('複数 warning が累積', () => {
    const r = extractDocumentGlobals(`---
writing: diagonal
direction: sideways
align: justify
---
`);
    expect(r.warnings).toHaveLength(3);
  });
});

describe('globalsToDataAttrs', () => {
  it('全 key 設定時 → data-pkc-* attribute 集合', () => {
    const attrs = globalsToDataAttrs({
      writing: 'vertical',
      direction: 'rtl',
      align: 'center',
      warnings: [],
    });
    expect(attrs).toEqual({
      'data-pkc-writing': 'vertical',
      'data-pkc-direction': 'rtl',
      'data-pkc-doc-align': 'center',
    });
  });

  it('未指定 key は output に含めない', () => {
    const attrs = globalsToDataAttrs({ writing: 'horizontal', warnings: [] });
    expect(attrs).toEqual({ 'data-pkc-writing': 'horizontal' });
    expect(attrs['data-pkc-direction']).toBeUndefined();
    expect(attrs['data-pkc-doc-align']).toBeUndefined();
  });

  it('全部 undefined → 空 record', () => {
    expect(globalsToDataAttrs({ warnings: [] })).toEqual({});
  });
});
