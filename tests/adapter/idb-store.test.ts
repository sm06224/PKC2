import { describe, it, expect, afterEach } from 'vitest';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import {
  createContainerStore,
  createMemoryStore,
  hydrateAllAssets,
  hydrateReferencedAssets,
  registerExportStore,
  hydrateForExport,
  loadAssetDirect,
} from '@adapter/platform/idb-store';
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

  // 段階2 (#868): save() is ADDITIVE-ONLY. The earlier B5 fix made
  // save() diff-delete asset keys missing from `container.assets`,
  // which assumed `container.assets` was always the complete set.
  // Lazy working-set loading breaks that assumption (a save may carry
  // only the resident subset), so diff-delete was a silent data-loss
  // landmine. The tests below pin the new contract: save never deletes;
  // deletion is the explicit job of `purgeAssetsExcept`. The B5
  // invariant (orphan-purge + reload stays purged) is preserved by the
  // persistence layer calling `purgeAssetsExcept` on the purge event —
  // see tests/adapter/persistence.test.ts.

  it('save is additive-only: a partial save keeps previously stored asset keys (no data loss)', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-a': 'A', 'ast-b': 'B', 'ast-c': 'C' }));
    // A later save carrying only a SUBSET (e.g. a lazy working-set, or
    // an orphan-purged in-memory container) must NOT drop the absent
    // keys. This is the core memory-reduction #7 safety property.
    await store.save(mockContainer('c1', { 'ast-a': 'A' }));

    const loaded = await store.load('c1');
    expect(loaded!.assets['ast-a']).toBe('A');
    expect(loaded!.assets['ast-b']).toBe('B');
    expect(loaded!.assets['ast-c']).toBe('C');
    expect((await store.listAssetKeys('c1')).sort()).toEqual(['ast-a', 'ast-b', 'ast-c']);
  });

  it('save with assets = {} preserves previously saved assets (additive-only)', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-a': 'A', 'ast-b': 'B' }));
    // An asset-stripped save (the lazy boot extreme) must not wipe IDB.
    await store.save(mockContainer('c1', {}));

    expect((await store.listAssetKeys('c1')).sort()).toEqual(['ast-a', 'ast-b']);
    const loaded = await store.load('c1');
    expect(loaded!.assets['ast-a']).toBe('A');
    expect(loaded!.assets['ast-b']).toBe('B');
  });

  it('同一 key の byte 差し替えは invalidatePersistedAssets 経由(#938 R1 契約)', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-1': 'old' }));
    // dirty-tracking により persist 済み key の再 put は skip される
    await store.save(mockContainer('c1', { 'ast-1': 'new' }));
    expect(await store.loadAsset('c1', 'ast-1')).toBe('old');
    // import 等の byte 差し替え経路は invalidate してから保存する
    store.invalidatePersistedAssets('c1');
    await store.save(mockContainer('c1', { 'ast-1': 'new' }));
    expect(await store.loadAsset('c1', 'ast-1')).toBe('new');
  });

  it('save scoped to its own container_id — other containers\' assets untouched', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-1': 'from-c1', 'ast-keep': 'keep-c1' }));
    await store.save(mockContainer('c2', { 'ast-1': 'from-c2', 'ast-only-c2': 'only-c2' }));

    // Re-saving c1 with a different/partial asset set never disturbs c2.
    // (#938 R1: byte 差し替えを伴うため invalidate してから保存)
    store.invalidatePersistedAssets('c1');
    await store.save(mockContainer('c1', { 'ast-1': 'from-c1-new' }));

    const c1 = await store.load('c1');
    expect(c1!.assets['ast-1']).toBe('from-c1-new');
    expect(c1!.assets['ast-keep']).toBe('keep-c1'); // additive: kept

    const c2 = await store.load('c2');
    expect(c2!.assets['ast-1']).toBe('from-c2');
    expect(c2!.assets['ast-only-c2']).toBe('only-c2');
  });
});

