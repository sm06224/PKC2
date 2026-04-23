/**
 * Folder collapse persistence — A-4 (2026-04-23).
 *
 * Stores the set of collapsed folder lids per container_id in
 * localStorage so a user's folded sidebar state survives page
 * reloads. This is deliberately a **viewer-local runtime
 * preference** — it is NOT written into `container.meta`, does NOT
 * participate in export / import, and does NOT synchronise across
 * devices. Two collaborators looking at the same container keep
 * their own fold state.
 *
 * Storage key: `pkc2.folderPrefs`. Value shape:
 *     { "<container_id>": ["lid-a", "lid-b", ...], ... }
 *
 * Per-container scoping: the same browser may load several
 * different containers (via import / source switch); their fold
 * states should not leak into each other. Using `container_id` as
 * the top-level key keeps each container's preference isolated.
 *
 * Fallback behaviour (mirrors pane-prefs.ts S-19):
 *   - localStorage unavailable (private browsing / quota / SSR) →
 *     the helper keeps an in-memory cache and writes are dropped.
 *     Fold state then behaves as it did pre-A-4 (reset per reload).
 *   - Malformed stored JSON → cached empty map. No exception
 *     bubbles out.
 *
 * No reducer / AppState coupling — the module is self-contained.
 * main.ts reads it once at boot and subscribes a state-listener
 * that writes through whenever `state.collapsedFolders` changes.
 */

/** Identifier stored in localStorage. Namespaced to avoid collisions. */
export const FOLDER_PREFS_STORAGE_KEY = 'pkc2.folderPrefs';

type FolderPrefsMap = Record<string, string[]>;

let cached: FolderPrefsMap | null = null;

/**
 * Read the collapsed-folder lids for a container. Returns an
 * empty array when nothing is persisted (or persistence is
 * unavailable).
 *
 * Idempotent; safe to call before every render.
 */
export function loadCollapsedFolders(containerId: string): string[] {
  if (!containerId) return [];
  const map = loadMap();
  const raw = map[containerId];
  if (!Array.isArray(raw)) return [];
  // Defensive: drop non-string / empty entries so a corrupt cell
  // can't wedge the sidebar.
  const deduped = new Set<string>();
  for (const lid of raw) {
    if (typeof lid === 'string' && lid.length > 0) deduped.add(lid);
  }
  return Array.from(deduped);
}

/**
 * Persist the collapsed-folder lids for a container. Writes
 * through to localStorage when available.
 *
 * No-op when the incoming list is equivalent (same set, same
 * length) to what is already stored — avoids a redundant write on
 * every re-render pass.
 */
export function saveCollapsedFolders(
  containerId: string,
  lids: readonly string[],
): void {
  if (!containerId) return;
  const map = loadMap();
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const lid of lids) {
    if (typeof lid !== 'string' || lid.length === 0) continue;
    if (seen.has(lid)) continue;
    seen.add(lid);
    deduped.push(lid);
  }
  const previous = map[containerId] ?? [];
  if (isSameSet(previous, deduped)) return;
  if (deduped.length === 0) {
    // Explicit "everything expanded" state — record as an empty
    // array rather than deleting so reload keeps "user chose full
    // expansion" distinct from "first-ever boot of this container".
    map[containerId] = [];
  } else {
    map[containerId] = deduped;
  }
  cached = map;
  writeMap(map);
}

// ── Internal ─────────────────────────────

function loadMap(): FolderPrefsMap {
  if (cached) return cached;
  cached = readFromStorage() ?? {};
  return cached;
}

function readFromStorage(): FolderPrefsMap | null {
  if (typeof localStorage === 'undefined') return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(FOLDER_PREFS_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const out: FolderPrefsMap = {};
  for (const [cid, v] of Object.entries(obj)) {
    if (typeof cid !== 'string' || cid.length === 0) continue;
    if (!Array.isArray(v)) continue;
    const lids: string[] = [];
    const seen = new Set<string>();
    for (const lid of v) {
      if (typeof lid !== 'string' || lid.length === 0) continue;
      if (seen.has(lid)) continue;
      seen.add(lid);
      lids.push(lid);
    }
    out[cid] = lids;
  }
  return out;
}

function writeMap(map: FolderPrefsMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(FOLDER_PREFS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota exceeded / private mode — in-memory cache stays
     * authoritative for this session. */
  }
}

function isSameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  for (const v of b) if (!s.has(v)) return false;
  return true;
}

/**
 * Test-only reset for the module-level cache. Unit tests that
 * manipulate localStorage directly can call this to force the next
 * `loadCollapsedFolders` to re-read from storage.
 */
export function __resetFolderPrefsCacheForTest(): void {
  cached = null;
}
