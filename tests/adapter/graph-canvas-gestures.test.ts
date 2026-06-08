/**
 * Graph Canvas zoom + pan gesture tests (PR-H G16, formerly G1 SVG).
 *
 * 領域 10-6 ζ'' PR-H (2026-05-06):graph view を SVG → Canvas に
 * 書き換えた。gesture handler は graph-canvas.ts に集約、view state
 * は data-pkc-graph-zoom-{scale,tx,ty} 属性に表面化。
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠:
 * gesture 発火 → __getGraphCanvasViewForTest / data-pkc-* attr で
 * state mutation + consumer behavior change を AND assert。
 */

/** @vitest-environment happy-dom */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  installGraphCanvasGestures,
  resetGraphCanvasZoom,
  bindGraphCanvas,
  setGraphEditMode,
  __getGraphCanvasViewForTest,
  type GraphCanvasPayload,
} from '@adapter/ui/graph-canvas';

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

function makeCanvas(width = 960, height = 600): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  // happy-dom doesn't provide a useful 2d context; provide a stub so
  // draw doesn't throw. We don't assert pixel content — only state.
  const stubCtx: Partial<CanvasRenderingContext2D> = {
    save: () => {},
    restore: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    translate: () => {},
    scale: () => {},
    setTransform: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: () => {},
    strokeText: () => {},
    setLineDash: () => {},
  };
  Object.assign(stubCtx, { globalAlpha: 1, font: '', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, textAlign: 'left', textBaseline: 'alphabetic', lineJoin: 'miter' });
  (canvas as unknown as { getContext: (type: string) => CanvasRenderingContext2D | null }).getContext = (type: string) => {
    if (type === '2d') return stubCtx as CanvasRenderingContext2D;
    return null;
  };

  // Provide bounding rect so coord math works.
  (canvas as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  } as DOMRect);

  document.body.appendChild(canvas);
  return canvas;
}

function mkPayload(width = 960, height = 600, nodes: { id: string; x: number; y: number }[] = []): GraphCanvasPayload {
  return {
    width,
    height,
    mode: 'relations',
    nodes: nodes.map((n) => ({ id: n.id, label: n.id, archetype: 'text' })),
    positions: new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
    links: [],
    selectedLid: null,
    regionLids: [],
    regionMode: false,
    collideRadius: 20,
  };
}

