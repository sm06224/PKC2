import { describe, it, expect } from 'vitest';
import { createMemoryStore } from '@adapter/platform/idb-store';
import type { Container } from '@core/model/container';

const T = '2026-04-06T00:00:00Z';

function mockContainer(id = 'c1'): Container {
  return {
    meta: {
      container_id: id,
      title: 'Test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [
      { lid: 'e1', title: 'A', body: '', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('MemoryStore (ContainerStore contract)', () => {
  it('save and load by id', async () => {
    const store = createMemoryStore();
    const c = mockContainer('c1');
    await store.save(c);

    const loaded = await store.load('c1');
    expect(loaded).not.toBeNull();
    expect(loaded!.meta.container_id).toBe('c1');
    expect(loaded!.entries).toHaveLength(1);
  });

  it('loadDefault returns the last saved container', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1'));
    await store.save(mockContainer('c2'));

    const loaded = await store.loadDefault();
    expect(loaded!.meta.container_id).toBe('c2');
  });

  it('load returns null for unknown id', async () => {
    const store = createMemoryStore();
    const loaded = await store.load('nonexistent');
    expect(loaded).toBeNull();
  });

  it('loadDefault returns null when nothing saved', async () => {
    const store = createMemoryStore();
    const loaded = await store.loadDefault();
    expect(loaded).toBeNull();
  });

  it('delete removes the container', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1'));
    await store.delete('c1');
    expect(await store.load('c1')).toBeNull();
  });

  it('delete of default clears loadDefault', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1'));
    await store.delete('c1');
    expect(await store.loadDefault()).toBeNull();
  });

  it('save creates a deep copy (no shared references)', async () => {
    const store = createMemoryStore();
    const c = mockContainer('c1');
    await store.save(c);

    // Mutate original
    c.entries.push({
      lid: 'e2', title: 'B', body: '', archetype: 'text', created_at: T, updated_at: T,
    });

    const loaded = await store.load('c1');
    expect(loaded!.entries).toHaveLength(1); // not mutated
  });

  it('load returns a deep copy (no shared references)', async () => {
    const store = createMemoryStore();
    await store.save(mockContainer('c1'));

    const loaded1 = await store.load('c1');
    const loaded2 = await store.load('c1');
    expect(loaded1).not.toBe(loaded2); // different objects
    expect(loaded1).toEqual(loaded2);  // same content
  });
});
