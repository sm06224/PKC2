/**
 * @vitest-environment happy-dom
 *
 * Covers the paste-surface optimization pipeline end-to-end using
 * injected Canvas / confirm-UI mocks (happy-dom has no WebP toBlob).
 *
 * Maps to behavior contract §7 examples 7-1 through 7-9.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prepareOptimizedPaste } from '@adapter/ui/image-optimize/paste-optimization';
import type { OptimizeResult } from '@adapter/ui/image-optimize/optimizer';
import type { OptimizeConfirmResult } from '@adapter/ui/image-optimize/confirm-ui';
import {
  clearPreference,
  setPreference,
} from '@adapter/ui/image-optimize/preference-store';

function makeFile(size: number, mime: string, name = 'screenshot.png'): File {
  // happy-dom's File implementation honours size via the provided buffer.
  const buf = new Uint8Array(size).fill(0x41);
  return new File([buf], name, { type: mime });
}

function okOptimizer(optimizedSize: number, resized = true) {
  return vi.fn(async (_file: File): Promise<OptimizeResult | null> => ({
    blob: new Blob([new Uint8Array(optimizedSize)], { type: 'image/webp' }),
    originalDimensions: { width: 3440, height: 1440 },
    optimizedDimensions: { width: 2560, height: 1073 },
    resized,
  }));
}

function falseAlpha() {
  return vi.fn(async () => false);
}

function trueAlpha() {
  return vi.fn(async () => true);
}

function confirmAs(result: OptimizeConfirmResult) {
  return vi.fn(async () => result);
}

beforeEach(() => {
  localStorage.clear();
  clearPreference('paste');
});

describe('prepareOptimizedPaste', () => {
  it('passes through below-threshold images silently', async () => {
    const file = makeFile(200 * 1024, 'image/png', 'small.png');
    const toast = vi.fn();
    const optimizer = okOptimizer(10);
    const confirm = confirmAs({ action: 'optimize', keepOriginal: false, remember: false });

    const payload = await prepareOptimizedPaste(file, 'ORIGINAL_B64', {
      optimizerImpl: optimizer,
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: toast,
    });

    expect(payload.assetData).toBe('ORIGINAL_B64');
    expect(payload.optimizationMeta).toBeUndefined();
    expect(payload.originalAssetData).toBeUndefined();
    expect(optimizer).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('candidate path: optimize + decline original keep', async () => {
    const file = makeFile(2_900_000, 'image/png');
    const optimizer = okOptimizer(460_800);
    const confirm = confirmAs({ action: 'optimize', keepOriginal: false, remember: false });
    const toast = vi.fn();

    const payload = await prepareOptimizedPaste(file, 'ORIGINAL_B64', {
      optimizerImpl: optimizer,
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: toast,
    });

    expect(payload.mime).toBe('image/webp');
    expect(payload.size).toBe(460_800);
    expect(payload.assetData).not.toBe('ORIGINAL_B64');
    expect(payload.originalAssetData).toBeUndefined();
    expect(payload.optimizationMeta?.originalMime).toBe('image/png');
    expect(payload.optimizationMeta?.originalSize).toBe(2_900_000);
    expect(payload.optimizationMeta?.resized).toBe(true);
  });

  it('keep-original opt-in attaches the original asset data', async () => {
    const file = makeFile(2_900_000, 'image/png');
    const optimizer = okOptimizer(460_800);
    const confirm = confirmAs({ action: 'optimize', keepOriginal: true, remember: false });

    const payload = await prepareOptimizedPaste(file, 'ORIGINAL_B64', {
      optimizerImpl: optimizer,
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: vi.fn(),
    });

    expect(payload.originalAssetData).toBe('ORIGINAL_B64');
    expect(payload.optimizationMeta).toBeDefined();
    expect(payload.mime).toBe('image/webp');
  });

  it('remembered optimize preference runs silent with toast', async () => {
    setPreference('paste', { action: 'optimize', keepOriginal: false });
    const file = makeFile(2_000_000, 'image/png');
    const optimizer = okOptimizer(350_000);
    const confirm = confirmAs({ action: 'decline', keepOriginal: false, remember: false });
    const toast = vi.fn();

    const payload = await prepareOptimizedPaste(file, 'ORIGINAL_B64', {
      optimizerImpl: optimizer,
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: toast,
    });

    expect(payload.mime).toBe('image/webp');
    expect(payload.size).toBe(350_000);
    expect(payload.originalAssetData).toBeUndefined();
    expect(confirm).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
    const firstArg = toast.mock.calls[0]![0]!;
    expect(firstArg.kind).toBe('info');
    expect(firstArg.message).toMatch(/最適化して保存しました/);
  });

  it('remembered decline preference passes through without confirm', async () => {
    setPreference('paste', { action: 'decline', keepOriginal: false });
    const file = makeFile(2_000_000, 'image/png');
    const optimizer = okOptimizer(350_000);
    const confirm = confirmAs({ action: 'optimize', keepOriginal: false, remember: false });

    const payload = await prepareOptimizedPaste(file, 'ORIGINAL_B64', {
      optimizerImpl: optimizer,
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: vi.fn(),
    });

    expect(payload.assetData).toBe('ORIGINAL_B64');
    expect(payload.optimizationMeta).toBeUndefined();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('transparent PNG is passed through (alpha detected)', async () => {
    const file = makeFile(1_500_000, 'image/png', 'logo.png');
    const optimizer = okOptimizer(100_000);
    const toast = vi.fn();

    const payload = await prepareOptimizedPaste(file, 'ORIGINAL_B64', {
      optimizerImpl: optimizer,
      alphaCheckImpl: trueAlpha(),
      confirmImpl: confirmAs({ action: 'optimize', keepOriginal: false, remember: false }),
      toastImpl: toast,
    });

    expect(payload.assetData).toBe('ORIGINAL_B64');
    expect(payload.optimizationMeta).toBeUndefined();
    expect(optimizer).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      message: '透過画像のため最適化をスキップしました',
      kind: 'info',
    });
  });

  it('unsupported format (GIF) is passed through silently', async () => {
    const file = makeFile(800_000, 'image/gif', 'anim.gif');
    const optimizer = okOptimizer(500_000);
    const confirm = confirmAs({ action: 'optimize', keepOriginal: false, remember: false });
    const toast = vi.fn();

    const payload = await prepareOptimizedPaste(file, 'ORIGINAL_B64', {
      optimizerImpl: optimizer,
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: toast,
    });

    expect(payload.assetData).toBe('ORIGINAL_B64');
    expect(optimizer).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('Canvas failure falls back to original with warn toast', async () => {
    const file = makeFile(2_000_000, 'image/png');
    const optimizer = vi.fn(async () => null);
    const toast = vi.fn();

    const payload = await prepareOptimizedPaste(file, 'ORIGINAL_B64', {
      optimizerImpl: optimizer,
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirmAs({ action: 'optimize', keepOriginal: false, remember: false }),
      toastImpl: toast,
    });

    expect(payload.assetData).toBe('ORIGINAL_B64');
    expect(payload.optimizationMeta).toBeUndefined();
    expect(toast).toHaveBeenCalledWith({
      message: '画像の最適化に失敗しました。元のまま保存します',
      kind: 'warn',
    });
  });

  it('size-guard: optimized >= original falls back to original', async () => {
    const file = makeFile(600_000, 'image/webp');
    const optimizer = okOptimizer(700_000);
    const toast = vi.fn();

    const payload = await prepareOptimizedPaste(file, 'ORIGINAL_B64', {
      optimizerImpl: optimizer,
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirmAs({ action: 'optimize', keepOriginal: false, remember: false }),
      toastImpl: toast,
    });

    expect(payload.assetData).toBe('ORIGINAL_B64');
    expect(payload.optimizationMeta).toBeUndefined();
    expect(toast).toHaveBeenCalledWith({
      message: 'この画像は既に十分小さいため、最適化をスキップしました',
      kind: 'info',
    });
  });

  it('decline from confirm UI preserves original', async () => {
    const file = makeFile(2_000_000, 'image/png');
    const payload = await prepareOptimizedPaste(file, 'ORIGINAL_B64', {
      optimizerImpl: okOptimizer(300_000),
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirmAs({ action: 'decline', keepOriginal: false, remember: false }),
      toastImpl: vi.fn(),
    });

    expect(payload.assetData).toBe('ORIGINAL_B64');
    expect(payload.optimizationMeta).toBeUndefined();
  });

  it('remember=true persists the preference for subsequent pastes', async () => {
    const file = makeFile(2_000_000, 'image/png');

    await prepareOptimizedPaste(file, 'ORIGINAL_B64', {
      optimizerImpl: okOptimizer(300_000),
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirmAs({ action: 'optimize', keepOriginal: true, remember: true }),
      toastImpl: vi.fn(),
    });

    const raw = localStorage.getItem('pkc2.imageOptimize.preference.paste');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.action).toBe('optimize');
    expect(parsed.keepOriginal).toBe(true);
  });
});
