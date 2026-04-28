/**
 * Canvas + WebP image optimizer for intake pipeline.
 *
 * All Canvas/ImageBitmap interactions are contained here so the
 * orchestrator (paste-optimization.ts) can be unit-tested by
 * dependency-injection without needing a real browser.
 *
 * Contract: every public function returns null / false / the
 * fallback value when the browser API is unavailable or fails.
 * Callers treat that as "skip optimization, save original".
 *
 * PR #187 (2026-04-28): the heavy `createImageBitmap` + canvas
 * decode/resize/encode now runs in a worker via `OffscreenCanvas`
 * when available (`./optimize-worker-client.ts`). The main-thread
 * path below is the fallback for older Safari and any environment
 * where Worker / OffscreenCanvas construction fails. The choice
 * is transparent to callers — same async signature, same result
 * shape — so the worker handoff cannot regress correctness; only
 * wall-clock differs.
 *
 * See behavior contract §2-5 for v1 default parameters.
 */

import {
  optimizeImageInWorker,
  hasAlphaChannelInWorker,
} from './optimize-worker-client';

export interface OptimizeParams {
  quality: number;
  maxLongEdge: number;
  outputMime: string;
}

export interface OptimizeResult {
  blob: Blob;
  originalDimensions: { width: number; height: number };
  optimizedDimensions: { width: number; height: number };
  resized: boolean;
}

async function safeCreateImageBitmap(source: Blob): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(source);
  } catch {
    return null;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

async function optimizeImageOnMainThread(file: File, params: OptimizeParams): Promise<OptimizeResult | null> {
  const bitmap = await safeCreateImageBitmap(file);
  if (!bitmap) return null;

  try {
    const { width, height } = bitmap;
    if (width <= 0 || height <= 0) return null;

    const longEdge = Math.max(width, height);
    const resized = longEdge > params.maxLongEdge;
    const scale = resized ? params.maxLongEdge / longEdge : 1;
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, outW, outH);

    const blob = await canvasToBlob(canvas, params.outputMime, params.quality);
    if (!blob) return null;

    return {
      blob,
      originalDimensions: { width, height },
      optimizedDimensions: { width: outW, height: outH },
      resized,
    };
  } finally {
    try {
      bitmap.close();
    } catch {
      // older engines may not implement close(); ignore
    }
  }
}

export async function optimizeImage(file: File, params: OptimizeParams): Promise<OptimizeResult | null> {
  // Worker-first. Returns null when the worker is unavailable
  // (OffscreenCanvas missing, Worker blocked, etc.) — fall back to
  // the main-thread path so the result is identical in shape.
  const viaWorker = await optimizeImageInWorker(file, params);
  if (viaWorker) return viaWorker;
  return optimizeImageOnMainThread(file, params);
}

/**
 * Detect whether an image has a non-opaque alpha channel.
 *
 * v1 Phase 1: full Canvas.getImageData scan. For a 4K (3840x2160)
 * screenshot this is ~8M bytes walked once per paste — well under
 * the contract's latency budget. If future measurement shows this
 * is hot, a sampled variant can replace it without API changes.
 *
 * Returns false on any failure (safe default: proceed to optimize).
 */
async function hasAlphaChannelOnMainThread(file: File): Promise<boolean> {
  const bitmap = await safeCreateImageBitmap(file);
  if (!bitmap) return false;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(bitmap, 0, 0);
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    } catch {
      return false;
    }
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! < 255) return true;
    }
    return false;
  } finally {
    try {
      bitmap.close();
    } catch {
      // ignore
    }
  }
}

export async function hasAlphaChannel(file: File): Promise<boolean> {
  const viaWorker = await hasAlphaChannelInWorker(file);
  if (viaWorker !== null) return viaWorker;
  return hasAlphaChannelOnMainThread(file);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, Math.min(i + chunk, bytes.length)) as unknown as number[],
    );
  }
  return btoa(binary);
}
