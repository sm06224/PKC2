import type { Entry } from './record';
import type { Relation } from './relation';

/**
 * Container metadata. Persistent.
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
 */
export interface Revision {
  id: string;
  entry_lid: string;
  snapshot: string;
  created_at: string;
}

/**
 * Container: the top-level persistent aggregate.
 * Holds all Entries, Relations, Revisions, and Assets.
 * This is what gets serialized to pkc-data.
 */
export interface Container {
  meta: ContainerMeta;
  entries: Entry[];
  relations: Relation[];
  revisions: Revision[];
  assets: { [key: string]: string };
}
