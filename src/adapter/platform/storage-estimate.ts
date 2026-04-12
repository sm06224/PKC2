/**
 * Storage-capacity preflight — best-effort read of
 * `navigator.storage.estimate()` so the UI can warn BEFORE a save
 * or large attachment hits a quota wall.
 *
 * Architectural role:
 *   - Sibling of `idb-warning-banner.ts` (runtime-environmental
 *     facts, surfaced OUTSIDE the reducer).
 *   - Pure, side-effect-free helpers so tests don't need a DOM.
 *     The only impure piece is `estimateStorage()` which wraps
 *     the browser API defensively.
 *
 * What this module deliberately does NOT do:
 *   - No hard reject — the existing `SIZE_REJECT_HARD` (250 MB)
 *     in `guardrails.ts` stays the sole blocker.
 *   - No automatic export.
 *   - No repeated polling. Callers decide cadence.
 *
 * What it DOES do:
 *   - Returns `{ available: false }` gracefully when the API is
 *     missing (Firefox private mode, old browsers, file:// on some
 *     engines).  Callers treat "unavailable" as "stay silent".
 *   - Classifies free space into `ok` / `low` / `critical` for the
 *     boot-time banner, and into `ok` / `tight` / `risky` relative
 *     to a pending file for paste / drop preflight.
 *   - Produces a human-readable message with hedged wording
 *     ("may fail", "consider exporting now") that never promises
 *     behaviour the browser cannot guarantee.
 *
 * See docs/development/idb-availability.md for the surrounding
 * environmental-warning design.
 */

/**
 * Result shape for `estimateStorage()`. `available: false` means
 * the API is unreachable or threw — callers should stay silent in
 * that case rather than guessing at free-space values.
 *
 * `quota` / `usage` may be `undefined` even when `available` is
 * `true` — some engines report only one of the two, or report
 * zero / absurd values; we pass them through unchanged and only
 * derive `free` when both are present.
 */
export interface StorageEstimateResult {
  available: boolean;
  quota?: number;
  usage?: number;
  /** `quota - usage`, clamped at 0. `undefined` when either input is missing. */
  free?: number;
}

export type FreeSpaceVerdict = 'ok' | 'low' | 'critical';
export type PreflightVerdict = 'ok' | 'tight' | 'risky';

/**
 * Boot-time thresholds (free-space only, no file context).
 *
 *   - critical: `< 50 MB` — essentially out of room, any non-trivial
 *     save or attachment is likely to fail.
 *   - low:      `< 500 MB` — plenty for day-to-day edits, but the
 *     250 MB hard-reject band of `guardrails.ts` is within reach
 *     and an export-now hint is warranted.
 */
export const LOW_FREE_THRESHOLD_BYTES = 500 * 1024 * 1024;
export const CRITICAL_FREE_THRESHOLD_BYTES = 50 * 1024 * 1024;

/**
 * Attachment-preflight thresholds (headroom = free - fileBytes).
 *
 *   - risky: headroom `< 10 MB` — this file alone would nearly
 *     drain the remaining quota; the subsequent save is very likely
 *     to fail.
 *   - tight: headroom `< 100 MB` — the file fits, but there is
 *     little room left for revision history or further edits.
 */
export const FILE_HEADROOM_TIGHT_BYTES = 100 * 1024 * 1024;
export const FILE_HEADROOM_RISKY_BYTES = 10 * 1024 * 1024;

/**
 * Defensive wrapper over `navigator.storage.estimate()`.
 *
 * Never rejects — returns `{ available: false }` when the API is
 * unreachable or throws.  Callers that surface UI must branch on
 * `available` and on the presence of `quota` / `usage` before
 * using the numeric fields.
 */
export async function estimateStorage(): Promise<StorageEstimateResult> {
  // Guard against non-browser / happy-dom-without-navigator contexts.
  if (typeof navigator === 'undefined') return { available: false };

  const storage = (navigator as Navigator & { storage?: StorageManager }).storage;
  if (!storage || typeof storage.estimate !== 'function') {
    return { available: false };
  }

  try {
    const est = await storage.estimate();
    const quota =
      typeof est.quota === 'number' && Number.isFinite(est.quota)
        ? est.quota
        : undefined;
    const usage =
      typeof est.usage === 'number' && Number.isFinite(est.usage)
        ? est.usage
        : undefined;
    const free =
      quota !== undefined && usage !== undefined
        ? Math.max(0, quota - usage)
        : undefined;
    return { available: true, quota, usage, free };
  } catch {
    // Some engines throw for cross-origin iframes, private mode, etc.
    return { available: false };
  }
}

/**
 * Classify raw free-space in bytes into a verdict for the boot-time
 * banner.
 */
export function classifyFreeSpace(freeBytes: number): FreeSpaceVerdict {
  if (freeBytes < CRITICAL_FREE_THRESHOLD_BYTES) return 'critical';
  if (freeBytes < LOW_FREE_THRESHOLD_BYTES) return 'low';
  return 'ok';
}

/**
 * Classify free-space relative to a pending file into a preflight
 * verdict.  `fileBytes` must be non-negative; negative values are
 * clamped to 0.
 */
export function classifyFreeSpaceVsFile(
  freeBytes: number,
  fileBytes: number,
): PreflightVerdict {
  const size = Math.max(0, fileBytes);
  const headroom = freeBytes - size;
  if (headroom < FILE_HEADROOM_RISKY_BYTES) return 'risky';
  if (headroom < FILE_HEADROOM_TIGHT_BYTES) return 'tight';
  return 'ok';
}

/**
 * Build a boot-time warning message.  Returns `null` when no
 * warning is warranted (API unavailable, free unknown, or free
 * space comfortably above thresholds).
 */
export function bootWarningMessage(result: StorageEstimateResult): string | null {
  if (!result.available || result.free === undefined) return null;
  const verdict = classifyFreeSpace(result.free);
  if (verdict === 'ok') return null;
  const freeMb = formatMb(result.free);
  if (verdict === 'critical') {
    return (
      `Browser storage is nearly full (~${freeMb} free). ` +
      `Saves or large attachments may fail — consider exporting now as a backup.`
    );
  }
  return (
    `Browser storage is low (~${freeMb} free). ` +
    `Large attachments may fail to persist; keep an export on hand.`
  );
}

/**
 * Build an attachment-preflight warning message for a specific
 * pending file.  Returns `null` when no warning is warranted.
 */
export function attachmentWarningMessage(
  result: StorageEstimateResult,
  fileBytes: number,
): string | null {
  if (!result.available || result.free === undefined) return null;
  const verdict = classifyFreeSpaceVsFile(result.free, fileBytes);
  if (verdict === 'ok') return null;
  const freeMb = formatMb(result.free);
  const fileMb = formatMb(fileBytes);
  if (verdict === 'risky') {
    return (
      `This attachment (${fileMb}) is close to the remaining browser ` +
      `storage (~${freeMb} free). The save may fail — export before ` +
      `attaching if the current state matters.`
    );
  }
  return (
    `Browser storage is tight (~${freeMb} free) relative to this ` +
    `attachment (${fileMb}). Consider exporting now as a precaution.`
  );
}

function formatMb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  return `${Math.max(0, Math.round(bytes / (1024 * 1024)))} MB`;
}
