/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  optimizeImageInWorker,
  hasAlphaChannelInWorker,
} from '@adapter/ui/image-optimize/optimize-worker-client';

/**
 * PR #187 — image optimize worker client contract.
 *
 * happy-dom does NOT implement OffscreenCanvas (and Worker is at best
 * a thin stub), so the buildWorker path returns null on first call
 * and the test environment routes everything through the
 * main-thread fallback in `optimizer.ts`. The worker client itself
 * surfaces this as `null`, signalling "fall back to main".
 *
 * These tests pin the **contract** the orchestrator depends on:
 *   1. Both functions return null when the worker is unavailable
 *      (guard for the fallback in `optimizer.ts`).
 *   2. The functions are async (they exclusively return a Promise).
 *
 * The end-to-end correctness of `optimizeImage` / `hasAlphaChannel`
 * is exercised by `tests/features/image-optimize/*.test.ts` against
 * the main-thread implementation; once happy-dom grows OffscreenCanvas
 * support, a parallel worker-path test can be added there.
 */

describe('optimize-worker-client (PR #187)', () => {
  it('optimizeImageInWorker returns null when OffscreenCanvas / Worker unavailable', async () => {
    const file = new File(['stub'], 'mini.png', { type: 'image/png' });
    const result = await optimizeImageInWorker(file, {
      quality: 0.8,
      maxLongEdge: 2048,
      outputMime: 'image/webp',
    });
    expect(result).toBeNull();
  });

  it('hasAlphaChannelInWorker returns null when OffscreenCanvas / Worker unavailable', async () => {
    const file = new File(['stub'], 'mini.png', { type: 'image/png' });
    const result = await hasAlphaChannelInWorker(file);
    expect(result).toBeNull();
  });

  it('returns Promise (caller pattern: await + null-check)', () => {
    const file = new File(['stub'], 'mini.png', { type: 'image/png' });
    const opt = optimizeImageInWorker(file, {
      quality: 0.8, maxLongEdge: 2048, outputMime: 'image/webp',
    });
    const alpha = hasAlphaChannelInWorker(file);
    expect(opt).toBeInstanceOf(Promise);
    expect(alpha).toBeInstanceOf(Promise);
  });
});
