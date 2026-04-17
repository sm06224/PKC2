/**
 * Entry Ordering: user-defined manual order for sidebar display.
 *
 * C-2 v1 (2026-04-17). Canonical contract:
 * `docs/spec/entry-ordering-v1-behavior-contract.md`.
 *
 * Pure helpers only. This module lives in features/ (Layer 3) and:
 * - imports only from `core/model` (read-only types)
 * - does NOT access browser APIs
 * - does NOT dispatch actions or touch AppState
 *
 * Responsibilities:
 * - Normalize a persisted `entry_order` against the live `entries` list
 *   (dedupe, drop dangling lids) — I-Order10.
 * - Snapshot an initial order (updated_at desc) when the user first
 *   enters manual mode or first triggers Move up/down — §2.5 of the
 *   contract.
 * - Project manual order onto a filtered entry list (appending
 *   un-ordered entries at the tail) — §2.2 B of the contract.
 * - Compute the swap result for Move up / Move down, updating the
 *   global `entry_order` so that the swap is reflected even when
 *   only a visible subset is showing (I-Order3 + §6.2).
 *
 * None of these helpers consult `AppState` directly; the reducer is
 * responsible for passing in the domain / visible lid arrays that
 * express the active selection / filter / folder context.
 */

import type { Entry } from '../../core/model/record';

/**
 * Normalize a persisted `entry_order` against the authoritative entry
 * set. Dedupes (first occurrence wins) and drops lids that are no
 * longer present in `entries`. Returns an empty array when the input
 * is `undefined` or empty. Never appends missing entries — use
 * `ensureEntryOrder` for that.
 */
export function normalizeEntryOrder(
  order: readonly string[] | undefined,
  entries: readonly Entry[],
): string[] {
  if (!order || order.length === 0) return [];
  const valid = new Set(entries.map((e) => e.lid));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const lid of order) {
    if (!valid.has(lid)) continue;
    if (seen.has(lid)) continue;
    seen.add(lid);
    out.push(lid);
  }
  return out;
}

/**
 * Snapshot ordering for the initial transition into manual mode.
 * Contract §2.5: "全 entry × updated_at desc で一括生成".
 *
 * Stable across equal `updated_at` values: input order is preserved
 * as a tiebreaker so the snapshot is deterministic for fixtures.
 */
export function snapshotEntryOrder(entries: readonly Entry[]): string[] {
  const indexed = entries.map((e, i) => ({ lid: e.lid, updated_at: e.updated_at, idx: i }));
  indexed.sort((a, b) => {
    if (a.updated_at > b.updated_at) return -1;
    if (a.updated_at < b.updated_at) return 1;
    return a.idx - b.idx;
  });
  return indexed.map((x) => x.lid);
}

/**
 * Produce a valid, complete-enough manual order:
 * 1. Normalize the existing `entry_order` (dedupe + drop dangling).
 * 2. If the result is empty, fall back to a fresh snapshot of all
 *    entries (§2.5 initial-snapshot rule).
 * 3. Otherwise, append any entries that were not yet in the order at
 *    the tail so the result references every entry exactly once
 *    (§2.3 "CREATE_ENTRY → append tail").
 *
 * Caller guarantees: the return value contains every lid in `entries`
 * exactly once, and every lid in the return value exists in `entries`.
 */
export function ensureEntryOrder(
  order: readonly string[] | undefined,
  entries: readonly Entry[],
): string[] {
  const normalized = normalizeEntryOrder(order, entries);
  if (normalized.length === 0) return snapshotEntryOrder(entries);
  const inOrder = new Set(normalized);
  const missing: string[] = [];
  for (const e of entries) {
    if (!inOrder.has(e.lid)) missing.push(e.lid);
  }
  return missing.length === 0 ? normalized : [...normalized, ...missing];
}

/**
 * Apply a manual order to a projected entry list. Entries that appear
 * in `order` come first in that sequence; entries that do not appear
 * are appended in their original input order (§2.2 fallback).
 *
 * The `order` may refer to lids that are not in `entries` (e.g. the
 * current filter hides them). Such references are silently skipped.
 */
