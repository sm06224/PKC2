import { describe, it, expect } from 'vitest';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';
import { reduce, createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';

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

function mkContainer(entries: Entry[], relations: Relation[] = []): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries,
    relations,
    revisions: [],
    assets: {},
  };
}

function readyState(overrides: Partial<AppState> & { container: Container }): AppState {
  return {
    ...createInitialState(),
    phase: 'ready',
    sortKey: 'manual',
    viewMode: 'detail',
    ...overrides,
  };
}

// ── SET_SORT → manual snapshot (contract §2.5) ─────────────────

describe('SET_SORT manual: initial snapshot', () => {
  it('populates entry_order on first switch to manual', () => {
    const entries = [
      mkEntry('a', { updated_at: '2026-01-01T00:00:00Z' }),
      mkEntry('b', { updated_at: '2026-03-01T00:00:00Z' }),
      mkEntry('c', { updated_at: '2026-02-01T00:00:00Z' }),
    ];
    const container = mkContainer(entries);
    const base: AppState = { ...createInitialState(), phase: 'ready', container };
    const { state } = reduce(base, { type: 'SET_SORT', key: 'manual', direction: 'asc' });
    expect(state.container?.meta.entry_order).toEqual(['b', 'c', 'a']);
    expect(state.sortKey).toBe('manual');
  });

  it('preserves entry_order on switch away to auto sort', () => {
    const entries = [mkEntry('a'), mkEntry('b')];
    const container: Container = {
      ...mkContainer(entries),
      meta: { ...mkContainer(entries).meta, entry_order: ['b', 'a'] },
    };
    const base: AppState = { ...createInitialState(), phase: 'ready', sortKey: 'manual', container };
    const { state } = reduce(base, { type: 'SET_SORT', key: 'title', direction: 'asc' });
    expect(state.sortKey).toBe('title');
    expect(state.container?.meta.entry_order).toEqual(['b', 'a']);
  });

  it('does not rewrite entry_order if one already exists on manual re-entry', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const container: Container = {
      ...mkContainer(entries),
      meta: { ...mkContainer(entries).meta, entry_order: ['c', 'a', 'b'] },
    };
    const base: AppState = { ...createInitialState(), phase: 'ready', sortKey: 'title', container };
    const { state } = reduce(base, { type: 'SET_SORT', key: 'manual', direction: 'asc' });
    expect(state.container?.meta.entry_order).toEqual(['c', 'a', 'b']);
  });
});

// ── MOVE_ENTRY_UP / DOWN: basic move (contract §4.2) ───────────

describe('MOVE_ENTRY_UP / DOWN: basic', () => {
  it('moves selected entry up within root set', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const container: Container = {
      ...mkContainer(entries),
      meta: { ...mkContainer(entries).meta, entry_order: ['a', 'b', 'c'] },
    };
    const state = readyState({ container, selectedLid: 'b' });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP' });
    expect(next.container?.meta.entry_order).toEqual(['b', 'a', 'c']);
    expect(next.selectedLid).toBe('b'); // I-Order1
  });

  it('moves selected entry down within root set', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const container: Container = {
      ...mkContainer(entries),
      meta: { ...mkContainer(entries).meta, entry_order: ['a', 'b', 'c'] },
    };
    const state = readyState({ container, selectedLid: 'a' });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_DOWN' });
    expect(next.container?.meta.entry_order).toEqual(['b', 'a', 'c']);
  });

  it('explicit lid overrides selectedLid', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const container: Container = {
      ...mkContainer(entries),
      meta: { ...mkContainer(entries).meta, entry_order: ['a', 'b', 'c'] },
    };
    const state = readyState({ container, selectedLid: 'a' });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP', lid: 'c' });
    expect(next.container?.meta.entry_order).toEqual(['a', 'c', 'b']);
  });
});

// ── No-op gates (contract §4.3 / §6.1) ─────────────────────────

describe('MOVE_ENTRY_UP / DOWN: no-op gates', () => {
  const entries = [mkEntry('a'), mkEntry('b')];
  const containerWithOrder: Container = {
    ...mkContainer(entries),
    meta: { ...mkContainer(entries).meta, entry_order: ['a', 'b'] },
  };

  it('no selectedLid → no-op, same state reference', () => {
    const state = readyState({ container: containerWithOrder, selectedLid: null });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP' });
    expect(next).toBe(state);
  });

  it('sortKey !== manual → no-op (D2 / I-Order2 enforcement)', () => {
    const state = readyState({
      container: containerWithOrder,
      selectedLid: 'b',
      sortKey: 'title',
    });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP' });
    expect(next).toBe(state);
  });

  it('viewMode !== detail → no-op (D3 enforcement)', () => {
    const state = readyState({
      container: containerWithOrder,
      selectedLid: 'b',
      viewMode: 'calendar',
    });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP' });
    expect(next).toBe(state);
  });

  it('top-edge up → no-op', () => {
    const state = readyState({ container: containerWithOrder, selectedLid: 'a' });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP' });
    expect(next).toBe(state);
  });

  it('bottom-edge down → no-op', () => {
    const state = readyState({ container: containerWithOrder, selectedLid: 'b' });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_DOWN' });
    expect(next).toBe(state);
  });

  it('readonly → no-op', () => {
    const state = readyState({
      container: containerWithOrder,
      selectedLid: 'b',
      readonly: true,
    });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP' });
    expect(next).toBe(state);
  });

  it('importPreview open → no-op', () => {
    const state = readyState({
      container: containerWithOrder,
      selectedLid: 'b',
      importPreview: {
        container: containerWithOrder,
        source: 'x',
        entry_count: 2,
        title: 't',
        container_id: 'c1',
        revision_count: 0,
        schema_version: 1,
      },
    });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP' });
    expect(next).toBe(state);
  });

  it('unknown lid → no-op', () => {
    const state = readyState({ container: containerWithOrder, selectedLid: 'a' });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP', lid: 'zzz' });
    expect(next).toBe(state);
  });
});

