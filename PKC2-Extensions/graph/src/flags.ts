/**
 * Graph tuning parameters — ported from PKC2 `features/graph/flags.ts`,
 * decoupled from the core flag registry. In the host product these were
 * resolved through the `?pkc-flag=` pipeline; in the standalone extension
 * they are plain mutable settings the UI can expose for live tuning.
 *
 * The zero-arg getter shape (`graphNodeRadiusFactor()`) is preserved so the
 * ported `graph-canvas.ts` consumes them unchanged.
 */

import type { ForceParams } from './force-layout';
import { DEFAULT_FORCE_PARAMS } from './force-layout';

export interface GraphSettings {
  linkDistance: number;
  linkStrength: number;
  charge: number;
  collideRadius: number;
  centerStrength: number;
  damping: number;
  maxSpeed: number;
  /** Initial simulation step count (full settle). */
  iterations: number;
  /** Node visual radius as a ratio of collideRadius (0.35 = label-priority). */
  nodeRadiusFactor: number;
  /** Galaxy 3D perspective: 0 = off (flat 2D), 1 = on (z = folder depth). */
  galaxyMode: number;
  /** Wheel zoom sensitivity (integer, internally ×0.0001). */
  zoomWheelSensitivity: number;
  /** Relation wire editor (drag between nodes to create relations). */
  editModeEnabled: boolean;
}

/**
 * Live, mutable graph settings. Defaults mirror the original PKC2 flag
 * defaults. Mutate fields (e.g. from a settings panel) and re-render to
 * apply.
 */
export const graphSettings: GraphSettings = {
  linkDistance: DEFAULT_FORCE_PARAMS.linkDistance,
  linkStrength: DEFAULT_FORCE_PARAMS.linkStrength,
  charge: DEFAULT_FORCE_PARAMS.charge,
  collideRadius: DEFAULT_FORCE_PARAMS.collideRadius,
  centerStrength: DEFAULT_FORCE_PARAMS.centerStrength,
  damping: DEFAULT_FORCE_PARAMS.damping,
  maxSpeed: DEFAULT_FORCE_PARAMS.maxSpeed,
  iterations: 400,
  nodeRadiusFactor: 0.35,
  galaxyMode: 0,
  zoomWheelSensitivity: 35,
  editModeEnabled: false,
};

export const graphNodeRadiusFactor = (): number => graphSettings.nodeRadiusFactor;
export const graphGalaxyMode = (): number => graphSettings.galaxyMode;
export const graphZoomWheelSensitivity = (): number => graphSettings.zoomWheelSensitivity;
export const graphIterations = (): number => graphSettings.iterations;
export const graphEditModeEnabled = (): boolean => graphSettings.editModeEnabled;

/**
 * Snapshot of force params at call time. Pass as `params` to the
 * simulation so it runs with consistent values throughout an iteration.
 */
export function getGraphForceParams(width: number, height: number): ForceParams {
  return {
    linkDistance: graphSettings.linkDistance,
    linkStrength: graphSettings.linkStrength,
    charge: graphSettings.charge,
    collideRadius: graphSettings.collideRadius,
    centerStrength: graphSettings.centerStrength,
    centerX: width / 2,
    centerY: height / 2,
    damping: graphSettings.damping,
    maxSpeed: graphSettings.maxSpeed,
  };
}
