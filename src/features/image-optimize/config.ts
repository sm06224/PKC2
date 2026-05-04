/**
 * Tunable defaults for v1 image intake optimization.
 *
 * These are v1 default parameters, NOT fixed eternal constants.
 * See behavior contract §2-5 / §5-4 for the rationale.
 * Revisable with measurement feedback at implementation time.
 */

import { defineFlag } from '../../core/flags';

export const DEFAULT_WEBP_QUALITY = 0.85;

export const DEFAULT_MAX_LONG_EDGE = defineFlag<number>(
  'image.max_long_edge',
  2560,
  {
    range: [256, 8192],
    category: 'storage',
    description: '画像 optimize 後の最大長辺ピクセル。低いほど bundle 軽量、高いほど画質優先',
    tier: 0,
  },
);

export const DEFAULT_OPTIMIZATION_THRESHOLD = defineFlag<number>(
  'image.optimize_threshold_bytes',
  512 * 1024,
  {
    range: [1024, 50 * 1024 * 1024],
    category: 'storage',
    description: '画像 optimize 起動 threshold (bytes)。これ以上のサイズで auto-optimize',
    tier: 0,
  },
);

export const DEFAULT_OUTPUT_MIME = 'image/webp';
