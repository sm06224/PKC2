import { describe, it, expect } from 'vitest';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { reduce, createInitialState, type AppState } from '@adapter/state/app-state';

/**
 * Color tag Slice 4 — filter-axis reducer tests.
 *
 * Spec: docs/spec/color-tag-data-model-v1-minimum-scope.md §6,
 *       docs/development/color-tag-filter-slice4-design.md §3.
 */

function mkEntry(lid: string, overrides: Partial<Entry> = {}): Entry {
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

function mkContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyState(overrides: Partial<AppState> & { container: Container }): AppState {
  return {
    ...createInitialState(),
    phase: 'ready',
    ...overrides,
  };
}

describe('TOGGLE_COLOR_TAG_FILTER', () => {
  it('adds a palette ID to an empty filter', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]) });
    const r = reduce(state, { type: 'TOGGLE_COLOR_TAG_FILTER', color: 'red' });
    expect(r.state.colorTagFilter?.has('red')).toBe(true);
    expect(r.state.colorTagFilter?.size).toBe(1);
  });

  it('removes a palette ID that is already in the filter (idempotent toggle)', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a')]),
      colorTagFilter: new Set(['red', 'blue']),
    });
    const r = reduce(state, { type: 'TOGGLE_COLOR_TAG_FILTER', color: 'red' });
    expect(r.state.colorTagFilter?.has('red')).toBe(false);
    expect(r.state.colorTagFilter?.has('blue')).toBe(true);
  });

  it('preserves unknown palette IDs (round-trip)', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]) });
    const r = reduce(state, { type: 'TOGGLE_COLOR_TAG_FILTER', color: 'teal' });
    expect(r.state.colorTagFilter?.has('teal')).toBe(true);
  });

  it('does not affect other filter axes', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a')]),
      tagFilter: new Set(['urgent']),
      searchQuery: 'foo',
    });
    const r = reduce(state, { type: 'TOGGLE_COLOR_TAG_FILTER', color: 'red' });
    expect(r.state.tagFilter?.has('urgent')).toBe(true);
    expect(r.state.searchQuery).toBe('foo');
  });
});

describe('CLEAR_COLOR_TAG_FILTER', () => {
  it('resets the Color filter Set to empty', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a')]),
      colorTagFilter: new Set(['red', 'blue']),
    });
    const r = reduce(state, { type: 'CLEAR_COLOR_TAG_FILTER' });
    expect(r.state.colorTagFilter?.size).toBe(0);
  });

  it('is an identity no-op when the filter is already empty', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]) });
    const r = reduce(state, { type: 'CLEAR_COLOR_TAG_FILTER' });
    expect(r.state).toBe(state);
    expect(r.events).toEqual([]);
  });
});

describe('CLEAR_FILTERS — Color axis integration', () => {
  it('resets colorTagFilter alongside the other axes', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a')]),
      searchQuery: 'foo',
      tagFilter: new Set(['urgent']),
      colorTagFilter: new Set(['red', 'blue']),
      archetypeFilter: new Set(['todo']),
    });
    const r = reduce(state, { type: 'CLEAR_FILTERS' });
    expect(r.state.searchQuery).toBe('');
    expect(r.state.tagFilter?.size).toBe(0);
    expect(r.state.colorTagFilter?.size).toBe(0);
    expect(r.state.archetypeFilter.size).toBe(0);
  });
});

describe('SAVE_SEARCH / APPLY_SAVED_SEARCH — Color axis round-trip', () => {
  it('captures the current colorTagFilter into the saved record', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a')]),
      colorTagFilter: new Set(['red', 'teal']),
    });
    const r = reduce(state, { type: 'SAVE_SEARCH', name: 'mine' });
    const saved = r.state.container?.meta.saved_searches?.[0];
    expect(saved).toBeDefined();
    // Unknown palette IDs are preserved by the writer; the order is
    // canonicalised by the Slice-2 writer (known IDs in palette order,
    // unknown IDs at the tail) so a strict array comparison is safe.
    expect(saved!.color_filter).toEqual(['red', 'teal']);
  });

  it('omits color_filter when the Color axis is off at save time', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]) });
    const r = reduce(state, { type: 'SAVE_SEARCH', name: 'mine' });
    const saved = r.state.container?.meta.saved_searches?.[0];
    expect(saved).toBeDefined();
    expect(saved).not.toHaveProperty('color_filter');
  });

  it('restores colorTagFilter from a saved record on APPLY_SAVED_SEARCH', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a')]),
      colorTagFilter: new Set(['red']),
    });
    // First save with red active.
    const saved = reduce(state, { type: 'SAVE_SEARCH', name: 'mine' });
    const id = saved.state.container!.meta.saved_searches![0]!.id;
    // Then change the filter to blue and re-apply the saved record.
    const changed: AppState = {
      ...saved.state,
      colorTagFilter: new Set(['blue']),
    };
    const restored = reduce(changed, { type: 'APPLY_SAVED_SEARCH', id });
    expect(restored.state.colorTagFilter?.has('red')).toBe(true);
    expect(restored.state.colorTagFilter?.has('blue')).toBe(false);
  });

  it('round-trips unknown palette IDs through SAVE_SEARCH + APPLY_SAVED_SEARCH', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a')]),
      colorTagFilter: new Set(['red', 'teal']),
    });
    const saved = reduce(state, { type: 'SAVE_SEARCH', name: 'mine' });
    const id = saved.state.container!.meta.saved_searches![0]!.id;
    const restored = reduce(saved.state, { type: 'APPLY_SAVED_SEARCH', id });
    expect(restored.state.colorTagFilter?.has('teal')).toBe(true);
    expect(restored.state.colorTagFilter?.has('red')).toBe(true);
  });

  it('restores an empty Color filter from a pre-Slice-2 saved record', () => {
    // Saved searches written before Slice 2 have no color_filter
    // field. The Slice-2 reader returns an empty Set, and Slice 4
    // applies that empty Set to AppState — i.e. the Color axis goes
    // off rather than carrying over the previous in-memory state.
    const state = readyState({
      container: {
        ...mkContainer([mkEntry('a')]),
        meta: {
          container_id: 'c1',
          title: 'test',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          schema_version: 1,
          saved_searches: [
            {
              id: 's1',
              name: 'pre-slice-2',
              created_at: '2026-04-01T00:00:00Z',
              updated_at: '2026-04-01T00:00:00Z',
              search_query: '',
              archetype_filter: [],
              categorical_peer_filter: null,
              sort_key: 'created_at',
              sort_direction: 'desc',
              show_archived: false,
            },
          ],
        },
      },
      colorTagFilter: new Set(['red']),
    });
    const r = reduce(state, { type: 'APPLY_SAVED_SEARCH', id: 's1' });
    expect(r.state.colorTagFilter?.size).toBe(0);
  });
});
