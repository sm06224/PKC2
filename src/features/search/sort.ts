/**
 * Sort: entry list ordering for sidebar projection.
 *
 * This module lives in features/ (Layer 3).
 * Sort types and functions are runtime-only concerns —
 * they do NOT belong in core/model (not part of persistent data model).
 *
 * Design:
 * - Pure function: (entries, key, direction) → sorted entries
 * - Stable sort: entries with equal keys preserve their original order
 * - Applied AFTER filter (filter → sort pipeline)
 * - Sort state lives in AppState as runtime-only fields
 *
 * This module does NOT:
 * - Access browser APIs
 * - Modify state or dispatch actions
 * - Touch persistent model
 * - Define core model types
 */

import type { Entry } from '../../core/model/record';

/** Sort key: which Entry field to sort by. */
export type SortKey = 'title' | 'created_at' | 'updated_at';

/** Sort direction. */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort entries by the given key and direction.
 * Returns a new array (does not mutate the input).
 * Uses stable sort (Array.prototype.sort is stable in modern engines).
 */
export function sortEntries(
  entries: Entry[],
  key: SortKey,
  direction: SortDirection,
): Entry[] {
  const sorted = [...entries];
  const dir = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  return sorted;
}
