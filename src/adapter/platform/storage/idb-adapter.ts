import type {
  BatchOp,
  BucketName,
  StorageAdapter,
  StorageBucket,
} from './storage-adapter';

/**
 * IndexedDB StorageAdapter.
 *
 * One connection per adapter; we open lazily on first bucket call and
 * reuse it for the lifetime of the adapter (closed via `.close()`).
 * Earlier code re-opened the DB on every operation, which made
 * `reassembleAssets` particularly slow at boot — N asset reads → N
 * `indexedDB.open()` calls. This adapter holds the connection.
 *
 * Range scans (`getAllByPrefix` / `getKeysByPrefix`) use IDBKeyRange
 * over `[prefix, prefix + '\uffff')`. Both `getAll()` and
 * `getAllKeys()` return results in lexicographic order, so we can
 * fire them in parallel inside a single transaction and zip the
 * results without a sort step.
 */

const DB_NAME = 'pkc2';
const DB_VERSION = 2;

const STORE_NAMES: Record<BucketName, string> = {
  containers: 'containers',
  assets: 'assets',
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      // v0 → v1: create containers store
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_NAMES.containers)) {
          db.createObjectStore(STORE_NAMES.containers);
        }
      }

      // v1 → v2: create assets store + migrate existing container.assets
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_NAMES.assets)) {
          db.createObjectStore(STORE_NAMES.assets);
        }

        // Migration: move container.assets to assets store. Preserved
        // verbatim from the previous idb-store.ts implementation. The
        // upgrade transaction is the only one that can touch both
        // stores simultaneously here, so we do the move in-place.
        if (oldVersion >= 1) {
          const tx = req.transaction!;
          const containersStore = tx.objectStore(STORE_NAMES.containers);
          const assetsStore = tx.objectStore(STORE_NAMES.assets);

          const cursorReq = containersStore.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;

            const key = cursor.key as string;
            if (key === '__default__') {
              cursor.continue();
              return;
            }

            const container = cursor.value as { meta?: { container_id?: string }; assets?: Record<string, string> };
            if (container && container.assets && Object.keys(container.assets).length > 0) {
              const cid = container.meta?.container_id ?? key;
              for (const [assetKey, assetData] of Object.entries(container.assets)) {
                assetsStore.put(assetData, `${cid}:${assetKey}`);
              }
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

function awaitTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function createIDBAdapter(): StorageAdapter {
  let dbPromise: Promise<IDBDatabase> | null = null;
  function db(): Promise<IDBDatabase> {
    if (!dbPromise) dbPromise = openDB();
    return dbPromise;
  }

  function bucket(name: BucketName): StorageBucket {
    const storeName = STORE_NAMES[name];

    return {
      async get(key) {
        const conn = await db();
        const tx = conn.transaction(storeName, 'readonly');
        const result = await wrap(tx.objectStore(storeName).get(key));
        return result === undefined ? undefined : result;
      },

      async put(key, value) {
        const conn = await db();
        const tx = conn.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value, key);
        await awaitTx(tx);
      },

      async delete(key) {
        const conn = await db();
        const tx = conn.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        await awaitTx(tx);
      },

      async getAllByPrefix(prefix) {
        const conn = await db();
        const tx = conn.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, false);
        // Issue both requests on the same tx; they run in parallel
        // and both return lexicographic order, so zipping is safe.
        const [keys, values] = await Promise.all([
          wrap(store.getAllKeys(range)) as Promise<IDBValidKey[]>,
          wrap(store.getAll(range)) as Promise<unknown[]>,
        ]);
        const out: Array<{ key: string; value: unknown }> = [];
        for (let i = 0; i < keys.length; i++) {
          out.push({ key: String(keys[i]), value: values[i] });
        }
        return out;
      },

      async getKeysByPrefix(prefix) {
        const conn = await db();
        const tx = conn.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const range = IDBKeyRange.bound(prefix, prefix + '\uffff', false, false);
        const keys = (await wrap(store.getAllKeys(range))) as IDBValidKey[];
        return keys.map((k) => String(k));
      },

      async applyBatch(ops: BatchOp[]) {
        if (ops.length === 0) return;
        const conn = await db();
        const tx = conn.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        for (const op of ops) {
          if (op.kind === 'put') {
            store.put(op.value, op.key);
          } else {
            store.delete(op.key);
          }
        }
        await awaitTx(tx);
      },

      async clear() {
        const conn = await db();
        const tx = conn.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        await awaitTx(tx);
      },
    };
  }

  return {
    bucket,
    close() {
      if (dbPromise) {
        void dbPromise.then((conn) => conn.close()).catch(() => {});
        dbPromise = null;
      }
    },
  };
}
