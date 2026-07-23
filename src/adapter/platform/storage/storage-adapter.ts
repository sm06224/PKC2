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
 *   - 'segments'   — Segment-log packs (P2-2 #967), key =
 *                    `${cid}:rev:${seq}`. Values are gzip Blob (or raw
 *                    JSON string where CompressionStream is absent).
 *
 * Adding a new bucket requires changes in every adapter impl + a
 * data-migration plan for IDB (object-store creation in upgradeneeded).
 */
export type BucketName = 'containers' | 'assets' | 'segments';

export interface StorageAdapter {
  bucket(name: BucketName): StorageBucket;
  /** Tear down the underlying connection / handles. */
  close(): void;
  /**
   * P1 slice 1(#967 storage v3): true when this backend can persist
   * `Blob` values natively(IDB = structured clone / memory = 参照保持)。
   * false / 未指定の backend(FS 系: 値は JSON 文字列)へは、
   * ContainerStore が base64 文字列へ変換してから書く。
   */
  readonly supportsBlobValues?: boolean;
  /**
   * True when per-record I/O is expensive on this backend. FS 系
   * (File System Access / OPFS)は 1 record = 1 ファイルで、
   * `createWritable()` が atomic swap のためファイル毎に数十 ms かかる —
   * 数千 record の一括書込みは分単位、boot の全 record 読出しも数千
   * ファイル open になる。ContainerStore はこれを見て split 形式
   * (差分保存の per-entry record)を避け、inline 単一 record 保存へ
   * fallback する。未指定 / false = fine-grained record が安価(IDB /
   * memory)。
   */
  readonly slowPerRecordIO?: boolean;
}