describe('MemoryStore: purgeAssetsExcept (explicit deletion, 段階2 #868)', () => {
  it('deletes only the keys absent from `keep`, returns the deleted keys', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-a': 'A', 'ast-b': 'B', 'ast-c': 'C' }));

    const deleted = await store.purgeAssetsExcept('c1', ['ast-a', 'ast-b']);

    expect(deleted).toEqual(['ast-c']);
    expect((await store.listAssetKeys('c1')).sort()).toEqual(['ast-a', 'ast-b']);
    expect(await store.loadAsset('c1', 'ast-c')).toBeNull();
  });

  it('preserves the B5 invariant: purge + reload stays purged', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-a': 'A', 'ast-b': 'B', 'orphan': 'X' }));
    // Orphan-purge keeps the referenced set {a, b}; `orphan` is dropped.
    await store.purgeAssetsExcept('c1', ['ast-a', 'ast-b']);

    const loaded = await store.load('c1');
    expect(loaded!.assets['orphan']).toBeUndefined();
    expect(loaded!.assets['ast-a']).toBe('A');
    expect(loaded!.assets['ast-b']).toBe('B');
  });

  it('keep = empty clears every asset for the container', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-a': 'A', 'ast-b': 'B' }));
    const deleted = await store.purgeAssetsExcept('c1', []);
    expect(deleted.sort()).toEqual(['ast-a', 'ast-b']);
    expect(await store.listAssetKeys('c1')).toEqual([]);
  });

  it('accepts a Set and is scoped to its own container_id', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-1': 'c1-1', 'ast-2': 'c1-2' }));
    await store.save(mockContainer('c2', { 'ast-1': 'c2-1', 'ast-2': 'c2-2' }));

    await store.purgeAssetsExcept('c1', new Set(['ast-1']));

    expect((await store.listAssetKeys('c1')).sort()).toEqual(['ast-1']);
    // c2 is completely untouched.
    expect((await store.listAssetKeys('c2')).sort()).toEqual(['ast-1', 'ast-2']);
  });

  it('keeping a superset of stored keys deletes nothing', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-a': 'A' }));
    // `keep` may contain referenced-but-absent keys (broken refs) —
    // they simply aren't in the store, so nothing is deleted.
    const deleted = await store.purgeAssetsExcept('c1', ['ast-a', 'ast-missing']);
    expect(deleted).toEqual([]);
    expect(await store.loadAsset('c1', 'ast-a')).toBe('A');
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

// 段階3 (#868) lazy asset loading: shallow load (no asset bytes) + the
// hydration helpers that make export lossless when the runtime container
// holds only a partial working-set.
describe('MemoryStore: loadShallow (段階3 #868)', () => {
  it('loadShallow returns the container record WITHOUT asset bytes', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-1': 'A', 'ast-2': 'B' }));

    const shallow = await store.loadShallow('c1');
    expect(shallow!.meta.container_id).toBe('c1');
    expect(shallow!.entries).toHaveLength(1);
    expect(shallow!.assets).toEqual({}); // bytes NOT reassembled
    // The bytes are still in the store, reachable on demand.
    expect(await store.loadAsset('c1', 'ast-1')).toBe('A');
  });

  it('loadDefaultShallow mirrors loadShallow for the default container', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1', { 'ast-1': 'A' }));
    const shallow = await store.loadDefaultShallow();
    expect(shallow!.meta.container_id).toBe('c1');
    expect(shallow!.assets).toEqual({});
  });

  it('loadShallow returns null for unknown id', async () => {
    const store = createMemoryStore();
    expect(await store.loadShallow('nope')).toBeNull();
  });
});

describe('hydrate helpers (段階3 #868)', () => {
  function withImage(): Container {
    return {
      meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [
        { lid: 'e1', title: 'A', body: '![p](asset:ref-1)', archetype: 'text', created_at: T, updated_at: T },
      ],
      relations: [],
      revisions: [],
      assets: {},
    };
  }

  it('hydrateAllAssets loads every stored asset (incl. orphans)', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'ref-1', 'REFERENCED');
    await store.saveAsset('c1', 'orphan', 'ORPHANED');

    const full = await hydrateAllAssets(store, withImage());
    expect(full.assets['ref-1']).toBe('REFERENCED');
    expect(full.assets['orphan']).toBe('ORPHANED');
  });

  it('hydrateReferencedAssets loads only entry-referenced assets (drops orphans)', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'ref-1', 'REFERENCED');
    await store.saveAsset('c1', 'orphan', 'ORPHANED');

    const scoped = await hydrateReferencedAssets(store, withImage());
    expect(scoped.assets['ref-1']).toBe('REFERENCED');
    expect(scoped.assets['orphan']).toBeUndefined();
  });

  it('hydrate keeps resident (un-persisted) bytes that are not yet in the store', async () => {
    const store = createMemoryStore();
    // 'ref-1' referenced but resident-only (freshly pasted, not saved).
    const c = withImage();
    c.assets['ref-1'] = 'RESIDENT';
    const scoped = await hydrateReferencedAssets(store, c);
    expect(scoped.assets['ref-1']).toBe('RESIDENT');
  });
});

