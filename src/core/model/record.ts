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
  | 'system-about'
  | 'system-settings';

export const ABOUT_LID = '__about__';
export const SETTINGS_LID = '__settings__';

export function isReservedLid(lid: string): boolean {
  return lid.startsWith('__') && lid.endsWith('__') && lid.length > 4;
}

/**
 * System archetypes carry PKC2-managed entries (about / settings) that
 * are not user content. They exist in the container but must be excluded
 * from "is this workspace empty?" / "should we boot from IDB?" decisions
 * and from sidebar/search/relation listings.
 *
 * Membership uses a string-prefix check so future system-* archetypes
 * (e.g. `system-settings`) are recognized even before their literal type
 * is added to the ArchetypeId union.
 */
export function isSystemArchetype(archetype: string): boolean {
  return archetype.startsWith('system-');
}

export function isUserEntry(entry: Entry): boolean {
  return !isSystemArchetype(entry.archetype);
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
  /**
   * W1 Slice B / Slice D — additive optional Tag attribute. Each
   * entry in the list is a Slice B §4 normalized string (trimmed,
   * non-empty, ≤ 64 chars, no control chars, case-sensitive,
   * deduped). Order is insertion-order.
   *
   * Missing and empty-array are treated as equivalent by all read
   * paths ("no tags"). Write paths(Tag UI / import / record:offer)
   * will route through a single normalizer as they land in later
   * slices; Slice D's filter pipeline only reads this field.
   *
   * Canonical spec: `docs/spec/tag-data-model-v1-minimum-scope.md`.
   */
  tags?: string[];
}
