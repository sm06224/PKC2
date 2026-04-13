import type { ArchetypeId, Entry } from '../model/record';

/**
 * Archetype interface: defines how an Entry's body is parsed,
 * serialized, and displayed for a given archetype.
 *
 * Canonical spec: `docs/spec/body-formats.md` (archetype-specific body contracts)
 * and `docs/spec/data-model.md` §4 (ArchetypeId enumeration).
 */
export interface Archetype<TView = unknown> {
  id: ArchetypeId;
  parseBody(body: string): TView;
  serializeBody(view: TView): string;
  deriveTitle(entry: Entry): string;
  getStatus?(entry: Entry): string | null;
}

const archetypeRegistry = new Map<ArchetypeId, Archetype>();

export function registerArchetype(arch: Archetype): void {
  archetypeRegistry.set(arch.id, arch);
}

export function getArchetype(id: ArchetypeId): Archetype {
  return archetypeRegistry.get(id) ?? archetypeRegistry.get('generic')!;
}
