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
    categoricalPeerFilter: null,
    // Slice E: Tag axis is required on the in-memory source fields.
    // Empty Set = axis off, serialized as an absent JSON key.
    tagFilter: new Set<string>(),
    // Color Slice 2: Color axis is required on the in-memory source
    // fields. Empty Set = axis off, serialized as an absent JSON
    // key (writer omits `color_filter` entirely).
    colorFilter: new Set<string>(),
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
      categoricalPeerFilter: 'tag-1',
      sortKey: 'updated_at',
      sortDirection: 'asc',
      showArchived: true,
    }));
    expect(saved.id).toBe('id-1');
    expect(saved.name).toBe('my search');
    expect(saved.search_query).toBe('todo');
    // Rename (W1 Slice B followup): the new key `categorical_peer_filter`
    // is emitted on write; the legacy `tag_filter` key must NOT appear
    // on freshly-created records.
    expect(saved.categorical_peer_filter).toBe('tag-1');
    expect(saved.tag_filter).toBeUndefined();
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
      categoricalPeerFilter: 't1',
      sortKey: 'title',
      sortDirection: 'asc',
      showArchived: true,
    }));
    const restored = applySavedSearchFields(saved);
    expect(restored.searchQuery).toBe('foo');
    expect(restored.archetypeFilter instanceof Set).toBe(true);
    expect([...restored.archetypeFilter].sort()).toEqual(['text', 'todo']);
    expect(restored.categoricalPeerFilter).toBe('t1');
    expect(restored.sortKey).toBe('title');
    expect(restored.sortDirection).toBe('asc');
    expect(restored.showArchived).toBe(true);
  });

  // Rename (W1 Slice B followup) backward-compat read path: a saved
  // search persisted before the rename carries only the legacy
  // `tag_filter` key. `applySavedSearchFields` must fall back to it
  // so pre-existing containers keep restoring correctly. Scheduled
  // to be removable 1-2 releases after the rename ships.
  it('falls back to legacy `tag_filter` key when `categorical_peer_filter` is absent', () => {
    const legacy = {
      id: 'legacy-1',
      name: 'legacy',
      created_at: '2026-04-21T00:00:00Z',
      updated_at: '2026-04-21T00:00:00Z',
      search_query: '',
      archetype_filter: [] as ArchetypeId[],
      // No `categorical_peer_filter` — only the old key.
      tag_filter: 'legacy-peer',
      sort_key: 'created_at' as const,
      sort_direction: 'desc' as const,
      show_archived: false,
    };
    const restored = applySavedSearchFields(legacy);
    expect(restored.categoricalPeerFilter).toBe('legacy-peer');
  });

  it('defaults to null when neither `categorical_peer_filter` nor `tag_filter` is present', () => {
    const bare = {
      id: 'bare',
      name: 'bare',
      created_at: '2026-04-21T00:00:00Z',
      updated_at: '2026-04-21T00:00:00Z',
      search_query: '',
      archetype_filter: [] as ArchetypeId[],
      sort_key: 'created_at' as const,
      sort_direction: 'desc' as const,
      show_archived: false,
    };
    const restored = applySavedSearchFields(bare);
    expect(restored.categoricalPeerFilter).toBeNull();
  });

  // W1 Slice E — Tag axis round-trip. `tag_filter_v2` is the
  // canonical JSON key; missing / empty = axis off.
  it('Slice E: tag_filter_v2 restores into tagFilter as a Set', () => {
    const saved = createSavedSearch('id-tag', 'tag-carrier', '2026-04-23T00:00:00Z', mkFields({
      tagFilter: new Set(['urgent', 'review']),
    }));
    expect(saved.tag_filter_v2).toEqual(['urgent', 'review']);
    const restored = applySavedSearchFields(saved);
    expect(restored.tagFilter instanceof Set).toBe(true);
    expect(restored.tagFilter.has('urgent')).toBe(true);
    expect(restored.tagFilter.has('review')).toBe(true);
    expect(restored.tagFilter.size).toBe(2);
  });

  it('Slice E: empty tagFilter omits tag_filter_v2 from the persisted record', () => {
    const saved = createSavedSearch('id-empty', 'empty', '2026-04-23T00:00:00Z', mkFields());
    // Omit, not write [] — keeps unused saved searches shape-identical
    // to their pre-Slice-E form.
    expect(saved.tag_filter_v2).toBeUndefined();
  });

  it('Slice E: missing tag_filter_v2 on the saved record restores into an empty Set', () => {
    const bare = {
      id: 'bare-slice-e',
      name: 'bare',
      created_at: '2026-04-23T00:00:00Z',
      updated_at: '2026-04-23T00:00:00Z',
      search_query: '',
      archetype_filter: [] as ArchetypeId[],
      sort_key: 'created_at' as const,
      sort_direction: 'desc' as const,
      show_archived: false,
    };
    const restored = applySavedSearchFields(bare);
    expect(restored.tagFilter instanceof Set).toBe(true);
    expect(restored.tagFilter.size).toBe(0);
  });

  it('Slice E: empty tag_filter_v2 array also restores into an empty Set', () => {
    const bare = {
      id: 'bare-empty-array',
      name: 'bare',
      created_at: '2026-04-23T00:00:00Z',
      updated_at: '2026-04-23T00:00:00Z',
      search_query: '',
      archetype_filter: [] as ArchetypeId[],
      tag_filter_v2: [] as string[],
      sort_key: 'created_at' as const,
      sort_direction: 'desc' as const,
      show_archived: false,
    };
    const restored = applySavedSearchFields(bare);
    expect(restored.tagFilter.size).toBe(0);
  });

  it('Slice E: Tag axis coexists with categorical_peer_filter without collision', () => {
    const saved = createSavedSearch('id-both', 'both', '2026-04-23T00:00:00Z', mkFields({
      categoricalPeerFilter: 'cat-peer',
      tagFilter: new Set(['urgent']),
    }));
    expect(saved.categorical_peer_filter).toBe('cat-peer');
    expect(saved.tag_filter_v2).toEqual(['urgent']);
    const restored = applySavedSearchFields(saved);
    expect(restored.categoricalPeerFilter).toBe('cat-peer');
    expect(restored.tagFilter.has('urgent')).toBe(true);
  });

  it('Slice E: tag_filter_v2 preserves insertion order from the Set', () => {
    const input = new Set<string>();
    input.add('zebra');
    input.add('alpha');
    input.add('mango');
    const saved = createSavedSearch('id-order', 'order', '2026-04-23T00:00:00Z', mkFields({
      tagFilter: input,
    }));
    // Slice B §5.1 insertion-order invariant — the serialized array
    // must equal the Set's iteration order, NOT sorted.
    expect(saved.tag_filter_v2).toEqual(['zebra', 'alpha', 'mango']);
  });

  it('Slice E: Tag axis is independent from legacy tag_filter read-compat', () => {
    // Legacy `tag_filter` stores a categorical peer lid as a string
    // (rename-era shape). A record that carries ONLY `tag_filter`
    // (legacy) must restore its value into categoricalPeerFilter and
    // leave the Tag axis empty — the two share no data.
    const legacy = {
      id: 'legacy-only',
      name: 'legacy',
      created_at: '2026-04-23T00:00:00Z',
      updated_at: '2026-04-23T00:00:00Z',
      search_query: '',
      archetype_filter: [] as ArchetypeId[],
      tag_filter: 'legacy-peer-lid',
      sort_key: 'created_at' as const,
      sort_direction: 'desc' as const,
      show_archived: false,
    };
    const restored = applySavedSearchFields(legacy);
    expect(restored.categoricalPeerFilter).toBe('legacy-peer-lid');
    expect(restored.tagFilter.size).toBe(0);
  });
});

