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
  400,
  {
    range: [10, 2000],
    category: FLAG_CATEGORY,
    description: '初期 simulation を実行するステップ数(完全 settle まで)',
    tier: 0,
  },
);

/**
 * Node 視覚半径の collideRadius に対する比率(PR-TTT 2026-05-07、
 * 修正指示7 #6「ノードが大きすぎる、ラベル優先表示」)。視覚 r は
 * `collideRadius * value` で算出、衝突判定 r も同じ値を使う。
 *
 * PR-Δ4 (2026-05-07、修正指示9):default 0.45 → 0.35。
 * 50 ばね × 0.35 = 17.5 px の視覚半径 + 50 px の衝突半径で、ノード
 * 同士は最低 100 px 離れ、label が node より大きく見える(銀河の星々の
 * 比率を意識)。
 *
 * range [0.2, 1.0] で誤って 0 に振らない。
 */
export const graphNodeRadiusFactor = defineFlag<number>(
  'graph.node_radius_factor',
  0.35,
  {
    range: [0.2, 1.0],
    category: FLAG_CATEGORY,
    description: 'node 視覚半径 / collide_radius 比率(0.35 = label / edge を node より優先表示)。小さくするほど label が相対的に大きく見える',
    tier: 0,
  },
);

/**
 * PR-Δ22 (2026-05-07、user 指摘「空間的所属を表現しろ。2D じゃ無理。
 * 銀河的にしろ」):3D perspective projection mode。0 で off(2D 平面)、
 * 1 で ON(z 軸を folder depth に割当て、近い node は大きく明るく、
 * 遠い node は小さく暗く描画)。
 */
export const graphGalaxyMode = defineFlag<number>(
  'graph.galaxy_mode',
  0,
  {
    range: [0, 1],
    category: FLAG_CATEGORY,
    description: '銀河的 3D perspective(0=off / 1=on)。folder depth = z 軸として奥行き表現',
    tier: 0,
  },
);

/**
 * Wheel zoom 感度(PR-F G19、2026-05-06)。整数 [10, 200] で与えて内部で
 * 1/10000 倍する(integer 表現の方が flags inspector で扱いやすい)。
 *
 *   factor = exp(-deltaY × value × 0.0001)
 *
 * default 35 ≈ wheel notch 100 で 1.42×(以前の hard-coded 15 = 1.16×
 * の約 2.4 倍)。max 200 まで上げると 1 notch で 7.4× の超高感度。
 */
export const graphZoomWheelSensitivity = defineFlag<number>(
  'graph.zoom.wheel_sensitivity',
  35,
  {
    range: [10, 200],
    category: FLAG_CATEGORY,
    description: 'wheel zoom 感度(整数、内部で ×0.0001)。1 notch あたりの scale 変化率 ≈ exp(deltaY × value × 0.0001)',
    tier: 0,
  },
);

/**
 * Phase γ-B2:graph view の relation wire editor(edit mode)を有効化する。
 * ON で graph toolbar に View / Edit toggle が出て、edit mode では node 間
 * を drag して relation を作成できる。default OFF(従来の閲覧専用)。
 */
export const graphEditModeEnabled = defineFlag<boolean>(
  'graph.edit_mode_enabled',
  false,
  {
    category: FLAG_CATEGORY,
    description:
      'graph view の relation wire editor(node 間 drag で relation 作成)を有効化。OFF で従来の閲覧専用',
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
