/**
 * Profile / performance measurement harness — PR #176 (2026-04-27).
 *
 * Goal: capture timings at known hot paths so the next-wave
 * optimisations (region-scoped render / persistence chunking /
 * worker / asset lazy hydration) can be prioritised by data
 * instead of guesswork.
 *
 * Activation:
 *   - `?profile=1` in the URL hash / search → runtime gate flips
 *     on for the whole session
 *   - `globalThis.__PKC2_PROFILE = true` before any module loads
 *     (Playwright bench injects this)
 *   - Otherwise every helper here is a no-op (`mark` / `measure` /
 *     `start` return immediately; `dump` returns an empty report)
 *
 * Cost when disabled: 1 boolean check per call site. The
 * `performance.mark` / `performance.measure` browser APIs are not
 * touched.
 *
 * Cost when enabled: standard browser perf API overhead (~0.1-1
 * µs per mark on Chromium). Names are short ASCII strings.
 *
 * Naming convention for marks:
 *   <phase>:<region>:start   — e.g. `boot:idb-load:start`
 *   <phase>:<region>:end
 * `start(name)` returns a thunk that emits the matching `:end`
 * mark and records a `measure` in one call.
 *
 * Namespaces in use:
 *   boot:*       startup phase
 *   dispatch:*   per-action reducer + listener flush
 *   render:*     renderer.ts entry points
 *   filter:*     applyFilters / categorical / archived
 *   tree:*       buildTree / reorderTreeByEntries
 *   asset:*      asset scan / orphan detect / dedupe
 *   search:*     keystroke → result paint (composite)
 *
 * Reports are flat: each entry is `{ name, startTime, duration }`
 * with the renderer's `dump()` / clear semantics.
 */

let profileFlag: boolean | null = null;

function detectProfileFlag(): boolean {
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as { __PKC2_PROFILE?: boolean };
    if (g.__PKC2_PROFILE === true) return true;
  }
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('profile') === '1') return true;
    // `#pkc?profile=1` is also accepted so the deep-link flow used
    // by the manual / addressbar paste tests can flip the flag.
    const hash = url.hash || '';
    if (/[?&]profile=1\b/.test(hash)) return true;
  } catch {
    /* opaque origin / SSR — leave flag off */
  }
  return false;
}

/** True when the harness is active for this session. Cached on first read. */
export function isProfileEnabled(): boolean {
  if (profileFlag === null) profileFlag = detectProfileFlag();
  return profileFlag;
}

/**
 * Test-only override. The Playwright bench can call
 * `setProfileEnabledForTest(true)` before driving the app to bypass
 * URL detection. Setting `null` restores auto-detection.
 */
export function setProfileEnabledForTest(value: boolean | null): void {
  profileFlag = value;
}

function safeMark(name: string): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  try {
    performance.mark(name);
  } catch {
    /* duplicate / invalid name — drop silently */
  }
}

function safeMeasure(name: string, start: string, end?: string): void {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return;
  try {
    if (end) performance.measure(name, start, end);
    else performance.measure(name, start);
  } catch {
    /* missing start mark — drop silently */
  }
}

/** Emit a single performance.mark when profiling is on. No-op otherwise. */
export function mark(name: string): void {
  if (!isProfileEnabled()) return;
  safeMark(name);
}

/** Emit a performance.measure spanning two existing marks. No-op otherwise. */
export function measure(name: string, startMark: string, endMark?: string): void {
  if (!isProfileEnabled()) return;
  safeMeasure(name, startMark, endMark);
}

/**
 * Begin a measurement block. Emits a `<name>:start` mark immediately
 * and returns a thunk that emits the `<name>:end` mark + records a
 * `<name>` measure when called.
 *
 * Idempotent under re-entry (each invocation gets its own counter
 * suffix to avoid mark-name collisions when nested calls overlap).
 */
let counter = 0;
export function start(name: string): () => void {
  if (!isProfileEnabled()) return noop;
  const id = ++counter;
  const startName = `${name}:start#${id}`;
  const endName = `${name}:end#${id}`;
  safeMark(startName);
  return () => {
    safeMark(endName);
    safeMeasure(name, startName, endName);
  };
}

function noop(): void {
  /* disabled-mode end thunk */
}

/** Single-entry shape returned by `dump()`. */
export interface ProfileEntry {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
}

/** Aggregated report — flat list of every measure recorded in this session. */
export interface ProfileReport {
  readonly entries: readonly ProfileEntry[];
  readonly capturedAt: number;
}

/**
 * Snapshot every `performance.measure` entry recorded since the last
 * `clear()`. Returns an empty report when profiling is off.
 */
export function dump(): ProfileReport {
  if (!isProfileEnabled() || typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return { entries: [], capturedAt: Date.now() };
  }
  const raw = performance.getEntriesByType('measure');
  const entries: ProfileEntry[] = raw.map((e) => ({
    name: e.name,
    startTime: e.startTime,
    duration: e.duration,
  }));
  return { entries, capturedAt: Date.now() };
}

/**
 * Clear all recorded marks + measures. Useful between scenarios so
 * report sizes stay bounded.
 */
export function clear(): void {
  if (typeof performance === 'undefined') return;
  try {
    performance.clearMarks?.();
    performance.clearMeasures?.();
  } catch {
    /* nothing to do */
  }
}

/**
 * Convenience wrapper: run `fn`, attribute its duration to a measure
 * named `name`, return whatever `fn` returns. Synchronous only.
 */
export function time<T>(name: string, fn: () => T): T {
  if (!isProfileEnabled()) return fn();
  const end = start(name);
  try {
    return fn();
  } finally {
    end();
  }
}

/**
 * Async variant of `time`. Accepts a thunk returning a Promise and
 * resolves with its value while still recording the measure.
 */
export async function timeAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!isProfileEnabled()) return fn();
  const end = start(name);
  try {
    return await fn();
  } finally {
    end();
  }
}

/**
 * Best-effort heap snapshot via the non-standard `performance.memory`
 * API (Chromium / Edge / Playwright chromium). Returns `null` on any
 * other engine. Used by the bench runner to track in-memory container
 * size growth across scenarios.
 */
export interface MemorySnapshot {
  readonly usedJsHeapSize: number;
  readonly totalJsHeapSize: number;
  readonly jsHeapSizeLimit: number;
}

export function memorySnapshot(): MemorySnapshot | null {
  if (typeof performance === 'undefined') return null;
  const m = (performance as unknown as { memory?: MemorySnapshot }).memory;
  if (!m) return null;
  return {
    usedJsHeapSize: m.usedJsHeapSize,
    totalJsHeapSize: m.totalJsHeapSize,
    jsHeapSizeLimit: m.jsHeapSizeLimit,
  };
}
