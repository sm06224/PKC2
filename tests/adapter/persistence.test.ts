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

    mountPersistence(dispatcher, { store, debounceMs: 100, unloadTarget: null });
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

    mountPersistence(dispatcher, { store, debounceMs: 200, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });

    // Rapid mutations: create enters editing, so save+create+save for subsequent
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'A' });
    const lidA = dispatcher.getState().selectedLid!;
    dispatcher.dispatch({ type: 'COMMIT_EDIT', lid: lidA, title: 'A', body: '' });
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'B' });
    const lidB = dispatcher.getState().selectedLid!;
    dispatcher.dispatch({ type: 'COMMIT_EDIT', lid: lidB, title: 'B', body: '' });
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

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
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

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
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

    mountPersistence(dispatcher, { store, debounceMs: 10, onError, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    await vi.advanceTimersByTimeAsync(50);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
  });

  it('dispose stops saving', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    const handle = mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    handle.dispose();

    // Trigger mutation after dispose
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'After cleanup' });
    await vi.advanceTimersByTimeAsync(100);

    // The pending CONTAINER_LOADED timer was cleared by dispose
    // No saves should have happened (or at most the one that was already scheduled)
    expect(saveSpy.mock.calls.length).toBe(0);
  });

  // ── Debounce stale-state investigation ──────────────────────────
  //
  // Confirms the architectural claim from the B sub-item's
  // investigation: even when a QUICK_UPDATE_ENTRY is immediately
  // followed by SELECT_ENTRY before the debounce fires, the eventual
  // save reflects the latest state, not a closure-captured snapshot.
  it('pending save after QUICK_UPDATE_ENTRY → SELECT_ENTRY uses the latest state', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 300, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    await vi.advanceTimersByTimeAsync(350);
    saveSpy.mockClear();

    // Update e1's body (QUICK_UPDATE_ENTRY-style path via COMMIT_EDIT
    // — either flavor emits ENTRY_UPDATED and schedules a save).
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    dispatcher.dispatch({ type: 'COMMIT_EDIT', lid: 'e1', title: 'Entry', body: 'updated body' });
    // Immediately switch selection — this does NOT trigger a save,
    // and does NOT affect the container.
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

    await vi.advanceTimersByTimeAsync(350);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const savedContainer = saveSpy.mock.calls[0]![0] as Container;
    const savedEntry = savedContainer.entries.find((e) => e.lid === 'e1');
    expect(savedEntry?.body).toBe('updated body');
  });

  it('flushPending runs a save immediately and cancels the pending timer', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    const handle = mountPersistence(dispatcher, { store, debounceMs: 300, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });

    // The CONTAINER_LOADED save is pending. Before the 300ms elapses,
    // flushPending should run it immediately.
    expect(saveSpy).not.toHaveBeenCalled();
    await handle.flushPending();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    // And the timer is gone — advancing past the debounce does not
    // trigger a second (stale) save.
    await vi.advanceTimersByTimeAsync(500);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('flushPending is a no-op when nothing is pending', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    const handle = mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
    // No dispatch at all — no state, no pending save. flushPending
    // should short-circuit in doSave via the `!container` guard.
    await handle.flushPending();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('pagehide fires flushPending automatically', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    // Use an EventTarget as the unloadTarget so the test can fire
    // pagehide deterministically without polluting the global window.
    const unloadTarget = new EventTarget();
    mountPersistence(dispatcher, { store, debounceMs: 500, unloadTarget });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });

    // Before pagehide, no save (debounce not elapsed).
    expect(saveSpy).not.toHaveBeenCalled();

    // Simulate tab close / navigation away.
    unloadTarget.dispatchEvent(new Event('pagehide'));

    // pagehide handler calls flushPending, which runs doSave.
    // The save is async; give microtasks a chance to resolve.
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('dispose removes the pagehide listener', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    const unloadTarget = new EventTarget();
    const handle = mountPersistence(dispatcher, { store, debounceMs: 500, unloadTarget });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    handle.dispose();

    // After dispose, pagehide must not trigger any save.
    unloadTarget.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(saveSpy).not.toHaveBeenCalled();
  });

  // ── Boot source policy revision (2026-04-16) ──────────────────
  //
  // viewOnlySource=true means the container was booted from embedded
  // pkc-data. Persistence must suppress saves so the embedded snapshot
  // does not contaminate the receiver's IDB. Explicit Import clears
  // the flag (see reducer CONFIRM_IMPORT / SYS_IMPORT_COMPLETE cases),
  // after which saves resume normally.

  it('does NOT save when viewOnlySource=true (pkc-data boot)', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: mockContainer,
      viewOnlySource: true,
    });
    await vi.advanceTimersByTimeAsync(100);
    // CONTAINER_LOADED event fired, but save was suppressed.
    expect(saveSpy).not.toHaveBeenCalled();

    // Also suppressed for subsequent mutations in the same session.
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'Note' });
    await vi.advanceTimersByTimeAsync(100);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('resumes saving after an explicit import clears viewOnlySource', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: mockContainer,
      viewOnlySource: true,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(saveSpy).not.toHaveBeenCalled();

    // Simulate an explicit Import flow: preview → confirm. SYS_IMPORT_PREVIEW
    // stashes the imported container; CONFIRM_IMPORT commits it and clears
    // viewOnlySource in the reducer.
    const importedContainer: Container = {
      ...mockContainer,
      meta: { ...mockContainer.meta, container_id: 'c-imported' },
    };
    dispatcher.dispatch({
      type: 'SYS_IMPORT_PREVIEW',
      preview: {
        title: importedContainer.meta.title,
        container_id: importedContainer.meta.container_id,
        entry_count: importedContainer.entries.length,
        revision_count: importedContainer.revisions.length,
        schema_version: importedContainer.meta.schema_version,
        source: 'test-import',
        container: importedContainer,
      },
    });
    dispatcher.dispatch({ type: 'CONFIRM_IMPORT' });

    // CONTAINER_IMPORTED is a save trigger; viewOnlySource was cleared
    // by the reducer, so the save should proceed.
    await vi.advanceTimersByTimeAsync(100);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const saved = saveSpy.mock.calls[0]![0] as Container;
    expect(saved.meta.container_id).toBe('c-imported');

    // Post-import edits persist normally.
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'Post import' });
    await vi.advanceTimersByTimeAsync(100);
    expect(saveSpy).toHaveBeenCalledTimes(2);
  });

  it('normal (viewOnlySource=false) boot still saves on CONTAINER_LOADED', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: mockContainer,
      // Explicit false — IDB path / empty path / imported path.
      viewOnlySource: false,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(saveSpy).toHaveBeenCalledTimes(1);
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
