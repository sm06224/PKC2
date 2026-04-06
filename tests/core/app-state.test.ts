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
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

function readyState(): AppState {
  return { ...createInitialState(), phase: 'ready', container: mockContainer };
}

describe('AppState reducer', () => {
  // ── initializing ─────────────────────────
  it('starts in initializing phase', () => {
    const state = createInitialState();
    expect(state.phase).toBe('initializing');
    expect(state.container).toBeNull();
    expect(state.editingLid).toBeNull();
  });

  it('SYS_INIT_COMPLETE → ready + CONTAINER_LOADED event', () => {
    const { state, events } = reduce(createInitialState(), {
      type: 'SYS_INIT_COMPLETE', container: mockContainer,
    });
    expect(state.phase).toBe('ready');
    expect(state.container).toBe(mockContainer);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('CONTAINER_LOADED');
  });

  it('SYS_INIT_ERROR → error + ERROR_OCCURRED event', () => {
    const { state, events } = reduce(createInitialState(), {
      type: 'SYS_INIT_ERROR', error: 'fail',
    });
    expect(state.phase).toBe('error');
    expect(events[0]).toEqual({ type: 'ERROR_OCCURRED', error: 'fail' });
  });

  it('blocks user actions during initializing', () => {
    const { state, events } = reduce(createInitialState(), {
      type: 'BEGIN_EDIT', lid: 'x',
    });
    expect(state.phase).toBe('initializing');
    expect(events).toHaveLength(0);
  });

  // ── ready ────────────────────────────────
  it('SELECT_ENTRY in ready → selectedLid + ENTRY_SELECTED event', () => {
    const { state, events } = reduce(readyState(), {
      type: 'SELECT_ENTRY', lid: 'abc',
    });
    expect(state.selectedLid).toBe('abc');
    expect(events).toEqual([{ type: 'ENTRY_SELECTED', lid: 'abc' }]);
  });

  it('DESELECT_ENTRY in ready → null + ENTRY_DESELECTED event', () => {
    const base = { ...readyState(), selectedLid: 'abc' };
    const { state, events } = reduce(base, { type: 'DESELECT_ENTRY' });
    expect(state.selectedLid).toBeNull();
    expect(events[0]!.type).toBe('ENTRY_DESELECTED');
  });

  it('BEGIN_EDIT in ready → editing phase + editingLid set', () => {
    const { state, events } = reduce(readyState(), {
      type: 'BEGIN_EDIT', lid: 'abc',
    });
    expect(state.phase).toBe('editing');
    expect(state.editingLid).toBe('abc');
    expect(state.selectedLid).toBe('abc');
    expect(events).toEqual([{ type: 'EDIT_BEGUN', lid: 'abc' }]);
  });

  it('CREATE_ENTRY in ready → ENTRY_CREATED event with generated lid', () => {
    const { events } = reduce(readyState(), {
      type: 'CREATE_ENTRY', archetype: 'text', title: 'New',
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('ENTRY_CREATED');
  });

  it('DELETE_ENTRY clears selectedLid if deleted entry was selected', () => {
    const base = { ...readyState(), selectedLid: 'abc' };
    const { state, events } = reduce(base, { type: 'DELETE_ENTRY', lid: 'abc' });
    expect(state.selectedLid).toBeNull();
    expect(events).toEqual([{ type: 'ENTRY_DELETED', lid: 'abc' }]);
  });

  it('BEGIN_EXPORT in ready → exporting phase', () => {
    const { state, events } = reduce(readyState(), { type: 'BEGIN_EXPORT' });
    expect(state.phase).toBe('exporting');
    expect(events).toHaveLength(0);
  });

  it('CREATE_RELATION in ready → RELATION_CREATED event', () => {
    const { events } = reduce(readyState(), {
      type: 'CREATE_RELATION', from: 'a', to: 'b', kind: 'structural',
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('RELATION_CREATED');
  });

  it('DELETE_RELATION in ready → RELATION_DELETED event', () => {
    const { events } = reduce(readyState(), {
      type: 'DELETE_RELATION', id: 'r1',
    });
    expect(events).toEqual([{ type: 'RELATION_DELETED', id: 'r1' }]);
  });

  // ── editing ──────────────────────────────
  it('COMMIT_EDIT in editing → ready + two events', () => {
    const base: AppState = { ...readyState(), phase: 'editing', editingLid: 'abc' };
    const { state, events } = reduce(base, {
      type: 'COMMIT_EDIT', lid: 'abc', title: 'T', body: 'B',
    });
    expect(state.phase).toBe('ready');
    expect(state.editingLid).toBeNull();
    expect(events).toEqual([
      { type: 'EDIT_COMMITTED', lid: 'abc' },
      { type: 'ENTRY_UPDATED', lid: 'abc' },
    ]);
  });

  it('CANCEL_EDIT in editing → ready + EDIT_CANCELLED', () => {
    const base: AppState = { ...readyState(), phase: 'editing', editingLid: 'abc' };
    const { state, events } = reduce(base, { type: 'CANCEL_EDIT' });
    expect(state.phase).toBe('ready');
    expect(state.editingLid).toBeNull();
    expect(events).toEqual([{ type: 'EDIT_CANCELLED' }]);
  });

  it('blocks SELECT_ENTRY during editing (no state change, no events)', () => {
    const base: AppState = { ...readyState(), phase: 'editing', editingLid: 'abc' };
    const { state, events } = reduce(base, { type: 'SELECT_ENTRY', lid: 'other' });
    expect(state).toBe(base); // same reference
    expect(events).toHaveLength(0);
  });

  // ── exporting ────────────────────────────
  it('SYS_FINISH_EXPORT in exporting → ready + EXPORT_COMPLETED', () => {
    const base: AppState = { ...readyState(), phase: 'exporting' };
    const { state, events } = reduce(base, { type: 'SYS_FINISH_EXPORT' });
    expect(state.phase).toBe('ready');
    expect(events).toEqual([{ type: 'EXPORT_COMPLETED' }]);
  });

  // ── error ────────────────────────────────
  it('SYS_INIT_COMPLETE recovers from error', () => {
    const base: AppState = { ...createInitialState(), phase: 'error', error: 'old' };
    const { state, events } = reduce(base, {
      type: 'SYS_INIT_COMPLETE', container: mockContainer,
    });
    expect(state.phase).toBe('ready');
    expect(state.error).toBeNull();
    expect(events[0]!.type).toBe('CONTAINER_LOADED');
  });
});