describe('graph canvas gestures (PR-H G16 parity)', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    canvas = makeCanvas(960, 600);
    bindGraphCanvas(canvas, mkPayload());
    installGraphCanvasGestures(canvas);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('initial state is identity (scale 1, tx 0, ty 0)', () => {
    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.scale).toBe(1);
    expect(v.tx).toBe(0);
    expect(v.ty).toBe(0);
  });

  it('wheel up zooms in around cursor', () => {
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(wheel, 'deltaY', { value: -100 });
    Object.defineProperty(wheel, 'clientX', { value: 480 });
    Object.defineProperty(wheel, 'clientY', { value: 300 });
    canvas.dispatchEvent(wheel);

    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.scale).toBeGreaterThan(1);
    expect(canvas.getAttribute('data-pkc-graph-zoom-scale')).toBe(String(v.scale));
  });

  it('wheel down zooms out', () => {
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(wheel, 'deltaY', { value: 100 });
    Object.defineProperty(wheel, 'clientX', { value: 480 });
    Object.defineProperty(wheel, 'clientY', { value: 300 });
    canvas.dispatchEvent(wheel);

    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.scale).toBeLessThan(1);
  });

  it('two-finger pinch out zooms in', () => {
    dispatchTouch(canvas, 'touchstart', [
      { identifier: 0, clientX: 400, clientY: 300, target: canvas },
      { identifier: 1, clientX: 560, clientY: 300, target: canvas },
    ]);
    dispatchTouch(canvas, 'touchmove', [
      { identifier: 0, clientX: 320, clientY: 300, target: canvas },
      { identifier: 1, clientX: 640, clientY: 300, target: canvas },
    ]);

    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.scale).toBeCloseTo(2, 0);
  });

  it('two-finger pinch in zooms out', () => {
    dispatchTouch(canvas, 'touchstart', [
      { identifier: 0, clientX: 320, clientY: 300, target: canvas },
      { identifier: 1, clientX: 640, clientY: 300, target: canvas },
    ]);
    dispatchTouch(canvas, 'touchmove', [
      { identifier: 0, clientX: 400, clientY: 300, target: canvas },
      { identifier: 1, clientX: 560, clientY: 300, target: canvas },
    ]);

    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.scale).toBeCloseTo(0.5, 1);
  });

  it('one-finger drag pans', () => {
    dispatchTouch(canvas, 'touchstart', [
      { identifier: 0, clientX: 100, clientY: 100, target: canvas },
    ]);
    dispatchTouch(canvas, 'touchmove', [
      { identifier: 0, clientX: 200, clientY: 150, target: canvas },
    ]);

    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.tx).toBeCloseTo(100, 0);
    expect(v.ty).toBeCloseTo(50, 0);
  });

  it('mousedown on a node coordinate fires pkc-graph-node-click on mouseup (no pan)', () => {
    // Bind payload with one node at (100, 100).
    bindGraphCanvas(canvas, mkPayload(960, 600, [{ id: 'n1', x: 100, y: 100 }]));
    // U2 (2026-05-07):auto-fit が小 bbox で zoom-in するため、gesture
    // 単独 test では view を identity に reset(本 test の対象は hit test
    // pipeline で auto-fit ではない)。
    const v0 = __getGraphCanvasViewForTest(canvas)!;
    v0.scale = 1; v0.tx = 0; v0.ty = 0;
    let receivedLid: string | null = null;
    canvas.addEventListener('pkc-graph-node-click', (ev) => {
      receivedLid = (ev as CustomEvent).detail.lid;
    });

    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 100 });
    Object.defineProperty(md, 'clientY', { value: 100 });
    canvas.dispatchEvent(md);

    const mu = new Event('mouseup', { bubbles: true });
    Object.defineProperty(mu, 'clientX', { value: 100 });
    Object.defineProperty(mu, 'clientY', { value: 100 });
    window.dispatchEvent(mu);

    expect(receivedLid).toBe('n1');
    // Pan must NOT have engaged.
    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.tx).toBe(0);
    expect(v.ty).toBe(0);
  });

  it('resetGraphCanvasZoom returns to identity from any state', () => {
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(wheel, 'deltaY', { value: -100 });
    Object.defineProperty(wheel, 'clientX', { value: 100 });
    Object.defineProperty(wheel, 'clientY', { value: 100 });
    canvas.dispatchEvent(wheel);
    expect(__getGraphCanvasViewForTest(canvas)!.scale).not.toBe(1);

    resetGraphCanvasZoom(canvas);

    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.scale).toBe(1);
    expect(v.tx).toBe(0);
    expect(v.ty).toBe(0);
  });

  it('re-binding gestures aborts previous handlers (no listener leak)', () => {
    const wheel = new Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(wheel, 'deltaY', { value: -100 });
    Object.defineProperty(wheel, 'clientX', { value: 100 });
    Object.defineProperty(wheel, 'clientY', { value: 100 });

    installGraphCanvasGestures(canvas);
    installGraphCanvasGestures(canvas);
    installGraphCanvasGestures(canvas);

    const before = __getGraphCanvasViewForTest(canvas)!.scale;
    canvas.dispatchEvent(wheel);
    const after = __getGraphCanvasViewForTest(canvas)!.scale;
    // sensitivity default 35 → factor = exp(-deltaY × 0.0035) for deltaY=-100
    // = exp(0.35) ≈ 1.419。重複 install されていなければ 1×。
    const ratio = after / before;
    expect(ratio).toBeCloseTo(Math.exp(0.35), 2);
  });
});

