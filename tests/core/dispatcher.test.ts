import { describe, it, expect, vi } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

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

describe('Dispatcher', () => {
  it('starts in initializing phase', () => {
    const d = createDispatcher();
    expect(d.getState().phase).toBe('initializing');
  });

  it('dispatch updates state', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    expect(d.getState().phase).toBe('ready');
  });

  it('notifies state listeners on state change', () => {
    const d = createDispatcher();
    const listener = vi.fn();
    d.onState(listener);
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    expect(listener).toHaveBeenCalledTimes(1);
    const [newState, prevState] = listener.mock.calls[0]!;
    expect(prevState.phase).toBe('initializing');
    expect(newState.phase).toBe('ready');
  });

  it('does not notify state listener when action is blocked', () => {
    const d = createDispatcher();
    const listener = vi.fn();
    d.onState(listener);
    // BEGIN_EDIT is invalid in 'initializing' phase
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'x' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies event listeners for emitted domain events', () => {
    const d = createDispatcher();
    const events: DomainEvent[] = [];
    d.onEvent((e) => events.push(e));
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('CONTAINER_LOADED');
  });

  it('unsubscribe stops notifications', () => {
    const d = createDispatcher();
    const listener = vi.fn();
    const unsub = d.onState(listener);
    unsub();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    expect(listener).not.toHaveBeenCalled();
  });

  it('full lifecycle: init → select → edit → commit', () => {
    const d = createDispatcher();
    const events: DomainEvent[] = [];
    d.onEvent((e) => events.push(e));

    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    d.dispatch({ type: 'COMMIT_EDIT', lid: 'e1', title: 'T', body: 'B' });

    expect(d.getState().phase).toBe('ready');
    expect(d.getState().editingLid).toBeNull();

    const types = events.map((e) => e.type);
    expect(types).toEqual([
      'CONTAINER_LOADED',
      'ENTRY_SELECTED',
      'EDIT_BEGUN',
      'EDIT_COMMITTED',
      'ENTRY_UPDATED',
    ]);
  });
});
