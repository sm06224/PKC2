/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import type { StorageAdapter } from '@adapter/platform/storage/storage-adapter';

/**
 * PR #180 StorageAdapter contract.
 *
 * Both the in-memory adapter (this file) and the IDB adapter
 * (`storage-idb-adapter.test.ts`, happy-dom + fake-indexeddb) must
 * uphold the same shape — that's the entire point of the abstraction.
 *
 * The cases below pin behaviour the higher-level facade
 * (`createContainerStore` in idb-store.ts) depends on:
 *   - getAllByPrefix returns key-value pairs in lexicographic order
 *   - getKeysByPrefix matches the keys returned by getAllByPrefix
 *   - applyBatch executes put + delete operations in order
 *   - clear empties only the targeted bucket
 *   - buckets are isolated (containers vs assets)
 *   - get returns undefined for missing keys (NOT null)
 *   - put + get round-trips structured data (deep clone, no shared refs)
 */

function suite(name: string, factory: () => StorageAdapter) {
  describe(name, () => {
    it('get returns undefined for missing key', async () => {
      const a = factory();
      const b = a.bucket('containers');
      expect(await b.get('missing')).toBeUndefined();
    });

    it('put + get round-trips a structured value', async () => {
      const a = factory();
      const b = a.bucket('containers');
      const value = { meta: { id: 'c1' }, list: [1, 2, 3] };
      await b.put('c1', value);
      const got = await b.get('c1');
      expect(got).toEqual(value);
      expect(got).not.toBe(value); // deep-cloned, not shared ref
    });

    it('put + delete removes the key', async () => {
      const a = factory();
      const b = a.bucket('containers');
      await b.put('k', 'v');
      await b.delete('k');
      expect(await b.get('k')).toBeUndefined();
    });

    it('getAllByPrefix returns lexicographically ordered pairs', async () => {
      const a = factory();
      const b = a.bucket('assets');
      await b.put('c1:b', 'B');
      await b.put('c1:a', 'A');
      await b.put('c1:c', 'C');
      await b.put('c2:a', 'OTHER'); // out of prefix
      const pairs = await b.getAllByPrefix('c1:');
      expect(pairs.map((p) => p.key)).toEqual(['c1:a', 'c1:b', 'c1:c']);
      expect(pairs.map((p) => p.value)).toEqual(['A', 'B', 'C']);
    });

    it('getKeysByPrefix matches getAllByPrefix key order', async () => {
      const a = factory();
      const b = a.bucket('assets');
      await b.put('p:1', 'x');
      await b.put('p:2', 'y');
      await b.put('q:1', 'z');
      const keys = await b.getKeysByPrefix('p:');
      const pairs = await b.getAllByPrefix('p:');
      expect(keys).toEqual(pairs.map((p) => p.key));
    });

    it('applyBatch executes put + delete in order', async () => {
      const a = factory();
      const b = a.bucket('assets');
      await b.put('keep', 'old');
      await b.put('drop', 'gone');
      await b.applyBatch([
        { kind: 'put', key: 'keep', value: 'new' },
        { kind: 'delete', key: 'drop' },
        { kind: 'put', key: 'fresh', value: 'fresh-value' },
      ]);
      expect(await b.get('keep')).toBe('new');
      expect(await b.get('drop')).toBeUndefined();
      expect(await b.get('fresh')).toBe('fresh-value');
    });

    it('applyBatch with empty array is a no-op', async () => {
      const a = factory();
      const b = a.bucket('containers');
      await b.put('k', 'v');
      await b.applyBatch([]);
      expect(await b.get('k')).toBe('v');
    });

    it('clear empties only the targeted bucket', async () => {
      const a = factory();
      const c = a.bucket('containers');
      const s = a.bucket('assets');
      await c.put('c1', { id: 'c1' });
      await s.put('c1:a', 'data');
      await c.clear();
      expect(await c.get('c1')).toBeUndefined();
      // assets bucket untouched
      expect(await s.get('c1:a')).toBe('data');
    });

    it('buckets are isolated by name', async () => {
      const a = factory();
      const c = a.bucket('containers');
      const s = a.bucket('assets');
      await c.put('shared-key', 'CONTAINER');
      await s.put('shared-key', 'ASSET');
      expect(await c.get('shared-key')).toBe('CONTAINER');
      expect(await s.get('shared-key')).toBe('ASSET');
    });

    it('getAllByPrefix returns empty array when no keys match', async () => {
      const a = factory();
      const b = a.bucket('assets');
      await b.put('p:1', 'x');
      const pairs = await b.getAllByPrefix('q:');
      expect(pairs).toEqual([]);
    });
  });
}

suite('StorageAdapter — memory impl', createMemoryAdapter);
