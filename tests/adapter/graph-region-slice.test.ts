/**
 * Graph region-slice gesture tests (G8 後半 / PR-E parity).
 *
 * 領域 10-6 ζ'' PR-E (2026-05-06):任意接近性 / region slice。
 * region-select mode 中は背景 drag が rect を引き、解放時に内部の
 * node の lid を `pkc-graph-region-selected` CustomEvent で emit する。
 *
 * reform-2026-05 §6 visual-state-parity:gesture を発火しただけで
 * 終わらず、emit された event detail が rect 内の node lid を持つこと、
 * 解放時に DOM の rect が消えること、を assert する。
 */

/** @vitest-environment happy-dom */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installGraphZoomGestures } from '@adapter/ui/graph-zoom';

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeSvgWithNodes(width: number, height: number, nodes: { lid: string; x: number; y: number }[]): { svg: SVGSVGElement; layer: SVGGElement } {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  // Stub SVG geometry helpers happy-dom doesn't provide.
  (svg as unknown as { getScreenCTM: () => DOMMatrix }).getScreenCTM = () => new DOMMatrix();
  (svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
    const p = new DOMPoint(0, 0);
    if (typeof (p as unknown as { matrixTransform?: unknown }).matrixTransform !== 'function') {
      (p as unknown as { matrixTransform: (m: DOMMatrix) => DOMPoint }).matrixTransform = (m: DOMMatrix) =>
        new DOMPoint(p.x * m.a + p.y * m.c + m.e, p.x * m.b + p.y * m.d + m.f);
    }
    return p;
  };
  (svg as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  } as DOMRect);

  const layer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  layer.setAttribute('class', 'pkc-graph-zoom-layer');
  svg.appendChild(layer);

  for (const n of nodes) {
    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g.setAttribute('class', 'pkc-filer-graph-node');
    g.setAttribute('data-pkc-lid', n.lid);
    g.setAttribute('transform', `translate(${n.x}, ${n.y})`);
    layer.appendChild(g);
  }

  document.body.appendChild(svg);
  return { svg, layer };
}

describe('graph region-slice gestures (PR-E parity)', () => {
  let svg: SVGSVGElement;
  let layer: SVGGElement;
  let emittedEvents: Array<{ lids: string[] }>;

  beforeEach(() => {
    document.body.innerHTML = '';
    emittedEvents = [];
    const made = makeSvgWithNodes(800, 600, [
      { lid: 'a', x: 100, y: 100 },
      { lid: 'b', x: 200, y: 150 },
      { lid: 'c', x: 500, y: 400 },
      { lid: 'd', x: 700, y: 500 },
    ]);
    svg = made.svg;
    layer = made.layer;
    svg.addEventListener('pkc-graph-region-selected', (ev) => {
      const detail = (ev as CustomEvent).detail as { lids: string[] };
      emittedEvents.push({ lids: detail.lids });
    });
    installGraphZoomGestures(svg);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('region-mode OFF: background drag does NOT emit selection event', () => {
    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 50 });
    Object.defineProperty(md, 'clientY', { value: 50 });
    Object.defineProperty(md, 'target', { value: svg });
    svg.dispatchEvent(md);

    const mu = new Event('mouseup', { bubbles: true });
    window.dispatchEvent(mu);

    expect(emittedEvents).toHaveLength(0);
  });

  it('region-mode ON: drag-rect over nodes a+b emits their lids', () => {
    svg.setAttribute('data-pkc-graph-region-select-mode', 'true');

    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 50 });
    Object.defineProperty(md, 'clientY', { value: 50 });
    Object.defineProperty(md, 'target', { value: svg });
    svg.dispatchEvent(md);

    // Drag to (300, 200) — covers a (100,100) and b (200,150) but not c/d.
    const mm = new Event('mousemove', { bubbles: true });
    Object.defineProperty(mm, 'clientX', { value: 300 });
    Object.defineProperty(mm, 'clientY', { value: 200 });
    window.dispatchEvent(mm);

    // Rect should now exist in the layer.
    expect(layer.querySelector('.pkc-graph-region-rect')).not.toBeNull();

    const mu = new Event('mouseup', { bubbles: true });
    window.dispatchEvent(mu);

    // Rect removed.
    expect(layer.querySelector('.pkc-graph-region-rect')).toBeNull();
    // Event emitted with a + b only.
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]!.lids.sort()).toEqual(['a', 'b']);
  });

  it('region-mode ON: tiny accidental click (<4×4) does NOT emit', () => {
    svg.setAttribute('data-pkc-graph-region-select-mode', 'true');

    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 50 });
    Object.defineProperty(md, 'clientY', { value: 50 });
    Object.defineProperty(md, 'target', { value: svg });
    svg.dispatchEvent(md);

    // 1×1 pixel drag — accidental click.
    const mm = new Event('mousemove', { bubbles: true });
    Object.defineProperty(mm, 'clientX', { value: 51 });
    Object.defineProperty(mm, 'clientY', { value: 51 });
    window.dispatchEvent(mm);

    const mu = new Event('mouseup', { bubbles: true });
    window.dispatchEvent(mu);

    expect(emittedEvents).toHaveLength(0);
  });

  it('region-mode ON: large rect covering all 4 nodes emits all 4 lids', () => {
    svg.setAttribute('data-pkc-graph-region-select-mode', 'true');

    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 0 });
    Object.defineProperty(md, 'clientY', { value: 0 });
    Object.defineProperty(md, 'target', { value: svg });
    svg.dispatchEvent(md);

    const mm = new Event('mousemove', { bubbles: true });
    Object.defineProperty(mm, 'clientX', { value: 800 });
    Object.defineProperty(mm, 'clientY', { value: 600 });
    window.dispatchEvent(mm);

    const mu = new Event('mouseup', { bubbles: true });
    window.dispatchEvent(mu);

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]!.lids.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('region-mode ON: drag missing all nodes emits empty list', () => {
    svg.setAttribute('data-pkc-graph-region-select-mode', 'true');

    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 300 });
    Object.defineProperty(md, 'clientY', { value: 250 });
    Object.defineProperty(md, 'target', { value: svg });
    svg.dispatchEvent(md);

    const mm = new Event('mousemove', { bubbles: true });
    Object.defineProperty(mm, 'clientX', { value: 400 });
    Object.defineProperty(mm, 'clientY', { value: 350 });
    window.dispatchEvent(mm);

    const mu = new Event('mouseup', { bubbles: true });
    window.dispatchEvent(mu);

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]!.lids).toEqual([]);
  });
});
