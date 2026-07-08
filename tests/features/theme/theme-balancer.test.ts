/**
 * theme-balancer unit test。実テーマ(dark / light)の実測失敗ペアが
 * balance 後に目標比へ到達し、達成済トークンは触られないことを検証する
 * (state → consumer 観測点:出力色の実コントラスト比を assert)。
 */
import { describe, it, expect } from 'vitest';
import { computeBalancedTokens } from '@features/theme/theme-balancer';
import { parseColor, getContrastRatio } from '@features/theme/wcag-contrast';

// base.css の実値(dark / light)。
const DARK: Record<string, string> = {
  'c-bg': '#0d0f0a', 'c-surface': '#111510', 'c-hover': '#162010',
  'c-fg': '#c8d8b0', 'c-muted': '#5a6e4a', 'c-toc-secondary': '#9ab37e',
  'c-accent': '#33ff66', 'c-danger': '#ff4444', 'c-warn': '#ffaa22',
  'c-info': '#3b82f6', 'c-success': '#33ff66',
};
const LIGHT: Record<string, string> = {
  'c-bg': '#f0ebe0', 'c-surface': '#e6e0d3', 'c-hover': '#e3ddd0',
  'c-fg': '#1a1a14', 'c-muted': '#6b6558', 'c-toc-secondary': '#26221b',
  'c-accent': '#1a6b35', 'c-danger': '#b91c1c', 'c-warn': '#c07000',
  'c-info': '#2563eb', 'c-success': '#1a6b35',
};

function reader(map: Record<string, string>) {
  return (t: string): string | undefined => map[t];
}
function ratio(colorStr: string | undefined, bgStr: string | undefined): number {
  const fg = parseColor(colorStr ?? '');
  const bg = parseColor(bgStr ?? '');
  if (!fg || !bg) return 0;
  return getContrastRatio(fg, bg);
}

describe('computeBalancedTokens', () => {
  it('dark: muted は bg に対し未達(3.45)→ balance 後 4.5 以上', () => {
    expect(ratio(DARK['c-muted'], DARK['c-bg'])).toBeLessThan(4.5);
    const out = computeBalancedTokens(reader(DARK), 4.5);
    expect(out['c-muted']).toBeDefined();
    // 最悪背景(hover / surface / bg)すべてに対して 4.5 以上
    for (const bg of ['c-bg', 'c-surface', 'c-hover']) {
      expect(ratio(out['c-muted'], DARK[bg])).toBeGreaterThanOrEqual(4.49);
    }
  });

  it('dark: body fg / accent は達成済 → override に含まれない', () => {
    const out = computeBalancedTokens(reader(DARK), 4.5);
    expect(out['c-fg']).toBeUndefined();
    expect(out['c-accent']).toBeUndefined();
  });

  it('light: warn は bg に対し未達(3.18)→ balance 後 4.5 以上', () => {
    expect(ratio(LIGHT['c-warn'], LIGHT['c-bg'])).toBeLessThan(4.5);
    const out = computeBalancedTokens(reader(LIGHT), 4.5);
    expect(out['c-warn']).toBeDefined();
    expect(ratio(out['c-warn'], LIGHT['c-bg'])).toBeGreaterThanOrEqual(4.49);
  });

  it('deterministic:同入力 → 同出力', () => {
    const a = computeBalancedTokens(reader(DARK), 4.5);
    const b = computeBalancedTokens(reader(DARK), 4.5);
    expect(a).toEqual(b);
  });

  it('色相は保たれる(同系色 shift、hue 差 ≤ 8°)', () => {
    const out = computeBalancedTokens(reader(DARK), 4.5);
    const toHue = (s: string | undefined): number => {
      const rgb = parseColor(s ?? '');
      if (!rgb) return 0;
      const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d === 0) return 0;
      let h = 0;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
      return h;
    };
    const before = toHue(DARK['c-muted']);
    const after = toHue(out['c-muted']);
    const diff = Math.min(Math.abs(after - before), 360 - Math.abs(after - before));
    expect(diff).toBeLessThanOrEqual(8);
  });

  it('parse 不能値は skip(落ちない)', () => {
    const bad = { ...DARK, 'c-muted': 'not-a-color' };
    const out = computeBalancedTokens(reader(bad), 4.5);
    expect(out['c-muted']).toBeUndefined(); // parse 不能なので skip、throw しない
  });
});
