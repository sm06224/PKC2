/**
 * Graph Canvas region-slice gesture tests (PR-H G16, formerly PR-E SVG).
 *
 * region-select mode 中は背景 drag が rect を引き、解放時に内部の
 * node の lid を `pkc-graph-region-selected` CustomEvent で emit する。
 *
 * reform-2026-05 §6 visual-state-parity:gesture を発火しただけで
 * 終わらず、emit された event detail が rect 内の node lid を持つこと、
 * 解放後に view state の rectStart/End が null に戻ることを assert する。
 */

/** @vitest-environment happy-dom */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  installGraphCanvasGestures,
  bindGraphCanvas,
  __getGraphCanvasViewForTest,
  type GraphCanvasPayload,
} from '@adapter/ui/graph-canvas';

function makeCanvas(width = 800, height = 600): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const stubCtx = {
    save: () => {}, restore: () => {}, clearRect: () => {}, fillRect: () => {},
    strokeRect: () => {}, translate: () => {}, scale: () => {}, setTransform: () => {},
    beginPath: () => {},
    moveTo: () => {}, lineTo: () => {}, arc: () => {}, fill: () => {}, stroke: () => {},
    fillText: () => {}, strokeText: () => {}, setLineDash: () => {},
    globalAlpha: 1, font: '', fillStyle: '#000', strokeStyle: '#000',
    lineWidth: 1, textAlign: 'left', textBaseline: 'alphabetic', lineJoin: 'miter',
  };
  (canvas as unknown as { getContext: (t: string) => CanvasRenderingContext2D | null }).getContext = (t) =>
    t === '2d' ? (stubCtx as unknown as CanvasRenderingContext2D) : null;
  (canvas as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  } as DOMRect);
  document.body.appendChild(canvas);
  return canvas;
}

function mkPayload(nodes: { id: string; x: number; y: number }[]): GraphCanvasPayload {
  return {
    width: 800,
    height: 600,
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

describe('graph canvas region-slice (PR-H G16 + PR-E parity)', () => {
  let canvas: HTMLCanvasElement;
  let emittedEvents: Array<{ lids: string[] }>;

  beforeEach(() => {
    document.body.innerHTML = '';
    emittedEvents = [];
    canvas = makeCanvas(800, 600);
    bindGraphCanvas(canvas, mkPayload([
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 200, y: 150 },
      { id: 'c', x: 500, y: 400 },
      { id: 'd', x: 700, y: 500 },
    ]));
    canvas.addEventListener('pkc-graph-region-selected', (ev) => {
      const detail = (ev as CustomEvent).detail as { lids: string[] };
      emittedEvents.push({ lids: detail.lids });
    });
    installGraphCanvasGestures(canvas);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('region-mode OFF: background drag does NOT emit selection event', () => {
    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 50 });
    Object.defineProperty(md, 'clientY', { value: 50 });
    canvas.dispatchEvent(md);
    const mu = new Event('mouseup', { bubbles: true });
    Object.defineProperty(mu, 'clientX', { value: 50 });
    Object.defineProperty(mu, 'clientY', { value: 50 });
    window.dispatchEvent(mu);

    expect(emittedEvents).toHaveLength(0);
  });

  it('region-mode ON: drag-rect over nodes a+b emits their lids', () => {
    canvas.setAttribute('data-pkc-graph-region-select-mode', 'true');

    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 50 });
    Object.defineProperty(md, 'clientY', { value: 50 });
    canvas.dispatchEvent(md);

    // Drag to (300, 200) — covers a (100,100) and b (200,150).
    const mm = new Event('mousemove', { bubbles: true });
    Object.defineProperty(mm, 'clientX', { value: 300 });
    Object.defineProperty(mm, 'clientY', { value: 200 });
    window.dispatchEvent(mm);

    // While dragging, view state has rectStart/rectEnd populated.
    const vDuring = __getGraphCanvasViewForTest(canvas)!;
    expect(vDuring.rectStart).not.toBeNull();

    const mu = new Event('mouseup', { bubbles: true });
    Object.defineProperty(mu, 'clientX', { value: 300 });
    Object.defineProperty(mu, 'clientY', { value: 200 });
    window.dispatchEvent(mu);

    // After release: rect cleared, event emitted with a + b.
    const vAfter = __getGraphCanvasViewForTest(canvas)!;
    expect(vAfter.rectStart).toBeNull();
    expect(vAfter.rectEnd).toBeNull();
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]!.lids.sort()).toEqual(['a', 'b']);
  });

  it('region-mode ON: tiny accidental click (<4×4) does NOT emit', () => {
    canvas.setAttribute('data-pkc-graph-region-select-mode', 'true');

    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 50 });
    Object.defineProperty(md, 'clientY', { value: 50 });
    canvas.dispatchEvent(md);

    const mm = new Event('mousemove', { bubbles: true });
    Object.defineProperty(mm, 'clientX', { value: 51 });
    Object.defineProperty(mm, 'clientY', { value: 51 });
    window.dispatchEvent(mm);

    const mu = new Event('mouseup', { bubbles: true });
    Object.defineProperty(mu, 'clientX', { value: 51 });
    Object.defineProperty(mu, 'clientY', { value: 51 });
    window.dispatchEvent(mu);

    expect(emittedEvents).toHaveLength(0);
  });

  it('region-mode ON: large rect covering all 4 nodes emits all 4 lids', () => {
    canvas.setAttribute('data-pkc-graph-region-select-mode', 'true');

    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 0 });
    Object.defineProperty(md, 'clientY', { value: 0 });
    canvas.dispatchEvent(md);

    const mm = new Event('mousemove', { bubbles: true });
    Object.defineProperty(mm, 'clientX', { value: 800 });
    Object.defineProperty(mm, 'clientY', { value: 600 });
    window.dispatchEvent(mm);

    const mu = new Event('mouseup', { bubbles: true });
    Object.defineProperty(mu, 'clientX', { value: 800 });
    Object.defineProperty(mu, 'clientY', { value: 600 });
    window.dispatchEvent(mu);

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]!.lids.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('region-mode ON: drag missing all nodes emits empty list', () => {
    canvas.setAttribute('data-pkc-graph-region-select-mode', 'true');

    const md = new Event('mousedown', { bubbles: true, cancelable: true });
    Object.defineProperty(md, 'button', { value: 0 });
    Object.defineProperty(md, 'clientX', { value: 300 });
    Object.defineProperty(md, 'clientY', { value: 250 });
    canvas.dispatchEvent(md);

    const mm = new Event('mousemove', { bubbles: true });
    Object.defineProperty(mm, 'clientX', { value: 400 });
    Object.defineProperty(mm, 'clientY', { value: 350 });
    window.dispatchEvent(mm);

    const mu = new Event('mouseup', { bubbles: true });
    Object.defineProperty(mu, 'clientX', { value: 400 });
    Object.defineProperty(mu, 'clientY', { value: 350 });
    window.dispatchEvent(mu);

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]!.lids).toEqual([]);
  });
});
