import { describe, it, expect } from 'vitest';
import { sortEntries } from '@features/search/sort';
import type { Entry } from '@core/model/record';

function makeEntry(
  lid: string, title: string,
  created_at: string, updated_at: string,
): Entry {
  return {
    lid, title, body: '',
    archetype: 'text', created_at, updated_at,
  };
}

const entries: Entry[] = [
  makeEntry('e1', 'Banana', '2026-01-02T00:00:00Z', '2026-01-05T00:00:00Z'),
  makeEntry('e2', 'Apple',  '2026-01-01T00:00:00Z', '2026-01-04T00:00:00Z'),
  makeEntry('e3', 'Cherry', '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z'),
];

describe('sortEntries', () => {
  // ── title ──────────────────────
  it('sorts by title asc', () => {
    const result = sortEntries(entries, 'title', 'asc');
    expect(result.map((e) => e.lid)).toEqual(['e2', 'e1', 'e3']);
  });

  it('sorts by title desc', () => {
    const result = sortEntries(entries, 'title', 'desc');
    expect(result.map((e) => e.lid)).toEqual(['e3', 'e1', 'e2']);
  });

  // ── created_at ─────────────────
  it('sorts by created_at asc', () => {
    const result = sortEntries(entries, 'created_at', 'asc');
    expect(result.map((e) => e.lid)).toEqual(['e2', 'e1', 'e3']);
  });

  it('sorts by created_at desc', () => {
    const result = sortEntries(entries, 'created_at', 'desc');
    expect(result.map((e) => e.lid)).toEqual(['e3', 'e1', 'e2']);
  });

  // ── updated_at ─────────────────
  it('sorts by updated_at asc', () => {
    const result = sortEntries(entries, 'updated_at', 'asc');
    expect(result.map((e) => e.lid)).toEqual(['e3', 'e2', 'e1']);
  });

  it('sorts by updated_at desc', () => {
    const result = sortEntries(entries, 'updated_at', 'desc');
    expect(result.map((e) => e.lid)).toEqual(['e1', 'e2', 'e3']);
  });

  // ── edge cases ─────────────────
  it('returns empty array for empty input', () => {
    expect(sortEntries([], 'title', 'asc')).toEqual([]);
  });

  it('returns single entry unchanged', () => {
    const single = [entries[0]!];
    const result = sortEntries(single, 'title', 'asc');
    expect(result).toEqual(single);
  });

  it('does not mutate the input array', () => {
    const original = [...entries];
    sortEntries(entries, 'title', 'asc');
    expect(entries.map((e) => e.lid)).toEqual(original.map((e) => e.lid));
  });

  it('stable sort: equal keys preserve original order', () => {
    const sameTitle: Entry[] = [
      makeEntry('s1', 'Same', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
      makeEntry('s2', 'Same', '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z'),
      makeEntry('s3', 'Same', '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z'),
    ];
    const result = sortEntries(sameTitle, 'title', 'asc');
    expect(result.map((e) => e.lid)).toEqual(['s1', 's2', 's3']);
  });
});
