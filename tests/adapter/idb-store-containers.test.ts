/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import type { Container } from '@core/model/container';

function container(id: string, title: string): Container {
  const now = '2026-06-16T00:00:00.000Z';
  return {
    meta: { container_id: id, title, created_at: now, updated_at: now, schema_version: 1 },
    entries: [{ lid: 'e1', title: `${title} entry`, body: 'b', archetype: 'text', created_at: now, updated_at: now }],
    relations: [], revisions: [], assets: {},
  };
}

describe('ContainerStore — same-origin container switching (#771/#773 MVP)', () => {
  it('listContainers enumerates saved containers (id+title), excluding the __default__ pointer', async () => {
    const store = createContainerStore(createMemoryAdapter());
    await store.save(container('c-b', 'Beta'));
    await store.save(container('c-a', 'Alpha'));
    const list = await store.listContainers();
    // sorted by title (case-insensitive), then id
    expect(list).toEqual([
      { id: 'c-a', title: 'Alpha' },
      { id: 'c-b', title: 'Beta' },
    ]);
  });

  it('listContainers is empty for a fresh store', async () => {
    const store = createContainerStore(createMemoryAdapter());
    expect(await store.listContainers()).toEqual([]);
  });

  it('setDefaultContainer flips which container loadDefault returns (no rewrite)', async () => {
    const store = createContainerStore(createMemoryAdapter());
    await store.save(container('c-a', 'Alpha')); // save() makes it default
    await store.save(container('c-b', 'Beta'));  // now Beta is default
    expect((await store.loadDefault())?.meta.container_id).toBe('c-b');
    await store.setDefaultContainer('c-a');
    expect((await store.loadDefault())?.meta.container_id).toBe('c-a');
    // both still listed (switching does not delete)
    expect((await store.listContainers()).map((c) => c.id).sort()).toEqual(['c-a', 'c-b']);
  });

  it('delete removes a container from the list', async () => {
    const store = createContainerStore(createMemoryAdapter());
    await store.save(container('c-a', 'Alpha'));
    await store.save(container('c-b', 'Beta'));
    await store.delete('c-b');
    expect((await store.listContainers()).map((c) => c.id)).toEqual(['c-a']);
  });
});
