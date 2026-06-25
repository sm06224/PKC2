import type { Container } from '../../core/model/container';
import type { BatchOp, StorageAdapter } from './storage/storage-adapter';
import { createIDBAdapter } from './storage/idb-adapter';
import { createMemoryAdapter } from './storage/memory-adapter';
import { collectReferencedAssetKeys } from '../../features/asset/asset-scan';

/**
 * ContainerStore: high-level facade for Container persistence.
 *
 * Built on top of `StorageAdapter` (see `./storage/storage-adapter.ts`).
 * The adapter layer abstracts the kv backend (IDB today, OPFS in
 * the future, an in-memory map for tests). The facade encodes
 * Container-shape semantics:
 *
 *   - assets are stored separately from the container record so a
 *     loaded entry list does not drag asset blobs through the cold
 *     path
 *   - default-pointer key (`__default__`) tracks the most recently
 *     saved container_id so `loadDefault()` is a single key lookup
 *   - save is **additive-only** for assets: it puts every key in
 *     `container.assets` but NEVER deletes. Deletion of asset bytes is
 *     an explicit, opt-in operation (`purgeAssetsExcept`) so a save
 *     carrying only a partial working-set (memory-reduction #7 / lazy
 *     asset loading) can never wipe the assets it didn't load. See the
 *     `save` / `purgeAssetsExcept` notes below for the B5 invariant.
 *
 * Phase 1 (Issue #36) separated assets from the container record.
 * Phase 2 (PR #180) introduced StorageAdapter and parallelised asset
 * reassembly: the previous loop opened a fresh transaction per asset
 * key, so cold boot scaled with asset count. The new path issues
 * `getAll(range)` once and zips with `getAllKeys(range)` in the same
 * transaction.
 *
 * 段階2 (#868, working-set lazy loading): `save()` dropped its
 * diff-delete. Earlier it removed any IDB asset key absent from
 * `container.assets`, which assumed `container.assets` was always the
 * complete set. Once boot loads only the working-set that assumption
 * becomes false and a debounced save would delete every un-loaded
 * asset — silent, total data loss. Diff-delete is replaced by the
 * explicit `purgeAssetsExcept`, invoked only on orphan-purge.
 */
export interface ContainerStore {
  save(container: Container): Promise<void>;
  load(containerId: string): Promise<Container | null>;
  loadDefault(): Promise<Container | null>;
  /**
   * 段階3 (#868, working-set lazy loading): load the container record
   * WITHOUT reassembling asset bytes — `assets` comes back as `{}`.
   * Boot uses this so the ≈400MB of base64 never lands in the JS heap
   * at startup; the working-set layer then loads only the assets the
   * current view references (via `loadAsset`) and evicts the rest.
   * The asset bytes still live in the store untouched — use
   * `loadAsset` / `listAssetKeys` to reach them on demand, or
   * `hydrateAllAssets` to materialise the full set (export).
   */
  loadShallow(containerId: string): Promise<Container | null>;
  /** `loadShallow` for the `__default__` container. */
  loadDefaultShallow(): Promise<Container | null>;
  delete(containerId: string): Promise<void>;
  /** Delete all data from all stores (workspace reset). */
  clearAll(): Promise<void>;

  /**
   * Enumerate stored containers (id + title only), for same-origin
   * container switching (#771/#773 MVP). Excludes the `__default__`
   * pointer record. Order: by title (case-insensitive), then id.
   */
  listContainers(): Promise<ContainerSummary[]>;
  /** Set the active (`__default__`) container without rewriting it. */
  setDefaultContainer(containerId: string): Promise<void>;

  // ── Workspace layer (#773) ──
  // Workspaces bundle containers into named workspaces. Persisted as
  // reserved `workspace:<id>` keys in the containers bucket (design §3
  // option B — no new bucket / seam change). `__active_workspace__`
  // points at the active one.
  /** Enumerate stored workspaces (by name, then id). */
  listWorkspaces(): Promise<Workspace[]>;
  /** Load a workspace by id, or `null`. */
  loadWorkspace(id: string): Promise<Workspace | null>;
  /** Create / overwrite a workspace record. */
  saveWorkspace(workspace: Workspace): Promise<void>;
  /** Delete a workspace record (does NOT delete its member containers). */
  deleteWorkspace(id: string): Promise<void>;
  /** Active workspace id (`__active_workspace__`), or `null`. */
  getActiveWorkspaceId(): Promise<string | null>;
  /** Set the active workspace id. */
  setActiveWorkspaceId(id: string): Promise<void>;

