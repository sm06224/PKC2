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
