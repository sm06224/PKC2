import { isUserEntry, type Entry } from './record';
import type { Relation } from './relation';
import type { SavedSearch } from './saved-search';

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
  /**
   * User-saved search / filter / sort snapshots (P4 Saved Searches v1,
   * 2026-04-21). Additive-only, optional.
   *
   * Absent / empty → no saved searches. Each entry captures the six
   * AppState fields that define a "search query" at save time
   * (searchQuery, archetypeFilter, tagFilter, sortKey, sortDirection,
   * showArchived). See `docs/development/saved-searches-v1.md` and
   * `src/core/model/saved-search.ts`. Cap: 20 per container.
   *
   * SCHEMA_VERSION unchanged per additive policy.
   */
  saved_searches?: SavedSearch[];
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
 * Upsert system-* entries onto a container per-lid. Entries in
 * `newSystemEntries` overwrite any existing base entry sharing the same
 * lid; system entries whose lid is NOT supplied are preserved. User
 * entries and all other container fields (relations, revisions, assets,
 * meta) are preserved.
 *
 * Intended use: at boot, the freshly-built pkc-data payload carries
 * the build-time system entries (e.g. `__about__`). When booting from
 * IDB, we want the build's copy to replace any stale version — but
 * user-mutable system entries like `__settings__` (which pkc-data does
 * NOT supply) must survive the merge. Prior to 2026-04-18 this function
 * wiped every non-user entry, so `__settings__` was lost on every
 * reboot; see FI-Settings v1 persistence bug.
 *
 * Policy:
 * - **pkc-data wins per-lid** for system entries it supplies (about).
 * - **IDB retains** system entries pkc-data does not mention
 *   (`__settings__`, future system-* entries).
 *
 * Ordering: existing base entries keep their relative order. Brand-new
 * system entries (lids not present in base) are appended to the end.
 *
 * Pure: no I/O, no mutation of inputs.
 */
export function mergeSystemEntries(base: Container, newSystemEntries: Entry[]): Container {
  const supplied = new Map(newSystemEntries.map((e) => [e.lid, e]));
  const mergedExisting = base.entries.map((e) => supplied.get(e.lid) ?? e);
  const existingLids = new Set(base.entries.map((e) => e.lid));
  const appended = newSystemEntries.filter((e) => !existingLids.has(e.lid));
  return {
    ...base,
    entries: [...mergedExisting, ...appended],
  };
}
