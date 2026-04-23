/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  FOLDER_PREFS_STORAGE_KEY,
  loadCollapsedFolders,
  saveCollapsedFolders,
  __resetFolderPrefsCacheForTest,
} from '@adapter/platform/folder-prefs';

/**
 * A-4 (2026-04-23) — viewer-local persistence of collapsed
 * folder lids, keyed by container_id. This is a runtime UI
 * preference and deliberately NOT part of any container schema.
 */

beforeEach(() => {
  __resetFolderPrefsCacheForTest();
  localStorage.clear();
});

describe('folder-prefs — save + load round trip', () => {
  it('returns an empty array when nothing is persisted', () => {
    expect(loadCollapsedFolders('cid-1')).toEqual([]);
  });

  it('persists a list of lids and reads them back', () => {
    saveCollapsedFolders('cid-1', ['f1', 'f2', 'f3']);
    __resetFolderPrefsCacheForTest();
    const lids = loadCollapsedFolders('cid-1');
    // Order is not part of the contract (Set round-trip), so
    // compare as sets.
    expect(new Set(lids)).toEqual(new Set(['f1', 'f2', 'f3']));
  });

  it('round-trips an empty array as "user expanded everything"', () => {
    saveCollapsedFolders('cid-1', ['f1']);
    saveCollapsedFolders('cid-1', []);
    __resetFolderPrefsCacheForTest();
    expect(loadCollapsedFolders('cid-1')).toEqual([]);
    // Raw storage still holds the container key so future reads
    // don't fall back to "first-ever boot" heuristics.
    const raw = JSON.parse(localStorage.getItem(FOLDER_PREFS_STORAGE_KEY)!);
    expect(raw['cid-1']).toEqual([]);
  });
});

describe('folder-prefs — container isolation', () => {
  it('keeps different containers independent', () => {
    saveCollapsedFolders('cid-A', ['a1', 'a2']);
    saveCollapsedFolders('cid-B', ['b1']);
    __resetFolderPrefsCacheForTest();
    expect(new Set(loadCollapsedFolders('cid-A'))).toEqual(new Set(['a1', 'a2']));
    expect(loadCollapsedFolders('cid-B')).toEqual(['b1']);
    expect(loadCollapsedFolders('cid-never-seen')).toEqual([]);
  });

  it('updating one container does not affect another', () => {
    saveCollapsedFolders('cid-A', ['a1']);
    saveCollapsedFolders('cid-B', ['b1']);
    saveCollapsedFolders('cid-A', ['a1', 'a2']);
    __resetFolderPrefsCacheForTest();
    expect(new Set(loadCollapsedFolders('cid-A'))).toEqual(new Set(['a1', 'a2']));
    expect(loadCollapsedFolders('cid-B')).toEqual(['b1']);
  });
});

describe('folder-prefs — defensive input handling', () => {
  it('deduplicates incoming lids on save', () => {
    saveCollapsedFolders('cid-1', ['f1', 'f1', 'f2', 'f1']);
    __resetFolderPrefsCacheForTest();
    expect(new Set(loadCollapsedFolders('cid-1'))).toEqual(new Set(['f1', 'f2']));
  });

  it('drops non-string / empty entries on save', () => {
    // Cast so TS allows the abnormal input; the helper must not
    // crash on malformed data that slips through from future
    // refactors.
    saveCollapsedFolders('cid-1', ['f1', '', 'f2'] as unknown as string[]);
    __resetFolderPrefsCacheForTest();
    expect(new Set(loadCollapsedFolders('cid-1'))).toEqual(new Set(['f1', 'f2']));
  });

  it('ignores an empty container_id', () => {
    saveCollapsedFolders('', ['f1']);
    expect(loadCollapsedFolders('')).toEqual([]);
  });

  it('tolerates a malformed JSON blob in storage (no throw)', () => {
    localStorage.setItem(FOLDER_PREFS_STORAGE_KEY, '}not json{');
    __resetFolderPrefsCacheForTest();
    expect(() => loadCollapsedFolders('cid-1')).not.toThrow();
    expect(loadCollapsedFolders('cid-1')).toEqual([]);
  });

  it('tolerates a wrong-shape stored value (no throw)', () => {
    localStorage.setItem(FOLDER_PREFS_STORAGE_KEY, JSON.stringify(['not', 'an', 'object']));
    __resetFolderPrefsCacheForTest();
    expect(loadCollapsedFolders('cid-1')).toEqual([]);
  });

  it('strips bad entries at read time so a corrupt cell does not wedge the sidebar', () => {
    // Mix of string / number / null — only strings should survive.
    localStorage.setItem(
      FOLDER_PREFS_STORAGE_KEY,
      JSON.stringify({ 'cid-1': ['f1', 42, null, 'f2', ''] }),
    );
    __resetFolderPrefsCacheForTest();
    expect(new Set(loadCollapsedFolders('cid-1'))).toEqual(new Set(['f1', 'f2']));
  });
});

describe('folder-prefs — write suppression', () => {
  it('does not rewrite storage when the set of lids is equivalent', () => {
    saveCollapsedFolders('cid-1', ['f1', 'f2']);
    const baseline = localStorage.getItem(FOLDER_PREFS_STORAGE_KEY);

    saveCollapsedFolders('cid-1', ['f2', 'f1']); // same set, different order
    // Storage snapshot unchanged — suppression short-circuits
    // before the JSON.stringify + setItem.
    expect(localStorage.getItem(FOLDER_PREFS_STORAGE_KEY)).toBe(baseline);
  });

  it('does rewrite storage when the set actually changes', () => {
    saveCollapsedFolders('cid-1', ['f1']);
    const before = localStorage.getItem(FOLDER_PREFS_STORAGE_KEY);
    saveCollapsedFolders('cid-1', ['f1', 'f2']);
    const after = localStorage.getItem(FOLDER_PREFS_STORAGE_KEY);
    expect(after).not.toBe(before);
    const parsed = JSON.parse(after!);
    expect(new Set(parsed['cid-1'])).toEqual(new Set(['f1', 'f2']));
  });
});
