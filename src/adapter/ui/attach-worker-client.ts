/**
 * Multi-file attach worker — main-thread coordinator (PR #184).
 *
 * The worker handles per-file CPU work that previously blocked the
 * main thread:
 *   1. File → ArrayBuffer (FileReader.readAsDataURL is available in
 *      workers; the C++-side base64 conversion happens off-main as
 *      well)
 *   2. fnv1a64Hex on the resulting base64 string (~30 ms / 5 MB)
 *
 * Main thread retains all DOM-bound work:
 *   - dispatcher.dispatch(CREATE_ENTRY / COMMIT_EDIT)
 *   - render
 *   - the dedupe-toast emission (data-pkc-* DOM mutation)
 *
 * Architecture:
 *   - One worker per browsing context, lazy-created on first request.
 *   - Sequential processing (one file at a time) inside the worker so
 *     the worker heap doesn't peak at N × file size for burst drops.
 *     Main thread orchestrates by sending the next file when the
 *     previous result arrives.
 *   - Inline `Blob` worker so the IIFE single-HTML build still works.
 *     Vite cannot emit a separate worker chunk under
 *     `inlineDynamicImports: true`; we stringify a top-level function
 *     and feed it through `URL.createObjectURL`.
 *
 * Failure mode: if Worker construction fails (e.g. CSP blocks blob:
 * URLs, ancient browser without Worker support), `processFileViaWorker`
 * falls back to running the same logic on the main thread. Behaviour
 * is correct either way; only wall-clock differs.
 */

export interface ProcessedFile {
  base64: string;
  hash: string;
  mime: string;
  size: number;
}

let workerInstance: Worker | null = null;
let workerFailed = false;
let nextRequestId = 0;
const pending = new Map<number, {
  resolve: (value: ProcessedFile) => void;
  reject: (error: Error) => void;
}>();

/**
 * Worker logic. Defined as a top-level function so we can stringify
 * it via `Function.prototype.toString` and inject the source into a
 * `Blob` URL. Keep it self-contained — anything captured from outer
 * scope is invisible inside the worker.
 *
 * The function is invoked as `(<source>)()` inside the worker, so
 * `self.onmessage` is registered immediately on worker boot.
 */
function workerSource(): void {
  // FNV-1a 64-bit (mirrors src/core/operations/hash.ts; inlined so
  // the worker has no import). 16-char lowercase hex.
  const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
  const FNV64_PRIME = 0x100000001b3n;
  const FNV64_MASK = 0xffffffffffffffffn;

  function utf8Encode(input: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < input.length; i++) {
      let cp = input.charCodeAt(i);
      if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < input.length) {
        const low = input.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }
      if (cp < 0x80) {
        out.push(cp);
      } else if (cp < 0x800) {
        out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
      } else if (cp < 0x10000) {
        out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
      } else {
        out.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f),
        );
      }
    }
    return out;
  }

  function fnv1a64Hex(input: string): string {
    let hash = FNV64_OFFSET_BASIS;
    const bytes = utf8Encode(input);
    for (let i = 0; i < bytes.length; i++) {
      hash ^= BigInt(bytes[i]!);
      hash = (hash * FNV64_PRIME) & FNV64_MASK;
    }
    return hash.toString(16).padStart(16, '0');
  }

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result;
        if (typeof url !== 'string') {
          reject(new Error('FileReader.result was not a string'));
          return;
        }
        const comma = url.indexOf(',');
        resolve(comma >= 0 ? url.slice(comma + 1) : url);
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsDataURL(file);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).onmessage = async (e: MessageEvent): Promise<void> => {
    const data = e.data as { id: number; file: File };
    try {
      const base64 = await readFileAsBase64(data.file);
      const hash = fnv1a64Hex(base64);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (self as any).postMessage({
        id: data.id,
        ok: true,
        base64,
        hash,
        mime: data.file.type || 'application/octet-stream',
        size: data.file.size,
      });
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
  try {
    const source = `(${workerSource.toString()})()`;
    const blob = new Blob([source], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    // Don't revoke immediately — some browsers race the worker's
    // load against revocation. Revoke after the worker boots.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    worker.onmessage = (e: MessageEvent): void => {
      const data = e.data as {
        id: number;
        ok: boolean;
        base64?: string;
        hash?: string;
        mime?: string;
        size?: number;
        message?: string;
      };
      const handlers = pending.get(data.id);
      if (!handlers) return;
      pending.delete(data.id);
      if (data.ok && data.base64 !== undefined && data.hash !== undefined) {
        handlers.resolve({
          base64: data.base64,
          hash: data.hash,
          mime: data.mime ?? 'application/octet-stream',
          size: data.size ?? 0,
        });
      } else {
        handlers.reject(new Error(data.message ?? 'worker reported failure'));
      }
    };
    worker.onerror = (e: ErrorEvent): void => {
      console.warn('[PKC2] attach worker error:', e.message);
      // Reject all pending requests; future calls fall back to main
      // thread via the workerFailed flag.
      for (const [id, handlers] of pending) {
        pending.delete(id);
        handlers.reject(new Error(`attach worker error: ${e.message}`));
      }
      workerFailed = true;
      workerInstance = null;
    };
    return worker;
  } catch (err) {
    console.warn('[PKC2] attach worker construction failed:', err);
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

/**
 * Main-thread fallback that mirrors the worker's behaviour. Used when
 * Worker construction fails or as the single-file path bypass.
 */
async function processOnMainThread(file: File): Promise<ProcessedFile> {
  const { fileToBase64 } = await import('./file-to-base64');
  const { fnv1a64Hex } = await import('../../core/operations/hash');
  const base64 = await fileToBase64(file);
  const hash = fnv1a64Hex(base64);
  return {
    base64,
    hash,
    mime: file.type || 'application/octet-stream',
    size: file.size,
  };
}

/**
 * Process one file off the main thread when possible, else inline.
 * Resolves with the file's base64 + content hash + mime + size.
 */
export function processFileViaWorker(file: File): Promise<ProcessedFile> {
  const worker = getWorker();
  if (!worker) return processOnMainThread(file);
  return new Promise<ProcessedFile>((resolve, reject) => {
    const id = ++nextRequestId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, file });
  });
}

/**
 * Test-only reset for the singleton worker. Tests stub `Worker` /
 * tear down between cases; this lets them swap fixtures cleanly.
 */
export function __resetAttachWorkerForTest(): void {
  if (workerInstance) {
    try { workerInstance.terminate(); } catch { /* ignore */ }
  }
  workerInstance = null;
  workerFailed = false;
  pending.clear();
}
