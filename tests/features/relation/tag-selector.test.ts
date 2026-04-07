import { describe, it, expect } from 'vitest';
import { getTagsForEntry, getAvailableTagTargets } from '@features/relation/tag-selector';
import type { Relation } from '@core/model/relation';
import type { Entry } from '@core/model/record';

function makeRelation(
  id: string, from: string, to: string, kind: Relation['kind'] = 'categorical',
): Relation {
  return { id, from, to, kind, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}

function makeEntry(lid: string, title: string): Entry {
  return { lid, title, body: '', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}

const entries: Entry[] = [
  makeEntry('e1', 'Alpha'),
  makeEntry('e2', 'Beta'),
  makeEntry('e3', 'Gamma'),
  makeEntry('e4', 'Delta'),
];

const relations: Relation[] = [
  makeRelation('r1', 'e1', 'e2', 'categorical'),  // e1 tagged with e2
  makeRelation('r2', 'e1', 'e3', 'categorical'),  // e1 tagged with e3
  makeRelation('r3', 'e1', 'e4', 'semantic'),      // NOT a tag (semantic)
  makeRelation('r4', 'e2', 'e1', 'categorical'),  // e2 tagged with e1 (not e1's tag)
];

describe('getTagsForEntry', () => {
  it('returns categorical outbound relations as tags', () => {
    const tags = getTagsForEntry(relations, entries, 'e1');
    expect(tags).toHaveLength(2);
    expect(tags[0]!.peer.title).toBe('Beta');
    expect(tags[1]!.peer.title).toBe('Gamma');
  });

  it('includes relation id for deletion', () => {
    const tags = getTagsForEntry(relations, entries, 'e1');
    expect(tags[0]!.relationId).toBe('r1');
    expect(tags[1]!.relationId).toBe('r2');
  });

  it('excludes non-categorical relations', () => {
    const tags = getTagsForEntry(relations, entries, 'e1');
    const ids = tags.map((t) => t.relationId);
    expect(ids).not.toContain('r3'); // semantic relation excluded
  });

  it('excludes inbound categorical relations', () => {
    const tags = getTagsForEntry(relations, entries, 'e1');
    const ids = tags.map((t) => t.relationId);
    expect(ids).not.toContain('r4'); // e2→e1 is inbound for e1
  });

  it('returns empty for entry with no tags', () => {
    expect(getTagsForEntry(relations, entries, 'e4')).toEqual([]);
  });

  it('returns empty for empty relations', () => {
    expect(getTagsForEntry([], entries, 'e1')).toEqual([]);
  });

  it('omits tags whose peer entry is missing', () => {
    const partial = [makeEntry('e2', 'Beta')]; // e3 missing
    const tags = getTagsForEntry(relations, partial, 'e1');
    expect(tags).toHaveLength(1);
    expect(tags[0]!.peer.lid).toBe('e2');
  });
});

describe('getAvailableTagTargets', () => {
  it('excludes self and already-tagged entries', () => {
    const available = getAvailableTagTargets(relations, entries, 'e1');
    const lids = available.map((e) => e.lid);
    expect(lids).not.toContain('e1'); // self
    expect(lids).not.toContain('e2'); // already tagged
    expect(lids).not.toContain('e3'); // already tagged
    expect(lids).toContain('e4');     // semantic relation, not categorical
  });

  it('returns all non-self entries when no tags exist', () => {
    const available = getAvailableTagTargets([], entries, 'e1');
    expect(available).toHaveLength(3);
    expect(available.map((e) => e.lid)).toEqual(['e2', 'e3', 'e4']);
  });

  it('returns empty when all entries are tagged', () => {
    const allTagged: Relation[] = [
      makeRelation('r1', 'e1', 'e2', 'categorical'),
      makeRelation('r2', 'e1', 'e3', 'categorical'),
      makeRelation('r3', 'e1', 'e4', 'categorical'),
    ];
    const available = getAvailableTagTargets(allTagged, entries, 'e1');
    expect(available).toHaveLength(0);
  });
});
