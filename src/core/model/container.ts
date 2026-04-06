import type { Record } from './record';
import type { Relation } from './relation';

/**
 * Container metadata.
 */
export interface ContainerMeta {
  container_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  schema_version: number;
}

/**
 * Revision: tracks a change to a Record.
 */
export interface Revision {
  id: string;
  record_lid: string;
  snapshot: string;
  created_at: string;
}

/**
 * Container: the top-level data structure holding all Records,
 * Relations, Revisions, and Assets.
 */
export interface Container {
  meta: ContainerMeta;
  records: Record[];
  relations: Relation[];
  revisions: Revision[];
  assets: { [key: string]: string };
}
