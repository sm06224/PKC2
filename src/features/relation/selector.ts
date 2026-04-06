import type { Relation } from '../../core/model/relation';
import type { Entry } from '../../core/model/record';

export type Direction = 'outbound' | 'inbound';

export interface DirectedRelation {
  relation: Relation;
  direction: Direction;
  peerLid: string;
}

export interface ResolvedRelation {
  relation: Relation;
  direction: Direction;
  peer: Entry;
}

/**
 * Get all relations involving the given entry, classified by direction.
 */
export function getRelationsForEntry(
  relations: readonly Relation[],
  lid: string,
): DirectedRelation[] {
  const result: DirectedRelation[] = [];
  for (const r of relations) {
    if (r.from === lid) {
      result.push({ relation: r, direction: 'outbound', peerLid: r.to });
    } else if (r.to === lid) {
      result.push({ relation: r, direction: 'inbound', peerLid: r.from });
    }
  }
  return result;
}

/**
 * Resolve peer entries for directed relations.
 * Relations whose peer entry cannot be found are omitted.
 */
export function resolveRelations(
  directed: readonly DirectedRelation[],
  entries: readonly Entry[],
): ResolvedRelation[] {
  const entryMap = new Map(entries.map((e) => [e.lid, e]));
  const result: ResolvedRelation[] = [];
  for (const d of directed) {
    const peer = entryMap.get(d.peerLid);
    if (peer) {
      result.push({ relation: d.relation, direction: d.direction, peer });
    }
  }
  return result;
}