// ── Filter-aware global swap (I-Order3) ────────────────────────

describe('MOVE_ENTRY_UP: filter / search semantics (I-Order3)', () => {
  it('search-filter visible swap updates global entry_order', () => {
    // Entries: a (match), x (no match), b (match), y (no match), c (match)
    const entries = [
      mkEntry('a', { title: 'Alpha 2026' }),
      mkEntry('x', { title: 'Nope' }),
      mkEntry('b', { title: 'Beta 2026' }),
      mkEntry('y', { title: 'Also nope' }),
      mkEntry('c', { title: 'Gamma 2026' }),
    ];
    const container: Container = {
      ...mkContainer(entries),
      meta: {
        ...mkContainer(entries).meta,
        entry_order: ['a', 'x', 'b', 'y', 'c'],
      },
    };
    // User searches "2026" → visible = [a, b, c]. Move c up.
    const state = readyState({
      container,
      selectedLid: 'c',
      searchQuery: '2026',
    });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP' });
    // Expected global order: [a, x, c, y, b] — x and y slots preserved.
    expect(next.container?.meta.entry_order).toEqual(['a', 'x', 'c', 'y', 'b']);
  });
});

// ── Belonging set: folder children vs root (contract §1.2) ─────

describe('MOVE_ENTRY_UP: folder children belonging set', () => {
  it('reorders inside a folder without touching root siblings', () => {
    const entries = [
      mkEntry('root1'),
      mkEntry('root2'),
      mkEntry('folder', { archetype: 'folder' }),
      mkEntry('child1'),
      mkEntry('child2'),
    ];
    const relations: Relation[] = [
      {
        id: 'r1',
        from: 'folder',
        to: 'child1',
        kind: 'structural',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'r2',
        from: 'folder',
        to: 'child2',
        kind: 'structural',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
    const container: Container = {
      ...mkContainer(entries, relations),
      meta: {
        ...mkContainer(entries).meta,
        entry_order: ['root1', 'root2', 'folder', 'child1', 'child2'],
      },
    };
    const state = readyState({ container, selectedLid: 'child2' });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP' });
    // child2 swaps with child1; roots untouched
    expect(next.container?.meta.entry_order).toEqual([
      'root1',
      'root2',
      'folder',
      'child2',
      'child1',
    ]);
  });
});

// ── Non-interference: container fields not touched ─────────────

describe('MOVE_ENTRY_UP: non-interference with other container fields', () => {
  it('relations / revisions / assets are reused by reference (I-Order5)', () => {
    const entries = [mkEntry('a'), mkEntry('b')];
    const relations: Relation[] = [
      {
        id: 'r1',
        from: 'a',
        to: 'b',
        kind: 'semantic',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
    const base = mkContainer(entries, relations);
    const container: Container = {
      ...base,
      meta: { ...base.meta, entry_order: ['a', 'b'] },
    };
    const state = readyState({ container, selectedLid: 'b' });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP' });
    expect(next.container?.entries).toBe(container.entries);
    expect(next.container?.relations).toBe(container.relations);
    expect(next.container?.revisions).toBe(container.revisions);
    expect(next.container?.assets).toBe(container.assets);
    expect(next.multiSelectedLids).toBe(state.multiSelectedLids); // I-Order-MS
  });
});

// ── Determinism ─────────────────────────────────────────────────

describe('MOVE_ENTRY_UP: determinism', () => {
  it('same state + same action → same output', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const container: Container = {
      ...mkContainer(entries),
      meta: { ...mkContainer(entries).meta, entry_order: ['a', 'b', 'c'] },
    };
    const state = readyState({ container, selectedLid: 'b' });
    const r1 = reduce(state, { type: 'MOVE_ENTRY_UP' });
    const r2 = reduce(state, { type: 'MOVE_ENTRY_UP' });
    expect(r1.state.container?.meta.entry_order).toEqual(
      r2.state.container?.meta.entry_order,
    );
  });
});
