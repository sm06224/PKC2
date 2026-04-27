/**
 * Pane state persistence — H-7 / USER_REQUEST_LEDGER S-19 (2026-04-14).
 *
 * Stores the collapsed/expanded state of the left (sidebar) and right
 * (meta) panes in localStorage so the user's pane layout survives
 * page reloads, new tabs, and re-renders triggered by any dispatch.
 *
 * Storage key: `pkc2.panePrefs`. Value shape:
 *     { "sidebar": <boolean>, "meta": <boolean> }   // true = collapsed
 *
 * Fallback behaviour:
 *   - localStorage unavailable (private browsing / quota / SSR) →
 *     the helper keeps an in-memory cache and writes are silently
 *     dropped. Pane state then behaves as it did pre-S-19 (lost on
 *     reload, preserved within the session).
 *   - Malformed stored JSON or wrong shape → cached DEFAULT_PREFS
 *     (both panes expanded). No exception bubbles out.
 *
 * No reducer / AppState coupling — this module is self-contained so
 * adding persistence did not require a user-action / state-field
 * change. See docs/development/pane-state-persistence.md.
 */

/** Identifier stored in localStorage. Namespaced to avoid collisions. */
export const PANE_PREFS_STORAGE_KEY = 'pkc2.panePrefs';

/** The persisted prefs. `true` means the pane is currently collapsed. */
export interface PanePrefs {
  sidebar: boolean;
  meta: boolean;
}

export const DEFAULT_PANE_PREFS: Readonly<PanePrefs> = Object.freeze({
  sidebar: false,
  meta: false,
});

let cached: PanePrefs | null = null;

/**
 * Read the prefs. Uses an in-memory cache so repeated calls on the
 * render hot path don't hit localStorage.
 *
 * Idempotent; safe to call before every render.
 *
 * On the iPhone shell (`pointer: coarse and (max-width: 640px)`)
 * the meta pane is rendered as a slide-over drawer; we default it
 * to collapsed on first paint so the user sees the entry detail
 * full-screen and opens the drawer explicitly via the ⓘ button
 * in the mobile header. The desktop / tablet default (both panes
 * open) is preserved everywhere else — including iPad, which
 * keeps the 3-pane chrome until its own dedicated PR lands.
 *
 * (Conflict resolution 2026-04-27: PR #172 had a wider 1024 px
 * gate that pre-collapsed the meta pane on iPad portrait too;
 * PR #173 narrowed it to 640 px because the iPhone push/pop
 * shell is the only viewport that uses the slide-over drawer
 * model. Took the iPhone-only gate.)
 */
export function loadPanePrefs(): PanePrefs {
  if (cached) return cached;
  cached = readFromStorage() ?? defaultPrefsForViewport();
  return cached;
}

function defaultPrefsForViewport(): PanePrefs {
  // Phone tier (`pointer: coarse and (max-width: 640px)`): meta
  // drawer closed so the entry detail is the hero on first paint.
  // Sidebar default stays open because the master-detail CSS
  // hides it via `data-pkc-mobile-page` when an entry is selected.
  // iPad and desktop keep the legacy "both panes open" default.
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse) and (max-width: 640px)').matches
  ) {
    return { sidebar: false, meta: true };
  }
  return { ...DEFAULT_PANE_PREFS };
}

/**
 * Update one pane's state. Writes through to localStorage when
 * available. Returns the resulting prefs object for the caller
 * that wants to immediately apply it to the DOM.
 *
 * No-op when the pane is already in the requested state — avoids
 * a redundant storage write on every toggle.
 */
export function setPaneCollapsed(
  pane: 'sidebar' | 'meta',
  collapsed: boolean,
): PanePrefs {
  const current = loadPanePrefs();
  if (current[pane] === collapsed) return current;
  const next: PanePrefs = { ...current, [pane]: collapsed };
  cached = next;
  writeToStorage(next);
  return next;
}

// ── Internal ─────────────────────────────

function readFromStorage(): PanePrefs | null {
  if (typeof localStorage === 'undefined') return null;
  let raw: string | null;
  try {
    raw = localStorage.getItem(PANE_PREFS_STORAGE_KEY);
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
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  // Tolerant shape check: accept strict booleans; reject anything
  // else so wire-format drift doesn't leak into the rest of the app.
  if (typeof obj.sidebar !== 'boolean') return null;
  if (typeof obj.meta !== 'boolean') return null;
  return { sidebar: obj.sidebar, meta: obj.meta };
}

function writeToStorage(prefs: PanePrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PANE_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota exceeded / private mode / etc. — in-memory cache stays
     * authoritative for this session. */
  }
}

/**
 * Test-only reset for the module-level cache. Unit tests that
 * manipulate localStorage directly can call this to force the next
 * `loadPanePrefs` to re-read from storage.
 */
export function __resetPanePrefsCacheForTest(): void {
  cached = null;
}
