/**
 * Graph zoom + pan gesture tests (G1 parity).
 *
 * 領域 10-6 ζ'' PR-C (2026-05-06):galaxy 風の wheel / drag / pinch
 * zoom + pan を独自 gesture handler で実装した。
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠:
 * gesture を発火しただけで終わらず、zoom-layer の transform attribute
 * (= 描画 consumer) が translate/scale を含むこと、reset で identity
 * に戻ること、を assert する。
 */

/** @vitest-environment happy-dom */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  installGraphZoomGestures,
  resetGraphZoom,
  __getGraphZoomStateForTest,
} from '@adapter/ui/graph-zoom';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface SyntheticTouch {
  identifier: number;
  clientX: number;
  clientY: number;
  target: EventTarget;
}

function dispatchTouch(target: EventTarget, type: 'touchstart' | 'touchmove' | 'touchend', touches: SyntheticTouch[], changedTouches?: SyntheticTouch[]): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'touches', { value: touches, configurable: true });
  Object.defineProperty(ev, 'changedTouches', { value: changedTouches ?? touches, configurable: true });
  target.dispatchEvent(ev);
}

function makeSvg(width: number, height: number): { svg: SVGSVGElement; layer: SVGGElement } {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  // happy-dom doesn't implement getScreenCTM / createSVGPoint —
  // stub them so the production code's coord conversion path works.
  (svg as unknown as { getScreenCTM: () => DOMMatrix | null }).getScreenCTM = () => {
    // identity (client coords == user coords for tests).
    return new DOMMatrix();
  };
  (svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
    const p = new DOMPoint(0, 0);
    // happy-dom DOMPoint may not have matrixTransform; provide stub.
    if (typeof (p as unknown as { matrixTransform?: unknown }).matrixTransform !== 'function') {
      (p as unknown as { matrixTransform: (m: DOMMatrix) => DOMPoint }).matrixTransform = (m: DOMMatrix) =>
        new DOMPoint(p.x * m.a + p.y * m.c + m.e, p.x * m.b + p.y * m.d + m.f);
    }
    return p;
  };
  // Provide bounding box so pan delta calc has non-zero divisor.
  (svg as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  } as DOMRect);

  const layer = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  layer.setAttribute('class', 'pkc-graph-zoom-layer');
  svg.appendChild(layer);
  document.body.appendChild(svg);
  return { svg, layer };
}

function readTransform(layer: SVGGElement): { tx: number; ty: number; scale: number } | null {
  const t = layer.getAttribute('transform');
  if (!t) return null;
  const m = /translate\(([-\d.]+),\s*([-\d.]+)\)\s*scale\(([-\d.]+)\)/.exec(t);
  if (!m) return null;
  return { tx: parseFloat(m[1]!), ty: parseFloat(m[2]!), scale: parseFloat(m[3]!) };
}

