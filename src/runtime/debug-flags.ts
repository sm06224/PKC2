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
 * - `kind`: discriminator for future event sources (e.g. `'render'`,
 *   `'event'` from `dispatcher.onEvent`). Currently `'dispatch'` only.
 * - `ts`: ISO 8601 timestamp at capture.
 * - `type`: action.type literal (always safe — short ASCII enum).
 * - `lid`: present when the action carries a `lid: string` field.
 *   Cherry-picked by name; never spread, so a future action with a
 *   sensitive field (body / title / asset bytes) cannot leak through
 *   structural mode.
 * - `content`: present only when `level === 'content'`. The full
 *   action payload, verbatim.
 *
 * Schema 2 invariant: structural callers MUST NOT read `content`,
 * and content callers MUST treat `content` as opt-in user data.
 */
export interface RecentEvent {
  kind: 'dispatch';
  ts: string;
  type: string;
  lid?: string;
  content?: unknown;
}

const RECENT_MAX = 100;
const recentBuffer: RecentEvent[] = [];

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

/** Test helper: empty the ring buffer between cases. */
export function clearDebugEvents(): void {
  recentBuffer.length = 0;
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
 * DebugReport schema 2 — what gets dumped to clipboard when the user
 * clicks the Report button.
 *
 * Schema evolution (additive only, per philosophy doc §4 原則 4):
 *  - schema 1 (PR #209, stage α): env + phase + view + selection +
 *    container counts.
 *  - schema 2 (PR #211, stage β): + level + contentsIncluded + recent.
 *
 * Old consumers reading a v2 dump ignore the unknown fields. New
 * consumers MUST tolerate v1 dumps that lack the additive fields by
 * treating them as `level: 'structural'`, `contentsIncluded: false`,
 * `recent: []`.
 *
 * Privacy: structural callers continue to drop entry body / asset
 * bytes (philosophy doc §4 原則 2). Content mode is only triggered by
 * `?pkc-debug-contents=1` and is surfaced via the dedicated `level`
 * and `contentsIncluded` fields so the user can see what they are
 * about to paste before pasting.
 */
export interface DebugReport {
  schema: 2;
  pkc: { version: string };
  ts: string;
  url: string;
  ua: string;
  viewport: { w: number; h: number; dpr: number };
  pointer: { coarse: boolean };
  phase: string;
  view: string;
  selectedLid: string | null;
  editingLid: string | null;
  container: {
    entryCount: number;
    relationCount: number;
    assetKeys: string[];
  } | null;
  flags: string[];
  /** Indicates whether `recent[].content` is populated. */
  level: 'structural' | 'content';
  /** Mirror of `level === 'content'`; redundant on purpose so a paste
   * preview UI can flag content reports without parsing `level`. */
  contentsIncluded: boolean;
  /** Dispatch ring buffer snapshot (max 100, oldest first). */
  recent: RecentEvent[];
}

/**
 * Build the runtime-environment slice of the Report. The state-aware
 * slice is filled in by `buildDebugReportFromState` in adapter/ui/.
 */
export function buildDebugEnvironment(): Pick<
  DebugReport,
  | 'schema'
  | 'pkc'
  | 'ts'
  | 'url'
  | 'ua'
  | 'viewport'
  | 'pointer'
  | 'flags'
  | 'level'
  | 'contentsIncluded'
  | 'recent'
> {
  const win = typeof window !== 'undefined' ? window : null;
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const contentMode = isContentModeEnabled();
  return {
    schema: 2,
    pkc: { version: VERSION },
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
    flags: Array.from(debugFeatures()).sort(),
    level: contentMode ? 'content' : 'structural',
    contentsIncluded: contentMode,
    recent: readDebugEvents(),
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