// ── Color tag Slice 2 — `color_filter` schema round-trip ─────────
//
// Spec: docs/spec/color-palette-v1.md §8.3,
//       docs/spec/color-tag-data-model-v1-minimum-scope.md §6.4 / §6.5.
//
// The Color filter stays additive in v1: pre-Slice-2 saved searches
// have no `color_filter` field, the schema must accept `null` /
// `[]` / `undefined` interchangeably as "axis off", and the writer
// canonicalises the array (deduplicate + palette order, unknown IDs
// preserved at the tail) so diffs and round-trips are stable.

describe('createSavedSearch — color_filter (Color Slice 2)', () => {
  const ts = '2026-04-25T00:00:00Z';

  it('omits color_filter when the in-memory filter is empty', () => {
    const saved = createSavedSearch('id-c1', 'x', ts, mkFields());
    expect(saved).not.toHaveProperty('color_filter');
  });

  it('emits known palette IDs in palette-canonical order', () => {
    const saved = createSavedSearch('id-c2', 'x', ts, mkFields({
      colorFilter: new Set(['gray', 'pink', 'red', 'green', 'blue']),
    }));
    expect(saved.color_filter).toEqual([
      'red',
      'green',
      'blue',
      'pink',
      'gray',
    ]);
  });

  it('deduplicates identical palette IDs', () => {
    const saved = createSavedSearch('id-c3', 'x', ts, mkFields({
      colorFilter: new Set(['red', 'red', 'blue']),
    }));
    expect(saved.color_filter).toEqual(['red', 'blue']);
  });

  it('preserves unknown palette IDs at the tail in input order', () => {
    // Data model §6.4 / §7.2 — unknown IDs must round-trip through
    // a writer rather than being silently dropped, so a future
    // palette extension can add `teal` without losing data.
    const saved = createSavedSearch('id-c4', 'x', ts, mkFields({
      colorFilter: new Set(['teal', 'red', 'magenta', 'blue']),
    }));
    expect(saved.color_filter).toEqual(['red', 'blue', 'teal', 'magenta']);
  });

  it('emits a single-element array when only one ID is set', () => {
    const saved = createSavedSearch('id-c5', 'x', ts, mkFields({
      colorFilter: new Set(['purple']),
    }));
    expect(saved.color_filter).toEqual(['purple']);
  });

  it('does not affect unrelated saved-search fields', () => {
    const before = createSavedSearch('id-c6', 'x', ts, mkFields());
    const withColor = createSavedSearch('id-c6', 'x', ts, mkFields({
      colorFilter: new Set(['red']),
    }));
    expect(withColor.id).toBe(before.id);
    expect(withColor.name).toBe(before.name);
    expect(withColor.search_query).toBe(before.search_query);
    expect(withColor.archetype_filter).toEqual(before.archetype_filter);
    expect(withColor.categorical_peer_filter).toBe(before.categorical_peer_filter);
    expect(withColor.tag_filter_v2).toBe(before.tag_filter_v2);
    expect(withColor.sort_key).toBe(before.sort_key);
    expect(withColor.sort_direction).toBe(before.sort_direction);
    expect(withColor.show_archived).toBe(before.show_archived);
  });
});

