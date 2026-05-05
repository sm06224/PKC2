/**
 * PKC2 fragment snapshot — wire format used by bookmarklets and other
 * external capture sources.
 *
 * Spec: docs/development/fragment-reference-ir-spec-2026-05.md §3.4
 *
 * The full JSON is base64-encoded into a URL parameter
 * `?pkc-snapshot=<base64>` (or `#pkc-snapshot=…` as a fallback) and
 * detected at boot. PKC2 creates a TEXT entry from it, places it in
 * the Inbox folder, and surfaces a toast — **no modal in the main
 * shell**(2026-05-05 user direction).
 */

import type { CanonicalFragment } from '../fragment/types';

export interface PKC2Snapshot {
  format: 'pkc2-fragment-snapshot';
  version: 1;
  /** Optional canonical fragment IR (URL with locator). */
  fragment?: CanonicalFragment;
  /** Page-level metadata when no fragment is captured. */
  selection?: {
    title?: string;
    snippet?: string;
    url?: string;
  };
  /** ISO 8601 timestamp from the bookmarklet. */
  captured_at?: string;
  /** User-provided memo (optional). */
  comment?: string;
}

export function isSnapshot(v: unknown): v is PKC2Snapshot {
  if (!v || typeof v !== 'object') return false;
  const o = v as { format?: unknown; version?: unknown };
  return o.format === 'pkc2-fragment-snapshot' && o.version === 1;
}
