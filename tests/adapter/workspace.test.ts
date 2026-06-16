/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import {
  ensureDefaultWorkspace,
  getActiveWorkspace,
  activeWorkspaceContainers,
  switchActiveContainer,
  addContainerToActiveWorkspace,
  removeContainerFromActiveWorkspace,
  switchWorkspace,
  createWorkspace,
  renameWorkspace,
} from '@adapter/platform/workspace';
import type { Container } from '@core/model/container';

function container(id: string, title: string): Container {
  const now = '2026-06-16T00:00:00.000Z';
  return {
    meta: { container_id: id, title, created_at: now, updated_at: now, schema_version: 1 },
    entries: [], relations: [], revisions: [], assets: {},
  };
}

describe('workspace orchestration (#773)', () => {
  it('ensureDefaultWorkspace migrates existing containers into a Default workspace (non-destructive)', async () => {
    const store = createContainerStore(createMemoryAdapter());
    await store.save(container('c-a', 'Alpha')); // __default__ = c-a
    await store.save(container('c-b', 'Beta'));   // __default__ = c-b
    const ws = await ensureDefaultWorkspace(store);
    expect(ws.name).toBe('Default');
    expect(ws.containerIds.sort()).toEqual(['c-a', 'c-b']);
    expect(ws.activeContainerId).toBe('c-b'); // = current __default__
    // __default__ kept (non-destructive)
    expect((await store.loadDefault())?.meta.container_id).toBe('c-b');
    // idempotent: second call returns the same active workspace
    const again = await ensureDefaultWorkspace(store);
    expect(again.id).toBe(ws.id);
  });

  it('activeWorkspaceContainers scopes to the active workspace members', async () => {
    const store = createContainerStore(createMemoryAdapter());
    await store.save(container('c-a', 'Alpha'));
    await store.save(container('c-b', 'Beta'));
    await ensureDefaultWorkspace(store); // both in Default
    // a second workspace with only c-a
    const ws2 = await createWorkspace(store, 'Solo', container('c-solo', 'Solo'));
    const scoped = await activeWorkspaceContainers(store);
    expect(scoped.map((c) => c.id)).toEqual(['c-solo']); // active = ws2
    void ws2;
  });

  it('switchActiveContainer updates workspace + __default__', async () => {
    const store = createContainerStore(createMemoryAdapter());
    await store.save(container('c-a', 'Alpha'));
    await store.save(container('c-b', 'Beta'));
    await ensureDefaultWorkspace(store);
    await switchActiveContainer(store, 'c-a');
    expect((await getActiveWorkspace(store))?.activeContainerId).toBe('c-a');
    expect((await store.loadDefault())?.meta.container_id).toBe('c-a');
  });

  it('addContainer / removeContainer adjust active workspace membership', async () => {
    const store = createContainerStore(createMemoryAdapter());
    await store.save(container('c-a', 'Alpha'));
    await ensureDefaultWorkspace(store);
    await addContainerToActiveWorkspace(store, container('c-new', 'New'));
    expect((await getActiveWorkspace(store))?.containerIds).toContain('c-new');
    expect((await getActiveWorkspace(store))?.activeContainerId).toBe('c-new');
    await removeContainerFromActiveWorkspace(store, 'c-new');
    const ws = await getActiveWorkspace(store);
    expect(ws?.containerIds).not.toContain('c-new');
    expect(ws?.activeContainerId).toBe('c-a'); // fell back to survivor
  });

  it('createWorkspace + switchWorkspace + renameWorkspace', async () => {
    const store = createContainerStore(createMemoryAdapter());
    await store.save(container('c-a', 'Alpha'));
    const def = await ensureDefaultWorkspace(store);
    const work = await createWorkspace(store, 'Work', container('c-work', 'Work doc'));
    expect((await store.getActiveWorkspaceId())).toBe(work.id);
    expect((await store.loadDefault())?.meta.container_id).toBe('c-work');
    // switch back to Default → __default__ follows its active container
    await switchWorkspace(store, def.id);
    expect((await store.getActiveWorkspaceId())).toBe(def.id);
    expect((await store.loadDefault())?.meta.container_id).toBe('c-a');
    await renameWorkspace(store, work.id, 'Work renamed');
    expect((await store.loadWorkspace(work.id))?.name).toBe('Work renamed');
  });
});
