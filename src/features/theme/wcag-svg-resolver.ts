/**
 * Mermaid SVG への WCAG 同系色 shift(2026-07-04 user 要望)。
 *
 * 「mermaid レンダリングにも WCAG 改善レンダリングを導入できますか？
 *   元の指定表現色に近い色から、視認性の高い組み合わせにしたい」
 *
 * mermaid は色を SVG に焼き込む(shape の fill 属性 / inline style と、
 * label の color)。inline-style walk 前提の wcag-dom-resolver は届かない
 * ため、mermaid の構造(shape + label を含む <g>)に合わせた専用 resolver
 * を用意する。色の探索は既存の `shiftToContrast`(HSL の L 軸のみを
 * 最小 step で動かす = **色相・彩度を保ったまま** fg/bg ペアを目標
 * コントラストへ寄せる、決定的 + memoized)をそのまま使う — user の
 * 「元の指定色に近い色から」の要件そのもの。
 *
 * 対象:
 *   1. shape(rect / circle / ellipse / polygon / path、fill が単色)を
 *      直下に持つ <g> と、その g に属する label(foreignObject 内の
 *      HTML label / SVG <text>)のペア → fg/bg 同時 shift
 *   2. shape を持たない裸の <text>(sequence 図の actor 線ラベル等)
 *      → ダイアグラム背景(containerBg)に対して fg のみ shift
 *
 * gradient(url(...))・'none'・parse 不能色は skip(元の見た目を尊重)。
 * shift 適用した g / text には `data-pkc-wcag-shifted="true"` を付ける
 * (debug / test の観測点)。revert 経路は持たない — mermaid は theme
 * 切替等で placeholder から**丸ごと再 render**されるため、flag OFF は
 * 次回 hydrate から効く。
 */

import {
  parseColor,
  resolveContrastPair,
  rgbToHsl,
  hslToRgb,
  getContrastRatio,
  rgbToString,
  type RGB,
} from './wcag-contrast';

/**
 * bg を固定したまま fg の L 軸のみを動かして目標 ratio を目指す
 * (裸 text 用 — ダイアグラム背景は app のものなので動かせない)。
 * 色相・彩度は保持。決定的。
 */
function shiftFgOnly(fg: RGB, bg: RGB, targetRatio: number): { fg: RGB; applied: boolean } {
  if (getContrastRatio(fg, bg) >= targetRatio) return { fg, applied: false };
  const bgLum = relativeLum(bg);
  const [h, s, l0] = rgbToHsl(fg);
  const STEP = 0.025;
  // 背景より明るくするか暗くするか:遠ざかれる余地の大きい方向へ。
  const dir = bgLum > 0.5 ? -1 : 1;
  let l = l0;
  let cur = fg;
  for (let i = 0; i < 40; i++) {
    l = Math.max(0, Math.min(1, l + dir * STEP));
    cur = hslToRgb([h, s, l]);
    if (getContrastRatio(cur, bg) >= targetRatio) return { fg: cur, applied: true };
    if (l === 0 || l === 1) break;
  }
  return { fg: cur, applied: true }; // 到達不能でも「可能な最大」で返す
}

