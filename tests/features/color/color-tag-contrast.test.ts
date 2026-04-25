/**
 * Color tag contrast guard — Slice 5.0 (2026-04-25).
 *
 * Spec: docs/development/color-theme-cvd-slice5-audit.md
 *       docs/spec/color-palette-v1.md §5
 *
 * Pins the WCAG 1.4.11 **non-text contrast 3:1 floor** for every
 * v1 palette hue against the canonical theme backgrounds. The
 * sidebar `.pkc-entry-color-bar` (3px border-left, base.css:968)
 * is the visible surface; treating it as a non-text UI component
 * means each hue must reach 3:1 against the active background.
 *
 * Slice 5.0 implementation note: the dark-theme `:root` defaults
 * already pass on `#0d0f0a`, but on the light parchment bg
 * `#f0ebe0` orange / yellow / green / pink fall below 3:1 with
 * those defaults. The light-theme override block in `base.css`
 * darkens those four hues to clear the floor. This file pins
 * both the dark and light values so a careless edit to either
 * regresses immediately.
 *
 * Out of scope:
 *   - WCAG text-AA (4.5:1) — palette is intentionally a
 *     non-text decorative surface; carrying meaning by color
 *     alone is forbidden by `color-palette-v1.md` §5.
 *   - Pairwise hue distinguishability for CVD — not a runtime
 *     contract; deferred to Slice 5.1+.
 *   - High-contrast / forced-colors media queries — Slice 5.1.
 */
import { describe, it, expect } from 'vitest';
import { contrastRatio } from '@features/color/wcag-contrast';
import { COLOR_TAG_IDS, type ColorTagId } from '@features/color/color-palette';

const BG_DARK = '#0d0f0a';
const BG_LIGHT = '#f0ebe0';
const FLOOR = 3.0;

const DARK_HEX: Record<ColorTagId, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  gray: '#6b7280',
};

const LIGHT_HEX: Record<ColorTagId, string> = {
  // Untouched hues already clear 3:1 against #f0ebe0 with the
  // dark-theme HEX (red 3.17:1, blue 3.09:1, purple 3.30:1,
  // gray 4.10:1) and read like the same color across themes.
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#a855f7',
  gray: '#6b7280',
  // Slice 5.0 darkens these four to clear the non-text 3:1 floor:
  // orange 2.39 → 4.41, yellow 1.60 → 4.13, green 1.91 → 4.16,
  // pink 2.97 → 3.92. Tailwind {orange,yellow,green}-700 +
  // pink-600 keep the named hue identifiable.
  orange: '#c2410c',
  yellow: '#a16207',
  green: '#15803d',
  pink: '#db2777',
};

describe('Color tag contrast guard — Slice 5.0', () => {
  describe(`dark theme (#${BG_DARK.slice(1)} bg)`, () => {
    for (const id of COLOR_TAG_IDS) {
      it(`${id} clears the 3:1 non-text contrast floor`, () => {
        const ratio = contrastRatio(DARK_HEX[id], BG_DARK);
        expect(ratio).toBeGreaterThanOrEqual(FLOOR);
      });
    }
  });

  describe(`light theme (#${BG_LIGHT.slice(1)} bg)`, () => {
    for (const id of COLOR_TAG_IDS) {
      it(`${id} clears the 3:1 non-text contrast floor`, () => {
        const ratio = contrastRatio(LIGHT_HEX[id], BG_LIGHT);
        expect(ratio).toBeGreaterThanOrEqual(FLOOR);
      });
    }
  });

  it('palette covers exactly 8 IDs', () => {
    // Sanity check: if a future palette extension adds a 9th ID,
    // this matrix must be extended too. The closed list in
    // `color-palette.ts` is the source of truth.
    expect(COLOR_TAG_IDS).toHaveLength(8);
    expect(Object.keys(DARK_HEX)).toHaveLength(8);
    expect(Object.keys(LIGHT_HEX)).toHaveLength(8);
  });
});
