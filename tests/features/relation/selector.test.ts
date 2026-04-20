import { describe, it, expect } from 'vitest';
import {
  buildConnectedLidSet,
  buildInboundCountMap,
  getRelationsForEntry,
  resolveRelations,
} from '@features/relation/selector';
import type { Relation } from '@core/model/relation';
import type { Entry } from '@core/model/record';

function makeRelation(
  id: string, from: string, to: string, kind: Relation['kind'] = 'semantic',
): Relation {
  return { id, from, to, kind, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}

function makeEntry(lid: string, title: string): Entry {
  return { lid, title, body: '', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}

const relations: Relation[] = [
  makeRelation('r1', 'e1', 'e2', 'structural'),
  makeRelation('r2', 'e3', 'e1', 'categorical'),
  makeRelation('r3', 'e2', 'e3', 'semantic'),
];

const entries: Entry[] = [
  makeEntry('e1', 'Alpha'),
  makeEntry('e2', 'Beta'),
  makeEntry('e3', 'Gamma'),
];

describe('getRelationsForEntry', () => {
  it('returns outbound relations', () => {
    const result = getRelationsForEntry(relations, 'e1');
    const outbound = result.filter((r) => r.direction === 'outbound');
    expect(outbound).toHaveLength(1);
    expect(outbound[0]!.peerLid).toBe('e2');
    expect(outbound[0]!.relation.kind).toBe('structural');
  });

  it('returns inbound relations', () => {
    const result = getRelationsForEntry(relations, 'e1');
    const inbound = result.filter((r) => r.direction === 'inbound');
    expect(inbound).toHaveLength(1);
    expect(inbound[0]!.peerLid).toBe('e3');
    expect(inbound[0]!.relation.kind).toBe('categorical');
  });

  it('returns both directions for an entry', () => {
    const result = getRelationsForEntry(relations, 'e1');
    expect(result).toHaveLength(2);
  });

  it('returns empty for entry with no relations', () => {
    expect(getRelationsForEntry(relations, 'e999')).toEqual([]);
  });

  it('returns empty for empty relations array', () => {
    expect(getRelationsForEntry([], 'e1')).toEqual([]);
  });

  it('handles entry appearing in both from and to of same relation set', () => {
    const result = getRelationsForEntry(relations, 'e2');
    expect(result).toHaveLength(2);
    const outbound = result.filter((r) => r.direction === 'outbound');
    const inbound = result.filter((r) => r.direction === 'inbound');
    expect(outbound).toHaveLength(1);
    expect(outbound[0]!.peerLid).toBe('e3');
    expect(inbound).toHaveLength(1);
    expect(inbound[0]!.peerLid).toBe('e1');
  });
});

describe('resolveRelations', () => {
  it('resolves peer entries', () => {
    const directed = getRelationsForEntry(relations, 'e1');
    const resolved = resolveRelations(directed, entries);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]!.peer.title).toBe('Beta');
    expect(resolved[1]!.peer.title).toBe('Gamma');
  });

  it('omits relations with missing peer entry', () => {
    const directed = getRelationsForEntry(relations, 'e1');
    const partialEntries = [makeEntry('e2', 'Beta')]; // e3 missing
    const resolved = resolveRelations(directed, partialEntries);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.peer.lid).toBe('e2');
  });

  it('returns empty for empty directed array', () => {
    expect(resolveRelations([], entries)).toEqual([]);
  });

  it('preserves direction in resolved result', () => {
    const directed = getRelationsForEntry(relations, 'e1');
    const resolved = resolveRelations(directed, entries);
    const outbound = resolved.find((r) => r.direction === 'outbound');
    const inbound = resolved.find((r) => r.direction === 'inbound');
    expect(outbound).toBeDefined();
    expect(inbound).toBeDefined();
    expect(outbound!.peer.lid).toBe('e2');
    expect(inbound!.peer.lid).toBe('e3');
  });

  it('preserves relation kind', () => {
    const directed = getRelationsForEntry(relations, 'e1');
    const resolved = resolveRelations(directed, entries);
    expect(resolved[0]!.relation.kind).toBe('structural');
    expect(resolved[1]!.relation.kind).toBe('categorical');
  });
});

// ── buildInboundCountMap (v1 sidebar backlink count badge) ──

