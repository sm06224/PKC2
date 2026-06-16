/**
 * Persistence for the FSA local-folder handle (#771).
 *
 * A `FileSystemDirectoryHandle` is structured-cloneable, so it can be
 * stored in IndexedDB and retrieved after a reload to reconnect to the
 * same folder (subject to a permission re-check — see `fsa-adapter.ts`).
 *
 * Kept in a **dedicated** tiny database (`pkc2-fsa`) rather than the
 * main `pkc2` store so it needs no schema-version bump / migration on
 * the container DB, and so clearing workspace data never drops the
 * folder binding by accident.
 */

const DB_NAME = 'pkc2-fsa';
const DB_VERSION = 1;
const STORE = 'handles';
const KEY = 'root';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = (): void => resolve(req.result);
        req.onerror = (): void => reject(req.error);
        t.oncomplete = (): void => db.close();
      }),
  );
}

/** Persist the picked folder handle. */
export async function saveFsaHandle(handle: unknown): Promise<void> {
  await tx('readwrite', (s) => s.put(handle, KEY));
}

/** Load the persisted folder handle, or `null` if none / on error. */
export async function loadFsaHandle(): Promise<unknown | null> {
  try {
    const v = await tx('readonly', (s) => s.get(KEY));
    return v ?? null;
  } catch {
    return null;
  }
}

/** Drop the persisted folder handle (e.g. when switching away from FSA). */
export async function clearFsaHandle(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(KEY));
  } catch {
    /* best-effort */
  }
}
