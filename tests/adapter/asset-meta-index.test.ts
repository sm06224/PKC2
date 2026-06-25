import { describe, it, expect, beforeEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { createMemoryStore } from '@adapter/platform/idb-store';
import {
  mountAssetMetaIndex,
  getResidentAssetMeta,
  getResidentAssetSizes,
  __resetAssetMetaIndexForTest,
} from '@adapter/platform/asset-meta-index';
import { computeAssetMeta } from '@features/asset/asset-meta';
import type { Container } from '@core/model/container';

const T = '2026-06-25T00:00:00Z';

function container(assets: Record<string, string>): Container {
  return {
    meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [{ lid: 'e1', title: 'A', body: '', archetype: 'text', created_at: T, updated_at: T }],
    relations: [],
    revisions: [],
    assets,
  };
}

beforeEach(() => __resetAssetMetaIndexForTest());

describe('asset-meta index (段階4 #868)', () => {
  it('backfills the index from the store (keys not resident) — memory-safe', async () => {
    const store = createMemoryStore();
    // Store holds three assets; container.assets is empty (shallow boot).
    await store.saveAsset('c1', 'a', 'AAAA');
    await store.saveAsset('c1', 'b', 'BBBBBB');
    await store.saveAsset('c1', 'c', 'CC');
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: container({}) });
    const mgr = mountAssetMetaIndex(dispatcher, store);

    await mgr.reconcile();

    const idx = getResidentAssetMeta('c1');
    expect(idx).not.toBeNull();
    expect(Object.keys(idx!).sort()).toEqual(['a', 'b', 'c']);
    expect(idx!['a']).toEqual(computeAssetMeta('AAAA'));
    // Sizes accessor mirrors the index.
    const sizes = getResidentAssetSizes('c1')!;
    expect(sizes['b']).toBe(computeAssetMeta('BBBBBB').size);
    mgr.dispose();
  });

  it('persists the index so a second mount loads it without re-reading bytes', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'a', 'AAAA');
    const d1 = createDispatcher();
    d1.dispatch({ type: 'SYS_INIT_COMPLETE', container: container({}) });
    const m1 = mountAssetMetaIndex(d1, store);
    await m1.reconcile();
    m1.dispose();
    expect(await store.loadAssetMeta('c1')).not.toBeNull();

    // Fresh module state + fresh mount: persisted index is loaded.
    __resetAssetMetaIndexForTest();
    const d2 = createDispatcher();
    d2.dispatch({ type: 'SYS_INIT_COMPLETE', container: container({}) });
    const m2 = mountAssetMetaIndex(d2, store);
    await m2.reconcile();
    expect(getResidentAssetMeta('c1')!['a']).toEqual(computeAssetMeta('AAAA'));
    m2.dispose();
  });

  it('indexes a resident (un-persisted) asset before it reaches the store', async () => {
    const store = createMemoryStore();
    const dispatcher = createDispatcher();
    // Freshly pasted asset lives in container.assets but not yet in the store.
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: container({ fresh: 'NEWBYTES' }) });
    const mgr = mountAssetMetaIndex(dispatcher, store);

    await mgr.reconcile();

    expect(getResidentAssetMeta('c1')!['fresh']).toEqual(computeAssetMeta('NEWBYTES'));
    mgr.dispose();
  });

  it('drops index entries for purged keys', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'keep', 'KEEP');
    await store.saveAsset('c1', 'gone', 'GONE');
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: container({}) });
    const mgr = mountAssetMetaIndex(dispatcher, store);
    await mgr.reconcile();
    expect(Object.keys(getResidentAssetMeta('c1')!).sort()).toEqual(['gone', 'keep']);

    // Purge 'gone' from the store, reconcile again.
    await store.purgeAssetsExcept('c1', ['keep']);
    await mgr.reconcile();
    expect(Object.keys(getResidentAssetMeta('c1')!)).toEqual(['keep']);
    mgr.dispose();
  });

  it('getResidentAssetMeta returns null for a different / not-ready container', async () => {
    const store = createMemoryStore();
    expect(getResidentAssetMeta('c1')).toBeNull(); // not mounted yet
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: container({}) });
    const mgr = mountAssetMetaIndex(dispatcher, store);
    await mgr.reconcile();
    expect(getResidentAssetMeta('other-cid')).toBeNull();
    mgr.dispose();
  });
});
