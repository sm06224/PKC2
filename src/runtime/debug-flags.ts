/**
 * Debug-via-URL-flag protocol — runtime layer.
 *
 * `?pkc-debug=<list>` (URL) or `pkc2.debug` (localStorage) controls
 * which feature debug overlays + Report dump are active. URL wins.
 *
 * See `docs/development/debug-via-url-flag-protocol.md` for the
 * cross-feature contract; this file covers stage α (flag reading +
 * Report dump). Ring buffer (`recordDebugEvent`) is stage β.
 *
 * Layer note: this module deliberately does NOT import `AppState`
 * from `src/adapter/state/app-state.ts` — building the state-aware
 * Report happens in `src/adapter/ui/debug-report.ts`. The runtime
 * layer only owns the flag schema, the Report data shape, and the
 * clipboard sink.
 */

import { VERSION } from './release-meta';

const URL_PARAM_NAME = 'pkc-debug';
const STORAGE_KEY = 'pkc2.debug';

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
 * DebugReport schema — what gets dumped to clipboard when the user
 * clicks the Report button. Stage α intentionally excludes:
 *  - entry body / asset base64 (privacy)
 *  - dispatch ring buffer (`recent`)  → stage β
 *  - feature-specific state (`feature.*`) → stage γ
 *  - DOM snapshot / screenshot         → opt-in via flags later
 *
 * Schema bumps must remain additive so older sessions paste-compat.
 */
export interface DebugReport {
  schema: 1;
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
}

/**
 * Build the runtime-environment slice of the Report. The state-aware
 * slice is filled in by `buildDebugReportFromState` in adapter/ui/.
 */
export function buildDebugEnvironment(): Pick<
  DebugReport,
  'schema' | 'pkc' | 'ts' | 'url' | 'ua' | 'viewport' | 'pointer' | 'flags'
> {
  const win = typeof window !== 'undefined' ? window : null;
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  return {
    schema: 1,
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
  };
}

/**
 * Write the Report to the clipboard as pretty-printed JSON.
 * Returns true on success, false when the clipboard API rejects /
 * is unavailable (caller can then show a fallback modal).
 */
export async function dispatchDebugReport(report: DebugReport): Promise<boolean> {
  const text = JSON.stringify(report, null, 2);
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
