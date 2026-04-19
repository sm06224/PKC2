/**
 * Tunable defaults for v1 image intake optimization.
 *
 * These are v1 default parameters, NOT fixed eternal constants.
 * See behavior contract §2-5 / §5-4 for the rationale.
 * Revisable with measurement feedback at implementation time.
 */

export const DEFAULT_WEBP_QUALITY = 0.85;
export const DEFAULT_MAX_LONG_EDGE = 2560;
export const DEFAULT_OPTIMIZATION_THRESHOLD = 512 * 1024;
export const DEFAULT_OUTPUT_MIME = 'image/webp';
