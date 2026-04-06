/**
 * Archetype ID: discriminated union for type-safe dispatch.
 */
export type ArchetypeId =
  | 'text'
  | 'textlog'
  | 'todo'
  | 'form'
  | 'attachment'
  | 'generic'
  | 'opaque';

/**
 * Record: the fundamental data unit in PKC2.
 * body is always a string — Archetype layer interprets it.
 */
export interface Record {
  lid: string;
  title: string;
  body: string;
  archetype: ArchetypeId;
  created_at: string;
  updated_at: string;
}
