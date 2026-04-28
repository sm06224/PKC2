/**
 * Image optimize worker — main-thread coordinator (PR #187).
 *
 * Moves the heavy canvas operations (`createImageBitmap` →
 * resize/encode via `OffscreenCanvas` → `convertToBlob`) off the
 * main thread. For 30 × 5 MB images the per-file optimize step
 * historically blocked the main thread for 200-500 ms each — total
 * ~9-15 s of jank during a burst attach.
 *
 * Architecture mirrors `attach-worker-client.ts`:
 *   - Single inline `Blob` worker, lazy-built on first request.
 *   - Sequential per-message processing.
 *   - Falls back to the main-thread implementation (pre-PR-187 code
 *     in `optimizer.ts`) when:
 *       a. `Worker` / `Blob` / `URL.createObjectURL` is unavailable
 *       b. `OffscreenCanvas` is unavailable inside the worker
 *       c. The worker constructor or any postMessage round-trip fails
 *
 * Browser support for OffscreenCanvas:
 *   - Chrome / Edge 69+
 *   - Safari 16.4+
 *   - Firefox 105+
 * Older Safari hits the main-thread fallback transparently.
 *
 * Confirmation dialogs (`showOptimizeConfirm`) stay in
 * `paste-optimization.ts` on the main thread — per the user
 * direction "画像の最適化が発生してダイアログを出す場合はユーザーの
 * 編集を邪魔してもいい". Only the CPU-heavy decode + resize is moved.
 */

import type { OptimizeParams, OptimizeResult } from './optimizer';

type OptimizeOk = {
  ok: true;
  blob: Blob;
  originalDimensions: { width: number; height: number };
  optimizedDimensions: { width: number; height: number };
  resized: boolean;
};
type OptimizeFail = { ok: false; message: string };

type AlphaOk = { ok: true; hasAlpha: boolean };
type AlphaFail = { ok: false; message: string };

let workerInstance: Worker | null = null;
let workerFailed = false;
let nextRequestId = 0;
const pending = new Map<number, {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}>();

/**
 * Worker logic. Self-contained — captured outer scope is invisible
 * inside the worker, so all helpers must inline here.
 */
function workerSource(): void {
  async function optimize(
    file: File,
    params: { quality: number; maxLongEdge: number; outputMime: string },
  ): Promise<{
    blob: Blob;
    originalDimensions: { width: number; height: number };
    optimizedDimensions: { width: number; height: number };
    resized: boolean;
  } | null> {
    if (typeof createImageBitmap !== 'function') return null;
    if (typeof OffscreenCanvas === 'undefined') return null;
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return null;
    }
    try {
      const { width, height } = bitmap;
      if (width <= 0 || height <= 0) return null;
      const longEdge = Math.max(width, height);
      const resized = longEdge > params.maxLongEdge;
      const scale = resized ? params.maxLongEdge / longEdge : 1;
      const outW = Math.max(1, Math.round(width * scale));
      const outH = Math.max(1, Math.round(height * scale));
      const canvas = new OffscreenCanvas(outW, outH);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = (canvas.getContext('2d') as any) as OffscreenCanvasRenderingContext2D | null;
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, outW, outH);
      let blob: Blob;
      try {
        blob = await canvas.convertToBlob({ type: params.outputMime, quality: params.quality });
      } catch {
        return null;
      }
      return {
        blob,
        originalDimensions: { width, height },
        optimizedDimensions: { width: outW, height: outH },
        resized,
      };
    } finally {
      try { bitmap?.close(); } catch { /* ignore */ }
    }
  }

  async function hasAlpha(file: File): Promise<boolean> {
    if (typeof createImageBitmap !== 'function') return false;
    if (typeof OffscreenCanvas === 'undefined') return false;
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return false;
    }
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = (canvas.getContext('2d') as any) as OffscreenCanvasRenderingContext2D | null;
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
      try { bitmap?.close(); } catch { /* ignore */ }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).onmessage = async (e: MessageEvent): Promise<void> => {
    const data = e.data as {
      id: number;
      kind: 'optimize' | 'hasAlpha';
      file: File;
      params?: { quality: number; maxLongEdge: number; outputMime: string };
    };
    try {
      if (data.kind === 'optimize') {
        const result = await optimize(data.file, data.params!);
        if (!result) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (self as any).postMessage({ id: data.id, ok: false, message: 'optimize-unsupported' });
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (self as any).postMessage({ id: data.id, ok: true, ...result });
      } else if (data.kind === 'hasAlpha') {
        const result = await hasAlpha(data.file);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (self as any).postMessage({ id: data.id, ok: true, hasAlpha: result });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (self as any).postMessage({ id: data.id, ok: false, message });
    }
  };
}

