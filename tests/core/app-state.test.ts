import { describe, it, expect } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

const mockContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  records: [],
  relations: [],
  revisions: [],
  assets: {},
};

describe('AppState', () => {
  it('starts in initializing phase', () => {
    const state = createInitialState();
    expect(state.phase).toBe('initializing');
    expect(state.container).toBeNull();
  });

  it('transitions to ready on INIT_COMPLETE', () => {
    const state = createInitialState();
    const next = reduce(state, { type: 'INIT_COMPLETE', container: mockContainer });
    expect(next.phase).toBe('ready');
    expect(next.container).toBe(mockContainer);
  });

  it('transitions to error on INIT_ERROR', () => {
    const state = createInitialState();
    const next = reduce(state, { type: 'INIT_ERROR', error: 'fail' });
    expect(next.phase).toBe('error');
    expect(next.error).toBe('fail');
  });

  it('blocks editing actions during initializing', () => {
    const state = createInitialState();
    const next = reduce(state, { type: 'BEGIN_EDIT', lid: 'x' });
    expect(next.phase).toBe('initializing');
  });

  it('allows SELECT_RECORD in ready phase', () => {
    const state: AppState = { ...createInitialState(), phase: 'ready', container: mockContainer };
    const next = reduce(state, { type: 'SELECT_RECORD', lid: 'abc' });
    expect(next.selectedLid).toBe('abc');
  });

  it('allows BEGIN_EDIT in ready phase', () => {
    const state: AppState = { ...createInitialState(), phase: 'ready', container: mockContainer };
    const next = reduce(state, { type: 'BEGIN_EDIT', lid: 'abc' });
    expect(next.phase).toBe('editing');
  });

  it('blocks SELECT_RECORD during editing', () => {
    const state: AppState = { ...createInitialState(), phase: 'editing', container: mockContainer };
    const next = reduce(state, { type: 'SELECT_RECORD', lid: 'other' });
    expect(next.phase).toBe('editing');
    expect(next).toBe(state); // same reference = no change
  });

  it('COMMIT_EDIT returns to ready', () => {
    const state: AppState = { ...createInitialState(), phase: 'editing', container: mockContainer };
    const next = reduce(state, { type: 'COMMIT_EDIT' });
    expect(next.phase).toBe('ready');
  });

  it('CANCEL_EDIT returns to ready', () => {
    const state: AppState = { ...createInitialState(), phase: 'editing', container: mockContainer };
    const next = reduce(state, { type: 'CANCEL_EDIT' });
    expect(next.phase).toBe('ready');
  });

  it('FINISH_EXPORT returns to ready', () => {
    const state: AppState = { ...createInitialState(), phase: 'exporting', container: mockContainer };
    const next = reduce(state, { type: 'FINISH_EXPORT' });
    expect(next.phase).toBe('ready');
  });
});
