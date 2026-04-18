/**
 * Archetype ID: discriminated union for type-safe dispatch.
 *
 * Canonical spec: `docs/spec/data-model.md` §4
 * Body format per archetype: `docs/spec/body-formats.md`
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
  | 'system-about';

export const ABOUT_LID = '__about__';

export function isReservedLid(lid: string): boolean {
  return lid.startsWith('__') && lid.endsWith('__') && lid.length > 4;
}

/**
 * Entry: the fundamental persistent data unit in PKC2.
 *
 * Renamed from "Record" to avoid collision with TypeScript's
 * built-in Record<K,V> utility type. All fields are persistent;
 * runtime-only state (selection, editing) belongs in AppState.
 *
 * body is always a string — Archetype layer interprets it.
 *
 * Canonical spec: `docs/spec/data-model.md` §3
 * Body format per archetype: `docs/spec/body-formats.md`
 */
export interface Entry {
  lid: string;
  title: string;
  body: string;
  archetype: ArchetypeId;
  created_at: string;
  updated_at: string;
}
