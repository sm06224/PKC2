/**
 * Vanilla force-directed graph layout (領域 10-6 ζ'' Phase 2b).
 *
 * Pure TypeScript, dep-zero, deterministic with a seeded RNG. Mirrors
 * the constants PKC1 (`docs/requirements/00-01_参考_前世代PKC1.html`
 * 5511 行付近) used with d3-force, so users see the same balance
 * they tuned over iterations there:
 *
 *   forceLink     distance: 70
 *   forceManyBody strength: -180
 *   forceCenter   center
 *   forceCollide  radius: 20
 *
 * Algorithm — classic spring + Coulomb repulsion + center pull,
 * integrated with velocity-Verlet style step (acceleration → velocity
 * → position) plus damping. Quadratic complexity (O(N²)) per step
 * which is fine for the ~hundreds-of-nodes scale filer view exposes;
 * Phase 4+ may add a Barnes-Hut quadtree if a real bench shows it
 * matters.
 *
 * Spec: docs/development/filer-view-and-folder-display-profile-audit-2026-05.md §4
 *       (Layout Engine Substitution Trigger documented for fallback to d3-force.)
 */

export interface GraphNodeInput {
  id: string;
  /** Optional initial position; the simulation seeds randomly if absent. */
  x?: number;
  y?: number;
}

export interface GraphLink {
  from: string;
  to: string;
}

export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface ForceParams {
  /** Spring rest length between linked nodes (PKC1 default: 70). */
  linkDistance: number;
  /** Spring stiffness; higher = tighter pull. */
  linkStrength: number;
  /** Coulomb repulsion strength (PKC1 default: -180; negative = repel). */
  charge: number;
  /** Collision radius preventing overlap (PKC1 default: 20). */
  collideRadius: number;
  /** Pull toward (centerX, centerY); 0 disables. */
  centerStrength: number;
  centerX: number;
  centerY: number;
  /** Velocity damping per step (1 = none, 0 = freeze). */
  damping: number;
  /** Per-step bound on speed to prevent explosions on degenerate input. */
  maxSpeed: number;
}

export const DEFAULT_FORCE_PARAMS: ForceParams = {
  // PR-Δ9 (2026-05-07、user 報告「グラフのノード重なりが直っていない。
  // 証拠だせ」):Playwright screenshot で 30 nodes が中央に密集確認、
  // Δ4 値(linkDistance 180 / charge -600 / collide 50)では不十分。
  // 大幅 bump:
  //   linkDistance 180 → 240  (edge 自然長 +33%)
  //   charge -600 → -1000     (反発 +66%、密集を解く)
  //   collideRadius 50 → 70   (node bound box +40%)
  //   centerStrength 0.02 → 0.005  (中心への引きを 1/4 弱、外側に逃せる)
  linkDistance: 240,
  linkStrength: 0.6,
  charge: -1000,
  collideRadius: 70,
  centerStrength: 0.005,
  centerX: 0,
  centerY: 0,
  damping: 0.85,
  maxSpeed: 30,
};

/**
 * Seeded mulberry32 PRNG so layouts are reproducible across reloads.
 * The seed is derived from the count of nodes; same N → same scatter.
 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulationOptions extends Partial<ForceParams> {
  width: number;
  height: number;
  /** Number of integration steps to run. Default 220. */
  iterations?: number;
}

/**
 * Run the simulation to a static layout. Returns final node positions.
 * Live, animated layouts can call `stepSimulation` directly inside an
 * RAF loop for the same result.
 */
export function runSimulation(
  nodes: readonly GraphNodeInput[],
  links: readonly GraphLink[],
  opts: SimulationOptions,
): SimNode[] {
  const params: ForceParams = {
    ...DEFAULT_FORCE_PARAMS,
    centerX: opts.width / 2,
    centerY: opts.height / 2,
    ...opts,
  };
  const sim = seedSimulation(nodes, opts.width, opts.height);
  const iter = opts.iterations ?? 220;
  for (let i = 0; i < iter; i++) {
    stepSimulation(sim, links, params);
  }
  return sim;
}

/**
 * Initialize node array with seeded random positions inside the viewport.
 * Existing `x` / `y` on input nodes are preserved (so live updates can
 * keep prior positions).
 */
export function seedSimulation(
  nodes: readonly GraphNodeInput[],
  width: number,
  height: number,
): SimNode[] {
  const rng = makeRng(nodes.length || 1);
  return nodes.map((n) => ({
    id: n.id,
    x: n.x ?? rng() * width,
    y: n.y ?? rng() * height,
    vx: 0,
    vy: 0,
  }));
}

/**
 * One integration step. Mutates the SimNode array in place.
 */
export function stepSimulation(
  sim: SimNode[],
  links: readonly GraphLink[],
  params: ForceParams,
): void {
  const len = sim.length;
  if (len === 0) return;

  const idx = new Map<string, number>();
  for (let i = 0; i < len; i++) idx.set(sim[i]!.id, i);

  // 1. Coulomb-style repulsion (O(N²)).
  for (let i = 0; i < len; i++) {
    const a = sim[i]!;
    for (let j = i + 1; j < len; j++) {
      const b = sim[j]!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) {
        // Jitter overlapping nodes apart deterministically.
        dx = (i % 2 === 0 ? 1 : -1) * 0.5;
        dy = (j % 2 === 0 ? 1 : -1) * 0.5;
        d2 = 0.5;
      }
      const dist = Math.sqrt(d2);
      // F = charge / d^2 (negative charge → repel). Apply equal+opposite.
      const f = params.charge / d2;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  // 2. Spring force on each link (Hooke's law, F = k * (d - rest)).
  for (const link of links) {
    const i = idx.get(link.from);
    const j = idx.get(link.to);
    if (i === undefined || j === undefined) continue;
    const a = sim[i]!;
    const b = sim[j]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const f = params.linkStrength * (d - params.linkDistance);
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // 3. Center pull.
  for (const n of sim) {
    n.vx += (params.centerX - n.x) * params.centerStrength;
    n.vy += (params.centerY - n.y) * params.centerStrength;
  }

  // 4. Collision resolution — push apart any two nodes within
  //    2 * collideRadius. Solved iteratively with a single pass per
  //    step which is sufficient at this scale.
  const r2 = params.collideRadius * 2;
  for (let i = 0; i < len; i++) {
    const a = sim[i]!;
    for (let j = i + 1; j < len; j++) {
      const b = sim[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r2 || dist === 0) continue;
      const overlap = (r2 - dist) / 2;
      const ux = dx / (dist || 1);
      const uy = dy / (dist || 1);
      a.x -= ux * overlap;
      a.y -= uy * overlap;
      b.x += ux * overlap;
      b.y += uy * overlap;
    }
  }

  // 5. Velocity-Verlet style integration with damping + speed clamp.
  for (const n of sim) {
    n.vx *= params.damping;
    n.vy *= params.damping;
    const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
    if (speed > params.maxSpeed) {
      const k = params.maxSpeed / speed;
      n.vx *= k;
      n.vy *= k;
    }
    n.x += n.vx;
    n.y += n.vy;
  }
}

/**
 * Compute the bounding box of a laid-out graph; useful for SVG
 * `viewBox` sizing after the simulation settles.
 */
export function boundingBox(sim: readonly SimNode[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (sim.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of sim) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  return { minX, minY, maxX, maxY };
}