describe('applySavedSearchFields — color_filter (Color Slice 2)', () => {
  const ts = '2026-04-25T00:00:00Z';
  const baseSaved = {
    id: 'id-r',
    name: 'restore-test',
    created_at: ts,
    updated_at: ts,
    search_query: '',
    archetype_filter: [] as ArchetypeId[],
    categorical_peer_filter: null,
    sort_key: 'created_at' as const,
    sort_direction: 'desc' as const,
    show_archived: false,
  };

  it('treats a missing color_filter as the Color axis being off', () => {
    const restored = applySavedSearchFields(baseSaved);
    expect(restored.colorFilter.size).toBe(0);
  });

  it('treats explicit null as the Color axis being off', () => {
    const restored = applySavedSearchFields({
      ...baseSaved,
      color_filter: null,
    });
    expect(restored.colorFilter.size).toBe(0);
  });

  it('treats an empty array as the Color axis being off', () => {
    const restored = applySavedSearchFields({
      ...baseSaved,
      color_filter: [],
    });
    expect(restored.colorFilter.size).toBe(0);
  });

  it('restores known palette IDs into the in-memory Set', () => {
    const restored = applySavedSearchFields({
      ...baseSaved,
      color_filter: ['red', 'blue', 'gray'],
    });
    expect(Array.from(restored.colorFilter).sort()).toEqual([
      'blue',
      'gray',
      'red',
    ]);
  });

  it('preserves unknown palette IDs (round-trip through Slice 2)', () => {
    const restored = applySavedSearchFields({
      ...baseSaved,
      color_filter: ['red', 'teal'],
    });
    expect(restored.colorFilter.has('red')).toBe(true);
    expect(restored.colorFilter.has('teal')).toBe(true);
  });

  it('drops non-string array elements without throwing', () => {
    // Lenient read: a writer mistake (number / object slipped into
    // the persisted array) must not poison the boot path.
    const restored = applySavedSearchFields({
      ...baseSaved,
      color_filter: [
        'red',
        // @ts-expect-error — exercising lenient read of bad data
        42,
        // @ts-expect-error — same
        { id: 'red' },
        'blue',
      ],
    });
    expect(Array.from(restored.colorFilter).sort()).toEqual(['blue', 'red']);
  });

  it('treats a non-array color_filter as the Color axis being off', () => {
    const restored = applySavedSearchFields({
      ...baseSaved,
      // @ts-expect-error — exercising lenient read of bad shape
      color_filter: 'red',
    });
    expect(restored.colorFilter.size).toBe(0);
  });
});

describe('createSavedSearch / applySavedSearchFields — color_filter round trip', () => {
  const ts2 = '2026-04-25T00:00:00Z';

  it('round-trips a known-only filter unchanged through canonical sort', () => {
    const saved = createSavedSearch('id-rt1', 'x', ts2, mkFields({
      colorFilter: new Set(['blue', 'red', 'pink']),
    }));
    const restored = applySavedSearchFields(saved);
    expect(Array.from(restored.colorFilter).sort()).toEqual([
      'blue',
      'pink',
      'red',
    ]);
  });

  it('round-trips a filter containing unknown palette IDs', () => {
    const saved = createSavedSearch('id-rt2', 'x', ts2, mkFields({
      colorFilter: new Set(['red', 'teal']),
    }));
    const restored = applySavedSearchFields(saved);
    expect(restored.colorFilter.has('red')).toBe(true);
    expect(restored.colorFilter.has('teal')).toBe(true);
    expect(restored.colorFilter.size).toBe(2);
  });
});
