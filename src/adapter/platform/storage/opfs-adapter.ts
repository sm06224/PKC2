import type { StorageAdapter } from './storage-adapter';
import {
  createFileSystemDirectoryAdapter,
  type FsDirectoryHandle,
} from './fs-directory-adapter';

/**
 * OPFS (Origin Private File System) StorageAdapter factory + probe.
 *
 * OPFS is a per-origin private filesystem reachable via
 * `navigator.storage.getDirectory()`. It needs a **secure context**
 * (https / localhost) and is unavailable from `file://` — so the
 * caller must keep IDB / memory as a fallback (see
 * `docs/development/opfs-storage-adapter-design-2026-06.md` §1/§3).
 *
 * Storage mapping is shared with the File System Access (folder)
 * backend via `createFileSystemDirectoryAdapter`; OPFS only differs in
 * how the root handle is obtained.
 */

/**
 * Resolve `navigator.storage.getDirectory`. We access it through an
 * `unknown` cast because some TS lib.dom versions omit the async
 * iterator members (`keys()`) on `FileSystemDirectoryHandle` that this
 * adapter relies on; the runtime handle always has them. The cast to
 * `FsDirectoryHandle` (our narrow surface) is therefore runtime-safe.
 */
function opfsRoot(): (() => Promise<FsDirectoryHandle>) | null {
  if (typeof navigator === 'undefined') return null;
  const storage = (navigator as unknown as { storage?: { getDirectory?: () => Promise<unknown> } }).storage;
  if (!storage || typeof storage.getDirectory !== 'function') return null;
  const getDir = storage.getDirectory.bind(storage);
  return async () => (await getDir()) as FsDirectoryHandle;
}

/** Whether OPFS looks usable in this runtime (cheap, no I/O). */
export function isOpfsSupported(): boolean {
  return opfsRoot() !== null;
}

/**
 * Probe OPFS for real: resolve the root and round-trip a throwaway
 * file (write → read → delete). Fail-closed — any error → `false` so
 * the chooser falls back to IDB. Safe to call at boot.
 */
export async function probeOpfsAvailable(): Promise<boolean> {
  const getRoot = opfsRoot();
  if (!getRoot) return false;
  try {
    const root = await getRoot();
    const probeName = '.pkc2-opfs-probe';
    const fh = await root.getFileHandle(probeName, { create: true });
    const w = await fh.createWritable();
    await w.write('1');
    await w.close();
    await root.removeEntry(probeName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create an OPFS-backed `StorageAdapter`. Async because
 * `getDirectory()` is async. Throws if OPFS is unavailable — callers
 * should gate on `isOpfsSupported()` / `probeOpfsAvailable()` first.
 */
export async function createOpfsAdapter(): Promise<StorageAdapter> {
  const getRoot = opfsRoot();
  if (!getRoot) throw new Error('[OPFS] navigator.storage.getDirectory unavailable');
  const root = await getRoot();
  return createFileSystemDirectoryAdapter(root);
}