export function applyManualOrder(
  entries: readonly Entry[],
  order: readonly string[],
): Entry[] {
  if (entries.length === 0) return [];
  const byLid = new Map<string, Entry>();
  for (const e of entries) byLid.set(e.lid, e);
  const placed = new Set<string>();
  const ordered: Entry[] = [];
  for (const lid of order) {
    const e = byLid.get(lid);
    if (!e || placed.has(lid)) continue;
    ordered.push(e);
    placed.add(lid);
  }
  for (const e of entries) {
    if (!placed.has(e.lid)) ordered.push(e);
  }
  return ordered;
}

/** Direction for Move up / Move down. */
export type MoveDirection = 'up' | 'down';

/**
 * Result of `moveAdjacentInOrder`. `changed === false` means the swap
 * was a no-op (target not visible, at the edge, etc.) and the caller
 * can reuse the prior state reference to preserve `===` identity.
 */
export interface MoveOrderResult {
  order: string[];
  changed: boolean;
}

/**
 * Swap `targetLid` with its visible neighbor (direction) inside the
 * global `entry_order` array. The caller supplies:
 * - `entry_order`: the current (normalized or ensured) manual order.
 * - `domainLids`: the set of lids that belong to the same scope
 *   (root / folder children / flat filter result). Only these entries
 *   are reordered; any non-domain lids retain their slot positions.
 * - `visibleLids`: the display-order list within the domain — i.e.,
 *   what the user currently sees after filter + manual ordering.
 *   Must be a subset of `domainLids`.
 *
 * Algorithm (see contract §4.2 / §6.2):
 *   1. Find `v` = index of `targetLid` in `visibleLids`. If absent or
 *      at the corresponding edge → no-op.
 *   2. Build the swapped `visibleLids` (target ↔ its neighbor).
 *   3. Walk the input `entry_order`: every slot that currently holds a
 *      domain lid is replaced with the next lid from the swapped
 *      visible list, preserving non-domain slots in place. Remaining
 *      visible-but-not-in-order lids are appended at the tail
 *      (I-Order7a new-entry behavior).
 *
 * Non-visible domain entries (e.g., hidden by filter/archive) keep
 * their relative slots — they are not represented in `visibleLids`
 * so the projection above simply skips their positions in the domain
 * sub-sequence. In practice, reducers always pass a pre-normalized
 * `entry_order` that contains every domain entry; the contract
 * guarantees filter-hidden lids stay in place within `entry_order`.
 */
export function moveAdjacentInOrder(
  entry_order: readonly string[],
  domainLids: readonly string[],
  visibleLids: readonly string[],
  targetLid: string,
  direction: MoveDirection,
): MoveOrderResult {
  const v = visibleLids.indexOf(targetLid);
  if (v === -1) return { order: [...entry_order], changed: false };
  const swapWith = direction === 'up' ? v - 1 : v + 1;
  if (swapWith < 0 || swapWith >= visibleLids.length) {
    return { order: [...entry_order], changed: false };
  }

  const newVisible = [...visibleLids];
  const tmp = newVisible[v]!;
  newVisible[v] = newVisible[swapWith]!;
  newVisible[swapWith] = tmp;

  // Build the new order: for each existing slot in entry_order that
  // holds a domain lid, draw the next lid from newVisible. Non-domain
  // slots pass through unchanged. Domain lids that were not already in
  // entry_order (e.g. CREATE_ENTRY tail-append semantics) are inserted
  // at their relative visible position by the "remaining" sweep below.
  const domainSet = new Set(domainLids);
  const visibleSet = new Set(newVisible);
  const queue: string[] = [...newVisible];
  const consumed = new Set<string>();
  const newOrder: string[] = [];

  for (const lid of entry_order) {
    if (domainSet.has(lid) && visibleSet.has(lid)) {
      const next = queue.shift();
      if (next !== undefined) {
        newOrder.push(next);
        consumed.add(next);
      }
      // Else: fewer visible than domain slots in order (can happen
      // when filter hides some). Drop the slot — the hidden lid must
      // have already been pushed earlier in this loop if it existed.
    } else {
      newOrder.push(lid);
    }
  }

  // Append any visible lids that were not yet placed (they were in
  // `visibleLids` but not in `entry_order` — new entries per §2.3).
  for (const lid of queue) {
    if (!consumed.has(lid)) newOrder.push(lid);
  }

  return { order: newOrder, changed: true };
}
