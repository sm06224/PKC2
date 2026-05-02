/**
 * Debug-via-URL-flag protocol — runtime layer.
 *
 * `?pkc-debug=<list>` (URL) or `pkc2.debug` (localStorage) controls
 * which feature debug overlays + Report dump are active. URL wins.
 *
 * See `docs/development/debug-via-url-flag-protocol.md` for the
 * cross-feature contract, and `docs/development/debug-privacy-philosophy.md`
 * for the upper-tier privacy regulation (4 principles: Local-only by
 * construction / Privacy by default / Graduated opt-in / Schema as
 * versioned protocol). This file owns the runtime data shape, the
 * dispatch ring buffer, and the clipboard sink.
 *
 * Layer note: this module deliberately does NOT import `AppState`
 * from `src/adapter/state/app-state.ts` — building the state-aware
 * Report happens in `src/adapter/ui/debug-report.ts`. The runtime
 * layer only owns the flag schema, the Report data shape, and the
 * ring buffer.
 */

import { VERSION } from './release-meta';

const URL_PARAM_NAME = 'pkc-debug';
const STORAGE_KEY = 'pkc2.debug';
const URL_PARAM_CONTENTS = 'pkc-debug-contents';
const STORAGE_KEY_CONTENTS = 'pkc2.debug-contents';

/**
 * Parse a raw flag string (`'sync,kanban'`, `'*'`, `''`, `null`)
 * into a Set of feature names. Pure; exported for unit tests.
 */
export function parseDebugList(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  const out = new Set<string>();
  for (const token of raw.split(',')) {
    const t = token.trim();
    if (t.length > 0) out.add(t);
  }
  return out;
}

function readDebugSource(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get(URL_PARAM_NAME);
    if (fromUrl !== null) return fromUrl;
  } catch {
    // location.href malformed (some test harnesses); fall through to storage.
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Active debug feature names. `'*'` means "all". Empty when off. */
export function debugFeatures(): Set<string> {
  return parseDebugList(readDebugSource());
}

/** True when this feature should activate its debug overlay / instrumentation. */
export function isDebugEnabled(feature: string): boolean {
  const set = debugFeatures();
  return set.has('*') || set.has(feature);
}

/**
 * True when at least one debug feature is active. Gates the dispatch
 * ring buffer (`recordDebugEvent`) and the Report button mount.
 */
export function isRecordingEnabled(): boolean {
  return debugFeatures().size > 0;
}

let persistedContentsWarned = false;

/**
 * Test-only: reset the "I already warned about persisted contents
 * mode" latch so the warning can be re-asserted in a fresh test.
 * Production code should never call this.
 */
export function _resetContentsWarningForTests(): void {
  persistedContentsWarned = false;
}

function isTruthyFlag(raw: string): boolean {
  return raw === '1' || raw === 'true';
}

/**
 * True when the user has explicitly opted into content mode via
 * `?pkc-debug-contents=1` (URL) or `pkc2.debug-contents` (localStorage).
 *
 * Privacy philosophy §4 原則 3 (Graduated opt-in): structural mode is
 * the default; content mode requires the user to type the long-form
 * flag deliberately. Content mode is only meaningful when recording
 * is also active — `?pkc-debug-contents=1` alone is a no-op.
 *
 * When the flag is read from localStorage (i.e. persisted across
 * sessions), the first read of each module load also emits a
 * `console.warn`. The user might have set the flag once and forgotten
 * about it; surfacing the persistence in DevTools helps catch the
 * "still in content mode" footgun the philosophy doc §5-3 describes.
 */
export function isContentModeEnabled(): boolean {
  if (!isRecordingEnabled()) return false;
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get(URL_PARAM_CONTENTS);
    if (fromUrl !== null) return isTruthyFlag(fromUrl);
  } catch {
    // location malformed; fall through to storage.
  }
  try {
    const fromStorage = window.localStorage.getItem(STORAGE_KEY_CONTENTS);
    if (fromStorage === null) return false;
    const enabled = isTruthyFlag(fromStorage);
    if (enabled && !persistedContentsWarned) {
      persistedContentsWarned = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[pkc2:debug] content mode is enabled via localStorage ' +
          `(${STORAGE_KEY_CONTENTS}). Debug reports will include entry ` +
          'titles, bodies, and asset bytes. Remove the localStorage ' +
          'key or open without the flag to return to structural mode.',
      );
    }
    return enabled;
  } catch {
    return false;
  }
}

