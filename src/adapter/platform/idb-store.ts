import type { Container } from '../../core/model/container';

/**
 * ContainerStore: abstract interface for Container persistence.
 *
 * This abstraction exists so that:
 * - core stays free of browser APIs
 * - tests can use a mock implementation
 * - future backends (localStorage, File System API) plug in here
 *
 * All methods are async because IDB is inherently async.
 *
 * Phase 1 (Issue #36): assets are stored separately from the container.
 * save() strips container.assets before writing; assets go to a separate store.
 * load()/loadDefault() reassemble container.assets from the assets store.
 */
export interface ContainerStore {
  save(container: Container): Promise<void>;
  load(containerId: string): Promise<Container | null>;
  loadDefault(): Promise<Container | null>;
  delete(containerId: string): Promise<void>;
  /** Delete all data from all stores (workspace reset). */
  clearAll(): Promise<void>;

  // Phase 1: asset operations
  saveAsset(cid: string, key: string, data: string): Promise<void>;
  loadAsset(cid: string, key: string): Promise<string | null>;
  deleteAsset(cid: string, key: string): Promise<void>;
  listAssetKeys(cid: string): Promise<string[]>;
}

// ── IDB implementation ───────────────────────

const DB_NAME = 'pkc2';
const DB_VERSION = 2;
const CONTAINERS_STORE = 'containers';
const ASSETS_STORE = 'assets';
const DEFAULT_KEY = '__default__';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      // v0 → v1: create containers store
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(CONTAINERS_STORE)) {
          db.createObjectStore(CONTAINERS_STORE);
        }
      }

      // v1 → v2: create assets store + migrate existing container.assets
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(ASSETS_STORE)) {
          db.createObjectStore(ASSETS_STORE);
        }

        // Migration: move container.assets to assets store
        if (oldVersion >= 1) {
          const tx = req.transaction!;
          const containersStore = tx.objectStore(CONTAINERS_STORE);
          const assetsStore = tx.objectStore(ASSETS_STORE);

          const cursorReq = containersStore.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;

            const key = cursor.key as string;
            // Skip the __default__ pointer
            if (key === DEFAULT_KEY) {
              cursor.continue();
              return;
            }

            const container = cursor.value as Container;
            if (container && container.assets && Object.keys(container.assets).length > 0) {
              const cid = container.meta?.container_id ?? key;
              // Move assets to assets store
              for (const [assetKey, assetData] of Object.entries(container.assets)) {
                assetsStore.put(assetData, `${cid}:${assetKey}`);
              }
              // Clear assets in container record
              const stripped = { ...container, assets: {} };
              cursor.update(stripped);
            }
            cursor.continue();
          };
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Create the IDB-backed ContainerStore.
 *
 * Phase 1: container is stored without assets in the containers store.
 * Assets are stored in a separate assets store keyed by "<cid>:<asset_key>".
 */
