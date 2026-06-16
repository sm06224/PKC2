import type { StorageAdapter } from './storage/storage-adapter';
import type { Container } from '../../core/model/container';
import {
  type ContainerStore,
  createContainerStore,
  createIDBStore,
} from './idb-store';
import { createOpfsAdapter, probeOpfsAvailable } from './storage/opfs-adapter';

/**
 * Storage backend selection (#771, FSA+OPFS 悲願).
 *
 * The active persistence backend is a **boot-time preference** stored
 * in localStorage (not in the Container — you need the backend to load
 * the container, so it cannot live inside it). `createConfiguredStore`
 * reads the preference, verifies availability, and falls back safely:
 *
 *   opfs (pref) + probe ok → OPFS  (migrating from IDB on first switch)
 *   else                   → IDB   (the default; existing behaviour)
 *
 * `'fsa'` (a user-picked local folder) is added in a later PR; it
 * reuses the same File System Access core as OPFS.
 *
 * Migration is **non-destructive**: switching to OPFS copies the
 * current default container from IDB into OPFS (once), leaving IDB
 * intact as a fallback.
 */

export type StorageBackend = 'idb' | 'opfs';

const PREF_KEY = 'pkc2.storageBackend';
const VALID: ReadonlySet<string> = new Set<StorageBackend>(['idb', 'opfs']);

/** Read the persisted backend preference. Defaults to `'idb'`. */
export function getStorageBackendPref(): StorageBackend {
  try {
    const v = globalThis.localStorage?.getItem(PREF_KEY);
    return v && VALID.has(v) ? (v as StorageBackend) : 'idb';
  } catch {
    return 'idb';
  }
}

/** Persist the backend preference. Best-effort (ignores storage errors). */
export function setStorageBackendPref(backend: StorageBackend): void {
  try {
    globalThis.localStorage?.setItem(PREF_KEY, backend);
  } catch {
    /* private mode / disabled storage — preference just won't stick */
  }
}

/** Injectable dependencies so the chooser is unit-testable with fakes. */
export interface ConfiguredStoreDeps {
  pref: StorageBackend;
  probeOpfs: () => Promise<boolean>;
  makeOpfsAdapter: () => Promise<StorageAdapter>;
  makeIdbStore: () => ContainerStore;
}

export interface ConfiguredStoreResult {
  store: ContainerStore;
  /** The backend actually selected (may differ from pref on fallback). */
  backend: StorageBackend;
  /** True when a one-time IDB→OPFS migration ran during this boot. */
  migrated: boolean;
}

/**
 * Resolve the active ContainerStore from the preference + availability.
 * Safe fallback to IDB. On a fresh switch to OPFS, copies the existing
 * IDB default container into OPFS (idempotent, non-destructive).
 */
export async function createConfiguredStore(
  deps: ConfiguredStoreDeps,
): Promise<ConfiguredStoreResult> {
  if (deps.pref === 'opfs' && (await deps.probeOpfs())) {
    const opfsStore = createContainerStore(await deps.makeOpfsAdapter());
    const migrated = await migrateIdbToOpfsIfEmpty(opfsStore, deps.makeIdbStore);
    return { store: opfsStore, backend: 'opfs', migrated };
  }
  return { store: deps.makeIdbStore(), backend: 'idb', migrated: false };
}

/**
 * If OPFS has no default container yet but IDB does, copy it across
 * (one-time, non-destructive). Returns whether a copy happened.
 */
async function migrateIdbToOpfsIfEmpty(
  opfsStore: ContainerStore,
  makeIdbStore: () => ContainerStore,
): Promise<boolean> {
  const opfsDefault = await opfsStore.loadDefault();
  if (opfsDefault) return false; // OPFS already populated — nothing to do
  const idbDefault: Container | null = await makeIdbStore().loadDefault();
  if (!idbDefault) return false; // nothing to migrate
  await opfsStore.save(idbDefault);
  return true;
}

/**
 * Production wiring: build the configured store from the live
 * preference + real OPFS probe/factory + IDB store. Used at boot.
 */
export function createConfiguredStoreFromEnv(): Promise<ConfiguredStoreResult> {
  return createConfiguredStore({
    pref: getStorageBackendPref(),
    probeOpfs: probeOpfsAvailable,
    makeOpfsAdapter: createOpfsAdapter,
    makeIdbStore: createIDBStore,
  });
}
