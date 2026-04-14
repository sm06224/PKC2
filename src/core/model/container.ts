import type { Entry } from './record';
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
