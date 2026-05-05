import { describe, it, expect } from 'vitest';
import type { Container } from '@core/model/container';
import type { Entry, FilerProfile } from '@core/model/record';
import { reduce, createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';

/**
 * Filer view (領域 10-6 ζ'' wave Phase 1 PR-1) reducer tests.
 *
 * Spec: docs/development/filer-view-explorer-subset-spec.md §5.3
 *
 * Two reducer paths:
 *   1. SET_VIEW_MODE accepts 'filer' as a 4th mode (additive).
 *   2. SET_DISPLAY_PROFILE updates folder.display_profile (additive
 *      optional). non-folder entries / missing entries are no-op.
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

describe('SET_VIEW_MODE accepts filer', () => {
  it('switches viewMode to filer', () => {
    const state = readyState({ container: mkContainer([mkEntry('a')]) });
    const r = reduce(state, { type: 'SET_VIEW_MODE', mode: 'filer' });
    expect(r.state.viewMode).toBe('filer');
  });

  it('preserves selectedLid across detail → filer transition', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a')]),
      selectedLid: 'a',
    });
    const r = reduce(state, { type: 'SET_VIEW_MODE', mode: 'filer' });
    expect(r.state.viewMode).toBe('filer');
    expect(r.state.selectedLid).toBe('a');
  });

  it('round-trips filer → calendar → filer without losing selection', () => {
    const state = readyState({
      container: mkContainer([mkEntry('a')]),
      selectedLid: 'a',
      viewMode: 'filer',
    });
    const r1 = reduce(state, { type: 'SET_VIEW_MODE', mode: 'calendar' });
    const r2 = reduce(r1.state, { type: 'SET_VIEW_MODE', mode: 'filer' });
    expect(r2.state.viewMode).toBe('filer');
    expect(r2.state.selectedLid).toBe('a');
  });
});

describe('SET_DISPLAY_PROFILE', () => {
  it('sets display_profile on a folder entry', () => {
    const folder = mkEntry('f1', { archetype: 'folder' });
    const state = readyState({ container: mkContainer([folder]) });
    const profile: FilerProfile = { kind: 'explorer' };
    const r = reduce(state, { type: 'SET_DISPLAY_PROFILE', lid: 'f1', profile });
    const updated = r.state.container?.entries.find((e) => e.lid === 'f1');
    expect(updated?.display_profile).toEqual(profile);
  });

  it('clears display_profile when profile is undefined', () => {
    const folder = mkEntry('f1', {
      archetype: 'folder',
      display_profile: { kind: 'explorer', columns: ['name'] },
    });
    const state = readyState({ container: mkContainer([folder]) });
    const r = reduce(state, { type: 'SET_DISPLAY_PROFILE', lid: 'f1', profile: undefined });
    const updated = r.state.container?.entries.find((e) => e.lid === 'f1');
    expect(updated?.display_profile).toBeUndefined();
    // The cleared field must not survive as a key with undefined value —
    // must be removed entirely so JSON serialization stays canonical.
    expect(Object.prototype.hasOwnProperty.call(updated ?? {}, 'display_profile')).toBe(false);
  });

  it('is a no-op for non-folder entries', () => {
    const text = mkEntry('t1', { archetype: 'text' });
    const state = readyState({ container: mkContainer([text]) });
    const r = reduce(state, {
      type: 'SET_DISPLAY_PROFILE',
      lid: 't1',
      profile: { kind: 'explorer' },
    });
    const updated = r.state.container?.entries.find((e) => e.lid === 't1');
    expect(updated?.display_profile).toBeUndefined();
    // updated_at must not change for a no-op
    expect(updated?.updated_at).toBe(text.updated_at);
  });

  it('is a no-op for missing lid', () => {
    const folder = mkEntry('f1', { archetype: 'folder' });
    const state = readyState({ container: mkContainer([folder]) });
    const r = reduce(state, {
      type: 'SET_DISPLAY_PROFILE',
      lid: 'nonexistent',
      profile: { kind: 'explorer' },
    });
    expect(r.state).toBe(state);
  });

  it('updates entry.updated_at + container.meta.updated_at when profile changes', () => {
    const folder = mkEntry('f1', {
      archetype: 'folder',
      updated_at: '2026-01-01T00:00:00Z',
    });
    const state = readyState({ container: mkContainer([folder]) });
    const before = state.container!.meta.updated_at;
    const r = reduce(state, {
      type: 'SET_DISPLAY_PROFILE',
      lid: 'f1',
      profile: { kind: 'explorer' },
    });
    const updated = r.state.container?.entries.find((e) => e.lid === 'f1');
    expect(updated?.updated_at).not.toBe(folder.updated_at);
    expect(r.state.container?.meta.updated_at).not.toBe(before);
  });
});
