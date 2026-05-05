/**
 * Tier 0 flags for the filer view graph subset (領域 10-6 ζ'' Phase 2b).
 *
 * Each parameter mirrors a tunable in PKC1's d3-force config. Live
 * getters pull from container.__flags__ via the standard flags
 * pipeline, so users can tweak with `?pkc-flag=graph.link_distance=100`
 * et al. and see the simulation re-layout on next render.
 */

import { defineFlag } from '../../core/flags';
import type { ForceParams } from './force-layout';
import { DEFAULT_FORCE_PARAMS } from './force-layout';

const FLAG_CATEGORY = 'graph';

export const graphLinkDistance = defineFlag<number>(
  'graph.link_distance',
  DEFAULT_FORCE_PARAMS.linkDistance,
  {
    range: [10, 400],
    category: FLAG_CATEGORY,
    description:
      'Filer graph view のリンク間ばね自然長 (px)。PKC1 の forceLink distance に相当',
    tier: 0,
  },
);

export const graphLinkStrength = defineFlag<number>(
  'graph.link_strength',
  DEFAULT_FORCE_PARAMS.linkStrength,
  {
    range: [0, 5],
    category: FLAG_CATEGORY,
    description: 'リンクばねの剛性。大きいほど引き寄せが強い',
    tier: 0,
  },
);

export const graphCharge = defineFlag<number>(
  'graph.charge',
  DEFAULT_FORCE_PARAMS.charge,
  {
    range: [-2000, 0],
    category: FLAG_CATEGORY,
    description:
      'クーロン斥力の強さ(負の値で反発、PKC1 の forceManyBody strength に相当)',
    tier: 0,
  },
);

export const graphCollideRadius = defineFlag<number>(
  'graph.collide_radius',
  DEFAULT_FORCE_PARAMS.collideRadius,
  {
    range: [0, 200],
    category: FLAG_CATEGORY,
    description: 'ノード重なり防止用半径 (px、PKC1 の forceCollide に相当)',
    tier: 0,
  },
);

export const graphCenterStrength = defineFlag<number>(
  'graph.center_strength',
  DEFAULT_FORCE_PARAMS.centerStrength,
  {
    range: [0, 1],
    category: FLAG_CATEGORY,
    description: '中心引き寄せ強度。0 で無効化',
    tier: 0,
  },
);

export const graphDamping = defineFlag<number>(
  'graph.damping',
  DEFAULT_FORCE_PARAMS.damping,
  {
    range: [0.1, 1],
    category: FLAG_CATEGORY,
    description: '速度減衰係数。1 で減衰なし、小さいほど早く収束',
    tier: 0,
  },
);

export const graphMaxSpeed = defineFlag<number>(
  'graph.max_speed',
  DEFAULT_FORCE_PARAMS.maxSpeed,
  {
    range: [1, 500],
    category: FLAG_CATEGORY,
    description: '1 ステップあたり最大速度 clamp (px)。爆発的発散の防止',
    tier: 0,
  },
);

export const graphIterations = defineFlag<number>(
  'graph.iterations',
  220,
  {
    range: [10, 2000],
    category: FLAG_CATEGORY,
    description: '初期 simulation を実行するステップ数(完全 settle まで)',
    tier: 0,
  },
);

/**
 * Snapshot of all graph force params at the moment of the call.
 * Pass as `params` to `runSimulation` / `stepSimulation` so the
 * simulation runs with consistent values throughout an iteration.
 */
export function getGraphForceParams(width: number, height: number): ForceParams {
  return {
    linkDistance: graphLinkDistance(),
    linkStrength: graphLinkStrength(),
    charge: graphCharge(),
    collideRadius: graphCollideRadius(),
    centerStrength: graphCenterStrength(),
    centerX: width / 2,
    centerY: height / 2,
    damping: graphDamping(),
    maxSpeed: graphMaxSpeed(),
  };
}
