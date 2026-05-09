import { describe, it, expect } from 'vitest';
import {
  HARD_CEILINGS,
  SOFT_DEFAULTS,
  resolveCap,
  resolveRendererCap,
  assertCapsConsistency,
  type RendererName,
} from '@features/notation/caps';

describe('features/notation/caps — HARD_CEILINGS / SOFT_DEFAULTS 整合', () => {
  it('全 renderer に HARD と SOFT 両方の entry がある + SOFT ≤ HARD', () => {
    expect(() => assertCapsConsistency()).not.toThrow();
  });

  it('top-level categories(non-renderer)で HARD と SOFT key 集合が一致', () => {
    const topLevel = ['frontmatter', 'body', 'list', 'table', 'codeFence', 'inlineNest', 'vars', 'math', 'embed'] as const;
    for (const cat of topLevel) {
      const hardKeys = Object.keys(HARD_CEILINGS[cat]).sort();
      const softKeys = Object.keys(SOFT_DEFAULTS[cat]).sort();
      expect(softKeys).toEqual(hardKeys);
    }
  });

  it('renderer 集合(HARD_CEILINGS / SOFT_DEFAULTS)の name が一致', () => {
    expect(Object.keys(HARD_CEILINGS.renderers).sort()).toEqual(
      Object.keys(SOFT_DEFAULTS.renderers).sort(),
    );
  });
});

describe('resolveCap — 上位 cap 解決', () => {
  it('override なし時 SOFT_DEFAULTS を返す', () => {
    expect(resolveCap('frontmatter', 'bytes')).toBe(SOFT_DEFAULTS.frontmatter.bytes);
    expect(resolveCap('frontmatter', 'keys')).toBe(SOFT_DEFAULTS.frontmatter.keys);
  });

  it('override が SOFT より小さい時 override 優先', () => {
    expect(resolveCap('frontmatter', 'bytes', 8 * 1024)).toBe(8 * 1024);
  });

  it('override が SOFT より大きい時 override 優先(HARD 内なら通す)', () => {
    expect(resolveCap('frontmatter', 'bytes', 100 * 1024)).toBe(100 * 1024);
  });

  it('override が HARD を超える時 HARD に clamp', () => {
    expect(resolveCap('frontmatter', 'bytes', 999_999_999)).toBe(HARD_CEILINGS.frontmatter.bytes);
  });

  it('override が exactly HARD なら HARD を返す', () => {
    expect(resolveCap('frontmatter', 'bytes', HARD_CEILINGS.frontmatter.bytes)).toBe(HARD_CEILINGS.frontmatter.bytes);
  });

  it('未知 cap 名は throw', () => {
    expect(() => resolveCap('frontmatter', 'unknown_key')).toThrow(/unknown cap/);
  });
});

describe('resolveRendererCap — renderer 別 cap 解決', () => {
  it('default で SOFT_DEFAULTS の renderer cap を返す', () => {
    expect(resolveRendererCap('tree', 'lines')).toBe(SOFT_DEFAULTS.renderers.tree.lines);
    expect(resolveRendererCap('query', 'resultRows')).toBe(SOFT_DEFAULTS.renderers.query.resultRows);
  });

  it('override が SOFT を超え HARD 内 → override 値', () => {
    expect(resolveRendererCap('tree', 'lines', 5000)).toBe(5000);
  });

  it('override が HARD を超える → HARD clamp', () => {
    expect(resolveRendererCap('tree', 'lines', 99_999_999)).toBe(HARD_CEILINGS.renderers.tree.lines);
  });

  it('未知 renderer 名は throw', () => {
    expect(() => resolveRendererCap('nonexistent' as RendererName, 'lines')).toThrow();
  });

  it('未知 cap 名は throw', () => {
    expect(() => resolveRendererCap('tree', 'unknown_key')).toThrow();
  });
});

describe('cap value sanity check', () => {
  // PKC philosophy: 普通 user は cap で詰まらない、攻撃 input は HARD で止まる
  it('frontmatter SOFT は典型 metadata より大きい(16 KB > 一般用途)', () => {
    expect(SOFT_DEFAULTS.frontmatter.bytes).toBeGreaterThanOrEqual(16 * 1024);
  });

  it('frontmatter HARD は実用 absolute(1 MB)', () => {
    expect(HARD_CEILINGS.frontmatter.bytes).toBeGreaterThanOrEqual(1 * 1024 * 1024);
  });

  it('embed.depth SOFT = 1(self / cycle 防御の現状動作維持)', () => {
    expect(SOFT_DEFAULTS.embed.depth).toBe(1);
  });

  it('vars.expansionsPerRender SOFT は 1000(M-7 reform で確定)', () => {
    expect(SOFT_DEFAULTS.vars.expansionsPerRender).toBe(1000);
  });
});
