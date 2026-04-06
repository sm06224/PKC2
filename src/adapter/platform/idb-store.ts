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
 */
export interface ContainerStore {
  save(container: Container): Promise<void>;
  load(containerId: string): Promise<Container | null>;
  loadDefault(): Promise<Container | null>;
  delete(containerId: string): Promise<void>;
}

// ── IDB implementation ───────────────────────

const DB_NAME = 'pkc2';
const DB_VERSION = 1;
const STORE_NAME = 'containers';
const DEFAULT_KEY = '__default__';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
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
 * Container is stored by its container_id as key.
 * A special '__default__' pointer stores the last-used container_id,
 * so loadDefault() can find it without knowing the ID.
 */
export function createIDBStore(): ContainerStore {
  async function save(container: Container): Promise<void> {
    const db = await openDB();
    const store = tx(db, 'readwrite');
    const cid = container.meta.container_id;
    store.put(container, cid);
    store.put(cid, DEFAULT_KEY);
    await wrap(store.transaction.objectStore(STORE_NAME).count());
    db.close();
  }

  async function load(containerId: string): Promise<Container | null> {
    const db = await openDB();
    const store = tx(db, 'readonly');
    const result = await wrap(store.get(containerId));
    db.close();
    return (result as Container) ?? null;
  }

  async function loadDefault(): Promise<Container | null> {
    const db = await openDB();
    const store = tx(db, 'readonly');
    const defaultId = await wrap(store.get(DEFAULT_KEY));
    if (!defaultId || typeof defaultId !== 'string') {
      db.close();
      return null;
    }
    const result = await wrap(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(defaultId),
    );
    db.close();
    return (result as Container) ?? null;
  }

  async function del(containerId: string): Promise<void> {
    const db = await openDB();
    const store = tx(db, 'readwrite');
    store.delete(containerId);
    db.close();
  }

  return { save, load, loadDefault, delete: del };
}

// ── In-memory mock (for tests and SSR) ───────

export function createMemoryStore(): ContainerStore {
  const data = new Map<string, Container>();
  let defaultId: string | null = null;

  return {
    async save(container) {
      const cid = container.meta.container_id;
      data.set(cid, structuredClone(container));
      defaultId = cid;
    },
    async load(containerId) {
      const c = data.get(containerId);
      return c ? structuredClone(c) : null;
    },
    async loadDefault() {
      if (!defaultId) return null;
      const c = data.get(defaultId);
      return c ? structuredClone(c) : null;
    },
    async delete(containerId) {
      data.delete(containerId);
      if (defaultId === containerId) defaultId = null;
    },
  };
}
