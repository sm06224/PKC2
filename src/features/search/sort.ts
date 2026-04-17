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

/**
 * Sort key: which Entry field to sort by, plus `'manual'` for
 * user-defined ordering (C-2 v1, 2026-04-17). Under `'manual'`,
 * `sortEntries` behaves as identity — real manual ordering is applied
 * by `features/entry-order/entry-order.ts#applyManualOrder` using
 * `container.meta.entry_order`.
 */
export type SortKey = 'title' | 'created_at' | 'updated_at' | 'manual';

/** Sort direction. */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort entries by the given key and direction.
 * Returns a new array (does not mutate the input).
 * Uses stable sort (Array.prototype.sort is stable in modern engines).
 *
 * `'manual'` returns a copy of the input unchanged — the caller is
 * expected to have already applied manual ordering upstream (the
 * renderer / UI slice routes `sortKey === 'manual'` through
 * `applyManualOrder` instead of this function).
 */
export function sortEntries(
  entries: Entry[],
  key: SortKey,
  direction: SortDirection,
): Entry[] {
  if (key === 'manual') return [...entries];
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
