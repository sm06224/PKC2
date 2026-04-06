import type { ArchetypeId, Record } from '../model/record';

/**
 * Archetype interface: defines how a Record's body is parsed,
 * serialized, and displayed for a given archetype.
 */
export interface Archetype<TView = unknown> {
  id: ArchetypeId;
  parseBody(body: string): TView;
  serializeBody(view: TView): string;
  deriveTitle(record: Record): string;
  getStatus?(record: Record): string | null;
}

const archetypeRegistry = new Map<ArchetypeId, Archetype>();

export function registerArchetype(arch: Archetype): void {
  archetypeRegistry.set(arch.id, arch);
}

export function getArchetype(id: ArchetypeId): Archetype {
  return archetypeRegistry.get(id) ?? archetypeRegistry.get('generic')!;
}
