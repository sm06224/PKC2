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

/**
 * Build the set of lids that appear in ANY relation, as either `from`
 * or `to`. Used by the sidebar renderer (v1 relations-based orphan
 * marker) so that per-row lookup is O(1) — see
 * docs/development/orphan-detection-ui-v1.md.
 *
 * Notes:
 * - Self-loop relations (`from === to`) contribute the lid once.
 * - Dangling relations (pointing to a deleted entry) include the
 *   missing lid in the set; that's harmless because the sidebar only
 *   queries lids that exist in `container.entries`.
 *
 * Complexity: O(R) where R = relations.length.
 */
export function buildConnectedLidSet(
  relations: readonly Relation[],
): Set<string> {
  const set = new Set<string>();
  for (const r of relations) {
    set.add(r.from);
    set.add(r.to);
  }
  return set;
}

/**
 * Build a `Map<targetLid, inboundCount>` in one pass over the relations
 * array. Used by the sidebar renderer (v1 backlink count badge) so that
 * per-row lookup is O(1) rather than repeated `getRelationsForEntry`
 * scans — see docs/development/sidebar-backlink-badge-v1.md.
 *
 * Notes:
 * - Counts ALL inbound relations regardless of kind (semantic,
 *   structural, categorical, temporal, provenance). Kind filtering is
 *   not a v1 requirement.
 * - A self-loop relation (`from === to`) is counted once on that entry.
 * - Dangling relations (pointing to a deleted entry) remain in the map
 *   harmlessly; callers that look up by existing lids are unaffected.
 *
 * Complexity: O(R) where R = relations.length.
 */
export function buildInboundCountMap(
  relations: readonly Relation[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of relations) {
    counts.set(r.to, (counts.get(r.to) ?? 0) + 1);
  }
  return counts;
}