/**
 * RecentEvent: a single dispatch captured by the ring buffer.
 *
 * Fields:
 * - `kind`: discriminator for future event sources. Currently
 *   `'dispatch'` only.
 * - `seq`: monotonic dispatch counter (1-based). Survives FIFO
 *   eviction so `errors[].lastSeq` can correlate to the right event
 *   even after ~100 dispatches have rolled past.
 * - `ts`: ISO 8601 timestamp at capture.
 * - `type`: action.type literal (always safe — short ASCII enum).
 * - `lid`: present when the action carries a `lid: string` field.
 *   Cherry-picked by name; never spread, so a future action with a
 *   sensitive field cannot leak through structural mode.
 * - `durMs`: wall-clock duration of dispatch (reduce + listener
 *   flush), rounded to 0.01 ms. Captured from `performance.now()`
 *   inside the dispatcher hook — independent of the `?profile=1`
 *   gate so debug always carries timings.
 * - `content`: present only when `level === 'content'`. The
 *   eagerly-cloned action payload, capped at MAX_CONTENT_BYTES.
 */
export interface RecentEvent {
  kind: 'dispatch';
  seq: number;
  ts: string;
  type: string;
  lid?: string;
  durMs?: number;
  content?: unknown;
}

const RECENT_MAX = 100;
const recentBuffer: RecentEvent[] = [];
let dispatchSeq = 0;

/**
 * Allocate the next monotonic dispatch sequence number. The dispatcher
 * calls this before recording so `errors[].lastSeq` can pin to a
 * specific dispatch even after ring-buffer eviction.
 */
export function nextDispatchSeq(): number {
  dispatchSeq += 1;
  return dispatchSeq;
}

/** Read the current sequence (0 if no dispatches yet). */
export function currentDispatchSeq(): number {
  return dispatchSeq;
}

/**
 * Append an event to the ring buffer, dropping the oldest when the
 * cap (100) is exceeded. The buffer is module-scoped and intentionally
 * not persisted — debug data is local-only by construction
 * (philosophy doc §4 原則 1).
 */
export function recordDebugEvent(event: RecentEvent): void {
  recentBuffer.push(event);
  while (recentBuffer.length > RECENT_MAX) {
    recentBuffer.shift();
  }
}

/** Snapshot the current ring buffer in dispatch order (oldest first). */
export function readDebugEvents(): RecentEvent[] {
  return recentBuffer.slice();
}

/** Test helper: empty the ring buffer + reset sequence between cases. */
export function clearDebugEvents(): void {
  recentBuffer.length = 0;
  dispatchSeq = 0;
}

/**
 * ErrorEvent: a single error / unhandled-rejection / console.error
 * captured since boot.
 *
 * `lastSeq` pins the error to the dispatch that was most recently
 * recorded when the error fired — developer can scan recent[] for
 * the matching seq to see "right after this action, this error
 * happened." Survives FIFO eviction by being a number, not an index.
 *
 * `message` policy:
 *   structural mode → truncated to MAX_ERROR_MESSAGE_BYTES (200)
 *   content mode    → full
 * `stack` is structural information only (function names + file +
 * line), so it stays full in both modes.
 */
export interface ErrorEvent {
  kind: 'error' | 'unhandledrejection' | 'console-error';
  ts: string;
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  col?: number;
  lastSeq: number;
}

const MAX_ERROR_MESSAGE_BYTES = 200;
const ERRORS_MAX = 10;
const errorBuffer: ErrorEvent[] = [];

export function recordDebugError(event: ErrorEvent): void {
  errorBuffer.push(event);
  while (errorBuffer.length > ERRORS_MAX) {
    errorBuffer.shift();
  }
}

export function readDebugErrors(): ErrorEvent[] {
  return errorBuffer.slice();
}

/** Test helper: empty the error ring buffer between cases. */
export function clearDebugErrors(): void {
  errorBuffer.length = 0;
}

/**
 * Truncate `message` to MAX_ERROR_MESSAGE_BYTES when not in content
 * mode. Stack traces are emitted as-is regardless of mode because
 * they are structural (no user content).
 */
