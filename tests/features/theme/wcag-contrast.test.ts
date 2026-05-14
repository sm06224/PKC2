/**
 * WCAG コントラスト計算 + shift resolver(reform-2026-05 Phase 3 PR-2T)unit test。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  relativeLuminance,
  getContrastRatio,
  parseColor,
  rgbToHsl,
  hslToRgb,
  shiftToContrast,
  shiftToContrastMemo,
  resolveContrastPair,
  _clearShiftCacheForTests,
} from '@features/theme/wcag-contrast';

describe('relativeLuminance', () => {
  it('黒(#000)= 0', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
  });
  it('白(#fff)= 1', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  });
  it('赤(#ff0000)≈ 0.2126', () => {
    expect(relativeLuminance([255, 0, 0])).toBeCloseTo(0.2126, 4);
  });
  it('緑(#00ff00)≈ 0.7152', () => {
    expect(relativeLuminance([0, 255, 0])).toBeCloseTo(0.7152, 4);
  });
});

describe('getContrastRatio', () => {
  it('黒 × 白 = 21:1(最大コントラスト)', () => {
    expect(getContrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
  });
  it('同色 = 1:1(最小コントラスト)', () => {
    expect(getContrastRatio([128, 128, 128], [128, 128, 128])).toBeCloseTo(1, 5);
  });
  it('対称性:getContrastRatio(a, b) === getContrastRatio(b, a)', () => {
    const r1 = getContrastRatio([100, 100, 200], [240, 220, 200]);
    const r2 = getContrastRatio([240, 220, 200], [100, 100, 200]);
    expect(r1).toBeCloseTo(r2, 5);
  });
});

describe('parseColor', () => {
  it('#fff(short hex)→ [255, 255, 255]', () => {
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
  });
  it('#000(short hex)→ [0, 0, 0]', () => {
    expect(parseColor('#000')).toEqual([0, 0, 0]);
  });
  it('#ff0080 → [255, 0, 128]', () => {
    expect(parseColor('#ff0080')).toEqual([255, 0, 128]);
  });
  it('rgb(255, 0, 128) → [255, 0, 128]', () => {
    expect(parseColor('rgb(255, 0, 128)')).toEqual([255, 0, 128]);
  });
  it('rgba(255, 0, 128, 0.5) → [255, 0, 128](alpha 無視)', () => {
    expect(parseColor('rgba(255, 0, 128, 0.5)')).toEqual([255, 0, 128]);
  });
  it('case insensitive', () => {
    expect(parseColor('#FFFFFF')).toEqual([255, 255, 255]);
  });
  it('invalid input → null', () => {
    expect(parseColor('not a color')).toBeNull();
    expect(parseColor('')).toBeNull();
  });
});

describe('rgbToHsl + hslToRgb round-trip', () => {
  it('赤 round-trip', () => {
    const back = hslToRgb(rgbToHsl([255, 0, 0]));
    expect(back).toEqual([255, 0, 0]);
  });
  it('青 round-trip', () => {
    const back = hslToRgb(rgbToHsl([0, 0, 255]));
    expect(back).toEqual([0, 0, 255]);
  });
  it('灰 round-trip(saturation 0)', () => {
    const back = hslToRgb(rgbToHsl([128, 128, 128]));
    expect(back).toEqual([128, 128, 128]);
  });
});

describe('shiftToContrast', () => {
  it('既に達成済 → applied=false、ratio 維持', () => {
    const r = shiftToContrast([0, 0, 0], [255, 255, 255], 4.5);
    expect(r.applied).toBe(false);
    expect(r.ratio).toBeCloseTo(21, 1);
  });

  it('未達 → shift で目標達成', () => {
    // 薄黄背景 + 黒文字 ≈ 1.2(WCAG 失敗)
    const r = shiftToContrast([220, 220, 0], [240, 240, 0], 4.5);
    expect(r.applied).toBe(true);
    expect(r.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('AAA(7:1)目標も達成可能(深い色なら)', () => {
    const r = shiftToContrast([100, 100, 100], [255, 255, 255], 7);
    expect(r.applied).toBe(true);
    expect(r.ratio).toBeGreaterThanOrEqual(7);
  });

  it('max iter で打ち切り(到達不能 case でも crash しない)', () => {
    const r = shiftToContrast([128, 128, 128], [128, 128, 128], 21);
    expect(r.iterations).toBeLessThanOrEqual(20);
    // 同色 start でも shift 後はある程度離れる
  });

  it('deterministic:同じ入力 → 同じ出力', () => {
    const r1 = shiftToContrast([100, 150, 200], [255, 250, 230], 4.5);
    const r2 = shiftToContrast([100, 150, 200], [255, 250, 230], 4.5);
    expect(r1).toEqual(r2);
  });
});

describe('shiftToContrastMemo', () => {
  beforeEach(() => _clearShiftCacheForTests());

  it('memoize:2 回目 call は cache から返す(同 object reference)', () => {
    const r1 = shiftToContrastMemo([100, 150, 200], [255, 250, 230], 4.5);
    const r2 = shiftToContrastMemo([100, 150, 200], [255, 250, 230], 4.5);
    expect(r1).toBe(r2); // reference equality(cache hit)
  });

  it('違う targetRatio で違う cache entry', () => {
    const r1 = shiftToContrastMemo([100, 150, 200], [255, 250, 230], 4.5);
    const r2 = shiftToContrastMemo([100, 150, 200], [255, 250, 230], 7);
    expect(r1).not.toBe(r2);
  });
});

describe('resolveContrastPair', () => {
  it('string 入力 / string 出力', () => {
    const r = resolveContrastPair('#ddd', '#fff', 4.5);
    expect(r).not.toBeNull();
    expect(r!.applied).toBe(true);
    expect(r!.fg).toMatch(/^rgb\(/);
    expect(r!.bg).toMatch(/^rgb\(/);
    expect(r!.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('既に達成済 → applied=false、元の色相当', () => {
    const r = resolveContrastPair('#000', '#fff', 4.5);
    expect(r).not.toBeNull();
    expect(r!.applied).toBe(false);
  });

  it('invalid string → null', () => {
    expect(resolveContrastPair('foo', 'bar', 4.5)).toBeNull();
  });

  it('rgb() input 受理', () => {
    const r = resolveContrastPair('rgb(100, 100, 100)', 'rgb(200, 200, 200)', 4.5);
    expect(r).not.toBeNull();
  });
});

describe('WCAG ガイドライン適合 sanity check', () => {
  it('AA normal text = 4.5:1', () => {
    // 黒 × 灰(#767676)= AA boundary(4.5:1)を例示
    const ratio = getContrastRatio([0, 0, 0], [118, 118, 118]);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('AAA = 7:1 で AA failing pair が AAA 達成可能', () => {
    // 適度な対比の pair が AAA に shift できる
    const r = resolveContrastPair('#333', '#aaa', 7);
    expect(r).not.toBeNull();
    expect(r!.ratio).toBeGreaterThanOrEqual(7);
  });
});
