/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStorageBackendPref,
  setStorageBackendPref,
  createConfiguredStore,
} from '@adapter/platform/storage-backend';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import type { Container } from '@core/model/container';

function container(id: string, title: string): Container {
  const now = '2026-06-16T00:00:00.000Z';
  return {
    meta: { container_id: id, title, created_at: now, updated_at: now, schema_version: 1 },
    entries: [{ lid: 'e1', title, body: 'b', archetype: 'text', created_at: now, updated_at: now }],
    relations: [], revisions: [], assets: {},
  };
}

describe('storage backend preference', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to idb when unset / invalid', () => {
    expect(getStorageBackendPref()).toBe('idb');
    localStorage.setItem('pkc2.storageBackend', 'bogus');
    expect(getStorageBackendPref()).toBe('idb');
  });

  it('round-trips a valid backend', () => {
    setStorageBackendPref('opfs');
    expect(getStorageBackendPref()).toBe('opfs');
  });

  it('setStorageBackendPref は localStorage 例外を握りつぶす(quota / private mode)', () => {
    const spy = vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => setStorageBackendPref('opfs')).not.toThrow();
    spy.mockRestore();
    // 書けていないので pref は既定 idb のまま(silent fallback、UI は別途処理)。
    expect(getStorageBackendPref()).toBe('idb');
  });
});

describe('createConfiguredStore', () => {
  // memory adapters stand in for IDB / OPFS; the chooser logic is
  // backend-agnostic (works against any StorageAdapter).

  it("pref 'idb' → IDB store, OPFS untouched", async () => {
    const idb = createContainerStore(createMemoryAdapter());
    let opfsMade = false;
    const res = await createConfiguredStore({
      pref: 'idb',
      probeOpfs: async () => true,
      makeOpfsAdapter: async () => { opfsMade = true; return createMemoryAdapter(); },
      makeIdbStore: () => idb,
    });
    expect(res.backend).toBe('idb');
    expect(res.migrated).toBe(false);
    expect(opfsMade).toBe(false); // never probed/built OPFS
    expect(res.store).toBe(idb);
  });

  it("pref 'opfs' + probe false → falls back to IDB (no data loss)", async () => {
    const idb = createContainerStore(createMemoryAdapter());
    const res = await createConfiguredStore({
      pref: 'opfs',
      probeOpfs: async () => false,
      makeOpfsAdapter: async () => { throw new Error('should not build OPFS when probe fails'); },
      makeIdbStore: () => idb,
    });
    expect(res.backend).toBe('idb');
    expect(res.store).toBe(idb);
  });

  it("pref 'opfs' + probe ok + OPFS empty + IDB has default → migrates", async () => {
    const idb = createContainerStore(createMemoryAdapter());
    await idb.save(container('c-idb', 'From IDB'));
    const opfsAdapter = createMemoryAdapter();
    const res = await createConfiguredStore({
      pref: 'opfs',
      probeOpfs: async () => true,
      makeOpfsAdapter: async () => opfsAdapter,
      makeIdbStore: () => idb,
    });
    expect(res.backend).toBe('opfs');
    expect(res.migrated).toBe(true);
    // OPFS store now serves the migrated container
    const got = await res.store.loadDefault();
    expect(got?.meta.container_id).toBe('c-idb');
    expect(got?.meta.title).toBe('From IDB');
    // non-destructive: IDB still has it
    expect((await idb.loadDefault())?.meta.container_id).toBe('c-idb');
  });

  it("pref 'opfs' + OPFS already populated → no migration", async () => {
    const idb = createContainerStore(createMemoryAdapter());
    await idb.save(container('c-idb', 'From IDB'));
    const opfsAdapter = createMemoryAdapter();
    // pre-populate OPFS with a different container
    await createContainerStore(opfsAdapter).save(container('c-opfs', 'Already OPFS'));
    const res = await createConfiguredStore({
      pref: 'opfs',
      probeOpfs: async () => true,
      makeOpfsAdapter: async () => opfsAdapter,
      makeIdbStore: () => idb,
    });
    expect(res.backend).toBe('opfs');
    expect(res.migrated).toBe(false);
    expect((await res.store.loadDefault())?.meta.container_id).toBe('c-opfs'); // untouched
  });

  it("pref 'opfs' + both empty → OPFS, no migration", async () => {
    const idb = createContainerStore(createMemoryAdapter());
    const res = await createConfiguredStore({
      pref: 'opfs',
      probeOpfs: async () => true,
      makeOpfsAdapter: async () => createMemoryAdapter(),
      makeIdbStore: () => idb,
    });
    expect(res.backend).toBe('opfs');
    expect(res.migrated).toBe(false);
    expect(await res.store.loadDefault()).toBeNull();
  });

  // ── FSA (local folder) — memory adapter stands in for the folder ──
  const fsaDeps = (over: Record<string, unknown>) => ({
    pref: 'fsa' as const,
    probeOpfs: async () => false,
    makeOpfsAdapter: async () => { throw new Error('opfs not expected'); },
    makeIdbStore: () => createContainerStore(createMemoryAdapter()),
    loadFsaHandle: async () => ({ name: 'folder' }),
    verifyFsaPermission: async () => true,
    makeFsaAdapter: () => createMemoryAdapter(),
    ...over,
  });

  it("pref 'fsa' + handle + permission granted + IDB has default → migrates to folder", async () => {
    const idb = createContainerStore(createMemoryAdapter());
    await idb.save(container('c-idb', 'From IDB'));
    const folder = createMemoryAdapter();
    const res = await createConfiguredStore(fsaDeps({
      makeIdbStore: () => idb,
      makeFsaAdapter: () => folder,
    }));
    expect(res.backend).toBe('fsa');
    expect(res.migrated).toBe(true);
    expect((await res.store.loadDefault())?.meta.container_id).toBe('c-idb');
  });

  it("pref 'fsa' + no persisted handle → falls back to IDB", async () => {
    const idb = createContainerStore(createMemoryAdapter());
    const res = await createConfiguredStore(fsaDeps({
      makeIdbStore: () => idb,
      loadFsaHandle: async () => null,
    }));
    expect(res.backend).toBe('idb');
    expect(res.store).toBe(idb);
  });

  it("pref 'fsa' + permission not granted → falls back to IDB (no data loss)", async () => {
    const idb = createContainerStore(createMemoryAdapter());
    const res = await createConfiguredStore(fsaDeps({
      makeIdbStore: () => idb,
      verifyFsaPermission: async () => false,
      makeFsaAdapter: () => { throw new Error('should not build FSA when permission denied'); },
    }));
    expect(res.backend).toBe('idb');
    expect(res.store).toBe(idb);
    // #940: silent fallback ではなく再接続用の handle を caller に返す
    expect(res.fsaPending).toEqual({ name: 'folder', handle: { name: 'folder' } });
  });

  it("#940: 'fsa' + handle 無しなら fsaPending も無し(素の IDB boot)", async () => {
    const res = await createConfiguredStore(fsaDeps({
      loadFsaHandle: async () => null,
    }));
    expect(res.backend).toBe('idb');
    expect(res.fsaPending).toBeUndefined();
  });

  it('#940: handle に name が無くても表示用 fallback 名で fsaPending を返す', async () => {
    const res = await createConfiguredStore(fsaDeps({
      loadFsaHandle: async () => ({}),
      verifyFsaPermission: async () => false,
    }));
    expect(res.fsaPending?.name).toBe('(フォルダ)');
  });
});