export function applyMessagePrivacy(
  message: string,
  contentMode: boolean,
): string {
  if (contentMode) return message;
  if (message.length <= MAX_ERROR_MESSAGE_BYTES) return message;
  return message.slice(0, MAX_ERROR_MESSAGE_BYTES) + '… [truncated]';
}

/**
 * Initial container snapshot for content-mode replay. Captured by the
 * dispatcher when SYS_INIT_COMPLETE first fires; surfaced in the
 * report only when the user has opted into content mode.
 *
 * The snapshot is held by reference. The Container in PKC2 is treated
 * as immutable by the reducer (state is recreated, not mutated), so
 * the reference stays valid for the page lifetime. JSON-stringify at
 * report time materializes it once.
 */
let initialContainerSnapshot: unknown = null;

export function recordInitialContainer(container: unknown): void {
  initialContainerSnapshot = container;
}

export function readInitialContainer(): unknown {
  return initialContainerSnapshot;
}

export function clearInitialContainerForTests(): void {
  initialContainerSnapshot = null;
}

/**
 * Storage estimate captured once at boot via `navigator.storage.estimate()`.
 * One-shot snapshot rather than a live read so report builds are
 * synchronous.
 */
let storageEstimate: { usageMB: number; quotaMB: number } | null = null;

export async function refreshStorageEstimate(): Promise<void> {
  if (typeof navigator === 'undefined') return;
  const storage = (navigator as Navigator & {
    storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> };
  }).storage;
  if (!storage?.estimate) return;
  try {
    const est = await storage.estimate();
    if (typeof est.usage === 'number' && typeof est.quota === 'number') {
      storageEstimate = {
        usageMB: Math.round((est.usage / 1024 / 1024) * 100) / 100,
        quotaMB: Math.round((est.quota / 1024 / 1024) * 100) / 100,
      };
    }
  } catch {
    /* permission denied / unsupported — stay null */
  }
}

export function readStorageEstimate(): { usageMB: number; quotaMB: number } | null {
  return storageEstimate;
}

export function clearStorageEstimateForTests(): void {
  storageEstimate = null;
}

/**
 * Cherry-pick the structural fields of a Dispatchable. Used by the
 * dispatcher hook to build a RecentEvent without ever spreading the
 * action object.
 *
 * Safety: only `type` (always present, short ASCII enum) and `lid`
 * (when it's a string field) are read. A new action with a `body` or
 * `title` field cannot leak through this path — the function never
 * iterates the action's keys. New action types do not require any
 * change here; the test suite (`tests/runtime/debug-flags.test.ts`)
 * grep-asserts that structural output never contains content for
 * every action variant the codebase produces.
 */
export function extractStructuralFromAction(
  action: { type: string } & Record<string, unknown>,
): { type: string; lid?: string } {
  const out: { type: string; lid?: string } = { type: action.type };
  const candidate = action.lid;
  if (typeof candidate === 'string') out.lid = candidate;
  return out;
}

/**
 * Hard cap on the JSON byte-length of a single `content` payload in
 * content mode. 64 KiB is more than enough for any realistic
 * COMMIT_EDIT (markdown body), but shuts down pathological cases like
 * SYS_INIT_COMPLETE carrying the full Container with base64 assets
 * (which can run into hundreds of MiB and trip Firefox's
 * "InternalError: allocation size overflow" later when the report is
 * stringified).
 *
 * Above the cap, we replace `content` with a small marker so the
 * debug consumer still sees that an action of type X happened, just
 * not the payload. This is the philosophy doc §4 原則 3 "graduated
 * opt-in" with a safety floor: opt-in does not mean "unbounded".
 */
export const MAX_CONTENT_BYTES = 64 * 1024;

/** Sentinel used in place of `content` when the payload is too big
 * to safely retain by reference + later JSON-stringify. */
export interface TruncatedContent {
  _truncated: true;
  type: string;
  approxBytes: number;
  reason?: 'oversize' | 'unserializable';
}

/**
 * Snapshot a Dispatchable for content mode. Eager deep-clone via
 * JSON round-trip so the ring buffer holds an immutable copy (no
 * pinning of evolving state objects, no GC anchor on rehydrated
 * Containers). Payloads above {@link MAX_CONTENT_BYTES} collapse to
 * a {@link TruncatedContent} marker.
 *
 * Returning `unknown` is deliberate: callers MUST treat the value as
 * opaque user data and not destructure it. The shape is either the
 * action shape or the truncation marker — encoding both in the type
 * system would over-constrain consumers (e.g., serializers).
 */
