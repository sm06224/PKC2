import { describe, it, expect } from 'vitest';
import {
  createSavedSearch,
  applySavedSearchFields,
  type SavedSearchSourceFields,
} from '@features/search/saved-searches';
import { SAVED_SEARCH_NAME_MAX } from '@core/model/saved-search';
import type { ArchetypeId } from '@core/model/record';

/**
 * Spec: docs/development/saved-searches-v1.md §1, §4.
 */
function mkFields(overrides: Partial<SavedSearchSourceFields> = {}): SavedSearchSourceFields {
  return {
    searchQuery: '',
    archetypeFilter: new Set<ArchetypeId>(),
    tagFilter: null,
    sortKey: 'created_at',
    sortDirection: 'desc',
    showArchived: false,
    ...overrides,
  };
}

describe('createSavedSearch', () => {
  const ts = '2026-04-21T00:00:00Z';

  it('captures the 6 AppState fields verbatim', () => {
    const saved = createSavedSearch('id-1', 'my search', ts, mkFields({
      searchQuery: 'todo',
      archetypeFilter: new Set<ArchetypeId>(['todo', 'text']),
      tagFilter: 'tag-1',
      sortKey: 'updated_at',
      sortDirection: 'asc',
      showArchived: true,
    }));
    expect(saved.id).toBe('id-1');
    expect(saved.name).toBe('my search');
    expect(saved.search_query).toBe('todo');
    expect(saved.tag_filter).toBe('tag-1');
    expect(saved.sort_key).toBe('updated_at');
    expect(saved.sort_direction).toBe('asc');
    expect(saved.show_archived).toBe(true);
    // archetype_filter is array, not Set
    expect(Array.isArray(saved.archetype_filter)).toBe(true);
    expect([...saved.archetype_filter].sort()).toEqual(['text', 'todo']);
  });

  it('sets created_at and updated_at to the same timestamp', () => {
    const saved = createSavedSearch('id-x', 'x', ts, mkFields());
    expect(saved.created_at).toBe(ts);
    expect(saved.updated_at).toBe(ts);
  });

  it('trims whitespace around the name', () => {
    const saved = createSavedSearch('id', '   spaced out   ', ts, mkFields());
    expect(saved.name).toBe('spaced out');
  });

  it(`truncates names longer than ${SAVED_SEARCH_NAME_MAX} characters`, () => {
    const long = 'x'.repeat(SAVED_SEARCH_NAME_MAX + 50);
    const saved = createSavedSearch('id', long, ts, mkFields());
    expect(saved.name.length).toBe(SAVED_SEARCH_NAME_MAX);
  });

  it('projects an empty Set into an empty array', () => {
    const saved = createSavedSearch('id', 'x', ts, mkFields());
    expect(saved.archetype_filter).toEqual([]);
  });
});

describe('applySavedSearchFields', () => {
  it('projects the stored fields back into AppState shape (Set for archetypes)', () => {
    const saved = createSavedSearch('id', 'x', '2026-04-21T00:00:00Z', mkFields({
      searchQuery: 'foo',
      archetypeFilter: new Set<ArchetypeId>(['text', 'todo']),
      tagFilter: 't1',
      sortKey: 'title',
      sortDirection: 'asc',
      showArchived: true,
    }));
    const restored = applySavedSearchFields(saved);
    expect(restored.searchQuery).toBe('foo');
    expect(restored.archetypeFilter instanceof Set).toBe(true);
    expect([...restored.archetypeFilter].sort()).toEqual(['text', 'todo']);
    expect(restored.tagFilter).toBe('t1');
    expect(restored.sortKey).toBe('title');
    expect(restored.sortDirection).toBe('asc');
    expect(restored.showArchived).toBe(true);
  });
});
