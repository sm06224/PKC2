import type {
  BatchOp,
  BucketName,
  StorageAdapter,
  StorageBucket,
} from './storage-adapter';

/**
 * File System Access / OPFS StorageAdapter — shared core.
 *
 * Implements `StorageAdapter` over a `FileSystemDirectoryHandle` root.
 * Both backends reuse this core; they differ only in how the root
 * handle is obtained (see `opfs-adapter.ts` / `fsa-adapter.ts`):
 *   - OPFS: `await navigator.storage.getDirectory()` (private, no prompt)
 *   - FSA:  `await window.showDirectoryPicker()` (a real user folder)
 *
 * Mapping (per `docs/development/opfs-storage-adapter-design-2026-06.md`):
 *   - bucket            = subdirectory (`containers/`, `assets/`)
 *   - key               = file name (percent-encoded; keys contain `:`)
 *   - value             = file contents (JSON-serialized)
 *   - getAllByPrefix    = iterate `keys()`, filter on the DECODED key,
 *                         read matching files, **sort by key** (the FS
 *                         iterator order is unspecified; the seam
 *                         contract requires lexicographic key order)
 *   - applyBatch        = sequential best-effort (no FS transaction)
 *
 * Serialization: file systems store bytes, not structured clones, so
 * values are JSON. Containers are JSON-safe; asset values are base64
 * strings. `JSON.parse` on read also yields a fresh object (no shared
 * ref), matching the deep-copy semantics the memory/IDB adapters give.
 */

/**
 * Narrow structural view of the File System Access API surface this
 * adapter actually uses. Both the real `FileSystemDirectoryHandle` and
 * the in-memory test fake satisfy it, so we avoid depending on the full
 * lib.dom shape (which varies by TS version / runtime).
 */
export interface FsWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
export interface FsFileHandle {
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<FsWritable>;
}
export interface FsDirectoryHandle {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  keys(): AsyncIterableIterator<string>;
}

const BUCKET_DIRS: Record<BucketName, string> = {
  containers: 'containers',
  assets: 'assets',
};

/** `NotFoundError` is the FS-API signal for a missing file/dir. */
function isNotFound(e: unknown): boolean {
  return e instanceof DOMException ? e.name === 'NotFoundError' : false;
}

/** key → filesystem-safe file name. Keys carry `:` (assets `cid:key`). */
function encodeKey(key: string): string {
  return encodeURIComponent(key);
}
function decodeKey(name: string): string {
  return decodeURIComponent(name);
}

/**
 * Build a `StorageAdapter` over a `FileSystemDirectoryHandle` root.
 * Synchronous (the root handle is already resolved by the caller);
 * per-bucket subdirectory handles are resolved lazily + cached.
 */
export function createFileSystemDirectoryAdapter(root: FsDirectoryHandle): StorageAdapter {
  const dirCache = new Map<BucketName, Promise<FsDirectoryHandle>>();

  function dir(name: BucketName): Promise<FsDirectoryHandle> {
    let p = dirCache.get(name);
    if (!p) {
      p = root.getDirectoryHandle(BUCKET_DIRS[name], { create: true });
      dirCache.set(name, p);
    }
    return p;
  }

  function bucket(name: BucketName): StorageBucket {
    return {
      async get(key) {
        const d = await dir(name);
        let fh: FsFileHandle;
        try {
          fh = await d.getFileHandle(encodeKey(key));
        } catch (e) {
          if (isNotFound(e)) return undefined;
          throw e;
        }
        const file = await fh.getFile();
        const text = await file.text();
        return JSON.parse(text) as unknown;
      },

      async put(key, value) {
        const d = await dir(name);
        const fh = await d.getFileHandle(encodeKey(key), { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(value));
        await w.close();
      },

      async delete(key) {
        const d = await dir(name);
        try {
          await d.removeEntry(encodeKey(key));
        } catch (e) {
          if (isNotFound(e)) return; // no-op on missing
          throw e;
        }
      },

      async getAllByPrefix(prefix) {
        const d = await dir(name);
        const matched: string[] = [];
        for await (const fileName of d.keys()) {
          const key = decodeKey(fileName);
          if (key.startsWith(prefix)) matched.push(key);
        }
        matched.sort(); // lexicographic by key (seam contract)
        const out: Array<{ key: string; value: unknown }> = [];
        for (const key of matched) {
          const fh = await d.getFileHandle(encodeKey(key));
          const text = await (await fh.getFile()).text();
          out.push({ key, value: JSON.parse(text) as unknown });
        }
        return out;
      },

      async getKeysByPrefix(prefix) {
        const d = await dir(name);
        const keys: string[] = [];
        for await (const fileName of d.keys()) {
          const key = decodeKey(fileName);
          if (key.startsWith(prefix)) keys.push(key);
        }
        keys.sort();
        return keys;
      },

      async applyBatch(ops: BatchOp[]) {
        if (ops.length === 0) return;
        const d = await dir(name);
        // No FS transaction primitive → sequential best-effort
        // (design doc §4). Callers' save() is diff-based + idempotent,
        // so a re-save converges after an interrupted batch.
        for (const op of ops) {
          if (op.kind === 'put') {
            const fh = await d.getFileHandle(encodeKey(op.key), { create: true });
            const w = await fh.createWritable();
            await w.write(JSON.stringify(op.value));
            await w.close();
          } else {
            try {
              await d.removeEntry(encodeKey(op.key));
            } catch (e) {
              if (!isNotFound(e)) throw e;
            }
          }
        }
      },

      async clear() {
        const d = await dir(name);
        const names: string[] = [];
        for await (const fileName of d.keys()) names.push(fileName);
        for (const fileName of names) {
          try {
            await d.removeEntry(fileName);
          } catch (e) {
            if (!isNotFound(e)) throw e;
          }
        }
      },
    };
  }

  return {
    bucket,
    close() {
      // FS handles need no explicit close; drop cached subdir handles.
      dirCache.clear();
    },
  };
}