function buildWorker(): Worker | null {
  if (typeof Worker === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return null;
  }
  // OffscreenCanvas in the global scope is a strong hint the worker
  // will also have it. (Workers and the main thread share platform
  // capabilities in the browsers we care about.)
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    const source = `(${workerSource.toString()})()`;
    const blob = new Blob([source], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    worker.onmessage = (e: MessageEvent): void => {
      const data = e.data as { id: number; ok: boolean; message?: string } & Record<string, unknown>;
      const handlers = pending.get(data.id);
      if (!handlers) return;
      pending.delete(data.id);
      if (data.ok) {
        handlers.resolve(data);
      } else {
        handlers.reject(new Error(data.message ?? 'image worker reported failure'));
      }
    };
    worker.onerror = (e: ErrorEvent): void => {
      console.warn('[PKC2] image-optimize worker error:', e.message);
      for (const [id, handlers] of pending) {
        pending.delete(id);
        handlers.reject(new Error(`image worker error: ${e.message}`));
      }
      workerFailed = true;
      workerInstance = null;
    };
    return worker;
  } catch (err) {
    console.warn('[PKC2] image-optimize worker construction failed:', err);
    return null;
  }
}

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (!workerInstance) {
    workerInstance = buildWorker();
    if (!workerInstance) workerFailed = true;
  }
  return workerInstance;
}

function postRequest<T>(payload: { kind: 'optimize' | 'hasAlpha'; file: File; params?: OptimizeParams }): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = getWorker();
    if (!worker) {
      reject(new Error('image-optimize worker unavailable'));
      return;
    }
    const id = ++nextRequestId;
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    worker.postMessage({ id, ...payload });
  });
}

/**
 * Worker-backed image optimize. Returns null when:
 *   - worker unavailable / construction failed
 *   - OffscreenCanvas unsupported in this engine
 *   - the per-file conversion failed (corrupt image, unsupported codec)
 *
 * Callers (`paste-optimization.ts`) treat null as "fall back to the
 * main-thread `optimizeImage` (pre-PR-187 path)".
 */
export async function optimizeImageInWorker(
  file: File,
  params: OptimizeParams,
): Promise<OptimizeResult | null> {
  try {
    const result = await postRequest<OptimizeOk | OptimizeFail>({ kind: 'optimize', file, params });
    if (!result.ok) return null;
    return {
      blob: result.blob,
      originalDimensions: result.originalDimensions,
      optimizedDimensions: result.optimizedDimensions,
      resized: result.resized,
    };
  } catch {
    return null;
  }
}

export async function hasAlphaChannelInWorker(file: File): Promise<boolean | null> {
  try {
    const result = await postRequest<AlphaOk | AlphaFail>({ kind: 'hasAlpha', file });
    if (!result.ok) return null;
    return result.hasAlpha;
  } catch {
    return null;
  }
}

export function __resetImageOptimizeWorkerForTest(): void {
  if (workerInstance) {
    try { workerInstance.terminate(); } catch { /* ignore */ }
  }
  workerInstance = null;
  workerFailed = false;
  pending.clear();
}
