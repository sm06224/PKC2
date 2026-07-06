/** @vitest-environment happy-dom */
/**
 * 2026-07-04 user 要望「mermaid にも WCAG 改善レンダリング。元の指定
 * 表現色に近い色から、視認性の高い組み合わせに」— mermaid SVG 用の
 * 同系色 shift resolver の contract。
 */
import { describe, it, expect } from 'vitest';
import { applyWcagToMermaidSvg } from '@features/theme/wcag-svg-resolver';
import { parseColor, getContrastRatio, rgbToHsl } from '@features/theme/wcag-contrast';

function svgContainer(inner: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'pkc-mermaid-rendered';
  div.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  document.body.appendChild(div);
  return div;
}

function contrastOf(fgStr: string, bgStr: string): number {
  const fg = parseColor(fgStr)!;
  const bg = parseColor(bgStr)!;
  return getContrastRatio(fg, bg);
}

describe('applyWcagToMermaidSvg — shape+label pair shift', () => {
  it('low-contrast node (dark label on dark fill) is shifted to >= 4.5 while preserving hue', () => {
    // 青系 fill #223 に近い青系文字 #345 — ratio ≈ 1.3 で視認不能。
    const c = svgContainer(
      '<g class="node">'
      + '<rect fill="#222233" width="10" height="10"></rect>'
      + '<foreignObject><div><span class="nodeLabel" style="color:#334455">A</span></div></foreignObject>'
      + '</g>',
    );
    const before = contrastOf('#334455', '#222233');
    expect(before).toBeLessThan(2);

    const res = applyWcagToMermaidSvg(c, { targetRatio: 4.5 });
    expect(res.scanned).toBe(1);
    expect(res.shifted).toBe(1);

    const rect = c.querySelector('rect')!;
    const label = c.querySelector<HTMLElement>('.nodeLabel')!;
    const newBg = (rect as unknown as HTMLElement).style.fill;
    const newFg = label.style.color;
    expect(contrastOf(newFg, newBg)).toBeGreaterThanOrEqual(4.5);

    // 色相保持:shift は HSL の L 軸のみ(#334455 の hue ≈ 210°)。
    const hueBefore = rgbToHsl(parseColor('#334455')!)[0];
    const hueAfter = rgbToHsl(parseColor(newFg)!)[0];
    expect(Math.abs(hueAfter - hueBefore)).toBeLessThanOrEqual(6);
    // marker が付く(観測点)。
    expect(c.querySelector('g[data-pkc-wcag-shifted="true"]')).not.toBeNull();
  });

  it('already-readable pair is left untouched (no-op)', () => {
    const c = svgContainer(
      '<g class="node">'
      + '<rect fill="#ffffff" width="10" height="10"></rect>'
      + '<foreignObject><div><span class="nodeLabel" style="color:#111111">A</span></div></foreignObject>'
      + '</g>',
    );
    const res = applyWcagToMermaidSvg(c, { targetRatio: 4.5 });
    expect(res.scanned).toBe(1);
    expect(res.shifted).toBe(0);
    expect((c.querySelector('rect') as unknown as HTMLElement).style.fill).toBe('');
    // 元の inline 指定がそのまま残る(shift されていない)。
    expect(c.querySelector<HTMLElement>('.nodeLabel')!.getAttribute('style')).toContain('#111111');
  });

  it('SVG <text fill> label inside a shape group is handled too', () => {
    const c = svgContainer(
      '<g class="actor">'
      + '<rect style="fill:#333344" width="10" height="10"></rect>'
      + '<text fill="#444455">Actor</text>'
      + '</g>',
    );
    const res = applyWcagToMermaidSvg(c, { targetRatio: 4.5 });
    expect(res.shifted).toBe(1);
    const text = c.querySelector<SVGTextElement>('text')!;
    const rect = c.querySelector('rect')!;
    const newFg = (text as unknown as HTMLElement).style.fill;
    const newBg = (rect as unknown as HTMLElement).style.fill;
    expect(contrastOf(newFg, newBg)).toBeGreaterThanOrEqual(4.5);
  });

  it('gradient / none fills are skipped (元の見た目を尊重)', () => {
    const c = svgContainer(
      '<g><rect fill="url(#grad)" width="10" height="10"></rect>'
      + '<text fill="#444455">X</text></g>'
      + '<g><rect fill="none" width="10" height="10"></rect>'
      + '<text fill="#444455">Y</text></g>',
    );
    const res = applyWcagToMermaidSvg(c, { targetRatio: 4.5 });
    expect(res.scanned).toBe(0);
    expect(res.shifted).toBe(0);
  });
});

describe('applyWcagToMermaidSvg — bare text vs diagram background', () => {
  it('shape の無い text は containerBg に対して fg のみ shift(目標到達)', () => {
    const c = svgContainer('<text fill="#3a3a3a">edge label</text>');
    const res = applyWcagToMermaidSvg(c, { targetRatio: 4.5, containerBg: '#0d0f0a' });
    expect(res.scanned).toBe(1);
    expect(res.shifted).toBe(1);
    const text = c.querySelector('text')!;
    const newFg = (text as unknown as HTMLElement).style.fill;
    expect(contrastOf(newFg, '#0d0f0a')).toBeGreaterThanOrEqual(4.5);
    expect(text.getAttribute('data-pkc-wcag-shifted')).toBe('true');
  });

  it('containerBg 未指定なら裸 text は判定しない', () => {
    const c = svgContainer('<text fill="#3a3a3a">edge label</text>');
    const res = applyWcagToMermaidSvg(c, { targetRatio: 4.5 });
    expect(res.scanned).toBe(0);
  });
});
