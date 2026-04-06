import { describe, it, expect } from 'vitest';
import { entryHasTag, filterByTag } from '@features/relation/tag-filter';
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
  makeEntry('tag1', 'Tag-Work'),
];

const relations: Relation[] = [
  makeRelation('r1', 'e1', 'tag1', 'categorical'),  // e1 tagged with tag1
  makeRelation('r2', 'e2', 'tag1', 'categorical'),  // e2 tagged with tag1
  makeRelation('r3', 'e3', 'tag1', 'semantic'),      // NOT categorical
  makeRelation('r4', 'tag1', 'e1', 'categorical'),   // inbound — tag1 tagged with e1, not relevant for e1's tag
];

describe('entryHasTag', () => {
  it('returns true for outbound categorical relation', () => {
    expect(entryHasTag(relations, 'e1', 'tag1')).toBe(true);
  });

  it('returns false for non-categorical relation', () => {
    expect(entryHasTag(relations, 'e3', 'tag1')).toBe(false);
  });

  it('returns false for inbound categorical relation', () => {
    // tag1→e1 exists but e1 is the "to" side, not "from"
    expect(entryHasTag(relations, 'e1', 'e2')).toBe(false);
  });

  it('returns false when no relations exist', () => {
    expect(entryHasTag([], 'e1', 'tag1')).toBe(false);
  });

  it('returns false for nonexistent entry', () => {
    expect(entryHasTag(relations, 'e999', 'tag1')).toBe(false);
  });
});

describe('filterByTag', () => {
  it('returns entries that have the specified tag', () => {
    const result = filterByTag(entries, relations, 'tag1');
    expect(result.map((e) => e.lid)).toEqual(['e1', 'e2']);
  });

  it('excludes entries with non-categorical relation to tag', () => {
    const result = filterByTag(entries, relations, 'tag1');
    expect(result.map((e) => e.lid)).not.toContain('e3');
  });

  it('returns empty when no entries match', () => {
    const result = filterByTag(entries, relations, 'nonexistent');
    expect(result).toEqual([]);
  });

  it('returns empty for empty entries', () => {
    expect(filterByTag([], relations, 'tag1')).toEqual([]);
  });

  it('does not mutate input', () => {
    const original = [...entries];
    filterByTag(entries, relations, 'tag1');
    expect(entries.map((e) => e.lid)).toEqual(original.map((e) => e.lid));
  });
});