export function snapshotActionForContent(action: unknown): unknown {
  let json: string | undefined;
  try {
    json = JSON.stringify(action);
  } catch {
    return makeTruncated(action, 0, 'unserializable');
  }
  if (typeof json !== 'string') {
    return makeTruncated(action, 0, 'unserializable');
  }
  if (json.length > MAX_CONTENT_BYTES) {
    return makeTruncated(action, json.length, 'oversize');
  }
  // Deep clone via re-parse so the buffer entry is immutable and not
  // a live reference into the dispatcher's action object.
  return JSON.parse(json);
}

function makeTruncated(
  action: unknown,
  approxBytes: number,
  reason: 'oversize' | 'unserializable',
): TruncatedContent {
  const type =
    typeof action === 'object' &&
    action !== null &&
    typeof (action as { type?: unknown }).type === 'string'
      ? (action as { type: string }).type
      : 'unknown';
  return { _truncated: true, type, approxBytes, reason };
}

/**
 * DebugReport schema 3 — what gets dumped when the user clicks the
 * 🐞 button.
 *
 * Schema evolution (additive only, per philosophy doc §4 原則 4):
 *  - schema 1 (PR #209, stage α): env + phase + view + selection +
 *    container counts.
 *  - schema 2 (PR #211 first round, stage β): + level + contentsIncluded
 *    + recent.
 *  - schema 3 (PR #211 finalize, 2026-05-02): + pkc.commit + storage
 *    + container.{schemaVersion, archetypeCounts} + recent[].seq +
 *    recent[].durMs + errors[] + replay (content-mode only) +
 *    truncatedCounts.
 *
 * Forward compat: a v2 consumer reading a v3 dump must ignore unknown
 * fields. A v3 consumer reading a v2 dump must tolerate the missing
 * fields (treat as absent / null / empty).
 *
 * Every field justifies itself by the debugging workflow it enables
 * (philosophy doc §5-4):
 *   - pkc.commit       → exact source-tree git checkout
 *   - storage          → quota-related bug category
 *   - schemaVersion    → migration-class bug category
 *   - archetypeCounts  → "only with N todos" repro shape
 *   - recent[].durMs   → "X is slow / freezes" perf bug category
 *   - errors[]         → crash-class bug category, with .lastSeq
 *                        correlating each error to the dispatch
 *                        sequence that preceded it
 *   - replay           → deterministic local reproduction in content
 *                        mode (reducer-purity contract underpins this;
 *                        tests/core/replay-determinism.test.ts pins it)
 *   - truncatedCounts  → transparency about what the 1 MiB total cap
 *                        had to drop
 */
export interface DebugReport {
  schema: 3;
  pkc: { version: string; commit: string };
  ts: string;
  url: string;
  ua: string;
  viewport: { w: number; h: number; dpr: number };
  pointer: { coarse: boolean };
  storage: { usageMB: number; quotaMB: number } | null;
  phase: string;
  view: string;
  selectedLid: string | null;
  editingLid: string | null;
  container: {
    entryCount: number;
    relationCount: number;
    assetKeys: string[];
    schemaVersion: number;
    archetypeCounts: Record<string, number>;
  } | null;
  flags: string[];
  level: 'structural' | 'content';
  contentsIncluded: boolean;
  recent: RecentEvent[];
  errors: ErrorEvent[];
  /** Present only in content mode. The container the dispatcher
   * received in the first SYS_INIT_COMPLETE since boot — the seed for
   * deterministic local replay over `recent[]`. */
  replay?: { initialContainer: unknown };
  /** What the 1 MiB total-size cap had to drop, by category. */
  truncatedCounts: {
    recent: number;
    errors: number;
    replayDropped: boolean;
  };
}

/**
 * Hard cap on the total stringified DebugReport. Above this, we
 * truncate in priority order: replay → recent[] FIFO → errors[] FIFO.
 * 1 MiB is a comfortable browser/clipboard/blob-URL handling target
 * even on mobile; the per-content cap (64 KiB) keeps a single dispatch
 * from monopolising the budget.
 */
