import { describe, it, expect } from 'vitest';
import {
  COLOR_TAG_IDS,
  isColorTagId,
  colorTagPaletteOrder,
  type ColorTagId,
} from '@features/color/color-palette';

/**
 * Color tag palette v1 fixed list (Slice 1, accepted spec
 * `docs/spec/color-palette-v1.md`). Slice 2 introduces the runtime
 * helpers; tests pin the closed set, the type guard, and the
 * palette-order semantics so that downstream slices (SavedSearch
 * `color_filter`, `color:<id>` parser, picker UI) can rely on them.
 */

describe('COLOR_TAG_IDS', () => {
  it('contains exactly the eight v1 palette IDs in canonical order', () => {
    expect(Array.from(COLOR_TAG_IDS)).toEqual([
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'pink',
      'gray',
    ]);
  });

  it('has no duplicates', () => {
    expect(new Set(COLOR_TAG_IDS).size).toBe(COLOR_TAG_IDS.length);
  });

  it('exposes a usable readonly tuple type', () => {
    // Compile-time pin: each member of the array is assignable to
    // `ColorTagId`. Using an explicit cast would mask a regression;
    // the bare assignment must type-check.
    const all: ColorTagId[] = [...COLOR_TAG_IDS];
    expect(all).toHaveLength(8);
  });
});

describe('isColorTagId', () => {
  it('accepts every canonical v1 palette ID', () => {
    for (const id of COLOR_TAG_IDS) {
      expect(isColorTagId(id)).toBe(true);
    }
  });

  it('rejects unknown palette IDs', () => {
    expect(isColorTagId('teal')).toBe(false);
    expect(isColorTagId('cyan')).toBe(false);
    expect(isColorTagId('magenta')).toBe(false);
    expect(isColorTagId('brown')).toBe(false);
  });

  it('rejects case-mismatched IDs', () => {
    expect(isColorTagId('Red')).toBe(false);
    expect(isColorTagId('RED')).toBe(false);
    expect(isColorTagId('Gray')).toBe(false);
  });

  it('rejects empty / whitespace strings', () => {
    expect(isColorTagId('')).toBe(false);
    expect(isColorTagId(' ')).toBe(false);
    expect(isColorTagId(' red ')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isColorTagId(undefined)).toBe(false);
    expect(isColorTagId(null)).toBe(false);
    expect(isColorTagId(0)).toBe(false);
    expect(isColorTagId(1)).toBe(false);
    expect(isColorTagId([])).toBe(false);
    expect(isColorTagId({})).toBe(false);
    expect(isColorTagId({ id: 'red' })).toBe(false);
  });

  it('narrows the type when used as a guard', () => {
    const value: unknown = 'red';
    if (isColorTagId(value)) {
      // Compile-time pin: inside this branch `value` is `ColorTagId`.
      const id: ColorTagId = value;
      expect(id).toBe('red');
    } else {
      expect.fail('expected the guard to accept "red"');
    }
  });
});

describe('colorTagPaletteOrder', () => {
  it('returns the palette index for known IDs', () => {
    expect(colorTagPaletteOrder('red')).toBe(0);
    expect(colorTagPaletteOrder('orange')).toBe(1);
    expect(colorTagPaletteOrder('yellow')).toBe(2);
    expect(colorTagPaletteOrder('green')).toBe(3);
    expect(colorTagPaletteOrder('blue')).toBe(4);
    expect(colorTagPaletteOrder('purple')).toBe(5);
    expect(colorTagPaletteOrder('pink')).toBe(6);
    expect(colorTagPaletteOrder('gray')).toBe(7);
  });

  it('returns -1 for unknown IDs', () => {
    expect(colorTagPaletteOrder('teal')).toBe(-1);
    expect(colorTagPaletteOrder('Red')).toBe(-1);
    expect(colorTagPaletteOrder('')).toBe(-1);
  });

  it('returns -1 for non-string input', () => {
    expect(colorTagPaletteOrder(undefined)).toBe(-1);
    expect(colorTagPaletteOrder(null)).toBe(-1);
    expect(colorTagPaletteOrder(0)).toBe(-1);
    expect(colorTagPaletteOrder({})).toBe(-1);
  });

  it('orders an array by palette position when used as a sort key', () => {
    const input = ['gray', 'pink', 'red', 'green', 'blue'];
    const sorted = [...input].sort(
      (a, b) => colorTagPaletteOrder(a) - colorTagPaletteOrder(b),
    );
    expect(sorted).toEqual(['red', 'green', 'blue', 'pink', 'gray']);
  });
});
