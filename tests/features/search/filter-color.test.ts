import { describe, it, expect } from 'vitest';
import { applyFilters, filterByColors } from '@features/search/filter';
import type { Entry, ArchetypeId } from '@core/model/record';

/**
 * Color tag axis filter tests — Slice 4.
 *
 * Spec: docs/spec/search-filter-semantics-v1.md §4 (axis composition),
 *       docs/spec/color-tag-data-model-v1-minimum-scope.md §6.4
 *       (OR-within-axis, unknown ID).
 */

function mk(lid: string, overrides: Partial<Entry> = {}): Entry {
  return {
    lid,
    title: lid.toUpperCase(),
    body: '',
    archetype: 'text',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('filterByColors', () => {
  it('returns all entries when the filter Set is empty (axis off)', () => {
    const entries = [mk('a', { color_tag: 'red' }), mk('b')];
    expect(filterByColors(entries, new Set())).toEqual(entries);
  });

  it('keeps only entries whose color_tag is in the filter (OR)', () => {
    const entries = [
      mk('a', { color_tag: 'red' }),
      mk('b', { color_tag: 'blue' }),
      mk('c', { color_tag: 'green' }),
    ];
    const out = filterByColors(entries, new Set(['red', 'blue']));
    expect(out.map((e) => e.lid).sort()).toEqual(['a', 'b']);
  });

  it('drops entries with no color_tag while the axis is active', () => {
    const entries = [mk('a'), mk('b', { color_tag: 'red' })];
    const out = filterByColors(entries, new Set(['red']));
    expect(out.map((e) => e.lid)).toEqual(['b']);
  });

  it('matches unknown palette IDs verbatim (round-trip preservation)', () => {
    const entries = [
      mk('a', { color_tag: 'teal' }),
      mk('b', { color_tag: 'red' }),
    ];
    const out = filterByColors(entries, new Set(['teal']));
    expect(out.map((e) => e.lid)).toEqual(['a']);
  });

  it('treats empty-string color_tag as no color', () => {
    const entries = [mk('a', { color_tag: '' as unknown as string }), mk('b', { color_tag: 'red' })];
    const out = filterByColors(entries, new Set(['red']));
    expect(out.map((e) => e.lid)).toEqual(['b']);
  });

  it('treats null color_tag as no color', () => {
    const entries = [mk('a', { color_tag: null }), mk('b', { color_tag: 'red' })];
    const out = filterByColors(entries, new Set(['red']));
    expect(out.map((e) => e.lid)).toEqual(['b']);
  });
});

describe('applyFilters — Color axis composition', () => {
  const archetypeAll: ReadonlySet<ArchetypeId> = new Set();

  it('applies the UI Color filter alone', () => {
    const entries = [
      mk('a', { color_tag: 'red' }),
      mk('b', { color_tag: 'blue' }),
    ];
    const out = applyFilters(entries, '', archetypeAll, undefined, new Set(['red']));
    expect(out.map((e) => e.lid)).toEqual(['a']);
  });

  it('applies a parser-extracted Color filter (color: token in query)', () => {
    const entries = [
      mk('a', { color_tag: 'red' }),
      mk('b', { color_tag: 'blue' }),
    ];
    const out = applyFilters(entries, 'color:blue', archetypeAll);
    expect(out.map((e) => e.lid)).toEqual(['b']);
  });

  it('unions UI and parser-extracted Color filters (OR)', () => {
    const entries = [
      mk('a', { color_tag: 'red' }),
      mk('b', { color_tag: 'blue' }),
      mk('c', { color_tag: 'green' }),
    ];
    const out = applyFilters(
      entries,
      'color:blue',
      archetypeAll,
      undefined,
      new Set(['red']),
    );
    expect(out.map((e) => e.lid).sort()).toEqual(['a', 'b']);
  });

  it('AND-composes the Color axis with FullText', () => {
    const entries = [
      mk('a', { title: 'PROPOSAL', color_tag: 'red' }),
      mk('b', { title: 'PROPOSAL', color_tag: 'blue' }),
      mk('c', { title: 'OTHER', color_tag: 'red' }),
    ];
    const out = applyFilters(entries, 'proposal color:red', archetypeAll);
    expect(out.map((e) => e.lid)).toEqual(['a']);
  });

  it('AND-composes the Color axis with the Tag axis', () => {
    const entries = [
      mk('a', { tags: ['urgent'], color_tag: 'red' }),
      mk('b', { tags: ['urgent'], color_tag: 'blue' }),
      mk('c', { tags: ['relaxed'], color_tag: 'red' }),
    ];
    const out = applyFilters(entries, 'tag:urgent color:red', archetypeAll);
    expect(out.map((e) => e.lid)).toEqual(['a']);
  });

  it('AND-composes the Color axis with Archetype', () => {
    const entries = [
      mk('a', { archetype: 'todo', color_tag: 'red' }),
      mk('b', { archetype: 'text', color_tag: 'red' }),
      mk('c', { archetype: 'todo', color_tag: 'blue' }),
    ];
    const out = applyFilters(
      entries,
      'color:red',
      new Set<ArchetypeId>(['todo']),
    );
    expect(out.map((e) => e.lid)).toEqual(['a']);
  });

  it('falls through to no narrowing when neither Color source is active', () => {
    const entries = [mk('a'), mk('b', { color_tag: 'red' })];
    const out = applyFilters(entries, '', archetypeAll);
    expect(out.map((e) => e.lid)).toEqual(['a', 'b']);
  });

  it('falls through when both Color sources are empty Sets', () => {
    const entries = [mk('a'), mk('b', { color_tag: 'red' })];
    const out = applyFilters(entries, '', archetypeAll, new Set(), new Set());
    expect(out.map((e) => e.lid)).toEqual(['a', 'b']);
  });
});
