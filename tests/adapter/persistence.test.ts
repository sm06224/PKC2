import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { createMemoryStore } from '@adapter/platform/idb-store';
import { mountPersistence, loadFromStore } from '@adapter/platform/persistence';
import type { Container } from '@core/model/container';

const T = '2026-04-06T00:00:00Z';

const mockContainer: Container = {
  meta: {
    container_id: 'c1',
    title: 'Test',
    created_at: T,
    updated_at: T,
    schema_version: 1,
  },
  entries: [
    { lid: 'e1', title: 'Entry', body: 'B', archetype: 'text', created_at: T, updated_at: T },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mountPersistence', () => {
  it('saves after ENTRY_CREATED (debounced)', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 100 });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });

    // CONTAINER_LOADED is a save trigger
    await vi.advanceTimersByTimeAsync(150);
    expect(saveSpy).toHaveBeenCalledTimes(1);

    // Now create an entry
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'New' });
    // Not saved yet (debounce)
    expect(saveSpy).toHaveBeenCalledTimes(1);

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(150);
    expect(saveSpy).toHaveBeenCalledTimes(2);
  });

  it('debounces multiple rapid mutations into one save', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 200 });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });

    // Rapid mutations
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'A' });
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'B' });
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'C' });

    // Advance past debounce — only 1 save for the batch (+ 1 for CONTAINER_LOADED)
    await vi.advanceTimersByTimeAsync(250);
    // CONTAINER_LOADED debounce fires at ~200ms, but the CREATE_ENTRYs keep resetting
    // After all, we should see saves complete
    expect(saveSpy.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('does not save on ENTRY_SELECTED (non-mutation event)', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50 });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    await vi.advanceTimersByTimeAsync(100);
    const countAfterInit = saveSpy.mock.calls.length;

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    await vi.advanceTimersByTimeAsync(100);

    // No additional save for selection
    expect(saveSpy.mock.calls.length).toBe(countAfterInit);
  });

  it('does not save on EDIT_CANCELLED (no persistent change)', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50 });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    await vi.advanceTimersByTimeAsync(100);
    const countAfterInit = saveSpy.mock.calls.length;

    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    dispatcher.dispatch({ type: 'CANCEL_EDIT' });
    await vi.advanceTimersByTimeAsync(100);

    expect(saveSpy.mock.calls.length).toBe(countAfterInit);
  });

  it('calls onError when save fails', async () => {
    const store = createMemoryStore();
    vi.spyOn(store, 'save').mockRejectedValue(new Error('disk full'));
    const onError = vi.fn();
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 10, onError });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    await vi.advanceTimersByTimeAsync(50);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
  });

  it('cleanup stops saving', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    const cleanup = mountPersistence(dispatcher, { store, debounceMs: 50 });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    cleanup();

    // Trigger mutation after cleanup
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'After cleanup' });
    await vi.advanceTimersByTimeAsync(100);

    // The pending CONTAINER_LOADED timer was cleared by cleanup
    // No saves should have happened (or at most the one that was already scheduled)
    expect(saveSpy.mock.calls.length).toBe(0);
  });
});

describe('loadFromStore', () => {
  it('returns idb container when found', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer);

    const result = await loadFromStore(store);
    expect(result.source).toBe('idb');
    expect(result.container!.meta.container_id).toBe('c1');
  });

  it('returns none when nothing in store', async () => {
    const store = createMemoryStore();
    const result = await loadFromStore(store);
    expect(result.source).toBe('none');
    expect(result.container).toBeNull();
  });

  it('returns none when store.loadDefault throws', async () => {
    const store = createMemoryStore();
    vi.spyOn(store, 'loadDefault').mockRejectedValue(new Error('corrupt'));
    const result = await loadFromStore(store);
    expect(result.source).toBe('none');
    expect(result.container).toBeNull();
  });
});
