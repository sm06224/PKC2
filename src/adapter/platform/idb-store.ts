import type { Container } from '../../core/model/container';
import type { BatchOp, StorageAdapter } from './storage/storage-adapter';
import { createIDBAdapter } from './storage/idb-adapter';
import { createMemoryAdapter } from './storage/memory-adapter';

/**
 * ContainerStore: high-level facade for Container persistence.
 *
 * Built on top of `StorageAdapter` (see `./storage/storage-adapter.ts`).
 * The adapter layer abstracts the kv backend (IDB today, OPFS in
 * the future, an in-memory map for tests). The facade encodes
 * Container-shape semantics:
 *
 *   - assets are stored separately from the container record so a
 *     loaded entry list does not drag asset blobs through the cold
 *     path
 *   - default-pointer key (`__default__`) tracks the most recently
 *     saved container_id so `loadDefault()` is a single key lookup
 *   - save diff-deletes asset keys that disappeared from
 *     `container.assets` (B5 invariant) so PURGE_ORPHAN_ASSETS +
 *     reload stays purged
 *
 * Phase 1 (Issue #36) separated assets from the container record.
 * Phase 2 (PR #180) introduced StorageAdapter and parallelised asset
 * reassembly: the previous loop opened a fresh transaction per asset
 * key, so cold boot scaled with asset count. The new path issues
 * `getAll(range)` once and zips with `getAllKeys(range)` in the same
 * transaction.
 */
export interface ContainerStore {
  save(container: Container): Promise<void>;
  load(containerId: string): Promise<Container | null>;
  loadDefault(): Promise<Container | null>;
  delete(containerId: string): Promise<void>;
  /** Delete all data from all stores (workspace reset). */
  clearAll(): Promise<void>;

  // Per-asset CRUD (Phase 1 contract)
  saveAsset(cid: string, key: string, data: string): Promise<void>;
  loadAsset(cid: string, key: string): Promise<string | null>;
  deleteAsset(cid: string, key: string): Promise<void>;
  listAssetKeys(cid: string): Promise<string[]>;
}

const DEFAULT_KEY = '__default__';

function assetFullKey(cid: string, assetKey: string): string {
  return `${cid}:${assetKey}`;
}

function assetPrefix(cid: string): string {
  return `${cid}:`;
}

/**
 * Build a ContainerStore on top of any StorageAdapter.
 *
 * Public adapters live in `./storage/`. This factory is the only
 * place where Container-shape knowledge meets the kv primitive — keep
 * adapters dumb and the facade small.
 */
export function createContainerStore(adapter: StorageAdapter): ContainerStore {
  const containers = adapter.bucket('containers');
  const assets = adapter.bucket('assets');

  async function save(container: Container): Promise<void> {
    const cid = container.meta.container_id;
    const prefix = assetPrefix(cid);

    // Diff-delete asset keys that vanished from `container.assets`
    // since the previous save (B5 invariant). One range scan instead
    // of N gets — still cheap because keys-only.
    const existingKeys = await assets.getKeysByPrefix(prefix);
    const incomingFullKeys = new Set(
      Object.keys(container.assets).map((k) => assetFullKey(cid, k)),
    );

    const assetOps: BatchOp[] = [];
    for (const fullKey of existingKeys) {
      if (!incomingFullKeys.has(fullKey)) {
        assetOps.push({ kind: 'delete', key: fullKey });
      }
    }
    for (const [key, data] of Object.entries(container.assets)) {
      assetOps.push({ kind: 'put', key: assetFullKey(cid, key), value: data });
    }
    await assets.applyBatch(assetOps);

    // Container record sans assets — the assets bucket owns those.
    const stripped: Container = { ...container, assets: {} };
    await containers.applyBatch([
      { kind: 'put', key: cid, value: stripped },
      { kind: 'put', key: DEFAULT_KEY, value: cid },
    ]);
  }

  async function reassembleAssets(cid: string, container: Container): Promise<Container> {
    // PR #180: single-call range scan, single transaction. Replaces
    // the previous `for (key) { db.transaction(...).get(key) }` loop
    // that opened one tx per asset and serialized the round-trips.
    const pairs = await assets.getAllByPrefix(assetPrefix(cid));
    if (pairs.length === 0) return container;
    const reassembled: Record<string, string> = {};
    for (const { key, value } of pairs) {
      const assetKey = key.slice(assetPrefix(cid).length);
      if (typeof value === 'string') {
        reassembled[assetKey] = value;
      }
    }
    return { ...container, assets: reassembled };
  }

  async function load(containerId: string): Promise<Container | null> {
    const record = await containers.get(containerId);
    if (!record) return null;
    return reassembleAssets(containerId, record as Container);
  }

  async function loadDefault(): Promise<Container | null> {
    const defaultId = await containers.get(DEFAULT_KEY);
    if (typeof defaultId !== 'string') return null;
    const record = await containers.get(defaultId);
    if (!record) return null;
    return reassembleAssets(defaultId, record as Container);
  }

  async function del(containerId: string): Promise<void> {
    const prefix = assetPrefix(containerId);
    const assetKeys = await assets.getKeysByPrefix(prefix);
    const assetOps: BatchOp[] = assetKeys.map((key) => ({ kind: 'delete', key }));
    await Promise.all([
      containers.applyBatch([{ kind: 'delete', key: containerId }]),
      assets.applyBatch(assetOps),
    ]);
  }

  async function saveAsset(cid: string, key: string, data: string): Promise<void> {
    await assets.put(assetFullKey(cid, key), data);
  }

  async function loadAsset(cid: string, key: string): Promise<string | null> {
    const result = await assets.get(assetFullKey(cid, key));
    return typeof result === 'string' ? result : null;
  }

  async function deleteAsset(cid: string, key: string): Promise<void> {
    await assets.delete(assetFullKey(cid, key));
  }

  async function listAssetKeys(cid: string): Promise<string[]> {
    const prefix = assetPrefix(cid);
    const keys = await assets.getKeysByPrefix(prefix);
    return keys.map((k) => k.slice(prefix.length));
  }

  async function clearAll(): Promise<void> {
    await Promise.all([containers.clear(), assets.clear()]);
  }

  return {
    save,
    load,
    loadDefault,
    delete: del,
    clearAll,
    saveAsset,
    loadAsset,
    deleteAsset,
    listAssetKeys,
  };
}

