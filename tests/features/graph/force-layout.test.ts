import { describe, it, expect } from 'vitest';
import {
  runSimulation,
  seedSimulation,
  stepSimulation,
  boundingBox,
  DEFAULT_FORCE_PARAMS,
  type ForceParams,
} from '@features/graph/force-layout';

const params: ForceParams = { ...DEFAULT_FORCE_PARAMS, centerX: 400, centerY: 240 };

describe('force-layout', () => {
  it('seedSimulation places nodes inside the canvas', () => {
    const sim = seedSimulation(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      800,
      480,
    );
    expect(sim).toHaveLength(3);
    for (const n of sim) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(800);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(480);
      expect(n.vx).toBe(0);
      expect(n.vy).toBe(0);
    }
  });

  it('seedSimulation is deterministic for the same node count', () => {
    const a = seedSimulation([{ id: '1' }, { id: '2' }, { id: '3' }], 800, 480);
    const b = seedSimulation([{ id: '1' }, { id: '2' }, { id: '3' }], 800, 480);
    expect(a).toEqual(b);
  });

  it('seedSimulation honors initial x/y when present', () => {
    const sim = seedSimulation(
      [{ id: 'a', x: 100, y: 50 }, { id: 'b', x: 300, y: 200 }],
      800,
      480,
    );
    expect(sim[0]).toMatchObject({ id: 'a', x: 100, y: 50, vx: 0, vy: 0 });
    expect(sim[1]).toMatchObject({ id: 'b', x: 300, y: 200, vx: 0, vy: 0 });
  });

  it('stepSimulation does nothing on an empty sim', () => {
    const sim: ReturnType<typeof seedSimulation> = [];
    stepSimulation(sim, [], params);
    expect(sim).toEqual([]);
  });

  it('stepSimulation moves linked nodes toward the link distance', () => {
    const sim = seedSimulation([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 400, y: 0 }], 800, 480);
    for (let i = 0; i < 250; i++) stepSimulation(sim, [{ from: 'a', to: 'b' }], params);
    const dx = sim[1]!.x - sim[0]!.x;
    const dy = sim[1]!.y - sim[0]!.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Should have settled near `params.linkDistance`. Tolerance derives
    // from collision + repulsion + center pull. PR-Δ4 (2026-05-07)
    // bumped DEFAULT_FORCE_PARAMS.linkDistance to 180 → tolerance band
    // re-centered.
    const target = params.linkDistance;
    expect(dist).toBeGreaterThan(target * 0.4); // 0.4 × 180 = 72
    expect(dist).toBeLessThan(target * 1.4);    // 1.4 × 180 = 252
  });

  it('runSimulation produces a layout with finite, non-NaN positions', () => {
    const sim = runSimulation(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'd' },
        { from: 'd', to: 'e' },
      ],
      { width: 800, height: 480, iterations: 100 },
    );
    for (const n of sim) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it('runSimulation respects custom force params', () => {
    const tight = runSimulation(
      [{ id: 'a' }, { id: 'b' }],
      [{ from: 'a', to: 'b' }],
      { width: 800, height: 480, linkDistance: 30, iterations: 200 },
    );
    const loose = runSimulation(
      [{ id: 'a' }, { id: 'b' }],
      [{ from: 'a', to: 'b' }],
      { width: 800, height: 480, linkDistance: 200, iterations: 200 },
    );
    const distOf = (s: typeof tight) => Math.hypot(s[1]!.x - s[0]!.x, s[1]!.y - s[0]!.y);
    expect(distOf(tight)).toBeLessThan(distOf(loose));
  });

  it('boundingBox encloses every node', () => {
    const sim = seedSimulation(
      [{ id: 'a', x: 10, y: 20 }, { id: 'b', x: 100, y: 200 }, { id: 'c', x: 50, y: 300 }],
      800,
      480,
    );
    const bb = boundingBox(sim);
    expect(bb).toEqual({ minX: 10, minY: 20, maxX: 100, maxY: 300 });
  });

  it('boundingBox is zero when there are no nodes', () => {
    expect(boundingBox([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('overlapping seed positions are jittered apart', () => {
    const sim = seedSimulation(
      [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 100, y: 100 }],
      800,
      480,
    );
    for (let i = 0; i < 20; i++) stepSimulation(sim, [], params);
    const dist = Math.hypot(sim[1]!.x - sim[0]!.x, sim[1]!.y - sim[0]!.y);
    expect(dist).toBeGreaterThan(0.1);
  });

  it('ignores links pointing at unknown ids', () => {
    const sim = seedSimulation([{ id: 'a' }, { id: 'b' }], 800, 480);
    expect(() =>
      stepSimulation(sim, [{ from: 'a', to: 'ghost' }, { from: 'ghost', to: 'b' }], params),
    ).not.toThrow();
  });
});
