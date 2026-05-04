/**
 * Recent Entries Pane v1 — pure selector.
 *
 * Canonical spec: `docs/development/recent-entries-pane-v1.md`.
 *
 * Features-layer pure helper. No DOM, no AppState, no persistence.
 * Callers recompute per render pass.
 *
 * Sort key:
 *   1. `updated_at` desc
 *   2. `created_at` desc (tie on updated_at)
 *   3. `lid` asc (tie on both timestamps — deterministic)
 *
 * Scope: `isUserEntry(entry)` only (system-* archetypes excluded).
 */

import type { Entry } from '../../core/model/record';
import { isUserEntry } from '../../core/model/record';
import { defineFlag } from '../../core/flags';

/**
 * Live getter for the Recent pane's default limit. Returns the
 * current resolved value (URL > Container > default = 10) on every
 * call, so inspector edits + SET_FLAG dispatches take effect
 * immediately — no page reload required.
 *
 * Exported as a function (not a constant). Call sites destructure
 * the value at use time: `selectRecentEntries(entries, recentEntriesDefaultLimit())`.
 */
export const recentEntriesDefaultLimit = defineFlag<number>(
  'recent.default_limit',
  10,
  {
    range: [1, 100],
    category: 'ui',
    description: 'Recent pane に表示する entry 件数',
    tier: 0,
  },
);
/** @deprecated 2026-05-04: use `recentEntriesDefaultLimit()` for runtime mutability. */
export const RECENT_ENTRIES_DEFAULT_LIMIT = 10;

export function selectRecentEntries(
  entries: readonly Entry[],
  limit: number = recentEntriesDefaultLimit(),
): Entry[] {
  if (limit <= 0) return [];
  const users = entries.filter(isUserEntry);
  const sorted = [...users].sort((a, b) => {
    if (a.updated_at > b.updated_at) return -1;
    if (a.updated_at < b.updated_at) return 1;
    if (a.created_at > b.created_at) return -1;
    if (a.created_at < b.created_at) return 1;
    if (a.lid < b.lid) return -1;
    if (a.lid > b.lid) return 1;
    return 0;
  });
  return sorted.slice(0, limit);
}
