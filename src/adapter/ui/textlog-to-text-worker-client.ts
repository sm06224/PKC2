/**
 * TEXTLOG → TEXT conversion を Web Worker で実行する client(user bug 報告
 * 2026-05-27「凄まじく重い」 / 「遂行は絶対」 = "must complete reliably")。
 *
 * 大量 log textlog(10,000+ logs)で textlogToText の sync CPU work が main
 * thread を block する問題への対策。worker でオフロード + chunk 化 + 進捗
 * report + cancel 対応。`attach-worker-client.ts` の pattern を踏襲(IIFE 化した
 * worker source を Blob URL 経由で boot)。
 *
 * Public API:
 *   - `convertTextlogToTextAsync(source, selection, opts)` →
 *     Promise<{ title, body, emittedCount, skippedEmptyCount } | null>
 *     opts.onProgress(0..1)、opts.signal(AbortSignal)、opts.now で deterministic
 *
 * Fallback:
 *   - Worker / Blob / URL 不在環境(node ESM SSR 等)では main thread で同期実行
 *   - Worker boot 失敗時も同様に fall back
 */

import type { Entry } from '../../core/model/record';
import {
  textlogToText as textlogToTextSync,
  type TextlogToTextResult,
} from '../../features/textlog/textlog-to-text';

export interface ConvertOptions {
  /** Extraction timestamp(deterministic test 用)。default `new Date()`。 */
  now?: Date;
  /** 0..1 の進捗 callback。chunk 境界で呼ばれる。 */
  onProgress?: (value: number) => void;
  /** AbortSignal:abort 時 worker.terminate + reject。 */
  signal?: AbortSignal;
}

interface WorkerMessage {
  type: 'progress' | 'done' | 'error';
  value?: number;
  result?: TextlogToTextResult;
  error?: string;
}

/**
 * worker 内で実行される処理(IIFE 化して Blob → URL → Worker boot)。
 * import は使えないため、`parseTextlogBody` / `toLocalDateKey` / `slugifyHeading`
 * を **完全に inline**。chunk size = 1000 entries で progress 報告。
 */
