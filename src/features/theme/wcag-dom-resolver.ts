/**
 * WCAG contrast DOM resolver(reform-2026-05 Phase 3 PR-2T)
 *
 * 純粋 algorithm は `wcag-contrast.ts`。本 module は DOM walking で
 * 該当要素を検出 + 同系色 shift を inline style override で適用する layer。
 *
 * 対象要素:`style` attribute に `background-color` または `color` を含む
 *          element(`<mark style="...">` / `<span style="...">` 等)。
 *
 * 計算 bg:該当要素の effective background color(`getComputedStyle().backgroundColor`
 *          を element / 祖先 chain で辿り、initial / transparent でない最初の値)。
 *
 * 適用方法:inline `style` attribute に shift 済 color を override(`!important`
 *          ではなく specificity で勝つ、`data-pkc-wcag-shifted` attribute も
 *          attach して debug 可能)。
 *
 * deterministic:同じ DOM 構造 → 同じ shift result(memoization 込み)。
 */

import { parseColor, rgbToString, getContrastRatio, shiftToContrastMemo } from './wcag-contrast';

const DEFAULT_TARGET = 4.5;
const SHIFTED_MARKER = 'data-pkc-wcag-shifted';

interface ResolveOptions {
  targetRatio?: number;
  rootSelector?: string;
}

/** 要素の effective background を上位 chain で探索。 */
function effectiveBackground(el: Element): string | null {
  let cur: Element | null = el;
  const win = el.ownerDocument?.defaultView;
  if (!win) return null;
  while (cur && cur.nodeType === Node.ELEMENT_NODE) {
    const cs = win.getComputedStyle(cur as HTMLElement);
    const bg = cs.backgroundColor;
    // transparent / rgba(0,0,0,0) は skip
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      return bg;
    }
    cur = cur.parentElement;
  }
  // fall back to body / html
  const body = el.ownerDocument!.body;
  if (body) {
    const bg = win.getComputedStyle(body).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
  }
  return null;
}

/**
 * 要素 1 件に対し WCAG resolver を適用。
 * - 自身の inline style に background-color or color が指定されている場合のみ対象
 * - effective bg(or parent bg)と組合せて contrast 計算
 * - target 未達なら同系色 shift で update + data-pkc-wcag-shifted="true" attr
 *
 * @returns applied:shift が実際に適用されたか
 */
export function resolveWcagOnElement(
  el: HTMLElement,
  targetRatio: number = DEFAULT_TARGET,
): boolean {
  const inlineStyle = el.getAttribute('style');
  if (!inlineStyle) return false;
  // inline `color:` or `background-color:` を含むか
  const hasColor = /(^|;)\s*color\s*:/i.test(inlineStyle);
  const hasBg = /(^|;)\s*background-color\s*:/i.test(inlineStyle);
  if (!hasColor && !hasBg) return false;

  const win = el.ownerDocument?.defaultView;
  if (!win) return false;
  const cs = win.getComputedStyle(el);
  const fgStr = cs.color;
  // 該当 element に bg があるなら自分の computed bg、無いなら effective(parent chain)
  const bgStr = hasBg ? cs.backgroundColor : (effectiveBackground(el) ?? cs.backgroundColor);

  const fg = parseColor(fgStr);
  const bg = parseColor(bgStr);
  if (!fg || !bg) return false;

  const currentRatio = getContrastRatio(fg, bg);
  if (currentRatio >= targetRatio) return false;

  const result = shiftToContrastMemo(fg, bg, targetRatio);
  if (!result.applied) return false;

  // shift 済の color を inline style に上書き(specificity で勝つ)
  // 元の style を保持しつつ color / background-color を update
  const newFg = rgbToString(result.fg);
  const newBg = rgbToString(result.bg);
  let newStyle = inlineStyle;
  if (hasColor) {
    newStyle = newStyle.replace(/(^|;)\s*color\s*:[^;]*/i, `$1color: ${newFg}`);
  } else {
    newStyle = newStyle + `; color: ${newFg}`;
  }
  if (hasBg) {
    newStyle = newStyle.replace(/(^|;)\s*background-color\s*:[^;]*/i, `$1background-color: ${newBg}`);
  } else {
    // bg が inline で指定されていない場合は触らない(parent chain の bg を変えるのは scope 外)
  }
  el.setAttribute('style', newStyle);
  el.setAttribute(SHIFTED_MARKER, 'true');
  el.setAttribute('data-pkc-wcag-ratio', String(Math.round(result.ratio * 100) / 100));
  return true;
}

/**
 * root element 配下のすべての該当要素に WCAG resolver を適用。
 *
 * `style` attribute を持つ element を querySelectorAll で列挙、各 element に対し
 * resolveWcagOnElement を call。
 */
export function applyWcagResolverToDom(
  root: HTMLElement | Document,
  opts: ResolveOptions = {},
): { scanned: number; shifted: number } {
  const targetRatio = opts.targetRatio ?? DEFAULT_TARGET;
  const selector = opts.rootSelector ?? '[style]';
  const elements = root.querySelectorAll<HTMLElement>(selector);
  let scanned = 0;
  let shifted = 0;
  for (const el of Array.from(elements)) {
    scanned++;
    if (resolveWcagOnElement(el, targetRatio)) shifted++;
  }
  return { scanned, shifted };
}

/** すでに shift 済の inline style を元に戻す(test reset 用、debug 用)。 */
export function revertWcagShiftsInDom(root: HTMLElement | Document): number {
  const elements = root.querySelectorAll<HTMLElement>(`[${SHIFTED_MARKER}]`);
  let reverted = 0;
  for (const el of Array.from(elements)) {
    el.removeAttribute(SHIFTED_MARKER);
    el.removeAttribute('data-pkc-wcag-ratio');
    reverted++;
  }
  return reverted;
}