function relativeLum([r, g, b]: RGB): number {
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const SHIFTED_MARKER = 'data-pkc-wcag-shifted';
const SHAPE_SELECTOR = ':scope > rect, :scope > circle, :scope > ellipse, :scope > polygon, :scope > path';

export interface SvgWcagOptions {
  targetRatio?: number;
  /** ダイアグラム背景(shape を持たない裸 text の対向色)。CSS color 文字列。 */
  containerBg?: string;
}

/** inline style 文字列から property 値を取り出す(fill / color 等)。
 *  mermaid は user 指定 style を `!important` 付きで焼き込むため strip。 */
function styleProp(el: Element, prop: string): string | null {
  const style = el.getAttribute('style');
  if (!style) return null;
  const m = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
  if (!m) return null;
  return m[1]!.replace(/!important\s*$/i, '').trim();
}

/** shape の塗り色(inline style fill → fill 属性)。単色でなければ null。 */
function readShapeFill(shape: Element): string | null {
  const v = styleProp(shape, 'fill') ?? shape.getAttribute('fill');
  if (!v) return null;
  const t = v.trim();
  if (t === 'none' || t.startsWith('url(')) return null;
  return t;
}

/** label の文字色。inline → computed の順(computed は browser 環境のみ)。 */
function readLabelColor(el: Element, svgText: boolean): string | null {
  if (svgText) {
    const v = styleProp(el, 'fill') ?? el.getAttribute('fill');
    if (v && v !== 'none') return v;
  } else {
    const v = styleProp(el, 'color');
    if (v) return v;
  }
  const win = el.ownerDocument?.defaultView;
  if (win) {
    try {
      const cs = win.getComputedStyle(el as HTMLElement);
      const v = svgText ? cs.fill : cs.color;
      if (v && v !== 'none') return v;
    } catch {
      /* happy-dom 等で computed が取れない場合は skip */
    }
  }
  return null;
}

/** g の直下から「使える fill を持つ shape」を探す。mermaid の label 用
 *  内側 <g> は fill 無しの裸 <rect> を持つため、fill の解析可否で判定。 */
function usableShapeOf(g: Element): Element | null {
  for (const s of Array.from(g.querySelectorAll(SHAPE_SELECTOR))) {
    const fill = readShapeFill(s);
    if (fill && parseColor(fill)) return s;
  }
  return null;
}

/** el の最寄り「使える shape を直下に持つ g」を返す(ペアの所有者判定)。 */
function owningShapeGroup(el: Element, svg: Element): Element | null {
  let cur: Element | null = el.parentElement;
  while (cur && cur !== svg) {
    if (cur.tagName.toLowerCase() === 'g' && usableShapeOf(cur)) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

/** mermaid の焼き込みは `!important` 付き — 上書きも important で。 */
function setLabelColor(el: Element, color: string, svgText: boolean): void {
  const asHtml = el as HTMLElement;
  asHtml.style.setProperty(svgText ? 'fill' : 'color', color, 'important');
}

function setShapeFill(shape: Element, color: string): void {
  (shape as unknown as HTMLElement).style.setProperty('fill', color, 'important');
}

/**
 * container(`.pkc-mermaid-rendered` 等)内の mermaid SVG に WCAG 同系色
 * shift を適用する。冪等(再適用しても marker 済みペアは現状の色から
 * 再判定され、目標達成済みなら no-op)。
 *
 * @returns scanned = 判定したペア数, shifted = 実際に色を動かしたペア数
 */
export function applyWcagToMermaidSvg(
  container: HTMLElement,
  options: SvgWcagOptions = {},
): { scanned: number; shifted: number } {
  const targetRatio = options.targetRatio ?? 4.5;
  const svg = container.querySelector('svg');
  if (!svg) return { scanned: 0, shifted: 0 };
  let scanned = 0;
  let shifted = 0;

  // ── 1. shape + label ペア(node / actor / edgeLabel 背景 rect 等)──
  for (const g of Array.from(svg.querySelectorAll('g'))) {
    const shape = usableShapeOf(g);
    if (!shape) continue;
    const bgStr = readShapeFill(shape)!;

    // この g を所有者とする label を集める(入れ子の shape-g に属する
    // label は、その内側の g が自分の pass で処理する)。
    const labels: { el: Element; svgText: boolean }[] = [];
    for (const t of Array.from(g.querySelectorAll('text'))) {
      if (owningShapeGroup(t, svg) === g) labels.push({ el: t, svgText: true });
    }
    for (const s of Array.from(g.querySelectorAll('foreignObject span, foreignObject p'))) {
      if (s.querySelector('span, p')) continue; // 最内の text 担体のみ
      if (owningShapeGroup(s, svg) === g) labels.push({ el: s, svgText: false });
    }
    if (labels.length === 0) continue;

    let groupShifted = false;
    let currentBg = bgStr;
    for (const { el, svgText } of labels) {
      const fgStr = readLabelColor(el, svgText);
      if (!fgStr || !parseColor(fgStr)) continue;
      scanned++;
      const res = resolveContrastPair(fgStr, currentBg, targetRatio);
      if (!res || !res.applied) continue;
      setLabelColor(el, res.fg, svgText);
      // shape 側は最初の shift 結果を採用(以降の label は shift 済み bg
      // に対して fg を寄せる)。
      if (!groupShifted) {
        setShapeFill(shape, res.bg);
        currentBg = res.bg;
        groupShifted = true;
      }
      shifted++;
    }
    if (groupShifted) g.setAttribute(SHIFTED_MARKER, 'true');
  }

  // ── 2. 裸の <text>(shape を持たない)vs ダイアグラム背景 ──
  const containerBg = options.containerBg;
  if (containerBg && parseColor(containerBg)) {
    for (const t of Array.from(svg.querySelectorAll('text'))) {
      if (owningShapeGroup(t, svg) !== null) continue; // ペア側で処理済み
      const fgStr = readLabelColor(t, true);
      const fgRgb = fgStr ? parseColor(fgStr) : null;
      const bgRgb = parseColor(containerBg);
      if (!fgRgb || !bgRgb) continue;
      scanned++;
      // 背景は app のものなので動かせない — fg のみを目標到達まで寄せる。
      const res = shiftFgOnly(fgRgb, bgRgb, targetRatio);
      if (!res.applied) continue;
      setLabelColor(t, rgbToString(res.fg), true);
      t.setAttribute(SHIFTED_MARKER, 'true');
      shifted++;
    }
  }

  return { scanned, shifted };
}
