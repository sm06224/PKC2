import { describe, it, expect } from 'vitest';
import { filterEntries, entryMatchesQuery, filterByArchetype, applyFilters } from '@features/search/filter';
import type { Entry, ArchetypeId } from '@core/model/record';

function makeEntry(lid: string, title: string, body: string, archetype: ArchetypeId = 'text'): Entry {
  return {
    lid,
    title,
    body,
    archetype,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const entries: Entry[] = [
  makeEntry('e1', 'Apple Pie Recipe', 'A classic dessert with butter crust'),
  makeEntry('e2', 'Banana Bread', 'Quick and easy bread recipe'),
  makeEntry('e3', 'Chocolate Cake', 'Rich and decadent'),
];

const mixedEntries: Entry[] = [
  makeEntry('m1', 'Text Note', 'plain text', 'text'),
  makeEntry('m2', 'Todo Item', 'buy groceries', 'todo'),
  makeEntry('m3', 'Another Text', 'more text content', 'text'),
  makeEntry('m4', 'Log Entry', 'event log', 'textlog'),
  makeEntry('m5', 'Todo Two', 'fix bug', 'todo'),
];

describe('filterEntries', () => {
  it('returns all entries when query is empty', () => {
    expect(filterEntries(entries, '')).toEqual(entries);
  });

  it('returns all entries when query is whitespace', () => {
    expect(filterEntries(entries, '   ')).toEqual(entries);
  });

  it('matches title substring (case-insensitive)', () => {
    const result = filterEntries(entries, 'apple');
    expect(result).toHaveLength(1);
    expect(result[0]!.lid).toBe('e1');
  });

  it('matches body substring (case-insensitive)', () => {
    const result = filterEntries(entries, 'DECADENT');
    expect(result).toHaveLength(1);
    expect(result[0]!.lid).toBe('e3');
  });

  it('matches across title and body', () => {
    const result = filterEntries(entries, 'recipe');
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.lid)).toEqual(['e1', 'e2']);
  });

  it('returns empty when no match', () => {
    expect(filterEntries(entries, 'xyz')).toHaveLength(0);
  });

  it('handles empty entries array', () => {
    expect(filterEntries([], 'test')).toEqual([]);
  });

  it('trims query before matching', () => {
    const result = filterEntries(entries, '  banana  ');
    expect(result).toHaveLength(1);
    expect(result[0]!.lid).toBe('e2');
  });
});

describe('entryMatchesQuery', () => {
  it('returns true for empty query', () => {
    expect(entryMatchesQuery(entries[0]!, '')).toBe(true);
  });

  it('returns true when title matches', () => {
    expect(entryMatchesQuery(entries[0]!, 'apple')).toBe(true);
  });

  it('returns true when body matches', () => {
    expect(entryMatchesQuery(entries[0]!, 'butter')).toBe(true);
  });

  it('returns false when no match', () => {
    expect(entryMatchesQuery(entries[0]!, 'zebra')).toBe(false);
  });
});

describe('filterByArchetype', () => {
  it('returns all entries when archetype is null', () => {
    expect(filterByArchetype(mixedEntries, null)).toEqual(mixedEntries);
  });

  it('filters entries by archetype', () => {
    const result = filterByArchetype(mixedEntries, 'todo');
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.lid)).toEqual(['m2', 'm5']);
  });

  it('returns empty when no entries match archetype', () => {
    expect(filterByArchetype(mixedEntries, 'form')).toHaveLength(0);
  });

  it('handles empty entries array', () => {
    expect(filterByArchetype([], 'text')).toEqual([]);
  });

  it('filters text entries correctly', () => {
    const result = filterByArchetype(mixedEntries, 'text');
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.lid)).toEqual(['m1', 'm3']);
  });

  it('filters textlog entries correctly', () => {
    const result = filterByArchetype(mixedEntries, 'textlog');
    expect(result).toHaveLength(1);
    expect(result[0]!.lid).toBe('m4');
  });
});

describe('applyFilters', () => {
  it('returns all entries when both filters are empty', () => {
    expect(applyFilters(mixedEntries, '', new Set())).toEqual(mixedEntries);
  });

  it('applies text query only when archetype set is empty', () => {
    const result = applyFilters(mixedEntries, 'text', new Set());
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.lid)).toEqual(['m1', 'm3']);
  });

  it('applies archetype filter only when query is empty', () => {
    const result = applyFilters(mixedEntries, '', new Set(['todo'] as const));
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.lid)).toEqual(['m2', 'm5']);
  });

  it('applies both filters as AND combination', () => {
    const result = applyFilters(mixedEntries, 'bug', new Set(['todo'] as const));
    expect(result).toHaveLength(1);
    expect(result[0]!.lid).toBe('m5');
  });

  it('returns empty when AND combination has no match', () => {
    const result = applyFilters(mixedEntries, 'bug', new Set(['text'] as const));
    expect(result).toHaveLength(0);
  });

  it('handles empty entries array', () => {
    expect(applyFilters([], 'test', new Set(['text'] as const))).toEqual([]);
  });
});
