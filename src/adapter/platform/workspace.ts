import type { Container } from '../../core/model/container';
import type { ContainerStore, Workspace } from './idb-store';

/**
 * Workspace orchestration (#773 完全層) over a `ContainerStore`.
 *
 * A workspace bundles containers (by reference) into a named work area
 * with its own active container. The container-switch UI operates
 * **within the active workspace**. `__default__` is kept in sync with
 * the active workspace's active container so boot's `loadDefault()`
 * keeps working unchanged.
 *
 * Migration (§5): on first run, all existing containers are wrapped in
 * a single "Default" workspace (non-destructive — `__default__` stays).
 */

function nowIso(): string {
  return new Date().toISOString();
}

export function newWorkspaceId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return c?.randomUUID?.() ?? `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Guarantee an active workspace exists. Returns it. If none exist,
 * creates a "Default" workspace containing every current container,
 * with its active container = the current `__default__` (or the first).
 */
export async function ensureDefaultWorkspace(store: ContainerStore): Promise<Workspace> {
  const list = await store.listWorkspaces();
  if (list.length > 0) {
    const activeId = await store.getActiveWorkspaceId();
    const active = activeId ? list.find((w) => w.id === activeId) : undefined;
    if (active) return active;
    await store.setActiveWorkspaceId(list[0]!.id);
    return list[0]!;
  }
  const containers = await store.listContainers();
  // 🔴 **`container_id` が欲しいだけなので、本文も asset も読まない**(2026-07-26)。
  //
  // ここは `store.loadDefault()` だった ── **container 全体 + 全 asset を
  // メモリへ載せて、使うのは下の `def.meta.container_id` 1 個**。
  // 本節は `list.length > 0` の早期 return の後なので、**ワークスペース情報が
  // まだ無い初回起動**(= 新しいビルドへの移行時)に必ず走る。
  //
  // 実測(`tests/bench/migration-heap.mjs`、添付 100 件 × 512KB):
  // 起動中の asset 読出 **200 件 / 100 MB**。その約半分がこの 1 行で、
  // しかも **1 本の配列に全部同時に載る**(`reassembleAssets` の
  // `getAllByPrefix`)。500MB・添付主体のワークスペースでは base64 化で
  // さらに 4/3 倍になり、user 報告のとおり **2GB 超 → OOM** に達する。
  //
  // ⚠ これは #1021 が `storage-backend.ts` の `migrateFromIdbIfEmpty` で
  // 直したのと **同一のバグ**(あちらのコメント:「`false` を返すためだけに
  // container 全体 + 全 asset を読んでいた」)。**こちらが直し漏れていた。**
  // 判定に container の中身が要らないなら `loadDefaultMetaShallow` を使う。
  const { container: def } = await store.loadDefaultMetaShallow();
  const ws: Workspace = {
    id: newWorkspaceId(),
    name: 'Default',
    containerIds: containers.map((c) => c.id),
    activeContainerId: def?.meta.container_id ?? containers[0]?.id ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await store.saveWorkspace(ws);
  await store.setActiveWorkspaceId(ws.id);
  return ws;
}

/** The currently active workspace, or `null`. */
export async function getActiveWorkspace(store: ContainerStore): Promise<Workspace | null> {
  const id = await store.getActiveWorkspaceId();
  return id ? store.loadWorkspace(id) : null;
}

/**
 * The active workspace's member containers resolved to `{id,title}`.
 * Falls back to all containers when no workspace is active.
 */
export async function activeWorkspaceContainers(
  store: ContainerStore,
): Promise<{ id: string; title: string }[]> {
  const all = await store.listContainers();
  const ws = await getActiveWorkspace(store);
  if (!ws) return all;
  const member = new Set(ws.containerIds);
  return all.filter((c) => member.has(c.id));
}

/** Switch the active container within the active workspace. */
export async function switchActiveContainer(store: ContainerStore, cid: string): Promise<void> {
  const ws = await getActiveWorkspace(store);
  if (ws) {
    ws.activeContainerId = cid;
    ws.updated_at = nowIso();
    await store.saveWorkspace(ws);
  }
  await store.setDefaultContainer(cid);
}

/** Save a new container and add it to (+ activate within) the active workspace. */
export async function addContainerToActiveWorkspace(
  store: ContainerStore,
  container: Container,
): Promise<void> {
  await store.save(container); // also sets __default__
  const ws = await getActiveWorkspace(store);
  if (ws) {
    if (!ws.containerIds.includes(container.meta.container_id)) {
      ws.containerIds.push(container.meta.container_id);
    }
    ws.activeContainerId = container.meta.container_id;
    ws.updated_at = nowIso();
    await store.saveWorkspace(ws);
  }
}

/** Delete a container and drop it from the active workspace's membership. */
export async function removeContainerFromActiveWorkspace(
  store: ContainerStore,
  cid: string,
): Promise<void> {
  await store.delete(cid);
  const ws = await getActiveWorkspace(store);
  if (ws) {
    ws.containerIds = ws.containerIds.filter((id) => id !== cid);
    if (ws.activeContainerId === cid) ws.activeContainerId = ws.containerIds[0] ?? null;
    ws.updated_at = nowIso();
    await store.saveWorkspace(ws);
    if (ws.activeContainerId) await store.setDefaultContainer(ws.activeContainerId);
  }
}

/** Switch the active workspace (and point `__default__` at its active container). */
export async function switchWorkspace(store: ContainerStore, wsId: string): Promise<void> {
  const ws = await store.loadWorkspace(wsId);
  if (!ws) return;
  await store.setActiveWorkspaceId(wsId);
  const cid = ws.activeContainerId ?? ws.containerIds[0] ?? null;
  if (cid) await store.setDefaultContainer(cid);
}

/** Create a new workspace seeded with a fresh blank container, and activate it. */
export async function createWorkspace(
  store: ContainerStore,
  name: string,
  blankContainer: Container,
): Promise<Workspace> {
  await store.save(blankContainer); // becomes __default__
  const ws: Workspace = {
    id: newWorkspaceId(),
    name: name.trim() || 'Workspace',
    containerIds: [blankContainer.meta.container_id],
    activeContainerId: blankContainer.meta.container_id,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await store.saveWorkspace(ws);
  await store.setActiveWorkspaceId(ws.id);
  return ws;
}

/** Rename a workspace. */
export async function renameWorkspace(store: ContainerStore, wsId: string, name: string): Promise<void> {
  const ws = await store.loadWorkspace(wsId);
  if (!ws) return;
  ws.name = name.trim() || ws.name;
  ws.updated_at = nowIso();
  await store.saveWorkspace(ws);
}
