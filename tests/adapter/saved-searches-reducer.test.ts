import { describe, it, expect } from 'vitest';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { reduce, createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import {
  SAVED_SEARCH_CAP,
  SAVED_SEARCH_NAME_MAX,
  type SavedSearch,
} from '@core/model/saved-search';

/**
 * Spec: docs/development/saved-searches-v1.md §5–§7.
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

function mkContainer(
  entries: Entry[],
  saved_searches?: SavedSearch[],
): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
      ...(saved_searches ? { saved_searches } : {}),
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

function mkSaved(id: string, overrides: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id,
    name: `Saved ${id}`,
    created_at: '2026-04-21T00:00:00Z',
    updated_at: '2026-04-21T00:00:00Z',
    search_query: '',
    archetype_filter: [],
    // Post-rename (W1 Slice B followup): fresh saved-search records
    // emit `categorical_peer_filter`, not the legacy `tag_filter` key.
    // A dedicated backward-compat test in
    // `tests/features/search/saved-searches.test.ts` covers the
    // legacy read path separately.
    categorical_peer_filter: null,
    sort_key: 'created_at',
    sort_direction: 'desc',
    show_archived: false,
    ...overrides,
  };
}

describe('SAVE_SEARCH', () => {
  it('appends a new SavedSearch to container.meta.saved_searches and bumps meta.updated_at', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a')]),
      searchQuery: 'foo',
      archetypeFilter: new Set(['text', 'todo']),
      categoricalPeerFilter: null,
      sortKey: 'updated_at',
      sortDirection: 'asc',
      showArchived: true,
    });
    const prevMetaUpdated = state.container!.meta.updated_at;

    const { state: next } = reduce(state, { type: 'SAVE_SEARCH', name: 'My Todos' });

    const saved = next.container!.meta.saved_searches ?? [];
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toBe('My Todos');
    expect(saved[0]!.search_query).toBe('foo');
    expect([...saved[0]!.archetype_filter].sort()).toEqual(['text', 'todo']);
    expect(saved[0]!.sort_key).toBe('updated_at');
    expect(saved[0]!.sort_direction).toBe('asc');
    expect(saved[0]!.show_archived).toBe(true);
    expect(next.container!.meta.updated_at).not.toBe(prevMetaUpdated);
  });

  it('silently no-ops when the name is empty after trim', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]) });
    const { state: next } = reduce(state, { type: 'SAVE_SEARCH', name: '   ' });
    expect(next).toBe(state);
  });

  it('trims whitespace around the name', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]) });
    const { state: next } = reduce(state, { type: 'SAVE_SEARCH', name: '  Trim me  ' });
    const saved = next.container!.meta.saved_searches!;
    expect(saved[0]!.name).toBe('Trim me');
  });

  it(`blocks when saved_searches.length === SAVED_SEARCH_CAP (${SAVED_SEARCH_CAP})`, () => {
    const existing: SavedSearch[] = Array.from({ length: SAVED_SEARCH_CAP }, (_, i) =>
      mkSaved(`s${i}`),
    );
    const state = readyState({ container: mkContainer([mkEntry('a')], existing) });
    const { state: next } = reduce(state, { type: 'SAVE_SEARCH', name: 'overflow' });
    expect(next).toBe(state);
  });

  it('blocks when state.readonly', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]), readonly: true });
    const { state: next } = reduce(state, { type: 'SAVE_SEARCH', name: 'x' });
    expect(next).toBe(state);
  });

  it('blocks when there is no container', () => {
    const state = { ...createInitialState(), phase: 'ready' as const };
    const { state: next } = reduce(state, { type: 'SAVE_SEARCH', name: 'x' });
    expect(next).toBe(state);
  });

  it('appends alongside an existing saved_searches list without mutating previous entries', () => {
    const existing = [mkSaved('keep-me', { name: 'Keep Me' })];
    const state = readyState({
      container: mkContainer([mkEntry('a')], existing),
      searchQuery: 'ex',
    });
    const { state: next } = reduce(state, { type: 'SAVE_SEARCH', name: 'New' });
    const saved = next.container!.meta.saved_searches!;
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual(existing[0]); // untouched
    expect(saved[1]!.name).toBe('New');
  });
});

describe('APPLY_SAVED_SEARCH', () => {
  it('applies all 6 fields back onto AppState', () => {
    const saved = mkSaved('s1', {
      search_query: 'restored',
      archetype_filter: ['todo'],
      categorical_peer_filter: 't1',
      sort_key: 'title',
      sort_direction: 'asc',
      show_archived: true,
    });
    const state = readyState({ container: mkContainer([mkEntry('a')], [saved]) });

    const { state: next } = reduce(state, { type: 'APPLY_SAVED_SEARCH', id: 's1' });

    expect(next.searchQuery).toBe('restored');
    expect(next.archetypeFilter instanceof Set).toBe(true);
    expect([...next.archetypeFilter]).toEqual(['todo']);
    expect(next.categoricalPeerFilter).toBe('t1');
    expect(next.sortKey).toBe('title');
    expect(next.sortDirection).toBe('asc');
    expect(next.showArchived).toBe(true);
  });

  // W1 Slice E — Tag axis round-trip at the reducer level.
  // SAVE_SEARCH must project `state.tagFilter` into the persisted
  // `tag_filter_v2` array; APPLY_SAVED_SEARCH must restore it.
  it('Slice E: SAVE_SEARCH + APPLY_SAVED_SEARCH round-trips state.tagFilter', () => {
    const seeded: AppState = {
      ...readyState({ container: mkContainer([mkEntry('a')]) }),
      tagFilter: new Set(['urgent', 'review']),
    };
    const { state: afterSave } = reduce(seeded, { type: 'SAVE_SEARCH', name: 'Tagged' });
    const persisted = afterSave.container!.meta.saved_searches![0]!;
    expect(persisted.tag_filter_v2).toEqual(['urgent', 'review']);

    // Pretend the user later cleared their filters in-memory, then
    // applied the saved search — the tag axis must come back.
    const afterClear: AppState = {
      ...afterSave,
      tagFilter: new Set<string>(),
    };
    const { state: afterApply } = reduce(afterClear, {
      type: 'APPLY_SAVED_SEARCH',
      id: persisted.id,
    });
    expect(afterApply.tagFilter instanceof Set).toBe(true);
    expect((afterApply.tagFilter as ReadonlySet<string>).has('urgent')).toBe(true);
    expect((afterApply.tagFilter as ReadonlySet<string>).has('review')).toBe(true);
  });

  it('Slice E: APPLY_SAVED_SEARCH on a pre-Slice-E record leaves tagFilter empty', () => {
    // `mkSaved` default emits no `tag_filter_v2`, matching pre-Slice-E
    // records on disk. Restoring from it must not pollute the Tag
    // axis with stale values.
    const saved = mkSaved('pre-slice-e');
    const seeded: AppState = {
      ...readyState({ container: mkContainer([mkEntry('a')], [saved]) }),
      tagFilter: new Set(['should-be-cleared']),
    };
    const { state: next } = reduce(seeded, {
      type: 'APPLY_SAVED_SEARCH',
      id: 'pre-slice-e',
    });
    expect((next.tagFilter as ReadonlySet<string>).size).toBe(0);
  });

  it('does not bump container.meta.updated_at (read-only operation)', () => {
    const saved = mkSaved('s2');
    const state = readyState({ container: mkContainer([mkEntry('a')], [saved]) });
    const prev = state.container!.meta.updated_at;
    const { state: next } = reduce(state, { type: 'APPLY_SAVED_SEARCH', id: 's2' });
    expect(next.container!.meta.updated_at).toBe(prev);
  });

  it('blocks on unknown id (state reference preserved)', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')], []) });
    const { state: next } = reduce(state, { type: 'APPLY_SAVED_SEARCH', id: 'ghost' });
    expect(next).toBe(state);
  });

  it('performs entry_order snapshot roll-in when sort_key is manual and no entry_order yet', () => {
    const saved = mkSaved('s-manual', { sort_key: 'manual' });
    const state = readyState({
      container: mkContainer([mkEntry('a'), mkEntry('b')], [saved]),
    });
    expect(state.container!.meta.entry_order).toBeUndefined();
    const { state: next } = reduce(state, { type: 'APPLY_SAVED_SEARCH', id: 's-manual' });
    expect(next.sortKey).toBe('manual');
    expect(next.container!.meta.entry_order).toEqual(['a', 'b']);
  });

  it('preserves selectedLid and viewMode', () => {
    const saved = mkSaved('s3');
    const state = readyState({
      container: mkContainer([mkEntry('a')], [saved]),
      selectedLid: 'a',
      viewMode: 'calendar',
    });
    const { state: next } = reduce(state, { type: 'APPLY_SAVED_SEARCH', id: 's3' });
    expect(next.selectedLid).toBe('a');
    expect(next.viewMode).toBe('calendar');
  });

  it('applies even in readonly mode (state-only, no container mutation)', () => {
    const saved = mkSaved('s-ro', { search_query: 'readonly-ok' });
    const state = readyState({
      container: mkContainer([mkEntry('a')], [saved]),
      readonly: true,
    });
    const { state: next } = reduce(state, { type: 'APPLY_SAVED_SEARCH', id: 's-ro' });
    expect(next.searchQuery).toBe('readonly-ok');
  });
});

describe('DELETE_SAVED_SEARCH', () => {
  it('removes the target id and bumps meta.updated_at', () => {
    const a = mkSaved('a');
    const b = mkSaved('b');
    const state = readyState({ container: mkContainer([mkEntry('x')], [a, b]) });
    const prev = state.container!.meta.updated_at;
    const { state: next } = reduce(state, { type: 'DELETE_SAVED_SEARCH', id: 'a' });
    const saved = next.container!.meta.saved_searches!;
    expect(saved).toHaveLength(1);
    expect(saved[0]!.id).toBe('b');
    expect(next.container!.meta.updated_at).not.toBe(prev);
  });

  it('silently no-ops on unknown id', () => {
    const a = mkSaved('a');
    const state = readyState({ container: mkContainer([mkEntry('x')], [a]) });
    const { state: next } = reduce(state, { type: 'DELETE_SAVED_SEARCH', id: 'ghost' });
    expect(next).toBe(state);
  });

  it('blocks when state.readonly', () => {
    const a = mkSaved('a');
    const state = readyState({
      container: mkContainer([mkEntry('x')], [a]),
      readonly: true,
    });
    const { state: next } = reduce(state, { type: 'DELETE_SAVED_SEARCH', id: 'a' });
    expect(next).toBe(state);
  });
});

describe('RENAME_SAVED_SEARCH', () => {
  it('updates the row name and bumps meta.updated_at', () => {
    const a = mkSaved('a', { name: 'Old' });
    const b = mkSaved('b', { name: 'B' });
    const state = readyState({ container: mkContainer([mkEntry('x')], [a, b]) });
    const prev = state.container!.meta.updated_at;
    const { state: next } = reduce(state, {
      type: 'RENAME_SAVED_SEARCH',
      id: 'a',
      name: 'New',
    });
    const saved = next.container!.meta.saved_searches!;
    expect(saved).toHaveLength(2);
    expect(saved.find((s) => s.id === 'a')!.name).toBe('New');
    expect(saved.find((s) => s.id === 'b')!.name).toBe('B');
    expect(next.container!.meta.updated_at).not.toBe(prev);
  });

  it('trims surrounding whitespace before storing', () => {
    const a = mkSaved('a', { name: 'Old' });
    const state = readyState({ container: mkContainer([mkEntry('x')], [a]) });
    const { state: next } = reduce(state, {
      type: 'RENAME_SAVED_SEARCH',
      id: 'a',
      name: '  Padded  ',
    });
    expect(next.container!.meta.saved_searches![0]!.name).toBe('Padded');
  });

  it('truncates names longer than SAVED_SEARCH_NAME_MAX', () => {
    const a = mkSaved('a', { name: 'Old' });
    const state = readyState({ container: mkContainer([mkEntry('x')], [a]) });
    const long = 'x'.repeat(SAVED_SEARCH_NAME_MAX + 25);
    const { state: next } = reduce(state, {
      type: 'RENAME_SAVED_SEARCH',
      id: 'a',
      name: long,
    });
    const renamed = next.container!.meta.saved_searches![0]!.name;
    expect(renamed).toHaveLength(SAVED_SEARCH_NAME_MAX);
    expect(renamed).toBe('x'.repeat(SAVED_SEARCH_NAME_MAX));
  });

  it('silently no-ops on unknown id', () => {
    const a = mkSaved('a', { name: 'Old' });
    const state = readyState({ container: mkContainer([mkEntry('x')], [a]) });
    const { state: next } = reduce(state, {
      type: 'RENAME_SAVED_SEARCH',
      id: 'ghost',
      name: 'Whatever',
    });
    expect(next).toBe(state);
  });

  it('silently no-ops on empty / whitespace-only name', () => {
    const a = mkSaved('a', { name: 'Old' });
    const state = readyState({ container: mkContainer([mkEntry('x')], [a]) });
    const { state: next } = reduce(state, {
      type: 'RENAME_SAVED_SEARCH',
      id: 'a',
      name: '   ',
    });
    expect(next).toBe(state);
  });

  it('silently no-ops when the new name equals the existing one', () => {
    const a = mkSaved('a', { name: 'Same' });
    const state = readyState({ container: mkContainer([mkEntry('x')], [a]) });
    const prev = state.container!.meta.updated_at;
    const { state: next } = reduce(state, {
      type: 'RENAME_SAVED_SEARCH',
      id: 'a',
      name: 'Same',
    });
    // Identity-preserving: no `updated_at` bump, no array reshuffle.
    expect(next.container!.meta.saved_searches![0]!.name).toBe('Same');
    expect(next.container!.meta.updated_at).toBe(prev);
  });

  it('blocks when state.readonly', () => {
    const a = mkSaved('a', { name: 'Old' });
    const state = readyState({
      container: mkContainer([mkEntry('x')], [a]),
      readonly: true,
    });
    const { state: next } = reduce(state, {
      type: 'RENAME_SAVED_SEARCH',
      id: 'a',
      name: 'New',
    });
    expect(next).toBe(state);
  });
});