/**
 * Create the IDB-backed ContainerStore.
 *
 * Internally: `createIDBAdapter()` → `createContainerStore(adapter)`.
 * Callers do not need to know the adapter exists.
 */
export function createIDBStore(): ContainerStore {
  return createContainerStore(createIDBAdapter());
}

/**
 * Create the in-memory ContainerStore (tests, SSR).
 */
export function createMemoryStore(): ContainerStore {
  return createContainerStore(createMemoryAdapter());
}

// ── Availability probe ──────────────────────
//
// IDB may be silently broken in certain runtime conditions:
//   - Some browsers disable IDB on `file://` (notably older Firefox,
//     some mobile configurations, and private-browsing modes).
//   - Private / incognito modes can return a functional-looking
//     IDB that throws on `open()` or on the first transaction.
//   - Quota-exhausted / corrupted databases can open but fail on read.
//
// We probe at boot so the UI can warn the user instead of
// silently falling back to pkc-data. The probe tries a full
// open → write → read → close cycle on a tiny disposable store.
// On failure it returns the underlying reason so callers can surface
// a diagnostic message; they never throw.

export interface IDBAvailability {
  available: boolean;
  reason?: string;
}

const PROBE_DB_NAME = 'pkc2-probe';
const PROBE_STORE = 'probe';

export async function probeIDBAvailability(): Promise<IDBAvailability> {
  if (typeof indexedDB === 'undefined' || indexedDB === null) {
    return { available: false, reason: 'indexedDB is undefined in this runtime' };
  }
  return new Promise<IDBAvailability>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(PROBE_DB_NAME, 1);
    } catch (err) {
      resolve({ available: false, reason: `open() threw: ${String(err)}` });
      return;
    }
    req.onupgradeneeded = () => {
      try {
        const db = req.result;
        if (!db.objectStoreNames.contains(PROBE_STORE)) {
          db.createObjectStore(PROBE_STORE);
        }
      } catch (err) {
        // Fall through to onerror / onsuccess — best-effort.
        console.warn('[PKC2] IDB probe upgrade failed:', err);
      }
    };
    req.onerror = () => {
      resolve({ available: false, reason: String(req.error?.message ?? req.error ?? 'unknown') });
    };
    req.onblocked = () => {
      resolve({ available: false, reason: 'open() blocked' });
    };
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction(PROBE_STORE, 'readwrite');
        const store = tx.objectStore(PROBE_STORE);
        store.put(1, '__probe__');
        const getReq = store.get('__probe__');
        getReq.onsuccess = () => {
          db.close();
          resolve({ available: getReq.result === 1 });
        };
        getReq.onerror = () => {
          db.close();
          resolve({ available: false, reason: 'probe read failed' });
        };
      } catch (err) {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        resolve({ available: false, reason: `probe txn failed: ${String(err)}` });
      }
    };
  });
}
