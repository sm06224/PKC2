import type { StorageAdapter } from './storage/storage-adapter';
import type { Container } from '../../core/model/container';
import {
  type ContainerStore,
  createContainerStore,
  createIDBStore,
} from './idb-store';
import { createOpfsAdapter, probeOpfsAvailable } from './storage/opfs-adapter';
import { createFsaAdapter, verifyFsaPermission } from './storage/fsa-adapter';
import { loadFsaHandle } from './storage/fsa-handle-store';
import type { FsDirectoryHandle } from './storage/fs-directory-adapter';

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

export type StorageBackend = 'idb' | 'opfs' | 'fsa';

const PREF_KEY = 'pkc2.storageBackend';
const VALID: ReadonlySet<string> = new Set<StorageBackend>(['idb', 'opfs', 'fsa']);

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
  // FSA (local folder). Optional so existing callers/tests need no change.
  loadFsaHandle?: () => Promise<unknown | null>;
  verifyFsaPermission?: (handle: unknown, requestIfNeeded: boolean) => Promise<boolean>;
  makeFsaAdapter?: (handle: unknown) => StorageAdapter;
}

export interface ConfiguredStoreResult {
  store: ContainerStore;
  /** The backend actually selected (may differ from pref on fallback). */
  backend: StorageBackend;
  /** True when a one-time IDB→OPFS migration ran during this boot. */
  migrated: boolean;
  /**
   * #940: FSA 選択中だが保存 handle の permission が boot 時 `'prompt'`
   * (Chromium は再起動後ほぼ必ずこうなる)で silent に IDB へ fallback
   * したとき、その handle を運ぶ。caller(main.ts)はこれを見て
   * 「前回のフォルダに再接続」バナーを出す ── 従来はここで何も知らせず
   * 「新規コンテナ状態で開く」ように見えていた(user 報告 2026-07-21)。
   */
  fsaPending?: { name: string; handle: unknown };
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
    const migrated = await migrateFromIdbIfEmpty(opfsStore, deps.makeIdbStore);
    return { store: opfsStore, backend: 'opfs', migrated };
  }
  if (
    deps.pref === 'fsa' &&
    deps.loadFsaHandle &&
    deps.verifyFsaPermission &&
    deps.makeFsaAdapter
  ) {
    const handle = await deps.loadFsaHandle();
    // Boot has no user gesture, so only QUERY permission (never request).
    if (handle && (await deps.verifyFsaPermission(handle, false))) {
      const fsaStore = createContainerStore(deps.makeFsaAdapter(handle));
      const migrated = await migrateFromIdbIfEmpty(fsaStore, deps.makeIdbStore);
      return { store: fsaStore, backend: 'fsa', migrated };
    }
    if (handle) {
      // #940: permission が `'prompt'` に落ちている(Chromium は再起動後
      // ほぼ必ずこうなる)。IDB に fallback しつつ handle を返し、caller が
      // 「再接続」バナー(user gesture で requestPermission → reload)を
      // 出せるようにする。従来の silent fallback は「前回パスを読み込まず
      // 新規コンテナ状態で開く」ように見えるバグだった。
      const name = typeof (handle as { name?: unknown }).name === 'string'
        ? (handle as { name: string }).name
        : '(フォルダ)';
      return {
        store: deps.makeIdbStore(),
        backend: 'idb',
        migrated: false,
        fsaPending: { name, handle },
      };
    }
  }
  return { store: deps.makeIdbStore(), backend: 'idb', migrated: false };
}

/**
 * If the target store has no default container yet but IDB does, copy
 * it across (one-time, non-destructive). Shared by the OPFS and FSA
 * paths. Returns whether a copy happened.
 */
async function migrateFromIdbIfEmpty(
  target: ContainerStore,
  makeIdbStore: () => ContainerStore,
): Promise<boolean> {
  // 「空か」を知りたいだけなので **本文も asset も読まない**。
  //
  // 2026-07-25: ここは元々 `target.loadDefault()` で、`false` を返すためだけに
  // **container 全体 + 全 asset** を読んでいた。OPFS / FSA を選んだ user は
  // 移行済みでも **毎 boot** これを踏む(呼び元 `createConfiguredStore` は
  // boot 経路)。数百 MB 規模では致命的で、しかも成果は捨てられる。
  // `loadDefaultMetaShallow` は `__default__` → core record の 2 read で、
  // 本文は skip し assets は空で返す(idb-store.ts:1093-1103)。
  const { container: targetDefault } = await target.loadDefaultMetaShallow();
  if (targetDefault) return false; // already populated — nothing to do
  const idbDefault: Container | null = await makeIdbStore().loadDefault();
  if (!idbDefault) return false; // nothing to migrate
  await target.save(idbDefault);
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
    loadFsaHandle,
    verifyFsaPermission,
    makeFsaAdapter: (handle) => createFsaAdapter(handle as FsDirectoryHandle),
  });
}