describe('buildInboundCountMap', () => {
  it('returns an empty map for an empty relations array', () => {
    const map = buildInboundCountMap([]);
    expect(map.size).toBe(0);
  });

  it('counts one relation against its `to` lid', () => {
    const map = buildInboundCountMap([makeRelation('r1', 'a', 'b')]);
    expect(map.get('b')).toBe(1);
    expect(map.get('a')).toBeUndefined();
  });

  it('sums multiple relations targeting the same entry', () => {
    const map = buildInboundCountMap([
      makeRelation('r1', 'a', 'target'),
      makeRelation('r2', 'b', 'target'),
      makeRelation('r3', 'c', 'target'),
    ]);
    expect(map.get('target')).toBe(3);
  });

  it('ignores relation kind (all kinds counted together)', () => {
    const map = buildInboundCountMap([
      makeRelation('r1', 'a', 'target', 'structural'),
      makeRelation('r2', 'b', 'target', 'semantic'),
      makeRelation('r3', 'c', 'target', 'categorical'),
      makeRelation('r4', 'd', 'target', 'temporal'),
      makeRelation('r5', 'e', 'target', 'provenance'),
    ]);
    expect(map.get('target')).toBe(5);
  });

  it('counts a self-loop (`from === to`) once on that entry', () => {
    const map = buildInboundCountMap([makeRelation('r1', 'x', 'x')]);
    expect(map.get('x')).toBe(1);
  });

  it('tolerates dangling targets (no entries cleanup performed)', () => {
    // No entries provided / pertinent — helper is purely a counter
    const map = buildInboundCountMap([
      makeRelation('r1', 'a', 'ghost'),
      makeRelation('r2', 'ghost', 'a'),
    ]);
    expect(map.get('ghost')).toBe(1);
    expect(map.get('a')).toBe(1);
  });

  it('processes the sample relations fixture correctly', () => {
    // relations contains r1: e1→e2, r2: e3→e1, r3: e2→e3
    const map = buildInboundCountMap(relations);
    expect(map.get('e1')).toBe(1); // from r2 (e3→e1)
    expect(map.get('e2')).toBe(1); // from r1 (e1→e2)
    expect(map.get('e3')).toBe(1); // from r3 (e2→e3)
    expect(map.size).toBe(3);
  });
});

// ── buildConnectedLidSet (v1 relations-based orphan detection) ──

describe('buildConnectedLidSet', () => {
  it('returns an empty set for an empty relations array', () => {
    const set = buildConnectedLidSet([]);
    expect(set.size).toBe(0);
  });

  it('contains both endpoints of each relation', () => {
    const set = buildConnectedLidSet([makeRelation('r1', 'a', 'b')]);
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(true);
    expect(set.size).toBe(2);
  });

  it('deduplicates lids that appear multiple times', () => {
    const set = buildConnectedLidSet([
      makeRelation('r1', 'a', 'b'),
      makeRelation('r2', 'b', 'c'),
      makeRelation('r3', 'a', 'c'),
    ]);
    expect(set.size).toBe(3);
    expect([...set].sort()).toEqual(['a', 'b', 'c']);
  });

  it('is kind-agnostic', () => {
    const set = buildConnectedLidSet([
      makeRelation('r1', 'a', 'b', 'structural'),
      makeRelation('r2', 'c', 'd', 'semantic'),
      makeRelation('r3', 'e', 'f', 'categorical'),
      makeRelation('r4', 'g', 'h', 'temporal'),
      makeRelation('r5', 'i', 'j', 'provenance'),
    ]);
    expect(set.size).toBe(10);
  });

  it('counts self-loop lids once', () => {
    const set = buildConnectedLidSet([makeRelation('r1', 'x', 'x')]);
    expect(set.size).toBe(1);
    expect(set.has('x')).toBe(true);
  });

  it('returns dangling lids too (caller queries by existing lids only)', () => {
    const set = buildConnectedLidSet([makeRelation('r1', 'a', 'ghost')]);
    expect(set.has('a')).toBe(true);
    expect(set.has('ghost')).toBe(true);
  });

  it('processes the shared relations fixture correctly', () => {
    // r1: e1→e2, r2: e3→e1, r3: e2→e3 — every lid is involved
    const set = buildConnectedLidSet(relations);
    expect(set.size).toBe(3);
    expect(set.has('e1')).toBe(true);
    expect(set.has('e2')).toBe(true);
    expect(set.has('e3')).toBe(true);
  });
});