describe('graph zoom gestures (G1 PR-C parity)', () => {
  let svg: SVGSVGElement;
  let layer: SVGGElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    const made = makeSvg(960, 600);
    svg = made.svg;
    layer = made.layer;
    installGraphZoomGestures(svg);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('initial state is identity (scale 1, tx 0, ty 0)', () => {
    const t = readTransform(layer);
    expect(t).not.toBeNull();
    expect(t!.scale).toBe(1);
    expect(t!.tx).toBe(0);
    expect(t!.ty).toBe(0);
  });

  it('Ctrl-or-not wheel zooms in around cursor', () => {
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(wheel, 'deltaY', { value: -100 });
    Object.defineProperty(wheel, 'clientX', { value: 480 });
    Object.defineProperty(wheel, 'clientY', { value: 300 });
    svg.dispatchEvent(wheel);

    const t = readTransform(layer);
    expect(t).not.toBeNull();
    expect(t!.scale).toBeGreaterThan(1);
    // cursor was at center of viewBox; zoom-around-cursor keeps it
    // there → tx,ty shift inversely with scale.
    expect(svg.getAttribute('data-pkc-graph-zoom-scale')).toBe(String(t!.scale));
  });

  it('wheel scroll down zooms out', () => {
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(wheel, 'deltaY', { value: 100 });
    Object.defineProperty(wheel, 'clientX', { value: 480 });
    Object.defineProperty(wheel, 'clientY', { value: 300 });
    svg.dispatchEvent(wheel);

    const t = readTransform(layer);
    expect(t!.scale).toBeLessThan(1);
  });

  it('two-finger pinch out zooms in', () => {
    dispatchTouch(svg, 'touchstart', [
      { identifier: 0, clientX: 400, clientY: 300, target: svg },
      { identifier: 1, clientX: 560, clientY: 300, target: svg },
    ]);
    dispatchTouch(svg, 'touchmove', [
      { identifier: 0, clientX: 320, clientY: 300, target: svg },
      { identifier: 1, clientX: 640, clientY: 300, target: svg },
    ]);

    const t = readTransform(layer);
    expect(t!.scale).toBeCloseTo(2, 0);
  });

  it('two-finger pinch in zooms out', () => {
    dispatchTouch(svg, 'touchstart', [
      { identifier: 0, clientX: 320, clientY: 300, target: svg },
      { identifier: 1, clientX: 640, clientY: 300, target: svg },
    ]);
    dispatchTouch(svg, 'touchmove', [
      { identifier: 0, clientX: 400, clientY: 300, target: svg },
      { identifier: 1, clientX: 560, clientY: 300, target: svg },
    ]);

    const t = readTransform(layer);
    expect(t!.scale).toBeCloseTo(0.5, 1);
  });

  it('one-finger drag pans', () => {
    // First zoom in so pan visibility is meaningful (still works at 1x).
    dispatchTouch(svg, 'touchstart', [
      { identifier: 0, clientX: 100, clientY: 100, target: svg },
    ]);
    dispatchTouch(svg, 'touchmove', [
      { identifier: 0, clientX: 200, clientY: 150, target: svg },
    ]);

    const t = readTransform(layer);
    expect(t!.tx).toBeCloseTo(100, 0);
    expect(t!.ty).toBeCloseTo(50, 0);
  });

  it('mousedown on a node does NOT start pan (selection preserved)', () => {
    const node = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    node.setAttribute('class', 'pkc-filer-graph-node');
    layer.appendChild(node);

    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 50 });
    Object.defineProperty(md, 'clientY', { value: 50 });
    Object.defineProperty(md, 'target', { value: node });
    svg.dispatchEvent(md);

    // Move the cursor — pan must not engage.
    const mm = new Event('mousemove', { bubbles: true });
    Object.defineProperty(mm, 'clientX', { value: 200 });
    Object.defineProperty(mm, 'clientY', { value: 200 });
    window.dispatchEvent(mm);

    const t = readTransform(layer);
    expect(t!.tx).toBe(0);
    expect(t!.ty).toBe(0);
  });

  it('resetGraphZoom returns to identity from any state', () => {
    // Apply a zoom + pan first.
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(wheel, 'deltaY', { value: -100 });
    Object.defineProperty(wheel, 'clientX', { value: 100 });
    Object.defineProperty(wheel, 'clientY', { value: 100 });
    svg.dispatchEvent(wheel);
    expect(__getGraphZoomStateForTest(svg)!.scale).not.toBe(1);

    resetGraphZoom(svg);

    const t = readTransform(layer);
    expect(t!.scale).toBe(1);
    expect(t!.tx).toBe(0);
    expect(t!.ty).toBe(0);
  });

  it('re-binding aborts previous handlers (no listener leak)', () => {
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(wheel, 'deltaY', { value: -100 });
    Object.defineProperty(wheel, 'clientX', { value: 100 });
    Object.defineProperty(wheel, 'clientY', { value: 100 });

    // Re-install several times on the SAME svg — state persists by
    // design (user's zoom level survives re-renders), but handlers
    // must NOT accumulate. If they did, one wheel event would zoom
    // N times (N×ratio) instead of 1×ratio.
    installGraphZoomGestures(svg);
    installGraphZoomGestures(svg);
    installGraphZoomGestures(svg);

    const before = __getGraphZoomStateForTest(svg)!.scale;
    svg.dispatchEvent(wheel);
    const after = __getGraphZoomStateForTest(svg)!.scale;
    // PR-F G19: default sensitivity = 35 → factor = exp(-deltaY × 0.0035)。
    // deltaY=-100 → exp(0.35) ≈ 1.419。handlers が 4× 重なると
    // ~1.419^4 = 4.06 になり close-to が壊れる(検出可能)。
    const ratio = after / before;
    expect(ratio).toBeCloseTo(Math.exp(0.35), 2);
  });
});