describe('hydrateForExport seam (段階3 #868)', () => {
  afterEach(() => registerExportStore(null));

  it('no-op when no store registered (returns container unchanged)', async () => {
    registerExportStore(null);
    const c = mockContainer('c1', { 'ast-1': 'resident' });
    expect(await hydrateForExport(c)).toBe(c);
  });

  it('hydrates referenced bytes from the registered export store (lossless export)', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'ref-1', 'FROM_STORE');
    registerExportStore(store);

    // Runtime container holds a PARTIAL working-set (asset not resident).
    const partial: Container = {
      meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [
        { lid: 'e1', title: 'A', body: '![p](asset:ref-1)', archetype: 'text', created_at: T, updated_at: T },
      ],
      relations: [],
      revisions: [],
      assets: {},
    };
    const hydrated = await hydrateForExport(partial);
    // The export now carries the referenced bytes — no silent loss.
    expect(hydrated.assets['ref-1']).toBe('FROM_STORE');
  });
});

describe('P1 slice 1 (#967): Blob asset CRUD + base64 両読み', () => {
  const BYTES = 'Blob-asset-bytes-123';
  const B64 = btoa(BYTES);

  it('saveAssetBlob → loadAssetBlob roundtrip(Blob 対応 backend)', async () => {
    const store = createMemoryStore();
    await store.saveAssetBlob('c1', 'k1', new Blob([BYTES], { type: 'text/plain' }));
    const blob = await store.loadAssetBlob('c1', 'k1');
    expect(blob).not.toBeNull();
    expect(await blob!.text()).toBe(BYTES);
  });

  it('旧 base64 record を loadAssetBlob で読むと Blob として返る(両読み)', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'k1', B64);
    const blob = await store.loadAssetBlob('c1', 'k1');
    expect(blob).not.toBeNull();
    expect(await blob!.text()).toBe(BYTES);
  });

  it('Blob record を旧 loadAsset で読むと base64 として返る(旧呼び出し面の互換)', async () => {
    const store = createMemoryStore();
    await store.saveAssetBlob('c1', 'k1', new Blob([BYTES]));
    expect(await store.loadAsset('c1', 'k1')).toBe(B64);
  });

  it('Blob record は load()(reassembleAssets)でも base64 として container.assets に載る', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1'));
    await store.saveAssetBlob('c1', 'k1', new Blob([BYTES]));
    const loaded = await store.load('c1');
    expect(loaded!.assets['k1']).toBe(B64);
  });

  it('Blob 非対応 backend(FS 系)へは base64 変換して書かれ、roundtrip できる', async () => {
    // fs-directory 相当: supportsBlobValues 未指定の adapter
    const rawAdapter = createMemoryAdapter();
    const adapter = { ...rawAdapter, supportsBlobValues: undefined } as unknown as
      Parameters<typeof createContainerStore>[0];
    const store = createContainerStore(adapter);
    await store.saveAssetBlob('c1', 'k1', new Blob([BYTES]));
    // 実体は base64 文字列で格納されている
    const rawValue = await rawAdapter.bucket('assets').get('c1:k1');
    expect(typeof rawValue).toBe('string');
    expect(rawValue).toBe(B64);
    // Blob でも base64 でも読み戻せる
    expect(await (await store.loadAssetBlob('c1', 'k1'))!.text()).toBe(BYTES);
    expect(await store.loadAsset('c1', 'k1')).toBe(B64);
  });
});

describe('loadAssetDirect (#956 gesture last-resort read)', () => {
  afterEach(() => registerExportStore(null));

  it('returns null when no store registered', async () => {
    registerExportStore(null);
    expect(await loadAssetDirect('c1', 'k1')).toBeNull();
  });

  it('reads bytes straight from the registered store, bypassing the working-set', async () => {
    const store = createMemoryStore();
    await store.saveAsset('c1', 'k1', 'RAW_BYTES');
    registerExportStore(store);
    expect(await loadAssetDirect('c1', 'k1')).toBe('RAW_BYTES');
  });

  it('returns null for a genuinely missing key (broken ref)', async () => {
    const store = createMemoryStore();
    registerExportStore(store);
    expect(await loadAssetDirect('c1', 'nope')).toBeNull();
  });
});
