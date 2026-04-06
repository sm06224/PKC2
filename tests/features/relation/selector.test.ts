import { describe, it, expect } from 'vitest';
import { getRelationsForEntry, resolveRelations } from '@features/relation/selector';
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
