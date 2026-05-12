/**
 * WCAG コントラスト計算 + 同系色 shift resolver(reform-2026-05 Phase 3 PR-2T)
 *
 * user 要望(2026-05-10):「書式指定したとき、フォント色と背景色が著しく可読を
 * 損なう時がある。WCAG を算出して同系色で視認性を探索して欲しい。同じ組合せなら
 * 同じ見た目。Flag で OFF も可能に」
 *
 * 仕様 doc:`docs/development/wcag-contrast-resolver-spec.md`
 *
 * 設計:
 * 1. WCAG 2.1 §1.4.3 の式で relative luminance + contrast ratio 計算
 * 2. 目標 ratio(default 4.5 = AA)未達なら、HSL の L 軸で deterministic shift
 *    - 暗い側を更に暗くする / 明るい側を更に明るくする
 *    - max 20 iteration、達成できなければ「可能な最大コントラスト」で打ち切り
 * 3. 同じ入力 → 同じ出力(pure function、memoization で perf 向上)
 *
 * 入力 color string は CSS 形式(`#fff` / `#ffffff` / `rgb(...)` / `rgba(...)`)
 * 出力は同じ表現形式に正規化(`rgb(r, g, b)` または `rgba(...)`)
 */

export type RGB = [number, number, number];

/** WCAG relative luminance(sRGB → linear → weighted)。 */
export function relativeLuminance([r, g, b]: RGB): number {
  const toLinear = (c: number): number => {
    const sc = c / 255;
    return sc <= 0.03928 ? sc / 12.92 : Math.pow((sc + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** 2 色間のコントラスト比(WCAG 2.1 §1.4.3 式、1〜21 の範囲)。 */
export function getContrastRatio(fg: RGB, bg: RGB): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** CSS color string を RGB tuple に変換。`#fff` / `#ffffff` / `rgb(r,g,b)` / `rgba(...)` 対応。 */
export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase();
  // #rgb
  const hexShort = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (hexShort) {
    return [
      parseInt(hexShort[1]! + hexShort[1]!, 16),
      parseInt(hexShort[2]! + hexShort[2]!, 16),
      parseInt(hexShort[3]! + hexShort[3]!, 16),
    ];
  }
  // #rrggbb
  const hex = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
  if (hex) {
    return [parseInt(hex[1]!, 16), parseInt(hex[2]!, 16), parseInt(hex[3]!, 16)];
  }
  // rgb(r, g, b) / rgba(r, g, b, a)
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  // named color の対応はしない(代表的なものは hex で書かれる前提)
  return null;
}

/** RGB を `rgb(r, g, b)` 形式 string に。 */
export function rgbToString([r, g, b]: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** RGB → HSL [h(0-360), s(0-1), l(0-1)]. */
export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const nr = r / 255, ng = g / 255, nb = b / 255;
  const max = Math.max(nr, ng, nb), min = Math.min(nr, ng, nb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === nr) h = ((ng - nb) / d) + (ng < nb ? 6 : 0);
  else if (max === ng) h = (nb - nr) / d + 2;
  else h = (nr - ng) / d + 4;
  return [h * 60, s, l];
}

/** HSL → RGB. */
export function hslToRgb([h, s, l]: [number, number, number]): RGB {
  const hn = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(hue2rgb(hn + 1 / 3) * 255),
    Math.round(hue2rgb(hn) * 255),
    Math.round(hue2rgb(hn - 1 / 3) * 255),
  ];
}

/** HSL の L 軸でクランプ。 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface ShiftResult {
  fg: RGB;
  bg: RGB;
  ratio: number;
  applied: boolean;       // shift が実施されたか
  iterations: number;     // max 20
}

/**
 * fg / bg の組から WCAG 目標 ratio(default 4.5 = AA)達成までの shift を計算。
 *
 * algorithm:
 * 1. 現 ratio が目標以上なら no-op
 * 2. luminance が低い方(暗い側)を更に暗く、高い方(明るい側)を更に明るく
 * 3. 0.025 step で HSL L 軸を shift、max 20 step まで
 * 4. 目標達成 or max iter で打ち切り
 *
 * deterministic — 同じ入力 → 同じ出力。
 */
export function shiftToContrast(
  fg: RGB,
  bg: RGB,
  targetRatio: number = 4.5,
): ShiftResult {
  const initialRatio = getContrastRatio(fg, bg);
  if (initialRatio >= targetRatio) {
    return { fg, bg, ratio: initialRatio, applied: false, iterations: 0 };
  }
  // luminance を比較、暗い側を darken、明るい側を lighten
  const fgL = relativeLuminance(fg);
  const bgL = relativeLuminance(bg);
  const fgHsl = rgbToHsl(fg);
  const bgHsl = rgbToHsl(bg);
  let fgL_ = fgHsl[2];
  let bgL_ = bgHsl[2];
  const STEP = 0.025;
  const MAX_ITER = 20;
  let iterations = 0;
  let currentFg: RGB = fg;
  let currentBg: RGB = bg;
  let currentRatio = initialRatio;
  for (let i = 0; i < MAX_ITER; i++) {
    iterations = i + 1;
    if (fgL < bgL) {
      // fg が暗い側、更に暗く / bg は明るい側、更に明るく
      fgL_ = clamp01(fgL_ - STEP);
      bgL_ = clamp01(bgL_ + STEP);
    } else {
      // fg が明るい側、更に明るく / bg は暗い側、更に暗く
      fgL_ = clamp01(fgL_ + STEP);
      bgL_ = clamp01(bgL_ - STEP);
    }
    currentFg = hslToRgb([fgHsl[0], fgHsl[1], fgL_]);
    currentBg = hslToRgb([bgHsl[0], bgHsl[1], bgL_]);
    currentRatio = getContrastRatio(currentFg, currentBg);
    if (currentRatio >= targetRatio) break;
    // limit reached(両側 0 or 1)で打ち切り
    if ((fgL_ === 0 || fgL_ === 1) && (bgL_ === 0 || bgL_ === 1)) break;
  }
  return {
    fg: currentFg,
    bg: currentBg,
    ratio: currentRatio,
    applied: true,
    iterations,
  };
}

/** memoize:同じ組合せ → 同じ shift(deterministic 保証 + perf)。 */
const SHIFT_CACHE = new Map<string, ShiftResult>();

/** memoized version of shiftToContrast。 */
export function shiftToContrastMemo(
  fg: RGB,
  bg: RGB,
  targetRatio: number = 4.5,
): ShiftResult {
  const key = `${fg.join(',')}|${bg.join(',')}|${targetRatio}`;
  const cached = SHIFT_CACHE.get(key);
  if (cached) return cached;
  const result = shiftToContrast(fg, bg, targetRatio);
  SHIFT_CACHE.set(key, result);
  return result;
}

/** cache clear(test 用)。 */
export function _clearShiftCacheForTests(): void {
  SHIFT_CACHE.clear();
}

/**
 * CSS color string ペアを受け取り、目標 ratio 未達なら同系色 shift で達成、
 * 達成済なら no-op。pure function、deterministic。
 *
 * 失敗時(parseColor 不能等)は null を返し、caller は元の色を保つ前提。
 */
export function resolveContrastPair(
  fgStr: string,
  bgStr: string,
  targetRatio: number = 4.5,
): { fg: string; bg: string; ratio: number; applied: boolean } | null {
  const fg = parseColor(fgStr);
  const bg = parseColor(bgStr);
  if (!fg || !bg) return null;
  const result = shiftToContrastMemo(fg, bg, targetRatio);
  return {
    fg: rgbToString(result.fg),
    bg: rgbToString(result.bg),
    ratio: result.ratio,
    applied: result.applied,
  };
}
