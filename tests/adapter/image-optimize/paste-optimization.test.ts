/**
 * @vitest-environment happy-dom
 *
 * Covers the surface-aware optimization pipeline end-to-end using
 * injected Canvas / confirm-UI mocks (happy-dom has no WebP toBlob).
 *
 * Phase 1 cases map to behavior contract §7 examples 7-1 through 7-9
 * (paste surface). Phase 2 adds drop/attach surface coverage and
 * surface-independence verification (D-IIO5 / contract §4-1-1 C2).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  prepareOptimizedIntake,
  buildAttachmentBodyMeta,
  buildAttachmentAssets,
  deriveDisplayFilename,
  type IntakePayload,
} from '@adapter/ui/image-optimize/paste-optimization';
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
  clearPreference('drop');
  clearPreference('attach');
});

describe('prepareOptimizedIntake (paste surface)', () => {
  it('passes through below-threshold images silently', async () => {
    const file = makeFile(200 * 1024, 'image/png', 'small.png');
    const toast = vi.fn();
    const optimizer = okOptimizer(10);
    const confirm = confirmAs({ action: 'optimize', keepOriginal: false, remember: false });

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
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

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
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

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
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

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
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

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
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

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
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

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
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

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
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

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
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
    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
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

    await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
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

describe('prepareOptimizedIntake (drop surface)', () => {
  it('drop surface optimize path returns the optimized payload', async () => {
    const file = makeFile(2_000_000, 'image/png');
    const optimizer = okOptimizer(350_000);
    const confirm = confirmAs({ action: 'optimize', keepOriginal: false, remember: false });

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'drop', {
      optimizerImpl: optimizer,
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: vi.fn(),
    });

    expect(payload.mime).toBe('image/webp');
    expect(payload.size).toBe(350_000);
    expect(payload.optimizationMeta).toBeDefined();
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('remembered drop preference runs silent on the drop surface', async () => {
    setPreference('drop', { action: 'optimize', keepOriginal: false });
    const file = makeFile(2_000_000, 'image/png');
    const confirm = confirmAs({ action: 'decline', keepOriginal: false, remember: false });

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'drop', {
      optimizerImpl: okOptimizer(400_000),
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: vi.fn(),
    });

    expect(payload.mime).toBe('image/webp');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('remember=true on drop surface persists under the drop key only', async () => {
    const file = makeFile(2_000_000, 'image/png');

    await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'drop', {
      optimizerImpl: okOptimizer(300_000),
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirmAs({ action: 'optimize', keepOriginal: false, remember: true }),
      toastImpl: vi.fn(),
    });

    expect(localStorage.getItem('pkc2.imageOptimize.preference.drop')).not.toBeNull();
    expect(localStorage.getItem('pkc2.imageOptimize.preference.paste')).toBeNull();
    expect(localStorage.getItem('pkc2.imageOptimize.preference.attach')).toBeNull();
  });
});

describe('prepareOptimizedIntake (attach surface)', () => {
  it('attach surface optimize path returns the optimized payload', async () => {
    const file = makeFile(2_000_000, 'image/png');
    const confirm = confirmAs({ action: 'optimize', keepOriginal: true, remember: false });

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'attach', {
      optimizerImpl: okOptimizer(350_000),
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: vi.fn(),
    });

    expect(payload.mime).toBe('image/webp');
    expect(payload.originalAssetData).toBe('ORIGINAL_B64');
    expect(payload.optimizationMeta?.originalSize).toBe(2_000_000);
  });

  it('remember=true on attach surface persists under the attach key only', async () => {
    const file = makeFile(2_000_000, 'image/png');

    await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'attach', {
      optimizerImpl: okOptimizer(300_000),
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirmAs({ action: 'decline', keepOriginal: false, remember: true }),
      toastImpl: vi.fn(),
    });

    expect(localStorage.getItem('pkc2.imageOptimize.preference.attach')).not.toBeNull();
    expect(localStorage.getItem('pkc2.imageOptimize.preference.paste')).toBeNull();
    expect(localStorage.getItem('pkc2.imageOptimize.preference.drop')).toBeNull();
  });
});

describe('prepareOptimizedIntake — surface independence (D-IIO5)', () => {
  it('paste preference does NOT influence the drop surface', async () => {
    setPreference('paste', { action: 'decline', keepOriginal: false });
    const file = makeFile(2_000_000, 'image/png');
    const confirm = confirmAs({ action: 'optimize', keepOriginal: false, remember: false });

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'drop', {
      optimizerImpl: okOptimizer(400_000),
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: vi.fn(),
    });

    // Drop surface must show the confirm UI even when paste has a remembered decline.
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(payload.mime).toBe('image/webp');
  });

  it('drop preference does NOT influence the attach surface', async () => {
    setPreference('drop', { action: 'optimize', keepOriginal: true });
    const file = makeFile(2_000_000, 'image/png');
    const confirm = confirmAs({ action: 'decline', keepOriginal: false, remember: false });

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'attach', {
      optimizerImpl: okOptimizer(400_000),
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: vi.fn(),
    });

    // Attach surface must still prompt; remembered drop=optimize must NOT auto-apply.
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(payload.assetData).toBe('ORIGINAL_B64');
    expect(payload.optimizationMeta).toBeUndefined();
  });

  it('attach preference does NOT influence the paste surface', async () => {
    setPreference('attach', { action: 'optimize', keepOriginal: true });
    const file = makeFile(2_000_000, 'image/png');
    const confirm = confirmAs({ action: 'decline', keepOriginal: false, remember: false });

    const payload = await prepareOptimizedIntake(file, 'ORIGINAL_B64', 'paste', {
      optimizerImpl: okOptimizer(400_000),
      alphaCheckImpl: falseAlpha(),
      confirmImpl: confirm,
      toastImpl: vi.fn(),
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(payload.assetData).toBe('ORIGINAL_B64');
  });
});

describe('buildAttachmentBodyMeta', () => {
  function passThroughPayload(): IntakePayload {
    return { assetData: 'B64', mime: 'application/pdf', size: 12345 };
  }

  function optimizedPayload(keepOriginal = false): IntakePayload {
    const payload: IntakePayload = {
      assetData: 'OPT_B64',
      mime: 'image/webp',
      size: 320_000,
      optimizationMeta: {
        originalMime: 'image/png',
        originalSize: 2_000_000,
        method: 'canvas-webp-lossy',
        quality: 0.85,
        resized: true,
        originalDimensions: { width: 3000, height: 2000 },
        optimizedDimensions: { width: 2560, height: 1707 },
      },
    };
    if (keepOriginal) payload.originalAssetData = 'ORIG_B64';
    return payload;
  }

  it('omits the optimized field when no optimization metadata is present', () => {
    const json = buildAttachmentBodyMeta('doc.pdf', 'att-1', passThroughPayload());
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({
      name: 'doc.pdf',
      mime: 'application/pdf',
      size: 12345,
      asset_key: 'att-1',
    });
    expect(parsed.optimized).toBeUndefined();
  });

  it('attaches optimized provenance when metadata is present', () => {
    const json = buildAttachmentBodyMeta('shot.png', 'att-9', optimizedPayload());
    const parsed = JSON.parse(json);
    expect(parsed.optimized).toBeDefined();
    expect(parsed.optimized.original_mime).toBe('image/png');
    expect(parsed.optimized.original_size).toBe(2_000_000);
    expect(parsed.optimized.method).toBe('canvas-webp-lossy');
    expect(parsed.optimized.quality).toBe(0.85);
    expect(parsed.optimized.resized).toBe(true);
    expect(parsed.optimized.original_asset_key).toBeUndefined();
  });

  it('includes original_asset_key when keep-original is set', () => {
    const json = buildAttachmentBodyMeta('shot.png', 'att-9', optimizedPayload(true));
    const parsed = JSON.parse(json);
    expect(parsed.optimized.original_asset_key).toBe('att-9__original');
  });
});

describe('buildAttachmentAssets', () => {
  it('returns a single-key map when no original is kept', () => {
    const assets = buildAttachmentAssets('att-1', {
      assetData: 'OPT', mime: 'image/webp', size: 100,
    });
    expect(assets).toEqual({ 'att-1': 'OPT' });
  });

  it('adds the __original suffix entry when keep-original is set', () => {
    const assets = buildAttachmentAssets('att-2', {
      assetData: 'OPT', mime: 'image/webp', size: 100, originalAssetData: 'ORIG',
    });
    expect(assets).toEqual({
      'att-2': 'OPT',
      'att-2__original': 'ORIG',
    });
  });
});

describe('deriveDisplayFilename', () => {
  it('rewrites extension when optimized to WebP', () => {
    expect(deriveDisplayFilename('screenshot.png', 'image/webp')).toBe('screenshot.webp');
    expect(deriveDisplayFilename('photo.jpg', 'image/webp')).toBe('photo.webp');
    expect(deriveDisplayFilename('photo.jpeg', 'image/webp')).toBe('photo.webp');
  });

  it('leaves filename unchanged when extension already matches MIME', () => {
    expect(deriveDisplayFilename('photo.webp', 'image/webp')).toBe('photo.webp');
    expect(deriveDisplayFilename('icon.png', 'image/png')).toBe('icon.png');
    expect(deriveDisplayFilename('pic.jpg', 'image/jpeg')).toBe('pic.jpg');
    expect(deriveDisplayFilename('pic.jpeg', 'image/jpeg')).toBe('pic.jpeg');
  });

  it('is case-insensitive on current extension', () => {
    expect(deriveDisplayFilename('shot.PNG', 'image/webp')).toBe('shot.webp');
    expect(deriveDisplayFilename('pic.JPG', 'image/webp')).toBe('pic.webp');
  });

  it('appends extension when filename has no extension', () => {
    expect(deriveDisplayFilename('screenshot', 'image/webp')).toBe('screenshot.webp');
  });

  it('preserves multi-dot basename', () => {
    expect(deriveDisplayFilename('my.image.v2.png', 'image/webp')).toBe('my.image.v2.webp');
  });

  it('returns filename unchanged for non-image MIME', () => {
    expect(deriveDisplayFilename('report.pdf', 'application/pdf')).toBe('report.pdf');
    expect(deriveDisplayFilename('notes.txt', 'text/plain')).toBe('notes.txt');
    expect(deriveDisplayFilename('archive.zip', 'application/zip')).toBe('archive.zip');
  });

  it('returns filename unchanged for unknown image MIME', () => {
    expect(deriveDisplayFilename('img.tiff', 'image/tiff')).toBe('img.tiff');
  });

  it('returns filename unchanged for empty MIME or empty name', () => {
    expect(deriveDisplayFilename('', 'image/webp')).toBe('');
    expect(deriveDisplayFilename('shot.png', '')).toBe('shot.png');
  });

  it('does not strip leading-dot filenames (.htaccess style)', () => {
    expect(deriveDisplayFilename('.htaccess', 'image/webp')).toBe('.htaccess.webp');
  });
});