export function createIDBStore(): ContainerStore {
  async function save(container: Container): Promise<void> {
    const db = await openDB();
    const cid = container.meta.container_id;

    // Save assets separately
    const assetEntries = Object.entries(container.assets);
    if (assetEntries.length > 0) {
      const assetsTx = db.transaction(ASSETS_STORE, 'readwrite');
      const assetsStore = assetsTx.objectStore(ASSETS_STORE);
      for (const [key, data] of assetEntries) {
        assetsStore.put(data, `${cid}:${key}`);
      }
    }

    // Save container WITHOUT assets
    const stripped: Container = { ...container, assets: {} };
    const containersTx = db.transaction(CONTAINERS_STORE, 'readwrite');
    const containersStore = containersTx.objectStore(CONTAINERS_STORE);
    containersStore.put(stripped, cid);
    containersStore.put(cid, DEFAULT_KEY);
    await wrap(containersTx.objectStore(CONTAINERS_STORE).count());

    db.close();
  }

  async function reassembleAssets(db: IDBDatabase, cid: string, container: Container): Promise<Container> {
    const prefix = `${cid}:`;
    const assetsTx = db.transaction(ASSETS_STORE, 'readonly');
    const assetsStore = assetsTx.objectStore(ASSETS_STORE);

    // Use IDBKeyRange to get all keys with the cid prefix
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, false);
    const allKeys = await wrap(assetsStore.getAllKeys(range));
    if (allKeys.length === 0) return container;

    const assets: Record<string, string> = {};
    for (const fullKey of allKeys) {
      const assetKey = (fullKey as string).slice(prefix.length);
      const data = await wrap(
        db.transaction(ASSETS_STORE, 'readonly').objectStore(ASSETS_STORE).get(fullKey),
      );
      if (typeof data === 'string') {
        assets[assetKey] = data;
      }
    }

    return { ...container, assets };
  }

  async function load(containerId: string): Promise<Container | null> {
    const db = await openDB();
    const containersTx = db.transaction(CONTAINERS_STORE, 'readonly');
    const result = await wrap(containersTx.objectStore(CONTAINERS_STORE).get(containerId));
    if (!result) {
      db.close();
      return null;
    }
    const container = result as Container;
    const reassembled = await reassembleAssets(db, containerId, container);
    db.close();
    return reassembled;
  }

  async function loadDefault(): Promise<Container | null> {
    const db = await openDB();
    const containersTx = db.transaction(CONTAINERS_STORE, 'readonly');
    const defaultId = await wrap(containersTx.objectStore(CONTAINERS_STORE).get(DEFAULT_KEY));
    if (!defaultId || typeof defaultId !== 'string') {
      db.close();
      return null;
    }
    const result = await wrap(
      db.transaction(CONTAINERS_STORE, 'readonly').objectStore(CONTAINERS_STORE).get(defaultId),
    );
    if (!result) {
      db.close();
      return null;
    }
    const container = result as Container;
    const reassembled = await reassembleAssets(db, defaultId, container);
    db.close();
    return reassembled;
  }

  async function del(containerId: string): Promise<void> {
    const db = await openDB();
    // Delete container
    const containersTx = db.transaction(CONTAINERS_STORE, 'readwrite');
    containersTx.objectStore(CONTAINERS_STORE).delete(containerId);

    // Delete all assets for this container
    const prefix = `${containerId}:`;
    const assetsTx = db.transaction(ASSETS_STORE, 'readwrite');
    const assetsStore = assetsTx.objectStore(ASSETS_STORE);
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, false);
    const allKeys = await wrap(assetsStore.getAllKeys(range));
    for (const key of allKeys) {
      db.transaction(ASSETS_STORE, 'readwrite').objectStore(ASSETS_STORE).delete(key);
    }

    db.close();
  }

  // ── Asset operations ──────────────────

  async function saveAsset(cid: string, key: string, data: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    tx.objectStore(ASSETS_STORE).put(data, `${cid}:${key}`);
    await wrap(tx.objectStore(ASSETS_STORE).count());
    db.close();
  }

  async function loadAsset(cid: string, key: string): Promise<string | null> {
    const db = await openDB();
    const tx = db.transaction(ASSETS_STORE, 'readonly');
    const result = await wrap(tx.objectStore(ASSETS_STORE).get(`${cid}:${key}`));
    db.close();
    return typeof result === 'string' ? result : null;
  }

  async function deleteAsset(cid: string, key: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    tx.objectStore(ASSETS_STORE).delete(`${cid}:${key}`);
    db.close();
  }

  async function listAssetKeys(cid: string): Promise<string[]> {
    const db = await openDB();
    const prefix = `${cid}:`;
    const tx = db.transaction(ASSETS_STORE, 'readonly');
    const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, false);
    const allKeys = await wrap(tx.objectStore(ASSETS_STORE).getAllKeys(range));
    db.close();
    return (allKeys as string[]).map((k) => k.slice(prefix.length));
  }

  async function clearAll(): Promise<void> {
    const db = await openDB();
    const tx = db.transaction([CONTAINERS_STORE, ASSETS_STORE], 'readwrite');
    tx.objectStore(CONTAINERS_STORE).clear();
    tx.objectStore(ASSETS_STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  return {
    save, load, loadDefault, delete: del, clearAll,
    saveAsset, loadAsset, deleteAsset, listAssetKeys,
  };
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

// ── In-memory mock (for tests and SSR) ───────

export function createMemoryStore(): ContainerStore {
  const containers = new Map<string, Container>();
  const assets = new Map<string, string>(); // key: "<cid>:<asset_key>"
  let defaultId: string | null = null;

  function stripAssets(container: Container): Container {
    return { ...container, assets: {} };
  }

  function reassemble(container: Container): Container {
    const cid = container.meta.container_id;
    const prefix = `${cid}:`;
    const reassembled: Record<string, string> = {};
    for (const [key, data] of assets) {
      if (key.startsWith(prefix)) {
        reassembled[key.slice(prefix.length)] = data;
      }
    }
    return { ...container, assets: reassembled };
  }

  return {
    async save(container) {
      const cid = container.meta.container_id;
      // Save assets separately
      for (const [key, data] of Object.entries(container.assets)) {
        assets.set(`${cid}:${key}`, data);
      }
      // Store container without assets
      containers.set(cid, structuredClone(stripAssets(container)));
      defaultId = cid;
    },
    async load(containerId) {
      const c = containers.get(containerId);
      if (!c) return null;
      return structuredClone(reassemble(c));
    },
    async loadDefault() {
      if (!defaultId) return null;
      const c = containers.get(defaultId);
      if (!c) return null;
      return structuredClone(reassemble(c));
    },
    async delete(containerId) {
      containers.delete(containerId);
      // Delete associated assets
      const prefix = `${containerId}:`;
      for (const key of [...assets.keys()]) {
        if (key.startsWith(prefix)) assets.delete(key);
      }
      if (defaultId === containerId) defaultId = null;
    },
    async clearAll() {
      containers.clear();
      assets.clear();
      defaultId = null;
    },
    async saveAsset(cid, key, data) {
      assets.set(`${cid}:${key}`, data);
    },
    async loadAsset(cid, key) {
      return assets.get(`${cid}:${key}`) ?? null;
    },
    async deleteAsset(cid, key) {
      assets.delete(`${cid}:${key}`);
    },
    async listAssetKeys(cid) {
      const prefix = `${cid}:`;
      const result: string[] = [];
      for (const key of assets.keys()) {
        if (key.startsWith(prefix)) result.push(key.slice(prefix.length));
      }
      return result;
    },
  };
}
