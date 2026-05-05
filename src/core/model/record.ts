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
  | 'system-settings'
  | 'system-flags';

export const ABOUT_LID = '__about__';
export const SETTINGS_LID = '__settings__';
export const FLAGS_LID = '__flags__';

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
  /**
   * Color tag — Slice 3 visual marker (additive, optional).
   *
   * Element type is `string` rather than `ColorTagId` so an unknown
   * palette ID (e.g. a future palette extension) round-trips through
   * a write / read cycle unchanged. Data model spec §3.3 / §4.5 / §7.2
   * require unknown IDs to be preserved, not silently dropped.
   *
   * Missing / `null` / `undefined` are equivalent ("no color"). Write
   * paths drop the field entirely when the in-memory color is cleared,
   * so on-disk JSON for un-coloured entries stays identical to its
   * pre-Slice-3 shape.
   *
   * Canonical spec: `docs/spec/color-tag-data-model-v1-minimum-scope.md` §3.
   */
  color_tag?: string | null;
  /**
   * Filer view subset profile — meaningful only when archetype === 'folder'.
   * Determines how the folder's children are rendered in filer view.
   *
   * Phase 1 supports `'explorer'` (default if undefined). Phase 2b adds
   * `'graph'`, Phase 3a adds `'contact-sheet' | 'book-base' | 'youtube-base'`.
   *
   * Backward compat: undefined treated as `'explorer'`. Old reader ignores
   * the field; old writer never sets it. additive optional, no schema
   * version bump.
   *
   * Canonical spec: `docs/development/filer-view-explorer-subset-spec.md` §2.3.
   */
  display_profile?: FilerProfile;
}

/**
 * Filer view subset profile — discriminated union.
 *
 * Each kind defines how the children of a folder are presented in
 * filer view:
 *   - 'explorer'      : table (Phase 1)
 *   - 'contact-sheet' : grid of image attachments (Phase 3a)
 *   - 'book-base'     : grid of card-style book entries (Phase 3a)
 *   - 'youtube-base'  : grid of card-style YouTube notes (Phase 3a)
 *   - 'graph'         : force-directed network of TEXT + relations
 *                       (Phase 2b — reserved kind)
 *
 * Backward compat: undefined treated as `'explorer'`. Old reader
 * ignores the field; old writer never sets it.
 */
export type FilerProfile =
  | { kind: 'explorer'; columns?: FilerColumnId[] }
  | { kind: 'contact-sheet'; cell_size?: 'sm' | 'md' | 'lg' }
  | { kind: 'book-base' }
  | { kind: 'video-base' }
  | { kind: 'novel-base' }
  | { kind: 'graph' };

export type FilerColumnId = 'name' | 'archetype' | 'updated_at' | 'tags';
