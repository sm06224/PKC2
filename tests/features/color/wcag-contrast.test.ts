import { describe, it, expect } from 'vitest';
import { contrastRatio, wcagGrade, formatContrastRatio } from '@features/color/wcag-contrast';

describe('WCAG contrast ratio', () => {
  it('black on white = 21:1', () => {
    const ratio = contrastRatio('#000000', '#ffffff');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('white on white = 1:1', () => {
    const ratio = contrastRatio('#ffffff', '#ffffff');
    expect(ratio).toBeCloseTo(1, 0);
  });

  it('is symmetric', () => {
    const a = contrastRatio('#ff0000', '#0000ff');
    const b = contrastRatio('#0000ff', '#ff0000');
    expect(a).toBeCloseTo(b, 5);
  });

  it('dark green on dark bg has reasonable ratio', () => {
    const ratio = contrastRatio('#0d0f0a', '#c8d8b0');
    expect(ratio).toBeGreaterThan(4.5);
  });
});

describe('wcagGrade', () => {
  it('21:1 → AAA', () => expect(wcagGrade(21)).toBe('AAA'));
  it('7.0 → AAA', () => expect(wcagGrade(7.0)).toBe('AAA'));
  it('6.9 → AA', () => expect(wcagGrade(6.9)).toBe('AA'));
  it('4.5 → AA', () => expect(wcagGrade(4.5)).toBe('AA'));
  it('4.4 → Fail', () => expect(wcagGrade(4.4)).toBe('Fail'));
  it('1 → Fail', () => expect(wcagGrade(1)).toBe('Fail'));
});

describe('formatContrastRatio', () => {
  it('formats to one decimal place', () => {
    expect(formatContrastRatio(4.56789)).toBe('4.6:1');
    expect(formatContrastRatio(21)).toBe('21.0:1');
  });
});
