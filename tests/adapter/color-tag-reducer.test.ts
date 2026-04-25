import { describe, it, expect } from 'vitest';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { reduce, createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';

/**
 * Color tag Slice 3 reducer tests.
 *
 * Spec: docs/development/color-tag-ui-appstate-audit.md
 *       docs/spec/color-tag-data-model-v1-minimum-scope.md §3
 *
 * SET_ENTRY_COLOR / CLEAR_ENTRY_COLOR follow the metadata-mutation
 * pattern (no revision snapshot, no phase change). Loose-string
 * storage means unknown palette IDs round-trip through the reducer
 * unchanged.
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

describe('SET_ENTRY_COLOR', () => {
  it('sets color_tag on the explicitly addressed entry', () => {
    const state = readyState({ container: mkContainer([mkEntry('a'), mkEntry('b')]) });
    const r = reduce(state, { type: 'SET_ENTRY_COLOR', lid: 'a', color: 'red' });
    const a = r.state.container?.entries.find((e) => e.lid === 'a');
    const b = r.state.container?.entries.find((e) => e.lid === 'b');
    expect(a?.color_tag).toBe('red');
    expect(b?.color_tag).toBeUndefined();
    expect(r.events).toEqual([{ type: 'ENTRY_UPDATED', lid: 'a' }]);
  });

  it('falls back to selectedLid when lid is omitted', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a')]),
      selectedLid: 'a',
    });
    const r = reduce(state, { type: 'SET_ENTRY_COLOR', color: 'blue' });
    const a = r.state.container?.entries.find((e) => e.lid === 'a');
    expect(a?.color_tag).toBe('blue');
  });

  it('replaces an existing color_tag', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a', { color_tag: 'red' })]),
    });
    const r = reduce(state, { type: 'SET_ENTRY_COLOR', lid: 'a', color: 'green' });
    const a = r.state.container?.entries.find((e) => e.lid === 'a');
    expect(a?.color_tag).toBe('green');
  });

  it('stores unknown palette IDs verbatim (round-trip preservation)', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]) });
    const r = reduce(state, { type: 'SET_ENTRY_COLOR', lid: 'a', color: 'teal' });
    const a = r.state.container?.entries.find((e) => e.lid === 'a');
    expect(a?.color_tag).toBe('teal');
  });

  it('does NOT create a revision snapshot (metadata mutation)', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]) });
    const r = reduce(state, { type: 'SET_ENTRY_COLOR', lid: 'a', color: 'red' });
    expect(r.state.container?.revisions ?? []).toHaveLength(0);
  });

  it('does NOT change phase or selection', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a'), mkEntry('b')]),
      selectedLid: 'b',
      phase: 'ready',
    });
    const r = reduce(state, { type: 'SET_ENTRY_COLOR', lid: 'a', color: 'red' });
    expect(r.state.phase).toBe('ready');
    expect(r.state.selectedLid).toBe('b');
  });

  it('treats empty / whitespace-only color as a clear request', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a', { color_tag: 'red' })]),
    });
    const r = reduce(state, { type: 'SET_ENTRY_COLOR', lid: 'a', color: '   ' });
    const a = r.state.container?.entries.find((e) => e.lid === 'a');
    expect(a?.color_tag).toBeUndefined();
  });

  it('blocks when readonly / lightSource / viewOnlySource is set', () => {
    // The reducer's `blocked` helper returns the same state with an
    // empty events array (it doesn't emit a discrete ACTION_BLOCKED
    // event). The observable invariants are: identity-stable state,
    // no ENTRY_UPDATED, and the entry's color_tag stays absent.
    for (const flag of ['readonly', 'lightSource', 'viewOnlySource'] as const) {
      const state = readyState({
        container: mkContainer([mkEntry('a')]),
        [flag]: true,
      });
      const r = reduce(state, { type: 'SET_ENTRY_COLOR', lid: 'a', color: 'red' });
      expect(r.state).toBe(state);
      expect(r.events).toEqual([]);
      const a = r.state.container?.entries.find((e) => e.lid === 'a');
      expect(a?.color_tag).toBeUndefined();
    }
  });

  it('blocks reserved lids (about / settings)', () => {
    const state = readyState({
      container: mkContainer([mkEntry('__about__')]),
    });
    const r = reduce(state, {
      type: 'SET_ENTRY_COLOR',
      lid: '__about__',
      color: 'red',
    });
    const a = r.state.container?.entries.find((e) => e.lid === '__about__');
    expect(a?.color_tag).toBeUndefined();
  });

  it('silently no-ops when the lid does not match any entry', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]) });
    const r = reduce(state, {
      type: 'SET_ENTRY_COLOR',
      lid: 'missing',
      color: 'red',
    });
    expect(r.state).toBe(state);
  });
});

describe('CLEAR_ENTRY_COLOR', () => {
  it('drops the color_tag field on the addressed entry', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a', { color_tag: 'red' })]),
    });
    const r = reduce(state, { type: 'CLEAR_ENTRY_COLOR', lid: 'a' });
    const a = r.state.container?.entries.find((e) => e.lid === 'a');
    expect(a?.color_tag).toBeUndefined();
    expect(r.events).toEqual([{ type: 'ENTRY_UPDATED', lid: 'a' }]);
  });

  it('falls back to selectedLid when lid is omitted', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a', { color_tag: 'blue' })]),
      selectedLid: 'a',
    });
    const r = reduce(state, { type: 'CLEAR_ENTRY_COLOR' });
    const a = r.state.container?.entries.find((e) => e.lid === 'a');
    expect(a?.color_tag).toBeUndefined();
  });

  it('is a stable no-op when the entry is already un-coloured', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]) });
    const r = reduce(state, { type: 'CLEAR_ENTRY_COLOR', lid: 'a' });
    // No events emitted because the field was already absent.
    expect(r.events).toEqual([]);
    expect(r.state).toBe(state);
  });

  it('also clears unknown palette IDs', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a', { color_tag: 'teal' })]),
    });
    const r = reduce(state, { type: 'CLEAR_ENTRY_COLOR', lid: 'a' });
    const a = r.state.container?.entries.find((e) => e.lid === 'a');
    expect(a?.color_tag).toBeUndefined();
  });

  it('blocks when readonly / lightSource / viewOnlySource is set', () => {
    const base = mkContainer([mkEntry('a', { color_tag: 'red' })]);
    for (const flag of ['readonly', 'lightSource', 'viewOnlySource'] as const) {
      const state = readyState({ container: base, [flag]: true });
      const r = reduce(state, { type: 'CLEAR_ENTRY_COLOR', lid: 'a' });
      const a = r.state.container?.entries.find((e) => e.lid === 'a');
      expect(a?.color_tag).toBe('red');
    }
  });
});
