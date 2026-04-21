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

export const RECENT_ENTRIES_DEFAULT_LIMIT = 10;

export function selectRecentEntries(
  entries: readonly Entry[],
  limit: number = RECENT_ENTRIES_DEFAULT_LIMIT,
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