export const MAX_REPORT_BYTES = 1024 * 1024;

/**
 * Reduce `report` so its serialized form fits MAX_REPORT_BYTES. Drops
 * `replay` first (largest single payload), then trims `recent` and
 * `errors` from the front (oldest first). Surfaces what was dropped
 * via `truncatedCounts` for transparency.
 */
export function applyTotalSizeCap(report: DebugReport): DebugReport {
  if (JSON.stringify(report).length <= MAX_REPORT_BYTES) return report;
  const out: DebugReport = {
    ...report,
    truncatedCounts: { ...report.truncatedCounts },
  };
  if (out.replay !== undefined) {
    delete out.replay;
    out.truncatedCounts.replayDropped = true;
    if (JSON.stringify(out).length <= MAX_REPORT_BYTES) return out;
  }
  while (out.recent.length > 0 && JSON.stringify(out).length > MAX_REPORT_BYTES) {
    out.recent = out.recent.slice(1);
    out.truncatedCounts.recent += 1;
  }
  while (out.errors.length > 0 && JSON.stringify(out).length > MAX_REPORT_BYTES) {
    out.errors = out.errors.slice(1);
    out.truncatedCounts.errors += 1;
  }
  return out;
}

/**
 * Build the runtime-environment slice of the Report. The state-aware
 * slice is filled in by `buildDebugReportFromState` in adapter/ui/.
 *
 * `commitFromMeta` is supplied by the adapter (which calls
 * `readReleaseMeta()`); the runtime layer cannot read the DOM `<script>`
 * slot directly without taking a layer dependency. When meta is
 * unavailable (test fixtures, server-side rendering) we fall back to
 * `'unknown'` rather than crashing.
 */
export function buildDebugEnvironment(commitFromMeta?: string): Pick<
  DebugReport,
  | 'schema'
  | 'pkc'
  | 'ts'
  | 'url'
  | 'ua'
  | 'viewport'
  | 'pointer'
  | 'storage'
  | 'flags'
  | 'level'
  | 'contentsIncluded'
  | 'recent'
  | 'errors'
  | 'truncatedCounts'
> {
  const win = typeof window !== 'undefined' ? window : null;
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const contentMode = isContentModeEnabled();
  const errors = readDebugErrors();
  const events = readDebugEvents();
  // Privacy: in structural mode, errors[].message must be truncated.
  // (Stack/source/line/col are structural and emit as-is.)
  const errorsForLevel = errors.map((e) => ({
    ...e,
    message: applyMessagePrivacy(e.message, contentMode),
  }));
  return {
    schema: 3,
    pkc: { version: VERSION, commit: commitFromMeta ?? 'unknown' },
    ts: new Date().toISOString(),
    url: win?.location?.href ?? '',
    ua: nav?.userAgent ?? '',
    viewport: {
      w: win?.innerWidth ?? 0,
      h: win?.innerHeight ?? 0,
      dpr: win?.devicePixelRatio ?? 1,
    },
    pointer: {
      coarse: !!win?.matchMedia?.('(pointer: coarse)')?.matches,
    },
    storage: readStorageEstimate(),
    flags: Array.from(debugFeatures()).sort(),
    level: contentMode ? 'content' : 'structural',
    contentsIncluded: contentMode,
    recent: events,
    errors: errorsForLevel,
    truncatedCounts: { recent: 0, errors: 0, replayDropped: false },
  };
}

/**
 * Open the Report as a JSON document in a new browser tab via a Blob
 * URL. The user can review the contents and Ctrl+S / ⌘+S to save —
 * no clipboard permission, no auto-download into the system Downloads
 * folder. Returns the opened Window when successful, or `null` when
 * the host blocks `window.open` (popup blocker, sandboxed iframe);
 * the caller can then fall back to an inline modal.
 *
 * `URL.revokeObjectURL` is scheduled on a long delay so the tab has
 * a comfortable window to load. Modern browsers retain the loaded
 * resource in the tab past revocation; the timer is hygiene to free
 * the kept-alive blob if the user never opens the tab.
 */
export function dispatchDebugReport(report: DebugReport): Window | null {
  if (typeof window === 'undefined' || typeof URL === 'undefined') return null;
  const text = JSON.stringify(report, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) {
    URL.revokeObjectURL(url);
    return null;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return opened;
}
