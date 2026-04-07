import type { Relation } from '../../core/model/relation';
import type { Entry } from '../../core/model/record';

export interface Tag {
  relationId: string;
  peer: Entry;
}

/**
 * Get tags for an entry: categorical relations where the entry is the `from` side.
 * Tags are outbound categorical relations resolved to their peer entries.
 */
export function getTagsForEntry(
  relations: readonly Relation[],
  entries: readonly Entry[],
  lid: string,
): Tag[] {
  const entryMap = new Map(entries.map((e) => [e.lid, e]));
  const result: Tag[] = [];
  for (const r of relations) {
    if (r.kind === 'categorical' && r.from === lid) {
      const peer = entryMap.get(r.to);
      if (peer) {
        result.push({ relationId: r.id, peer });
      }
    }
  }
  return result;
}

/**
 * Get entries that can be used as tag targets for the given entry.
 * Excludes the entry itself and entries already tagged.
 */
export function getAvailableTagTargets(
  relations: readonly Relation[],
  entries: readonly Entry[],
  lid: string,
): Entry[] {
  const tagged = new Set<string>();
  for (const r of relations) {
    if (r.kind === 'categorical' && r.from === lid) {
      tagged.add(r.to);
    }
  }
  return entries.filter((e) => e.lid !== lid && !tagged.has(e.lid));
}