function workerSource(): void {
  const CHUNK_SIZE = 1000;

  // ── inline `parseTextlogBody`(`src/features/textlog/textlog-body.ts`)
  function parseTextlogBody(body: string): { entries: { id: string; text: string; createdAt: string; flags: string[] }[] } {
    if (!body) return { entries: [] };
    try {
      const parsed = JSON.parse(body) as { entries?: unknown[] };
      if (parsed && Array.isArray(parsed.entries)) {
        return {
          entries: parsed.entries.map((e: unknown) => {
            const o = e as Record<string, unknown>;
            return {
              id: typeof o.id === 'string' ? o.id : `log-${Math.random().toString(36).slice(2)}`,
              text: typeof o.text === 'string' ? o.text : '',
              createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
              flags: Array.isArray(o.flags) ? o.flags.filter((f: unknown) => typeof f === 'string') as string[] : [],
            };
          }),
        };
      }
    } catch {
      // not valid JSON
    }
    return { entries: [] };
  }

  // ── inline `toLocalDateKey`(`src/features/textlog/textlog-doc.ts`)
  function toLocalDateKey(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ── inline `slugifyHeading`(`src/features/markdown/markdown-toc.ts`)
  // ── 最小版:lower + non-alphanum → '-'、連続 '-' は 1 個に縮約、前後 '-' を trim
  function slugifyHeading(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\wÀ-￿]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function formatLocalTime(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function logSlug(text: string): string {
    const firstLine = text.split(/\r?\n/).find((l: string) => l.trim().length > 0) ?? '';
    const capped = firstLine.trim().slice(0, 40);
    const slug = slugifyHeading(capped);
    return slug || 'log';
  }

  function postProgress(value: number): void {
    (self as unknown as { postMessage: (m: WorkerMessage) => void }).postMessage({ type: 'progress', value });
  }

  function doConvert(
    sourceLid: string,
    sourceTitle: string,
    sourceArchetype: string,
    sourceBody: string,
    selectionArr: string[],
    nowIso: string,
  ): TextlogToTextResult {
    const selection = new Set(selectionArr);
    postProgress(0.05);

    const parsed = sourceArchetype === 'textlog'
      ? parseTextlogBody(sourceBody)
      : { entries: [] };
    postProgress(0.25);

    // chunk filter(progress 0.25 → 0.40)
    const chosen: { id: string; text: string; createdAt: string; flags: string[] }[] = [];
    const total = parsed.entries.length;
    for (let i = 0; i < total; i++) {
      const e = parsed.entries[i]!;
      if (selection.has(e.id)) chosen.push(e);
      if ((i + 1) % CHUNK_SIZE === 0) {
        const p = 0.25 + (0.15 * (i + 1)) / total;
        postProgress(p);
      }
    }
    postProgress(0.40);

    // sort O(N log N)、進捗は出ない(JS sort は中断不可)
    chosen.sort((a, b) => {
      const ka = toLocalDateKey(a.createdAt);
      const kb = toLocalDateKey(b.createdAt);
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
    postProgress(0.55);

    // bucket(chunk 化、進捗 0.55 → 0.70)
    let skippedEmptyCount = 0;
    const buckets = new Map<string, { id: string; text: string; createdAt: string; flags: string[] }[]>();
    for (let i = 0; i < chosen.length; i++) {
      const e = chosen[i]!;
      if (!e.text.trim()) {
        skippedEmptyCount += 1;
        continue;
      }
      const key = toLocalDateKey(e.createdAt);
      const list = buckets.get(key) ?? [];
      list.push(e);
      buckets.set(key, list);
      if ((i + 1) % CHUNK_SIZE === 0) {
        const p = 0.55 + (0.15 * (i + 1)) / chosen.length;
        postProgress(p);
      }
    }
    postProgress(0.70);

    const emittedCount = [...buckets.values()].reduce((n, xs) => n + xs.length, 0);

    // build lines(chunk 化、進捗 0.70 → 0.95)
    const now = new Date(nowIso);
    const extractedAtIso = now.toISOString();
    const extractionDateKey = toLocalDateKey(extractedAtIso);
    const srcTitle = sourceTitle || '(untitled)';
    const title = `${srcTitle} — log extract ${extractionDateKey}`;

    const lines: string[] = [];
    lines.push(`# ${srcTitle} (log extract)`);
    lines.push('');
    lines.push(`> Source: [${srcTitle}](entry:${sourceLid})`);
    lines.push(`> Extracted: ${extractedAtIso}`);
    if (emittedCount === 0) {
      lines.push('> Logs: 0 entries');
    } else {
      const allKeys = [...buckets.keys()].sort();
      const firstKey = allKeys[0]!;
      const lastKey = allKeys[allKeys.length - 1]!;
      const range = firstKey === lastKey ? firstKey : `${firstKey} to ${lastKey}`;
      const noun = emittedCount === 1 ? 'entry' : 'entries';
      lines.push(`> Logs: ${emittedCount} ${noun} from ${range}`);
    }
    lines.push('');

    const orderedKeys = [...buckets.keys()].sort();
    let emittedSoFar = 0;
    for (const key of orderedKeys) {
      const dayLabel = key === '' ? 'Undated' : key;
      lines.push(`## ${dayLabel}`);
      lines.push('');
      const list = buckets.get(key)!;
      for (const log of list) {
        const time = formatLocalTime(log.createdAt);
        const slug = logSlug(log.text);
        lines.push(`### ${time} — ${slug}`);
        lines.push('');
        lines.push(log.text.replace(/\s+$/u, ''));
        lines.push('');
        lines.push(`[↩ source log](entry:${sourceLid}#log/${log.id})`);
        lines.push('');
        emittedSoFar++;
        if (emittedSoFar % CHUNK_SIZE === 0) {
          const p = 0.70 + (0.25 * emittedSoFar) / Math.max(1, emittedCount);
          postProgress(p);
        }
      }
    }
    postProgress(0.95);

    const body = lines.join('\n').replace(/\n+$/u, '\n');
    postProgress(1.0);

    return { title, body, emittedCount, skippedEmptyCount };
  }

  (self as unknown as { onmessage: (e: MessageEvent) => void }).onmessage = (e: MessageEvent): void => {
    const data = e.data as {
      sourceLid: string;
      sourceTitle: string;
      sourceArchetype: string;
      sourceBody: string;
      selection: string[];
      nowIso: string;
    };
    try {
      const result = doConvert(
        data.sourceLid,
        data.sourceTitle,
        data.sourceArchetype,
        data.sourceBody,
        data.selection,
        data.nowIso,
      );
      (self as unknown as { postMessage: (m: WorkerMessage) => void }).postMessage({ type: 'done', result });
    } catch (err) {
      (self as unknown as { postMessage: (m: WorkerMessage) => void }).postMessage({
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

/**
 * source 大きさを判定して worker / sync を分岐(threshold 未満は sync の方が
 * worker boot コストより速い)。default threshold は 500 entries 相当の body size。
 */
const SYNC_THRESHOLD_BODY_BYTES = 50_000;

/**
 * TEXTLOG → TEXT 変換を非同期実行。可能なら Web Worker、ダメなら main thread sync。
 */
export function convertTextlogToTextAsync(
  source: Entry,
  selection: ReadonlySet<string> | ReadonlyArray<string>,
  opts: ConvertOptions = {},
): Promise<TextlogToTextResult> {
  const now = opts.now ?? new Date();
  const selectionArr = Array.from(selection);
  const bodyBytes = (source.body ?? '').length;

  // 既に aborted な signal を渡された場合は即 reject(sync / worker どちらの経路にも入らない)
  if (opts.signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  // 小さいときは main thread 同期(worker boot より速い)
  if (bodyBytes < SYNC_THRESHOLD_BODY_BYTES) {
    return Promise.resolve(textlogToTextSync(source, selectionArr, { now }));
  }

  // worker boot
  if (typeof Worker === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return Promise.resolve(textlogToTextSync(source, selectionArr, { now }));
  }

  let worker: Worker | null = null;
  let blobUrl: string | null = null;
  let aborted = false;

  return new Promise<TextlogToTextResult>((resolve, reject) => {
    try {
      const wsrc = `(${workerSource.toString()})()`;
      const blob = new Blob([wsrc], { type: 'application/javascript' });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl);
    } catch (e) {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      // fall back to sync
      try {
        resolve(textlogToTextSync(source, selectionArr, { now }));
      } catch (syncErr) {
        reject(syncErr);
      }
      void e;
      return;
    }

    const cleanup = (): void => {
      if (worker) {
        worker.terminate();
        worker = null;
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
      if (opts.signal) {
        opts.signal.removeEventListener('abort', onAbort);
      }
    };

    function onAbort(): void {
      aborted = true;
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    }

    if (opts.signal) {
      if (opts.signal.aborted) {
        onAbort();
        return;
      }
      opts.signal.addEventListener('abort', onAbort);
    }

    worker.onmessage = (e: MessageEvent): void => {
      if (aborted) return;
      const msg = e.data as WorkerMessage;
      if (msg.type === 'progress') {
        opts.onProgress?.(msg.value ?? 0);
      } else if (msg.type === 'done' && msg.result) {
        cleanup();
        resolve(msg.result);
      } else if (msg.type === 'error') {
        cleanup();
        // try sync fallback
        try {
          resolve(textlogToTextSync(source, selectionArr, { now }));
        } catch {
          reject(new Error(msg.error ?? 'worker error'));
        }
      }
    };

    worker.onerror = (e: ErrorEvent): void => {
      if (aborted) return;
      console.warn('[PKC2] textlog-to-text worker error:', e.message);
      cleanup();
      // fall back to sync
      try {
        resolve(textlogToTextSync(source, selectionArr, { now }));
      } catch (syncErr) {
        reject(syncErr);
      }
    };

    worker.postMessage({
      sourceLid: source.lid,
      sourceTitle: source.title,
      sourceArchetype: source.archetype,
      sourceBody: source.body,
      selection: selectionArr,
      nowIso: now.toISOString(),
    });
  });
}
