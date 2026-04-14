/**
 * User-facing formatting for ZIP import warnings (P0-5 surfacing).
 *
 * P0-5 added `ZipImportWarning[]` to the ZIP importer's success result
 * to record non-fatal issues (duplicate entries, path-unsafe keys).
 * The information was retained inside the platform layer but never
 * reached the user. This module converts warnings into short,
 * human-readable strings suitable for a toast / banner while
 * preserving the full structured detail for console logging.
 *
 * Design notes:
 *   - Pure functions, no DOM. Tested without happy-dom.
 *   - Messages are intentionally terse: a toast has ~80 chars of
 *     readable space before wrapping gets ugly.
 *   - Quotes around `key` are straight ASCII so the text does not
 *     depend on typographic-quote availability.
 *   - The summary message for multiple warnings stays stable even
 *     as new warning codes are added — it never enumerates codes
 *     inline, only counts.
 *
 * Canonical spec: `docs/spec/data-model.md` §11.7 (collision
 * policy). See also `src/adapter/platform/zip-package.ts` for the
 * ZipImportWarning / ZipImportWarningCode definitions.
 */

import type {
  ZipImportWarning,
  ZipImportWarningCode,
} from '../platform/zip-package';

/**
 * Render one warning as a single-line human message. Always includes
 * enough context (the key, the "kept first" decision) to be
 * actionable without reading the raw structure.
 */
export function formatZipImportWarning(w: ZipImportWarning): string {
  switch (w.code) {
    case 'DUPLICATE_ASSET_SAME_CONTENT':
      return `Duplicate asset key "${w.key ?? '?'}" with identical content — deduplicated.`;
    case 'DUPLICATE_ASSET_CONFLICT':
      return `Asset key "${w.key ?? '?'}" had conflicting contents — kept the first occurrence.`;
    case 'DUPLICATE_MANIFEST':
      return `ZIP contained multiple manifest.json entries — kept the first.`;
    case 'DUPLICATE_CONTAINER_JSON':
      return `ZIP contained multiple container.json entries — kept the first.`;
    case 'INVALID_ASSET_KEY':
      return `Skipped asset with unsafe key ${JSON.stringify(w.key ?? '')}.`;
    default: {
      // Exhaustiveness guard: a new code added to ZipImportWarningCode
      // without a case here is a compile-time error. The fallback
      // text is only reached when the type union is widened without
      // updating this switch.
      const _exhaustive: never = w.code;
      return _exhaustive;
    }
  }
}

/**
 * Summary returned by `summarizeZipImportWarnings`. Callers show
 * `summary` in the toast and optionally log `details` to the console
 * so operators can audit what happened.
 */
export interface ZipImportWarningSummary {
  /** Single-line message suitable for a toast. */
  summary: string;
  /** Per-warning messages, one per input warning, in input order. */
  details: string[];
}

/**
 * Collapse an array of warnings into a toast-friendly summary plus
 * an ordered `details[]` the caller can dump to the console.
 *
 * Rules:
 *   - Empty / null / undefined input is a no-op — returns empty
 *     summary so the caller can decide to skip the toast entirely.
 *   - Exactly one warning → `summary` is the single warning text.
 *   - Two or more warnings → `summary` is a "N warnings" count
 *     aggregation; per-warning text still appears in `details`.
 */
export function summarizeZipImportWarnings(
  warnings: readonly ZipImportWarning[] | undefined | null,
): ZipImportWarningSummary {
  if (!warnings || warnings.length === 0) {
    return { summary: '', details: [] };
  }
  const details = warnings.map(formatZipImportWarning);
  if (warnings.length === 1) {
    return { summary: `ZIP import succeeded with a warning: ${details[0]!}`, details };
  }
  const counts = countByCode(warnings);
  const entries = Object.entries(counts) as [ZipImportWarningCode, number][];
  // Sort by count desc. Ties break on code-string asc so the output
  // is deterministic across runs — helpful for tests and for users
  // comparing two imports.
  entries.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  const mostCommon = entries[0]!;
  const distinct = entries.length;
  const summary = `ZIP import succeeded with ${warnings.length} warnings ` +
    `(${distinct} kind${distinct === 1 ? '' : 's'}; ` +
    `most common: ${friendlyCode(mostCommon[0])}). ` +
    `See console for details.`;
  return { summary, details };
}

/** Internal: tally of warnings strictly by code. Distinct-code count
 *  is derived from `Object.keys(...).length` so the map never mixes
 *  "codes" and "meta" fields. */
type CodeCounts = Partial<Record<ZipImportWarningCode, number>>;

function countByCode(warnings: readonly ZipImportWarning[]): CodeCounts {
  const out: CodeCounts = {};
  for (const w of warnings) {
    out[w.code] = (out[w.code] ?? 0) + 1;
  }
  return out;
}

/**
 * Short human-readable label for a single warning code — used in the
 * multi-warning summary line as "most common: …". Keep the phrasing
 * non-parenthetical so the enclosing summary sentence flows.
 */
function friendlyCode(code: ZipImportWarningCode): string {
  switch (code) {
    case 'DUPLICATE_ASSET_SAME_CONTENT':
      return 'duplicate assets (same content)';
    case 'DUPLICATE_ASSET_CONFLICT':
      return 'asset key conflicts';
    case 'DUPLICATE_MANIFEST':
      return 'duplicate manifest.json';
    case 'DUPLICATE_CONTAINER_JSON':
      return 'duplicate container.json';
    case 'INVALID_ASSET_KEY':
      return 'unsafe asset keys';
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}
