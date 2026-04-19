/**
 * Orchestrates the paste-surface optimization pipeline described in
 * behavior contract §2-1. Consumes a File + its already-computed
 * original base64, returns a payload that describes what to
 * dispatch (optimized vs original, optional original-kept asset,
 * optional provenance metadata).
 *
 * This function is deliberately kept side-effect-aware (toasts,
 * Canvas, localStorage) but pure-in-shape: no state-machine
 * dispatch, no DOM fiddling outside confirm-ui. The caller decides
 * how to turn the payload into a PASTE_ATTACHMENT action.
 */

import { classifyIntakeCandidate } from '@features/image-optimize/classifier';
import {
  DEFAULT_MAX_LONG_EDGE,
  DEFAULT_OPTIMIZATION_THRESHOLD,
  DEFAULT_OUTPUT_MIME,
  DEFAULT_WEBP_QUALITY,
} from '@features/image-optimize/config';
import { blobToBase64, hasAlphaChannel, optimizeImage, type OptimizeResult } from './optimizer';
import { getPreference, setPreference } from './preference-store';
import { showOptimizeConfirm, type OptimizeConfirmResult } from './confirm-ui';
import { showToast } from '../toast';

export interface OptimizationMeta {
  originalMime: string;
  originalSize: number;
  method: string;
  quality: number;
  resized: boolean;
  originalDimensions: { width: number; height: number };
  optimizedDimensions: { width: number; height: number };
}

export interface PastePayload {
  /** base64 to store as the primary asset. */
  assetData: string;
  /** MIME type of the primary asset. */
  mime: string;
  /** Byte size (decoded) of the primary asset. */
  size: number;
  /** Original asset base64 when keep-original is opted in. */
  originalAssetData?: string;
  /** Provenance metadata when optimization was actually applied. */
  optimizationMeta?: OptimizationMeta;
}

export interface PasteOptimizeOptions {
  quality?: number;
  maxLongEdge?: number;
  threshold?: number;
  outputMime?: string;
  /** Test hook: inject a custom optimizer (no real Canvas). */
  optimizerImpl?: typeof optimizeImage;
  /** Test hook: inject an alpha-check impl. */
  alphaCheckImpl?: typeof hasAlphaChannel;
  /** Test hook: inject a confirm UI that resolves programmatically. */
  confirmImpl?: typeof showOptimizeConfirm;
  /** Test hook: silence toast calls. */
  toastImpl?: typeof showToast;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildMeta(
  file: File,
  result: OptimizeResult,
  quality: number,
): OptimizationMeta {
  return {
    originalMime: file.type || 'application/octet-stream',
    originalSize: file.size,
    method: 'canvas-webp-lossy',
    quality,
    resized: result.resized,
    originalDimensions: result.originalDimensions,
    optimizedDimensions: result.optimizedDimensions,
  };
}

function passThrough(
  file: File,
  originalBase64: string,
  originalSize: number,
): PastePayload {
  return {
    assetData: originalBase64,
    mime: file.type || 'application/octet-stream',
    size: originalSize,
  };
}

export async function prepareOptimizedPaste(
  file: File,
  originalBase64: string,
  options: PasteOptimizeOptions = {},
): Promise<PastePayload> {
  const quality = options.quality ?? DEFAULT_WEBP_QUALITY;
  const maxLongEdge = options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const threshold = options.threshold ?? DEFAULT_OPTIMIZATION_THRESHOLD;
  const outputMime = options.outputMime ?? DEFAULT_OUTPUT_MIME;
  const optimizerFn = options.optimizerImpl ?? optimizeImage;
  const alphaFn = options.alphaCheckImpl ?? hasAlphaChannel;
  const confirmFn = options.confirmImpl ?? showOptimizeConfirm;
  const toastFn = options.toastImpl ?? showToast;

  // Step [2]: classify
  const cls = classifyIntakeCandidate(file.type);
  if (cls !== 'candidate') {
    return passThrough(file, originalBase64, file.size);
  }

  // Step [3]: threshold
  if (file.size < threshold) {
    return passThrough(file, originalBase64, file.size);
  }

  // Step [4]: alpha check (PNG only — other candidates treated as opaque)
  if (file.type.toLowerCase() === 'image/png') {
    const hasAlpha = await alphaFn(file);
    if (hasAlpha) {
      toastFn({ message: '透過画像のため最適化をスキップしました', kind: 'info' });
      return passThrough(file, originalBase64, file.size);
    }
  }

  // Step [5]: optimize
  const result = await optimizerFn(file, { quality, maxLongEdge, outputMime });
  if (!result) {
    toastFn({ message: '画像の最適化に失敗しました。元のまま保存します', kind: 'warn' });
    return passThrough(file, originalBase64, file.size);
  }

  const optimizedSize = result.blob.size;

  // Step [6]: size guard — optimization cost outweighs benefit
  if (optimizedSize >= file.size) {
    toastFn({
      message: 'この画像は既に十分小さいため、最適化をスキップしました',
      kind: 'info',
    });
    return passThrough(file, originalBase64, file.size);
  }

  const optimizedBase64 = await blobToBase64(result.blob);
  const meta = buildMeta(file, result, quality);

  // Step [7a]: remembered-preference silent path (paste surface only)
  const pref = getPreference('paste');
  if (pref) {
    if (pref.action === 'optimize') {
      toastFn({
        message: `画像を最適化して保存しました: ${formatSize(file.size)} → ${formatSize(optimizedSize)}`,
        kind: 'info',
      });
      return {
        assetData: optimizedBase64,
        mime: outputMime,
        size: optimizedSize,
        originalAssetData: pref.keepOriginal ? originalBase64 : undefined,
        optimizationMeta: meta,
      };
    }
    // pref.action === 'decline' — user opted out; save original silently.
    return passThrough(file, originalBase64, file.size);
  }

  // Step [7b]: confirm UI
  const choice: OptimizeConfirmResult = await confirmFn({
    filename: file.name,
    originalSize: file.size,
    optimizedSize,
    originalDimensions: result.originalDimensions,
    optimizedDimensions: result.optimizedDimensions,
    resized: result.resized,
  });

  if (choice.remember) {
    setPreference('paste', { action: choice.action, keepOriginal: choice.keepOriginal });
  }

  if (choice.action === 'optimize') {
    return {
      assetData: optimizedBase64,
      mime: outputMime,
      size: optimizedSize,
      originalAssetData: choice.keepOriginal ? originalBase64 : undefined,
      optimizationMeta: meta,
    };
  }

  // decline
  return passThrough(file, originalBase64, file.size);
}
