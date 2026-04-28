/**
 * StorageAdapter — low-level kv primitive for the persistence layer.
 *
 * Why this layer exists
 * ──────────────────────
 * `ContainerStore` (idb-store.ts) is the high-level facade callers
 * use: `save(container)` / `loadDefault()` / asset CRUD. That facade
 * is implemented today on IndexedDB and on an in-memory map. A future
 * OPFS implementation needs to slot in **without** changing the
 * ContainerStore surface or rewriting the facade logic.
 *
 * `StorageAdapter` is the seam: it exposes the minimum kv operations
 * the facade actually relies on. IDB, in-memory, and OPFS all map to
 * the same shape:
 *
 *   - IDB:    bucket = object store, key = primary key, range scan = IDBKeyRange
 *   - Memory: bucket = `Map<string, unknown>`, range scan = filter on iteration
 *   - OPFS:   bucket = directory, key = filename, range scan = entries() iterator
 *
 * Buckets exist because the IDB layout uses two distinct stores
 * (`containers`, `assets`) for legitimate reasons (per-store quotas,
 * separate transaction granularity). OPFS will mirror this with two
 * subdirectories. Memory uses two Maps. The bucket abstraction lets
 * the facade ask for the right namespace without knowing the impl.
 *
 * Design decisions
 * ────────────────
 *  - Async only. IDB is async; OPFS is async; memory wraps trivially.
 *  - `getAllByPrefix` returns key-value pairs together, in **one
 *    round-trip / one transaction**. The previous IDB implementation
 *    opened a fresh transaction per asset key — this method exists
 *    specifically so that bug class is impossible to recreate.
 *  - `putMany` / `deleteMany` accept batches so an OPFS impl can
 *    parallelize file writes / deletes. The IDB impl keeps them in a
 *    single readwrite transaction.
 *  - No streaming / no cursor API. Adopt only when a concrete need
 *    arises (e.g. assets too large to materialize together — but at
 *    that point we'd chunk per asset already).
 *
 * Adapter implementations live alongside this file:
 *   - `idb-adapter.ts`    — IndexedDB
 *   - `memory-adapter.ts` — in-memory (tests + SSR)
 *   - `opfs-adapter.ts`   — future, not yet present
 *
 * Callers should never construct adapters directly when using the
 * facade. `createIDBStore()` / `createMemoryStore()` in `idb-store.ts`
 * compose the right adapter internally.
 */

/**
 * One bucket = one isolated key-value namespace inside a StorageAdapter.
 * IDB object store, OPFS subdirectory, or in-memory `Map`.
 */
export interface StorageBucket {
  /** Get a single value. Returns `undefined` for missing keys. */
  get(key: string): Promise<unknown | undefined>;

  /** Put a value. Overwrites existing. */
  put(key: string, value: unknown): Promise<void>;

  /** Delete a key. No-op if missing. */
  delete(key: string): Promise<void>;

  /**
   * Get every (key, value) pair whose key starts with `prefix`, in
   * one round-trip / transaction.
   *
   * Order: lexicographic by key (matches IDB's natural cursor order
   * and OPFS's `entries()` iterator). Memory adapter sorts to match.
   */
  getAllByPrefix(prefix: string): Promise<ReadonlyArray<{ key: string; value: unknown }>>;

  /**
   * Get every key (no values) whose key starts with `prefix`. Cheaper
   * than `getAllByPrefix` when callers only need the key set
   * (e.g. for diff-based delete during save).
   */
  getKeysByPrefix(prefix: string): Promise<ReadonlyArray<string>>;

  /**
   * Apply a batch of put + delete operations atomically.
   * IDB: single readwrite transaction.
   * OPFS: best-effort sequential (no transaction primitive).
   */
  applyBatch(ops: BatchOp[]): Promise<void>;

  /** Remove every key in this bucket. */
  clear(): Promise<void>;
}

export type BatchOp =
  | { kind: 'put'; key: string; value: unknown }
  | { kind: 'delete'; key: string };

/**
 * StorageAdapter provides typed access to a fixed set of buckets.
 *
 * Bucket names are stable strings agreed across implementations:
 *   - 'containers' — Container records (without assets)
 *   - 'assets'     — Per-asset blobs, key = `${cid}:${assetKey}`
 *
 * Adding a new bucket requires changes in every adapter impl + a
 * data-migration plan for IDB (object-store creation in upgradeneeded).
 */
export type BucketName = 'containers' | 'assets';

export interface StorageAdapter {
  bucket(name: BucketName): StorageBucket;
  /** Tear down the underlying connection / handles. */
  close(): void;
}
