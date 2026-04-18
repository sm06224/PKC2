import { isUserEntry, type Entry } from './record';
import type { Relation } from './relation';

/**
 * Container metadata. Persistent.
 *
 * Canonical spec: `docs/spec/data-model.md` §2.
 */
export interface ContainerMeta {
  container_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  schema_version: number;
  /**
   * Container-level default sandbox policy for HTML/SVG attachment previews.
   * Applied when an individual attachment entry has no per-entry sandbox_allow.
   * - 'strict': allow-same-origin only (default when absent)
   * - 'relaxed': allow-same-origin + allow-scripts + allow-forms
   */
  sandbox_policy?: 'strict' | 'relaxed';
  /**
   * User-defined entry ordering (C-2 v1, 2026-04-17). Additive-only.
   *
   * Absent / empty → no manual order. `AppState.sortKey === 'manual'`
   * reads this list to drive sidebar ordering; all other sort keys
   * ignore it. Invariant list I-Order1〜I-Order10 lives in
   * `docs/spec/entry-ordering-v1-behavior-contract.md`.
   *
   * Load-time normalization (see `entry-order.ts`) deduplicates
   * entries and drops dangling lids. SCHEMA_VERSION is unchanged per
   * additive policy (Option A).
   */
  entry_order?: string[];
}

/**
 * Revision: tracks a historical snapshot of an Entry. Persistent.
 *
 * Canonical spec: `docs/spec/data-model.md` §6.
 * `snapshot` is `JSON.stringify(Entry)` of the pre-mutation state.
 * See `parseRevisionSnapshot` in `core/operations/container-ops.ts`
 * for the parse contract (§6.4).
 *
 * `bulk_id` (added 2026-04-13, bulk-snapshot policy) groups together
 * the revisions produced by a single bulk action — `BULK_DELETE`,
 * `BULK_SET_STATUS`, `BULK_SET_DATE`. When present, a future UI can
 * offer "restore the whole bulk" semantics without inferring groups
 * from timestamps. Absent for single-entry snapshots so the common
 * path stays unchanged. Additive / backward-compatible per spec
 * §15.1 and §6.1.
 *
 * `prev_rid` (added 2026-04-15, H-6 provenance strengthening) points
 * to the most recent prior revision of the same `entry_lid` at the
 * moment this revision was created. Absent when no prior revision
 * existed for that entry. Gives downstream tools a linear
 * entry-history pointer without needing timestamp scans. Additive
 * only — `parseRevisionSnapshot` / `restoreEntry` /
 * `restoreDeletedEntry` do not read this field. Spec §6.2 / §15.5.
 *
 * `content_hash` (added 2026-04-15, H-6) is a 16-char lowercase hex
 * FNV-1a-64 digest of `snapshot`. Serves as an integrity fingerprint
 * and a precondition for future dedup / branch-detection logic.
 * NOT a cryptographic commitment. See `core/operations/hash.ts` and
 * spec §6.2 / `schema-migration-policy.md §3.1` for the rationale on
 * algorithm choice and future upgrade path.
 */
export interface Revision {
  id: string;
  entry_lid: string;
  snapshot: string;
  created_at: string;
  /**
   * Opaque group identifier shared by every revision produced in the
   * same bulk action. Absent on single-entry snapshots.
   */
  bulk_id?: string;
  /**
   * ID of the most recent prior revision for the same `entry_lid` at
   * creation time. Absent when this is the first revision recorded
   * for the entry.
   */
  prev_rid?: string;
  /**
   * 16-char lowercase hex FNV-1a-64 hash of `snapshot`. Absent on
   * revisions imported from pre-H-6 artifacts; new snapshots always
   * populate it.
   */
  content_hash?: string;
}

/**
 * Container: the top-level persistent aggregate.
 * Holds all Entries, Relations, Revisions, and Assets.
 * This is what gets serialized to pkc-data.
 *
 * Canonical spec: `docs/spec/data-model.md` §1.
 */
export interface Container {
  meta: ContainerMeta;
  entries: Entry[];
  relations: Relation[];
  revisions: Revision[];
  assets: { [key: string]: string };
}

/**
 * Returns only user-content entries, excluding system-* archetypes
 * (about, settings, etc). Use this whenever the question is "what does
 * the user have?" — sidebar listings, search results, relation pickers,
 * empty-workspace detection, IDB boot-source decisions.
 */
export function getUserEntries(entries: Entry[]): Entry[] {
  return entries.filter(isUserEntry);
}

/**
 * Whether the container has any user-content entry. System entries
 * (about / settings) do NOT count as content for this purpose: a
 * container with only `__about__` is still effectively empty from the
 * user's perspective.
 */
export function hasUserContent(container: Container): boolean {
  return container.entries.some(isUserEntry);
}

/**
 * Upsert system-* entries onto a container, replacing any existing
 * system entries with the supplied set. User entries and all other
 * container fields (relations, revisions, assets, meta) are preserved.
 *
 * Intended use: at boot, the freshly-built pkc-data payload carries
 * the current system entries (about, settings, …). When booting from
 * IDB or starting empty, we want those system entries to reflect the
 * current build — not whatever stale copy IDB happens to hold — so the
 * boot path merges them in before SYS_INIT_COMPLETE.
 *
 * Policy: **pkc-data wins for system entries**. About is immutable
 * build-time data; Settings, when added, will have its own reconciliation
 * rules (see its behavior contract §I-SETTINGS-3 for import-time host
 * priority — boot-time policy is defined here).
 *
 * Ordering: system entries from `newSystemEntries` are appended to the
 * end of the entries list. Existing entries keep their relative order.
 *
 * Pure: no I/O, no mutation of inputs.
 */
export function mergeSystemEntries(base: Container, newSystemEntries: Entry[]): Container {
  const userEntries = base.entries.filter(isUserEntry);
  return {
    ...base,
    entries: [...userEntries, ...newSystemEntries],
  };
}
