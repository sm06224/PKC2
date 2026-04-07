import { describe, it, expect } from 'vitest';
import { createMemoryStore } from '@adapter/platform/idb-store';
import type { Container } from '@core/model/container';

const T = '2026-04-06T00:00:00Z';

function mockContainer(id = 'c1', assets: Record<string, string> = {}): Container {
  return {
    meta: {
      container_id: id,
      title: 'Test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [
      { lid: 'e1', title: 'A', body: '', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets,
  };
}

describe('MemoryStore (ContainerStore contract)', () => {
  it('save and load by id', async () => {
    const store = createMemoryStore();
    const c = mockContainer('c1');
    await store.save(c);

    const loaded = await store.load('c1');
    expect(loaded).not.toBeNull();
    expect(loaded!.meta.container_id).toBe('c1');
    expect(loaded!.entries).toHaveLength(1);
  });

  it('loadDefault returns the last saved container', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1'));
    await store.save(mockContainer('c2'));

    const loaded = await store.loadDefault();
    expect(loaded!.meta.container_id).toBe('c2');
  });

  it('load returns null for unknown id', async () => {
    const store = createMemoryStore();
    const loaded = await store.load('nonexistent');
    expect(loaded).toBeNull();
  });

  it('loadDefault returns null when nothing saved', async () => {
    const store = createMemoryStore();
    const loaded = await store.loadDefault();
    expect(loaded).toBeNull();
  });

  it('delete removes the container', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1'));
    await store.delete('c1');
    expect(await store.load('c1')).toBeNull();
  });

  it('delete of default clears loadDefault', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1'));
    await store.delete('c1');
    expect(await store.loadDefault()).toBeNull();
  });

  it('save creates a deep copy (no shared references)', async () => {
    const store = createMemoryStore();
    const c = mockContainer('c1');
    await store.save(c);

    // Mutate original
    c.entries.push({
      lid: 'e2', title: 'B', body: '', archetype: 'text', created_at: T, updated_at: T,
    });

    const loaded = await store.load('c1');
    expect(loaded!.entries).toHaveLength(1); // not mutated
  });

  it('load returns a deep copy (no shared references)', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1'));

    const loaded1 = await store.load('c1');
    const loaded2 = await store.load('c1');
    expect(loaded1).not.toBe(loaded2); // different objects
    expect(loaded1).toEqual(loaded2);  // same content
  });
});

describe('MemoryStore: assets separation (Phase 1)', () => {
  it('save separates assets; load reassembles them', async () => {
    const store = createMemoryStore();
    const c = mockContainer('c1', { 'ast-1': 'data1', 'ast-2': 'data2' });
    await store.save(c);

    const loaded = await store.load('c1');
    expect(loaded!.assets['ast-1']).toBe('data1');
    expect(loaded!.assets['ast-2']).toBe('data2');
  });

  it('loadDefault reassembles assets', async () => {
    const store = createMemoryStore();
    const c = mockContainer('c1', { 'ast-x': 'hello' });
    await store.save(c);

    const loaded = await store.loadDefault();
    expect(loaded!.assets['ast-x']).toBe('hello');
  });

  it('container stored internally without heavy assets', async () => {
    const store = createMemoryStore();
    const bigData = 'x'.repeat(100000);
    const c = mockContainer('c1', { 'ast-big': bigData });
    await store.save(c);

    // Directly use saveAsset/loadAsset to verify asset is stored separately
    const assetData = await store.loadAsset('c1', 'ast-big');
    expect(assetData).toBe(bigData);
  });

  it('delete removes associated assets', async () => {
    const store = createMemoryStore();
    const c = mockContainer('c1', { 'ast-1': 'data1' });
    await store.save(c);
    await store.delete('c1');

    expect(await store.loadAsset('c1', 'ast-1')).toBeNull();
  });

  it('assets from different containers are isolated', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-1': 'from-c1' }));
    await store.save(mockContainer('c2', { 'ast-1': 'from-c2' }));

    const loaded1 = await store.load('c1');
    const loaded2 = await store.load('c2');
    expect(loaded1!.assets['ast-1']).toBe('from-c1');
    expect(loaded2!.assets['ast-1']).toBe('from-c2');
  });
});

describe('MemoryStore: asset CRUD operations', () => {
  it('saveAsset and loadAsset', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'ast-1', 'hello');
    expect(await store.loadAsset('c1', 'ast-1')).toBe('hello');
  });

  it('loadAsset returns null for unknown key', async () => {
    const store = createMemoryStore();
    expect(await store.loadAsset('c1', 'nonexistent')).toBeNull();
  });

  it('deleteAsset removes the asset', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'ast-1', 'data');
    await store.deleteAsset('c1', 'ast-1');
    expect(await store.loadAsset('c1', 'ast-1')).toBeNull();
  });

  it('listAssetKeys returns all keys for a container', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'ast-a', 'a');
    await store.saveAsset('c1', 'ast-b', 'b');
    await store.saveAsset('c2', 'ast-c', 'c');

    const keys = await store.listAssetKeys('c1');
    expect(keys.sort()).toEqual(['ast-a', 'ast-b']);
  });

  it('listAssetKeys returns empty array when no assets', async () => {
    const store = createMemoryStore();
    expect(await store.listAssetKeys('c1')).toEqual([]);
  });

  it('saveAsset overwrites existing data', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'ast-1', 'old');
    await store.saveAsset('c1', 'ast-1', 'new');
    expect(await store.loadAsset('c1', 'ast-1')).toBe('new');
  });

  it('saved assets are included in next load', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1'));
    await store.saveAsset('c1', 'ast-extra', 'bonus');

    const loaded = await store.load('c1');
    expect(loaded!.assets['ast-extra']).toBe('bonus');
  });
});