describe('graph canvas wire drag (Phase γ-B2-2)', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    canvas = makeCanvas(960, 600);
    installGraphCanvasGestures(canvas);
    setGraphEditMode('view');
  });

  afterEach(() => {
    setGraphEditMode('view');
    document.body.innerHTML = '';
  });

  function md(x: number, y: number): void {
    const ev = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'button', { value: 0 });
    Object.defineProperty(ev, 'clientX', { value: x });
    Object.defineProperty(ev, 'clientY', { value: y });
    canvas.dispatchEvent(ev);
  }
  function mmove(x: number, y: number): void {
    const ev = new Event('mousemove', { bubbles: true });
    Object.defineProperty(ev, 'clientX', { value: x });
    Object.defineProperty(ev, 'clientY', { value: y });
    window.dispatchEvent(ev);
  }
  function mup(x: number, y: number): void {
    const ev = new Event('mouseup', { bubbles: true });
    Object.defineProperty(ev, 'clientX', { value: x });
    Object.defineProperty(ev, 'clientY', { value: y });
    window.dispatchEvent(ev);
  }

  it('edit mode: node から drag で prototype line(wireSource/wireTarget)が立つ', () => {
    bindGraphCanvas(
      canvas,
      mkPayload(960, 600, [
        { id: 'n1', x: 100, y: 100 },
        { id: 'n2', x: 300, y: 100 },
      ]),
    );
    const v0 = __getGraphCanvasViewForTest(canvas)!;
    v0.scale = 1;
    v0.tx = 0;
    v0.ty = 0;
    setGraphEditMode('edit');

    md(100, 100);
    mmove(200, 110);

    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.wireSource).toBe('n1');
    expect(v.wireTarget).not.toBeNull();
    expect(v.wireTarget).not.toBeUndefined();
  });

  it('edit mode: mouseup で wire drag state が reset される', () => {
    bindGraphCanvas(canvas, mkPayload(960, 600, [{ id: 'n1', x: 100, y: 100 }]));
    const v0 = __getGraphCanvasViewForTest(canvas)!;
    v0.scale = 1;
    v0.tx = 0;
    v0.ty = 0;
    setGraphEditMode('edit');

    md(100, 100);
    mmove(200, 100);
    mup(200, 100);

    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.wireSource == null).toBe(true);
  });

  it('edit mode: drop が別 node 上なら pkc-graph-wire-drop を発行', () => {
    bindGraphCanvas(
      canvas,
      mkPayload(960, 600, [
        { id: 'n1', x: 100, y: 100 },
        { id: 'n2', x: 300, y: 100 },
      ]),
    );
    const v0 = __getGraphCanvasViewForTest(canvas)!;
    v0.scale = 1;
    v0.tx = 0;
    v0.ty = 0;
    setGraphEditMode('edit');
    let dropDetail: { source: string; target: string } | null = null;
    canvas.addEventListener('pkc-graph-wire-drop', (ev) => {
      dropDetail = (ev as CustomEvent).detail as {
        source: string;
        target: string;
      };
    });

    md(100, 100);
    mmove(300, 100);
    mup(300, 100);

    expect(dropDetail).not.toBeNull();
    expect(dropDetail!.source).toBe('n1');
    expect(dropDetail!.target).toBe('n2');
  });

  it('edit mode: drop が空白なら wire-drop event は出ない', () => {
    bindGraphCanvas(canvas, mkPayload(960, 600, [{ id: 'n1', x: 100, y: 100 }]));
    const v0 = __getGraphCanvasViewForTest(canvas)!;
    v0.scale = 1;
    v0.tx = 0;
    v0.ty = 0;
    setGraphEditMode('edit');
    let fired = false;
    canvas.addEventListener('pkc-graph-wire-drop', () => {
      fired = true;
    });

    md(100, 100);
    mmove(500, 400);
    mup(500, 400);

    expect(fired).toBe(false);
  });

  it('edit mode + Shift+drag は wire でなく node-drag に退避', () => {
    bindGraphCanvas(
      canvas,
      mkPayload(960, 600, [
        { id: 'n1', x: 100, y: 100 },
        { id: 'n2', x: 300, y: 100 },
      ]),
    );
    const v0 = __getGraphCanvasViewForTest(canvas)!;
    v0.scale = 1;
    v0.tx = 0;
    v0.ty = 0;
    setGraphEditMode('edit');

    md(100, 100);
    const mm = new Event('mousemove', { bubbles: true });
    Object.defineProperty(mm, 'clientX', { value: 200 });
    Object.defineProperty(mm, 'clientY', { value: 100 });
    Object.defineProperty(mm, 'shiftKey', { value: true });
    window.dispatchEvent(mm);

    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.wireSource == null).toBe(true);
    expect(v.dragLid).toBe('n1');

    mup(200, 100);
  });

  it('view mode: wire drag は起きず従来の node-drag のまま', () => {
    bindGraphCanvas(
      canvas,
      mkPayload(960, 600, [
        { id: 'n1', x: 100, y: 100 },
        { id: 'n2', x: 300, y: 100 },
      ]),
    );
    const v0 = __getGraphCanvasViewForTest(canvas)!;
    v0.scale = 1;
    v0.tx = 0;
    v0.ty = 0;
    setGraphEditMode('view');

    md(100, 100);
    mmove(200, 100);

    const v = __getGraphCanvasViewForTest(canvas)!;
    expect(v.wireSource == null).toBe(true);
    expect(v.dragLid).toBe('n1');

    mup(200, 100);
  });
});
