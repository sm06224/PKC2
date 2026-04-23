import { describe, it, expect } from 'vitest';
import { filterEntries, entryMatchesQuery, filterByArchetype, applyFilters, filterByTags } from '@features/search/filter';
import type { Entry, ArchetypeId } from '@core/model/record';

function makeEntry(lid: string, title: string, body: string, archetype: ArchetypeId = 'text', tags?: string[]): Entry {
  return {
    lid,
    title,
    body,
    archetype,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...(tags !== undefined ? { tags } : {}),
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

// ── W1 Slice D: Tag axis (free-form entry-level tags) ──
//
// Spec: `docs/spec/search-filter-semantics-v1.md` §4.2 + Slice B
// `tag-data-model-v1-minimum-scope.md`. Tag filter is AND-by-default:
// every value in the filter Set must appear in `entry.tags` for the
// entry to match. Missing or empty `entry.tags` never matches a
// non-empty filter. Raw `===` comparison, case-sensitive.

const taggedEntries: Entry[] = [
  makeEntry('t1', 'Urgent review', '', 'text', ['urgent', 'review']),
  makeEntry('t2', 'Just urgent', '', 'text', ['urgent']),
  makeEntry('t3', 'Just review', '', 'text', ['review']),
  makeEntry('t4', 'Untagged', '', 'text'),               // tags: undefined
  makeEntry('t5', 'Empty tags', '', 'text', []),         // tags: []
  makeEntry('t6', 'Case-distinct', '', 'text', ['Urgent']), // capital U
];

describe('filterByTags', () => {
  it('returns all entries when filter is empty (axis off)', () => {
    expect(filterByTags(taggedEntries, new Set<string>())).toEqual(taggedEntries);
  });

  it('single tag: matches entries whose tags contain that value', () => {
    const result = filterByTags(taggedEntries, new Set(['urgent']));
    expect(result.map((e) => e.lid)).toEqual(['t1', 't2']);
  });

  it('multiple tags: AND-by-default — entry must contain ALL values', () => {
    const result = filterByTags(taggedEntries, new Set(['urgent', 'review']));
    expect(result.map((e) => e.lid)).toEqual(['t1']);
  });

  it('entries with missing tags never match a non-empty filter', () => {
    const result = filterByTags(taggedEntries, new Set(['urgent']));
    expect(result.map((e) => e.lid)).not.toContain('t4'); // undefined
    expect(result.map((e) => e.lid)).not.toContain('t5'); // empty array
  });

  it('empty entry.tags ([]) is equivalent to missing (no match on non-empty filter)', () => {
    const result = filterByTags(taggedEntries, new Set(['any-tag']));
    expect(result.map((e) => e.lid)).toEqual([]);
  });

  it('comparison is case-sensitive (raw ===)', () => {
    const result = filterByTags(taggedEntries, new Set(['urgent']));
    // 't6' has `'Urgent'` (capital U); must NOT match lowercase filter.
    expect(result.map((e) => e.lid)).not.toContain('t6');
  });

  it('no-match filter returns empty', () => {
    const result = filterByTags(taggedEntries, new Set(['nonexistent']));
    expect(result).toEqual([]);
  });

  it('returns the same entry reference set (filter is pure, no copy)', () => {
    const filter = new Set(['urgent']);
    const result = filterByTags(taggedEntries, filter);
    for (const r of result) {
      expect(taggedEntries).toContain(r);
    }
  });
});

describe('applyFilters — Tag axis composition', () => {
  // Slice D extends applyFilters with an optional 4th parameter for
  // the Tag filter Set. Existing (text, archetype) two-axis behavior
  // must be unchanged when the new arg is omitted or empty.

  it('omitted tagFilter argument = pre-Slice-D behavior (backward compat)', () => {
    const result = applyFilters(taggedEntries, '', new Set());
    expect(result).toEqual(taggedEntries);
  });

  it('empty Set tagFilter = axis off (same as omitted)', () => {
    const result = applyFilters(taggedEntries, '', new Set(), new Set<string>());
    expect(result).toEqual(taggedEntries);
  });

  it('Tag axis composes as AND with archetype axis', () => {
    // Add a todo with 'urgent' to prove archetype + tag AND.
    const extra = makeEntry('t7', 'Urgent todo', '', 'todo', ['urgent']);
    const pool = [...taggedEntries, extra];
    const result = applyFilters(
      pool,
      '',
      new Set(['todo'] as const),
      new Set(['urgent']),
    );
    expect(result.map((e) => e.lid)).toEqual(['t7']);
  });

  it('Tag axis composes as AND with full-text axis', () => {
    // `title` includes "review" for t1 and t3; Tag filter narrows to
    // entries that also carry the `review` tag.
    const result = applyFilters(
      taggedEntries,
      'review',
      new Set(),
      new Set(['review']),
    );
    expect(result.map((e) => e.lid)).toEqual(['t1', 't3']);
  });

  it('All three axes AND together', () => {
    const extra = makeEntry('t8', 'Urgent review', '', 'todo', ['urgent', 'review']);
    const pool = [...taggedEntries, extra];
    const result = applyFilters(
      pool,
      'review',
      new Set(['todo'] as const),
      new Set(['urgent', 'review']),
    );
    expect(result.map((e) => e.lid)).toEqual(['t8']);
  });
});
