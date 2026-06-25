import type { Dispatcher } from '../state/dispatcher';
import type { ContainerStore } from './idb-store';
import type { DomainEvent } from '../../core/action/domain-event';
import { computeAssetMeta, type AssetMeta, type AssetMetaIndex } from '../../features/asset/asset-meta';

/**
 * Resident asset-metadata index (段階4, #868 working-set lazy loading).
 *
 * Boot loads the container shallow and the working-set manager keeps only
 * a partial `container.assets` resident, so consumers that scan it for
 * size / count / hash (storage profile, guardrails, orphan count, paste
 * dedupe) would under-report. This manager keeps a RAM-resident
 * `key → { size, hash }` index covering EVERY stored asset (a few dozen
 * bytes each — negligible vs the bytes), and exposes it synchronously so
 * those consumers report on the full store, not just the working-set.
 *
 * Sourcing (memory-safe):
 *   - The index is persisted as one reserved record per cid
 *     (`store.loadAssetMeta` / `saveAssetMeta`) — loaded cheaply at boot.
 *   - `reconcile()` fills any gap vs the store's actual key set by loading
 *     missing assets' bytes ONE AT A TIME (peak RAM = one asset), computing
 *     metadata, and discarding the bytes. Resident working-set / freshly
 *     pasted bytes are used directly (no store hit). This is the migration
 *     path for pre-段階4 data and the steady-state maintenance after pastes
 *     / purges.
 *
 * Consumers fall back to the partial `container.assets` while the index is
 * not yet ready (graceful degrade, never wrong-but-confident).
 */

let currentCid: string | null = null;
let index: AssetMetaIndex = {};
let ready = false;

/**
 * Synchronous read for render-path consumers. Returns the full-store
 * metadata index for `cid`, or null when it is not ready / for a different
 * container (caller then falls back to `container.assets`).
 */
export function getResidentAssetMeta(cid: string): AssetMetaIndex | null {
  return ready && currentCid === cid ? index : null;
}

/**
 * Full-store `key → decoded byte size` map for `cid`, or null when the
 * index is not ready. Convenience for `buildStorageProfile(container,
 * sizes)`. Returns a fresh object (callers iterate it once per render).
 */
export function getResidentAssetSizes(cid: string): Record<string, number> | null {
  if (!ready || currentCid !== cid) return null;
  const sizes: Record<string, number> = {};
  for (const key in index) sizes[key] = index[key]!.size;
  return sizes;
}

/** Test helper: reset module state. */
export function __resetAssetMetaIndexForTest(): void {
  currentCid = null;
  index = {};
  ready = false;
}

export interface AssetMetaIndexManager {
  reconcile(): Promise<void>;
  dispose(): void;
}

const RECONCILE_EVENTS: ReadonlySet<DomainEvent['type']> = new Set([
  'CONTAINER_LOADED',
  'CONTAINER_IMPORTED',
  'CONTAINER_MERGED',
  'CONTAINER_REHYDRATED',
  'ENTRY_CREATED',
  'ENTRY_UPDATED',
  'ENTRY_DELETED',
  'ORPHAN_ASSETS_PURGED',
]);

export function mountAssetMetaIndex(
  dispatcher: Dispatcher,
  store: ContainerStore,
): AssetMetaIndexManager {
  let running: Promise<void> = Promise.resolve();
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function runReconcile(): Promise<void> {
    if (disposed) return;
    const container = dispatcher.getState().container;
    if (!container) return;
    const cid = container.meta.container_id;

    // Container swap → reset and load the persisted index for the new cid.
    if (cid !== currentCid) {
      currentCid = cid;
      index = {};
      ready = false;
      const persisted = await store.loadAssetMeta(cid);
      if (disposed) return;
      if (persisted) index = { ...persisted };
    }

    const resident = container.assets;
    const storeKeys = await store.listAssetKeys(cid);
    if (disposed) return;
    const universe = new Set<string>(storeKeys);
    for (const k of Object.keys(resident)) universe.add(k);

    let changed = false;
    // Fill gaps — resident bytes first (working-set / unsaved pastes), else
    // load from the store ONE AT A TIME so peak memory stays at one asset.
    for (const key of universe) {
      if (index[key]) continue;
      let bytes: string | null | undefined = resident[key];
      if (bytes == null) bytes = await store.loadAsset(cid, key);
      if (disposed) return;
      if (typeof bytes === 'string') {
        index[key] = computeAssetMeta(bytes);
        changed = true;
      }
    }
    // Drop entries for keys that no longer exist anywhere (purged).
    for (const key of Object.keys(index)) {
      if (!universe.has(key)) {
        delete index[key];
        changed = true;
      }
    }

    ready = true;
    if (changed) await store.saveAssetMeta(cid, index);
  }

  function reconcile(): Promise<void> {
    running = running.then(runReconcile).catch((err) => {
      console.warn('[PKC2] asset-meta reconcile failed:', err);
    });
    return running;
  }

  function schedule(): void {
    if (timer !== null) clearTimeout(timer);
    // Debounce: pastes / edits arrive in bursts; reconcile reads the store
    // which lags the debounced save, so coalescing also lets saves land.
    timer = setTimeout(() => {
      timer = null;
      void reconcile();
    }, 500);
  }

  const unsub = dispatcher.onEvent((event) => {
    if (RECONCILE_EVENTS.has(event.type)) schedule();
  });

  return {
    reconcile,
    dispose: () => {
      disposed = true;
      unsub();
      if (timer !== null) clearTimeout(timer);
    },
  };
}

export type { AssetMeta, AssetMetaIndex };
