/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadPanePrefs,
  setPaneCollapsed,
  DEFAULT_PANE_PREFS,
  PANE_PREFS_STORAGE_KEY,
  __resetPanePrefsCacheForTest,
} from '@adapter/platform/pane-prefs';

/**
 * USER_REQUEST_LEDGER S-19 (H-7, 2026-04-14) — storage helper.
 *
 * Contract:
 *   - Default is both panes expanded (sidebar: false, meta: false).
 *   - loadPanePrefs hydrates from localStorage; invalid JSON / wrong
 *     shape falls back silently to DEFAULT_PANE_PREFS.
 *   - setPaneCollapsed persists through to localStorage, updates the
 *     in-memory cache, and is a no-op when the value is unchanged.
 *   - localStorage throws (quota / private-mode) → in-memory cache
 *     stays authoritative, no exception escapes.
 */

beforeEach(() => {
  __resetPanePrefsCacheForTest();
  localStorage.clear();
});

afterEach(() => {
  __resetPanePrefsCacheForTest();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('loadPanePrefs', () => {
  it('returns the default when nothing is stored', () => {
    const prefs = loadPanePrefs();
    expect(prefs).toEqual(DEFAULT_PANE_PREFS);
    expect(prefs.sidebar).toBe(false);
    expect(prefs.meta).toBe(false);
  });

  it('reads a valid stored value', () => {
    localStorage.setItem(
      PANE_PREFS_STORAGE_KEY,
      JSON.stringify({ sidebar: true, meta: false }),
    );
    const prefs = loadPanePrefs();
    expect(prefs).toEqual({ sidebar: true, meta: false });
  });

  it('falls back to default on malformed JSON', () => {
    localStorage.setItem(PANE_PREFS_STORAGE_KEY, 'not json');
    expect(loadPanePrefs()).toEqual(DEFAULT_PANE_PREFS);
  });

  it('falls back to default when the stored shape is wrong (missing field)', () => {
    localStorage.setItem(
      PANE_PREFS_STORAGE_KEY,
      JSON.stringify({ sidebar: true }),
    );
    expect(loadPanePrefs()).toEqual(DEFAULT_PANE_PREFS);
  });

  it('falls back to default when a field is not a boolean', () => {
    localStorage.setItem(
      PANE_PREFS_STORAGE_KEY,
      JSON.stringify({ sidebar: 'yes', meta: true }),
    );
    expect(loadPanePrefs()).toEqual(DEFAULT_PANE_PREFS);
  });

  it('caches the first read — subsequent reads do not re-hit storage', () => {
    localStorage.setItem(
      PANE_PREFS_STORAGE_KEY,
      JSON.stringify({ sidebar: true, meta: true }),
    );
    const first = loadPanePrefs();
    // Mutate storage out-of-band. Without the cache, the next load
    // would reflect this change.
    localStorage.setItem(
      PANE_PREFS_STORAGE_KEY,
      JSON.stringify({ sidebar: false, meta: false }),
    );
    const second = loadPanePrefs();
    expect(first).toEqual(second);
    expect(second).toEqual({ sidebar: true, meta: true });
  });

  it('survives a throwing localStorage.getItem', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const prefs = loadPanePrefs();
    expect(prefs).toEqual(DEFAULT_PANE_PREFS);
    spy.mockRestore();
  });
});

describe('setPaneCollapsed', () => {
  it('writes the new value to localStorage', () => {
    setPaneCollapsed('sidebar', true);
    const raw = localStorage.getItem(PANE_PREFS_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual({ sidebar: true, meta: false });
  });

  it('updates the cached value so later loadPanePrefs sees the change', () => {
    setPaneCollapsed('meta', true);
    expect(loadPanePrefs()).toEqual({ sidebar: false, meta: true });
  });

  it('is a no-op when the value is unchanged (no extra storage write)', () => {
    setPaneCollapsed('sidebar', true);
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const prefs = setPaneCollapsed('sidebar', true);
    expect(spy).not.toHaveBeenCalled();
    expect(prefs).toEqual({ sidebar: true, meta: false });
    spy.mockRestore();
  });

  it('survives a throwing localStorage.setItem (in-memory cache wins)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const prefs = setPaneCollapsed('sidebar', true);
    expect(prefs).toEqual({ sidebar: true, meta: false });
    // The cache reflects the new value even though storage rejected the write.
    expect(loadPanePrefs()).toEqual({ sidebar: true, meta: false });
    spy.mockRestore();
  });

  it('returns a new object reference (immutable update pattern)', () => {
    const a = loadPanePrefs();
    const b = setPaneCollapsed('meta', true);
    expect(b).not.toBe(a);
    expect(a).toEqual(DEFAULT_PANE_PREFS); // prior reference unchanged
  });
});