  // Per-asset CRUD (Phase 1 contract)
  saveAsset(cid: string, key: string, data: string): Promise<void>;
  loadAsset(cid: string, key: string): Promise<string | null>;
  deleteAsset(cid: string, key: string): Promise<void>;
  listAssetKeys(cid: string): Promise<string[]>;

  /**
   * Explicit asset purge (段階2 #868). Delete every stored asset for
   * `cid` whose key is NOT in `keep`, and return the keys that were
   * deleted. This is the deliberate counterpart to the now
   * additive-only `save()`: callers (the orphan-purge persistence
   * path) hand in the set of keys to retain, derived from a FULL view
   * of the container (entry references), never from a partial
   * working-set. Scoped to `cid` only — other containers' assets are
   * never touched.
   */
  purgeAssetsExcept(cid: string, keep: Iterable<string>): Promise<string[]>;
}

/** Minimal container descriptor for the switcher list. */
export interface ContainerSummary {
  id: string;
  title: string;
}

/**
 * A workspace bundles containers into a named work area (#773). It
 * **references** containers by id (does not own them); the same
 * container may appear in multiple workspaces.
 */
export interface Workspace {
  id: string;
  name: string;
  containerIds: string[];
  activeContainerId: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_KEY = '__default__';
const WORKSPACE_PREFIX = 'workspace:';
const ACTIVE_WORKSPACE_KEY = '__active_workspace__';

function assetFullKey(cid: string, assetKey: string): string {
  return `${cid}:${assetKey}`;
}

function assetPrefix(cid: string): string {
  return `${cid}:`;
}

/**
 * Build a ContainerStore on top of any StorageAdapter.
 *
 * Public adapters live in `./storage/`. This factory is the only
 * place where Container-shape knowledge meets the kv primitive — keep
 * adapters dumb and the facade small.
 */
export function createContainerStore(adapter: StorageAdapter): ContainerStore {
  const containers = adapter.bucket('containers');
  const assets = adapter.bucket('assets');

  async function save(container: Container): Promise<void> {
    const cid = container.meta.container_id;

    // Additive-only (段階2 #868): put every asset in `container.assets`,
    // delete nothing. `container.assets` may be a partial working-set
    // (lazy loading) — diff-deleting "keys not present here" would
    // erase every un-loaded asset, i.e. silent data loss. Deletion is
    // the explicit job of `purgeAssetsExcept`. Putting a key that
    // already holds the same bytes is a harmless idempotent overwrite.
    const assetOps: BatchOp[] = [];
    for (const [key, data] of Object.entries(container.assets)) {
      assetOps.push({ kind: 'put', key: assetFullKey(cid, key), value: data });
    }
    await assets.applyBatch(assetOps);

    // Container record sans assets — the assets bucket owns those.
    const stripped: Container = { ...container, assets: {} };
    await containers.applyBatch([
      { kind: 'put', key: cid, value: stripped },
      { kind: 'put', key: DEFAULT_KEY, value: cid },
    ]);
  }

  async function reassembleAssets(cid: string, container: Container): Promise<Container> {
    // PR #180: single-call range scan, single transaction. Replaces
    // the previous `for (key) { db.transaction(...).get(key) }` loop
    // that opened one tx per asset and serialized the round-trips.
    const pairs = await assets.getAllByPrefix(assetPrefix(cid));
    if (pairs.length === 0) return container;
    const reassembled: Record<string, string> = {};
    for (const { key, value } of pairs) {
      const assetKey = key.slice(assetPrefix(cid).length);
      if (typeof value === 'string') {
        reassembled[assetKey] = value;
      }
    }
    return { ...container, assets: reassembled };
  }

  async function load(containerId: string): Promise<Container | null> {
    const record = await containers.get(containerId);
    if (!record) return null;
    return reassembleAssets(containerId, record as Container);
  }

  async function loadDefault(): Promise<Container | null> {
    const defaultId = await containers.get(DEFAULT_KEY);
    if (typeof defaultId !== 'string') return null;
    const record = await containers.get(defaultId);
    if (!record) return null;
    return reassembleAssets(defaultId, record as Container);
  }

  async function loadShallow(containerId: string): Promise<Container | null> {
    // No asset reassembly: the container record is already stored sans
    // assets (see `save`), so `record.assets` is `{}`. We normalise it
    // defensively in case a legacy record carried inline assets.
    const record = await containers.get(containerId);
    if (!record) return null;
    return { ...(record as Container), assets: {} };
  }

  async function loadDefaultShallow(): Promise<Container | null> {
    const defaultId = await containers.get(DEFAULT_KEY);
    if (typeof defaultId !== 'string') return null;
    return loadShallow(defaultId);
  }

  async function del(containerId: string): Promise<void> {
    const prefix = assetPrefix(containerId);
    const assetKeys = await assets.getKeysByPrefix(prefix);
    const assetOps: BatchOp[] = assetKeys.map((key) => ({ kind: 'delete', key }));
    await Promise.all([
      containers.applyBatch([{ kind: 'delete', key: containerId }]),
      assets.applyBatch(assetOps),
    ]);
  }

  async function saveAsset(cid: string, key: string, data: string): Promise<void> {
    await assets.put(assetFullKey(cid, key), data);
  }

  async function loadAsset(cid: string, key: string): Promise<string | null> {
    const result = await assets.get(assetFullKey(cid, key));
    return typeof result === 'string' ? result : null;
  }

  async function deleteAsset(cid: string, key: string): Promise<void> {
    await assets.delete(assetFullKey(cid, key));
  }

  async function listAssetKeys(cid: string): Promise<string[]> {
    const prefix = assetPrefix(cid);
    const keys = await assets.getKeysByPrefix(prefix);
    return keys.map((k) => k.slice(prefix.length));
  }

  async function purgeAssetsExcept(cid: string, keep: Iterable<string>): Promise<string[]> {
    const prefix = assetPrefix(cid);
    const keepSet = keep instanceof Set ? keep : new Set(keep);
    // One keys-only range scan (cheap), then batch-delete the misses.
    const existingFullKeys = await assets.getKeysByPrefix(prefix);
    const deletedKeys: string[] = [];
    const ops: BatchOp[] = [];
    for (const fullKey of existingFullKeys) {
      const assetKey = fullKey.slice(prefix.length);
      if (!keepSet.has(assetKey)) {
        ops.push({ kind: 'delete', key: fullKey });
        deletedKeys.push(assetKey);
      }
    }
    if (ops.length > 0) await assets.applyBatch(ops);
    return deletedKeys;
  }

  async function clearAll(): Promise<void> {
    await Promise.all([containers.clear(), assets.clear()]);
  }

  async function listContainers(): Promise<ContainerSummary[]> {
    // One range scan over the containers bucket. Skip the `__default__`
    // pointer (its value is a cid string, not a container record) and
    // any non-container value defensively.
    const pairs = await containers.getAllByPrefix('');
    const out: ContainerSummary[] = [];
    for (const { key, value } of pairs) {
      if (key === DEFAULT_KEY) continue;
      const meta = (value as { meta?: { container_id?: unknown; title?: unknown } } | null)?.meta;
      if (!meta || typeof meta.container_id !== 'string') continue;
      out.push({ id: meta.container_id, title: typeof meta.title === 'string' ? meta.title : '' });
    }
    out.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    return out;
  }

  async function setDefaultContainer(containerId: string): Promise<void> {
    await containers.put(DEFAULT_KEY, containerId);
  }

  function isWorkspace(v: unknown): v is Workspace {
    const w = v as Workspace | null;
    return (
      !!w && typeof w.id === 'string' && typeof w.name === 'string' && Array.isArray(w.containerIds)
    );
  }

  async function listWorkspaces(): Promise<Workspace[]> {
    const pairs = await containers.getAllByPrefix(WORKSPACE_PREFIX);
    const out: Workspace[] = [];
    for (const { value } of pairs) {
      if (isWorkspace(value)) out.push(value);
    }
    out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return out;
  }

  async function loadWorkspace(id: string): Promise<Workspace | null> {
    const v = await containers.get(WORKSPACE_PREFIX + id);
    return isWorkspace(v) ? v : null;
  }

  async function saveWorkspace(workspace: Workspace): Promise<void> {
    await containers.put(WORKSPACE_PREFIX + workspace.id, workspace);
  }

  async function deleteWorkspace(id: string): Promise<void> {
    await containers.delete(WORKSPACE_PREFIX + id);
  }

  async function getActiveWorkspaceId(): Promise<string | null> {
    const v = await containers.get(ACTIVE_WORKSPACE_KEY);
    return typeof v === 'string' ? v : null;
  }

  async function setActiveWorkspaceId(id: string): Promise<void> {
    await containers.put(ACTIVE_WORKSPACE_KEY, id);
  }

  return {
    save,
    load,
    loadDefault,
    loadShallow,
    loadDefaultShallow,
    delete: del,
    clearAll,
    listContainers,
    setDefaultContainer,
    listWorkspaces,
    loadWorkspace,
    saveWorkspace,
    deleteWorkspace,
    getActiveWorkspaceId,
    setActiveWorkspaceId,
    saveAsset,
    loadAsset,
    deleteAsset,
    listAssetKeys,
    purgeAssetsExcept,
  };
}

/**
 * Create the IDB-backed ContainerStore.
 *
 * Internally: `createIDBAdapter()` → `createContainerStore(adapter)`.
 * Callers do not need to know the adapter exists.
 */
export function createIDBStore(): ContainerStore {
  return createContainerStore(createIDBAdapter());
}

/**
 * Create the in-memory ContainerStore (tests, SSR).
 */
export function createMemoryStore(): ContainerStore {
  return createContainerStore(createMemoryAdapter());
}

/**
 * Materialise the FULL asset set for `container` from the store
 * (段階3 #868). At runtime `container.assets` holds only the lazy
 * working-set, so any path that must serialise every byte — export
 * to HTML / ZIP, entry-package export — has to hydrate first or it
 * would silently drop the non-resident assets (data loss).
 *
 * Reads every stored asset key for the container, loads its bytes,
 * and returns a new container whose `assets` is the union of the
 * stored set and whatever was already resident in memory (resident
 * bytes win on conflict — they reflect un-saved in-flight edits).
 * The input container is not mutated. Keys that fail to load are
 * skipped (their reference simply stays broken, as before).
 */
export async function hydrateAllAssets(
  store: ContainerStore,
  container: Container,
): Promise<Container> {
  const cid = container.meta.container_id;
  const storedKeys = await store.listAssetKeys(cid);
  const full: Record<string, string> = {};
  await Promise.all(
    storedKeys.map(async (key) => {
      const data = await store.loadAsset(cid, key);
      if (typeof data === 'string') full[key] = data;
    }),
  );
  // Resident (possibly un-persisted) bytes take precedence.
  for (const [key, data] of Object.entries(container.assets)) {
    full[key] = data;
  }
  return { ...container, assets: full };
}

/**
 * Materialise just the assets `container`'s own entries REFERENCE
 * (段階3 #868) — the right hydration for export. Loads each referenced
 * key's bytes from the store and merges them over whatever is already
 * resident (resident wins, preserving un-persisted edits). Orphan
 * (unreferenced) bytes are intentionally NOT pulled in, so a subset
 * export carries only its own entries' assets (no leakage of the rest
 * of the workspace) and a full export drops dead orphan bytes.
 *
 * Data-safety: a referenced asset is always recoverable — either it is
 * still resident (the working-set manager never evicts un-persisted
 * bytes) or it is in the store. So nothing an entry needs is lost.
 */
export async function hydrateReferencedAssets(
  store: ContainerStore,
  container: Container,
): Promise<Container> {
  const cid = container.meta.container_id;
  const referenced = collectReferencedAssetKeys(container);
  const merged: Record<string, string> = {};
  await Promise.all(
    [...referenced].map(async (key) => {
      if (container.assets[key] != null) return; // resident wins
      const data = await store.loadAsset(cid, key);
      if (typeof data === 'string') merged[key] = data;
    }),
  );
  for (const [key, data] of Object.entries(container.assets)) merged[key] = data;
  return { ...container, assets: merged };
}

// ── Export hydration seam (段階3 #868) ───────────────────────────────
//
// Under lazy loading `container.assets` holds only the resident
// working-set, so export serializers must hydrate the referenced bytes
// before writing or they would silently drop them. The serializers live
// in the platform layer and are called from many sites (main, action-
// binder subset exports, transport export-handler) that don't all hold
// a store reference, so the active store is registered once at boot and
// the serializers hydrate through `hydrateForExport`. Unset (tests that
// pass a fully-resident container) → no-op.
let activeExportStore: ContainerStore | null = null;

/** Register the store used by `hydrateForExport`. Called once at boot. */
export function registerExportStore(store: ContainerStore | null): void {
  activeExportStore = store;
}

/**
 * Hydrate a container's referenced assets via the registered export
 * store, for serialization paths (HTML / ZIP / entry-package). No-op
 * (returns the container unchanged) when no store is registered.
 */
export async function hydrateForExport(container: Container): Promise<Container> {
  if (!activeExportStore) return container;
  return hydrateReferencedAssets(activeExportStore, container);
}

// ── Availability probe ──────────────────────
//
// IDB may be silently broken in certain runtime conditions:
//   - Some browsers disable IDB on `file://` (notably older Firefox,
//     some mobile configurations, and private-browsing modes).
//   - Private / incognito modes can return a functional-looking
//     IDB that throws on `open()` or on the first transaction.
//   - Quota-exhausted / corrupted databases can open but fail on read.
//
// We probe at boot so the UI can warn the user instead of
// silently falling back to pkc-data. The probe tries a full
// open → write → read → close cycle on a tiny disposable store.
// On failure it returns the underlying reason so callers can surface
// a diagnostic message; they never throw.

export interface IDBAvailability {
  available: boolean;
  reason?: string;
}

const PROBE_DB_NAME = 'pkc2-probe';
const PROBE_STORE = 'probe';

export async function probeIDBAvailability(): Promise<IDBAvailability> {
  if (typeof indexedDB === 'undefined' || indexedDB === null) {
    return { available: false, reason: 'indexedDB is undefined in this runtime' };
  }
  return new Promise<IDBAvailability>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(PROBE_DB_NAME, 1);
    } catch (err) {
      resolve({ available: false, reason: `open() threw: ${String(err)}` });
      return;
    }
    req.onupgradeneeded = () => {
      try {
        const db = req.result;
        if (!db.objectStoreNames.contains(PROBE_STORE)) {
          db.createObjectStore(PROBE_STORE);
        }
      } catch (err) {
        // Fall through to onerror / onsuccess — best-effort.
        console.warn('[PKC2] IDB probe upgrade failed:', err);
      }
    };
    req.onerror = () => {
      resolve({ available: false, reason: String(req.error?.message ?? req.error ?? 'unknown') });
    };
    req.onblocked = () => {
      resolve({ available: false, reason: 'open() blocked' });
    };
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction(PROBE_STORE, 'readwrite');
        const store = tx.objectStore(PROBE_STORE);
        store.put(1, '__probe__');
        const getReq = store.get('__probe__');
        getReq.onsuccess = () => {
          db.close();
          resolve({ available: getReq.result === 1 });
        };
        getReq.onerror = () => {
          db.close();
          resolve({ available: false, reason: 'probe read failed' });
        };
      } catch (err) {
        try {
          db.close();
        } catch {
          /* ignore */
        }
        resolve({ available: false, reason: `probe txn failed: ${String(err)}` });
      }
    };
  });
}
