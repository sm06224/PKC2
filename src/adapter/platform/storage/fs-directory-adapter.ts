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
/** Write a file via a single open→write→close, always releasing the lock. */
async function writeFile(d: FsDirectoryHandle, fileName: string, data: string): Promise<void> {
  const fh = await d.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(data);
  } finally {
    // OPFS keeps the file locked until the writable closes; a skipped
    // close (on a write error) would orphan the lock and make the file
    // permanently unreadable. Always close.
    await w.close();
  }
}

export function createFileSystemDirectoryAdapter(root: FsDirectoryHandle): StorageAdapter {
  const dirCache = new Map<BucketName, Promise<FsDirectoryHandle>>();

  // OPFS allows only ONE open writable per file at a time; two
  // overlapping operations (e.g. a migration save racing an autosave)
  // would throw a lock error and could orphan a stream. Serialize every
  // adapter operation through a single chain so writes never overlap.
  // Persistence ops are infrequent (debounced save / boot load), so the
  // throughput cost is irrelevant.
  let opChain: Promise<unknown> = Promise.resolve();
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = opChain.then(fn, fn);
    opChain = run.then(() => undefined, () => undefined);
    return run;
  }

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
      get: (key) => serialize(async () => {
        const d = await dir(name);
        let fh: FsFileHandle;
        try {
          fh = await d.getFileHandle(encodeKey(key));
        } catch (e) {
          if (isNotFound(e)) return undefined;
          throw e;
        }
        const text = await (await fh.getFile()).text();
        return JSON.parse(text) as unknown;
      }),

      put: (key, value) => serialize(async () => {
        const d = await dir(name);
        await writeFile(d, encodeKey(key), JSON.stringify(value));
      }),

      delete: (key) => serialize(async () => {
        const d = await dir(name);
        try {
          await d.removeEntry(encodeKey(key));
        } catch (e) {
          if (!isNotFound(e)) throw e; // no-op on missing
        }
      }),

      getAllByPrefix: (prefix) => serialize(async () => {
        const d = await dir(name);
        const matched: string[] = [];
        for await (const fileName of d.keys()) {
          const key = decodeKey(fileName);
          if (key.startsWith(prefix)) matched.push(key);
        }
        matched.sort(); // lexicographic by key (seam contract)
        // 読取りは writable lock を取らないので serialize チェーンの
        // 内側で並列化できる(差分保存の split 形式では per-entry file
        // が数千件並ぶため、逐次 open→read だと boot が线性に伸びる)。
        // index 書込みで sort 済みの順序を保つ。
        const out: Array<{ key: string; value: unknown }> = new Array(matched.length);
        const CONCURRENCY = 16;
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, matched.length) }, async () => {
            while (next < matched.length) {
              const idx = next++;
              const key = matched[idx]!;
              const fh = await d.getFileHandle(encodeKey(key));
              const text = await (await fh.getFile()).text();
              out[idx] = { key, value: JSON.parse(text) as unknown };
            }
          }),
        );
        return out;
      }),

      getKeysByPrefix: (prefix) => serialize(async () => {
        const d = await dir(name);
        const keys: string[] = [];
        for await (const fileName of d.keys()) {
          const key = decodeKey(fileName);
          if (key.startsWith(prefix)) keys.push(key);
        }
        keys.sort();
        return keys;
      }),

      applyBatch: (ops: BatchOp[]) => serialize(async () => {
        if (ops.length === 0) return;
        const d = await dir(name);
        // No FS transaction primitive → sequential best-effort
        // (design doc §4). Callers' save() is diff-based + idempotent,
        // so a re-save converges after an interrupted batch.
        for (const op of ops) {
          if (op.kind === 'put') {
            await writeFile(d, encodeKey(op.key), JSON.stringify(op.value));
          } else {
            try {
              await d.removeEntry(encodeKey(op.key));
            } catch (e) {
              if (!isNotFound(e)) throw e;
            }
          }
        }
      }),

      clear: () => serialize(async () => {
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
      }),
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
