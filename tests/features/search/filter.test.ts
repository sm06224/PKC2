import { describe, it, expect } from 'vitest';
import { filterEntries, entryMatchesQuery } from '@features/search/filter';
import type { Entry } from '@core/model/record';

function makeEntry(lid: string, title: string, body: string): Entry {
  return {
    lid,
    title,
    body,
    archetype: 'text',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const entries: Entry[] = [
  makeEntry('e1', 'Apple Pie Recipe', 'A classic dessert with butter crust'),
  makeEntry('e2', 'Banana Bread', 'Quick and easy bread recipe'),
  makeEntry('e3', 'Chocolate Cake', 'Rich and decadent'),
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
