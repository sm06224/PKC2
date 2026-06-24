import { describe, it, expect, beforeEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { createMemoryStore } from '@adapter/platform/idb-store';
import { mountWorkingSet } from '@adapter/platform/asset-working-set';
import { noteAssetMiss, resetAssetMisses } from '@features/asset/asset-miss-recorder';
import type { Container } from '@core/model/container';

const T = '2026-06-24T00:00:00Z';

function containerWith(assets: Record<string, string>, body = ''): Container {
  return {
    meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [{ lid: 'e1', title: 'A', body, archetype: 'text', created_at: T, updated_at: T }],
    relations: [],
    revisions: [],
    assets,
  };
}

/** Drain the manager's microtask queue (ensure is serialized on a promise chain). */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

beforeEach(() => {
  resetAssetMisses();
});

describe('working-set manager (段階3 #868)', () => {
  it('ensure() loads requested assets from the store into container.assets', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'ast-1', 'BYTES1');
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: containerWith({}) });
    const ws = mountWorkingSet(dispatcher, { store });

    await ws.ensure(['ast-1']);
    await settle();

    expect(dispatcher.getState().container!.assets['ast-1']).toBe('BYTES1');
    expect(ws.residentKeys()).toContain('ast-1');
    ws.dispose();
  });

  it('does not dispatch when nothing changed (no render loop)', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'ast-1', 'BYTES1');
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: containerWith({}) });
    const ws = mountWorkingSet(dispatcher, { store });

    await ws.ensure(['ast-1']);
    await settle();
    const after = dispatcher.getState().container;
    // Ensuring the same resident key again must be a no-op (identical map).
    await ws.ensure(['ast-1']);
    await settle();
    expect(dispatcher.getState().container).toBe(after); // same reference — no dispatch
    ws.dispose();
  });

  it('a missing (absent-from-store) key does not loop or resurrect', async () => {
    const store = createMemoryStore();
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: containerWith({}) });
    const ws = mountWorkingSet(dispatcher, { store });

    await ws.ensure(['ghost']);
    await settle();
    expect(dispatcher.getState().container!.assets['ghost']).toBeUndefined();
    // Re-ensuring an absent key reloads nothing and dispatches nothing.
    const before = dispatcher.getState().container;
    await ws.ensure(['ghost']);
    await settle();
    expect(dispatcher.getState().container).toBe(before);
    ws.dispose();
  });

  it('evicts least-recently-used assets over budget — but ONLY store-confirmed bytes', async () => {
    const store = createMemoryStore();
    // Three 10-char assets in the store; budget fits ~2.
    await store.saveAsset('c1', 'a', 'x'.repeat(10));
    await store.saveAsset('c1', 'b', 'y'.repeat(10));
    await store.saveAsset('c1', 'c', 'z'.repeat(10));
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: containerWith({}) });
    const ws = mountWorkingSet(dispatcher, { store, budgetBytes: 25 });

    await ws.ensure(['a']);
    await settle();
    await ws.ensure(['b']);
    await settle();
    await ws.ensure(['c']); // now 30 bytes > 25 budget → evict LRU 'a'
    await settle();

    const assets = dispatcher.getState().container!.assets;
    expect(assets['c']).toBeDefined();
    expect(assets['b']).toBeDefined();
    expect(assets['a']).toBeUndefined(); // evicted (oldest, store-confirmed)
    ws.dispose();
  });

  it('NEVER evicts an asset whose bytes are not persisted in the store (data safety)', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'stored1', 's'.repeat(10));
    await store.saveAsset('c1', 'stored2', 't'.repeat(10));
    const dispatcher = createDispatcher();
    // A freshly-pasted asset 'dirty' lives in container.assets but is NOT
    // in the store yet (debounced save pending). It must survive eviction.
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: containerWith({ dirty: 'd'.repeat(10) }),
    });
    const ws = mountWorkingSet(dispatcher, { store, budgetBytes: 15 });

    await ws.ensure(['stored1']);
    await settle();
    await ws.ensure(['stored2']);
    await settle();

    const assets = dispatcher.getState().container!.assets;
    // Over budget, but 'dirty' is unpersisted → retained no matter what.
    expect(assets['dirty']).toBe('d'.repeat(10));
    ws.dispose();
  });

  it('refresh() drains render misses and loads them', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'missed-key', 'POPIN');
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: containerWith({}) });
    const ws = mountWorkingSet(dispatcher, { store });

    // Simulate the render path recording a miss for an asset not resident.
    noteAssetMiss('missed-key');
    await ws.refresh();
    await settle();

    expect(dispatcher.getState().container!.assets['missed-key']).toBe('POPIN');
    ws.dispose();
  });

  it('proactively preloads the selected entry dependency closure', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'ast-img', 'IMGBYTES');
    const dispatcher = createDispatcher();
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: containerWith({}, 'see ![pic](asset:ast-img)'),
    });
    const ws = mountWorkingSet(dispatcher, { store });

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    await settle();

    expect(dispatcher.getState().container!.assets['ast-img']).toBe('IMGBYTES');
    ws.dispose();
  });
});
