/**
 * Vendored PKC2 data-model types — a faithful minimal subset of
 * `src/core/model/*` sufficient for the graph extension to consume a
 * Container received from a host PKC2 (via PKC-Message) or imported from
 * an exported `.pkc` / pkc-data payload.
 *
 * Kept structurally identical to the host so JSON round-trips unchanged.
 * Source of truth for the full contract remains the PKC2 repo.
 */

export type ArchetypeId =
  | 'text'
  | 'textlog'
  | 'todo'
  | 'form'
  | 'attachment'
  | 'folder'
  | 'generic'
  | 'opaque'
  | 'spreadsheet';

export type RelationKind =
  | 'structural'   // folder membership
  | 'categorical'  // tag classification
  | 'semantic'     // meaning-based reference
  | 'temporal'     // time-based ordering
  | 'provenance';  // origin tracking

export interface Entry {
  lid: string;
  title: string;
  body: string;
  archetype: ArchetypeId;
  created_at: string;
  updated_at: string;
  tags?: string[];
  color_tag?: string | null;
  /** Filer view subset profile — meaningful only when archetype === 'folder'. */
  display_profile?: { kind: string } & Record<string, unknown>;
}

export interface Relation {
  id: string;
  from: string;
  to: string;
  kind: RelationKind;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface Revision {
  id: string;
  entry_lid: string;
  snapshot: string;
  created_at: string;
}

export interface ContainerMeta {
  container_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  schema_version: number;
}

export interface Container {
  meta: ContainerMeta;
  entries: Entry[];
  relations: Relation[];
  revisions: Revision[];
  assets: { [key: string]: string };
}
