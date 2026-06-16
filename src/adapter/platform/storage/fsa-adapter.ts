import type { StorageAdapter } from './storage-adapter';
import { createFileSystemDirectoryAdapter, type FsDirectoryHandle } from './fs-directory-adapter';

/**
 * File System Access (FSA) backend — a user-picked **local folder**
 * (#771, the "ローカルフォルダでの利用" goal).
 *
 * FSA reuses the same `FileSystemDirectoryHandle` core as OPFS
 * (`fs-directory-adapter.ts`); it differs only in how the root handle
 * is obtained and that it carries a permission lifecycle:
 *   - the user picks a folder via `showDirectoryPicker()` (a user
 *     gesture is required — call from a click handler),
 *   - the handle is persisted (it is structured-cloneable) so the same
 *     folder reconnects after a reload (`fsa-handle-store.ts`),
 *   - permission must be re-verified per session; if it has lapsed to
 *     `'prompt'` the boot path cannot silently re-request (no gesture)
 *     and falls back to IDB until the user re-picks the folder.
 *
 * FSA needs a secure context + a supporting browser (Chromium today;
 * not file://) — callers gate on `isFsaSupported()`.
 *
 * The File System Access types below are declared locally because they
 * are absent from the TS lib.dom version this project builds against.
 */

interface FsaPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}
interface FsaPermissionHandle {
  queryPermission?: (d: FsaPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (d: FsaPermissionDescriptor) => Promise<PermissionState>;
}
type ShowDirectoryPicker = (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FsDirectoryHandle>;

function picker(): ShowDirectoryPicker | null {
  const p = (globalThis as unknown as { showDirectoryPicker?: ShowDirectoryPicker }).showDirectoryPicker;
  return typeof p === 'function' ? p : null;
}

/** Whether a local-folder picker is available in this runtime. */
export function isFsaSupported(): boolean {
  return picker() !== null;
}

/**
 * Prompt the user to pick a local folder. **Must be called from a user
 * gesture** (e.g. a click handler). Returns the chosen directory handle,
 * or `null` if unavailable or the user cancelled.
 */
export async function pickDirectory(): Promise<FsDirectoryHandle | null> {
  const p = picker();
  if (!p) return null;
  try {
    return await p({ mode: 'readwrite' });
  } catch {
    return null; // AbortError (cancelled) or SecurityError
  }
}

/**
 * Verify readwrite permission for a persisted folder handle.
 * `requestIfNeeded` re-requests when the state is `'prompt'` — only
 * pass `true` from a user gesture (boot must pass `false`). Handles
 * without the permission API (e.g. OPFS-derived) are treated as usable.
 */
export async function verifyFsaPermission(handle: unknown, requestIfNeeded: boolean): Promise<boolean> {
  const h = handle as FsaPermissionHandle;
  const opts: FsaPermissionDescriptor = { mode: 'readwrite' };
  try {
    if (typeof h.queryPermission !== 'function') return true;
    const state = await h.queryPermission(opts);
    if (state === 'granted') return true;
    if (state === 'denied') return false;
    // 'prompt'
    if (requestIfNeeded && typeof h.requestPermission === 'function') {
      return (await h.requestPermission(opts)) === 'granted';
    }
    return false;
  } catch {
    return false;
  }
}

/** Build a StorageAdapter over a picked local-folder handle. */
export function createFsaAdapter(handle: FsDirectoryHandle): StorageAdapter {
  return createFileSystemDirectoryAdapter(handle);
}
