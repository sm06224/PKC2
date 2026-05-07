/**
 * Graph Canvas auto-fit-to-bounds tests (PR-AAA, 2026-05-06).
 *
 * User 修正指示1:「グラフビューが詰まりすぎていて見づらい。
 * できるなら、拡大縮小可能にして欲しい。まるで銀河の星々のように」
 *
 * PR-AAA は初回 bind で全 node の bounding box を canvas viewport に
 * フィットさせる auto-fit を実行。subsequent re-bind は user の
 * zoom/pan を保持。`resetGraphCanvasZoom` が flag をクリアして
 * re-fit を可能にする。
 */

/** @vitest-environment happy-dom */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  bindGraphCanvas,
  resetGraphCanvasZoom,
  __getGraphCanvasViewForTest,
  type GraphCanvasPayload,
} from '@adapter/ui/graph-canvas';

function makeCanvas(width = 960, height = 600): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const stubCtx: Partial<CanvasRenderingContext2D> = {
    save: () => {}, restore: () => {}, clearRect: () => {}, fillRect: () => {},
    strokeRect: () => {}, translate: () => {}, scale: () => {}, setTransform: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, arc: () => {},
    fill: () => {}, stroke: () => {}, fillText: () => {}, strokeText: () => {},
    setLineDash: () => {},
  };
  Object.assign(stubCtx, {
    globalAlpha: 1, font: '', fillStyle: '#000', strokeStyle: '#000',
    lineWidth: 1, textAlign: 'left', textBaseline: 'alphabetic', lineJoin: 'miter',
  });
  (canvas as unknown as { getContext: (type: string) => CanvasRenderingContext2D | null }).getContext = (type: string) => {
    if (type === '2d') return stubCtx as CanvasRenderingContext2D;
    return null;
  };
  (canvas as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height,
    toJSON: () => ({}),
  } as DOMRect);
  document.body.appendChild(canvas);
  return canvas;
}

function mkPayload(
  nodes: { id: string; x: number; y: number }[],
  width = 960,
  height = 600,
): GraphCanvasPayload {
  return {
    width, height,
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

describe('PR-AAA: graph canvas auto-fit-to-bounds', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    canvas = makeCanvas(960, 600);
  });

  it('first bind auto-fits scale + translation to bring nodes inside viewport', () => {
    // Nodes spread far outside the 960x600 viewport.
    const payload = mkPayload([
      { id: 'a', x: -2000, y: -1500 },
      { id: 'b', x: 2000, y: 1500 },
      { id: 'c', x: 0, y: 0 },
    ]);
    bindGraphCanvas(canvas, payload);
    const view = __getGraphCanvasViewForTest(canvas)!;
    // Auto-fit should have shrunk scale below 1 because the bbox
    // (4000 wide × 3000 tall + padding) doesn't fit at scale=1.
    expect(view.scale).toBeLessThan(1);
    expect(view.scale).toBeGreaterThan(0.05);
    // Translation should be non-zero (bbox is centered in viewport).
    expect(Math.abs(view.tx) + Math.abs(view.ty)).toBeGreaterThan(0);
  });

  it('second bind preserves user zoom/pan (no re-fit)', () => {
    const payload = mkPayload([
      { id: 'a', x: -2000, y: -1500 },
      { id: 'b', x: 2000, y: 1500 },
    ]);
    bindGraphCanvas(canvas, payload);
    const view = __getGraphCanvasViewForTest(canvas)!;
    // Simulate user zoom + pan.
    view.scale = 4;
    view.tx = 100;
    view.ty = -50;

    // Re-bind with different positions (user kept the canvas open).
    const payload2 = mkPayload([
      { id: 'a', x: -100, y: -100 },
      { id: 'b', x: 100, y: 100 },
    ]);
    bindGraphCanvas(canvas, payload2);
    const view2 = __getGraphCanvasViewForTest(canvas)!;
    expect(view2.scale).toBe(4);
    expect(view2.tx).toBe(100);
    expect(view2.ty).toBe(-50);
  });

  it('resetGraphCanvasZoom triggers re-fit (not identity zoom)', () => {
    const payload = mkPayload([
      { id: 'a', x: -2000, y: -1500 },
      { id: 'b', x: 2000, y: 1500 },
    ]);
    bindGraphCanvas(canvas, payload);
    const view = __getGraphCanvasViewForTest(canvas)!;
    const fitScale = view.scale;
    const fitTx = view.tx;

    // User zooms in.
    view.scale = 4;
    view.tx = 999;
    view.ty = -999;

    // Reset → should restore the auto-fit, not scale=1.
    resetGraphCanvasZoom(canvas);
    const view2 = __getGraphCanvasViewForTest(canvas)!;
    expect(view2.scale).toBeCloseTo(fitScale, 3);
    expect(view2.tx).toBeCloseTo(fitTx, 3);
  });

  it('first bind with empty positions does not crash and leaves identity', () => {
    const payload = mkPayload([]);
    bindGraphCanvas(canvas, payload);
    const view = __getGraphCanvasViewForTest(canvas)!;
    expect(view.scale).toBe(1);
    expect(view.tx).toBe(0);
    expect(view.ty).toBe(0);
  });

  it('auto-fit zooms IN moderately for small bbox (capped at 2.5x)', () => {
    // U2 (2026-05-07、wave-10-6 UX evaluation):単一 folder で node が
    // 中央に固まり viewport が空白だらけになる症状を fit-to-content で
    // 解消。tiny bbox(単一 node 等)では zoom-IN するが、過剰拡大を
    // 防ぐため 2.5x で cap。bbox = 単一 node + r=24 padding = 48x48、
    // viewport 960x600 → sx=17.6, sy=11.0、min=11.0、cap=2.5。
    const payload = mkPayload([
      { id: 'a', x: 100, y: 100 },
    ]);
    bindGraphCanvas(canvas, payload);
    const view = __getGraphCanvasViewForTest(canvas)!;
    expect(view.scale).toBe(2.5);
    // Center: bbox center (100, 100) は viewport center (480, 300) に置く。
    // user-space 中心は w*s/2 = 48*2.5/2 = 60 オフセット。tx は (480 - 60 - 76*2.5)。
    // 直接 number 比較は脆いので、center が viewport center に居ることを確認。
    const cxAfter = view.tx + 100 * view.scale; // node 'a' rendered x
    const cyAfter = view.ty + 100 * view.scale;
    expect(cxAfter).toBeCloseTo(480, 1); // viewport width / 2
    expect(cyAfter).toBeCloseTo(300, 1); // viewport height / 2
  });

  it('auto-fit MIN_SCALE clamp survives extreme bbox', () => {
    // bbox 100,000 wide → scale would be ~0.008 < MIN_SCALE=0.05.
    const payload = mkPayload([
      { id: 'a', x: -50000, y: 0 },
      { id: 'b', x: 50000, y: 0 },
    ]);
    bindGraphCanvas(canvas, payload);
    const view = __getGraphCanvasViewForTest(canvas)!;
    expect(view.scale).toBeGreaterThanOrEqual(0.05);
  });
});
