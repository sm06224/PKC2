import type {
  BatchOp,
  BucketName,
  StorageAdapter,
  StorageBucket,
} from './storage-adapter';

/**
 * In-memory StorageAdapter — tests and SSR use this.
 *
 * Each bucket is a plain `Map<string, unknown>`. Values are
 * `structuredClone`-ed on put / get to mirror the deep-copy
 * semantics that IDB enforces via structured serialization.
 * This keeps test fixtures honest: a caller cannot mutate a
 * value through a held reference and have the change reflect
 * back into the store.
 */
export function createMemoryAdapter(): StorageAdapter {
  const buckets = new Map<BucketName, Map<string, unknown>>([
    ['containers', new Map()],
    ['assets', new Map()],
  ]);

  function getBucket(name: BucketName): Map<string, unknown> {
    const b = buckets.get(name);
    if (!b) throw new Error(`[StorageAdapter] unknown bucket "${name}"`);
    return b;
  }

  function bucket(name: BucketName): StorageBucket {
    const map = getBucket(name);
    return {
      async get(key) {
        if (!map.has(key)) return undefined;
        return structuredClone(map.get(key));
      },
      async put(key, value) {
        map.set(key, structuredClone(value));
      },
      async delete(key) {
        map.delete(key);
      },
      async getAllByPrefix(prefix) {
        const out: Array<{ key: string; value: unknown }> = [];
        for (const [key, value] of map) {
          if (key.startsWith(prefix)) {
            out.push({ key, value: structuredClone(value) });
          }
        }
        out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        return out;
      },
      async getKeysByPrefix(prefix) {
        const out: string[] = [];
        for (const key of map.keys()) {
          if (key.startsWith(prefix)) out.push(key);
        }
        out.sort();
        return out;
      },
      async applyBatch(ops: BatchOp[]) {
        for (const op of ops) {
          if (op.kind === 'put') {
            map.set(op.key, structuredClone(op.value));
          } else {
            map.delete(op.key);
          }
        }
      },
      async clear() {
        map.clear();
      },
    };
  }

  return {
    bucket,
    close() {
      // No-op for memory.
    },
  };
}
