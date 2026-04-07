import type { Relation } from '../../core/model/relation';
import type { Entry } from '../../core/model/record';

/**
 * Check if an entry has a specific tag (outbound categorical relation to tagLid).
 */
export function entryHasTag(
  relations: readonly Relation[],
  entryLid: string,
  tagLid: string,
): boolean {
  return relations.some(
    (r) => r.kind === 'categorical' && r.from === entryLid && r.to === tagLid,
  );
}

/**
 * Filter entries to only those tagged with the given tag (categorical relation).
 * Returns a new array (does not mutate input).
 */
export function filterByTag(
  entries: readonly Entry[],
  relations: readonly Relation[],
  tagLid: string,
): Entry[] {
  return entries.filter((e) => entryHasTag(relations, e.lid, tagLid));
}
