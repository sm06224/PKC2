/**
 * Recent Entries Pane v1 — pure selector tests.
 * Spec: docs/development/recent-entries-pane-v1.md §3
 */
import { describe, it, expect } from 'vitest';
import { selectRecentEntries, RECENT_ENTRIES_DEFAULT_LIMIT } from '@features/entry-order/recent-entries';
import type { Entry, ArchetypeId } from '@core/model/record';

function mkEntry(
  lid: string,
  archetype: ArchetypeId,
  updated_at: string,
  created_at: string = updated_at,
  title: string = lid,
): Entry {
  return { lid, title, body: '', archetype, created_at, updated_at };
}

describe('selectRecentEntries — §3 pure selector', () => {
  it('returns [] for empty input', () => {
    expect(selectRecentEntries([])).toEqual([]);
  });

  it('returns [] when limit <= 0', () => {
    const entries = [mkEntry('a', 'text', '2026-04-20T00:00:00Z')];
    expect(selectRecentEntries(entries, 0)).toEqual([]);
    expect(selectRecentEntries(entries, -1)).toEqual([]);
  });

  it('sorts by updated_at desc as primary key', () => {
    const entries = [
      mkEntry('old', 'text', '2026-01-01T00:00:00Z'),
      mkEntry('new', 'text', '2026-04-20T00:00:00Z'),
      mkEntry('mid', 'text', '2026-02-15T00:00:00Z'),
    ];
    const out = selectRecentEntries(entries);
    expect(out.map((e) => e.lid)).toEqual(['new', 'mid', 'old']);
  });

  it('breaks updated_at ties by created_at desc', () => {
    const U = '2026-04-20T00:00:00Z';
    const entries = [
      mkEntry('olderCreate', 'text', U, '2026-04-01T00:00:00Z'),
      mkEntry('newerCreate', 'text', U, '2026-04-10T00:00:00Z'),
    ];
    const out = selectRecentEntries(entries);
    expect(out.map((e) => e.lid)).toEqual(['newerCreate', 'olderCreate']);
  });

  it('breaks full timestamp ties by lid asc (deterministic)', () => {
    const T = '2026-04-20T00:00:00Z';
    const entries = [
      mkEntry('b', 'text', T, T),
      mkEntry('a', 'text', T, T),
      mkEntry('c', 'text', T, T),
    ];
    const out = selectRecentEntries(entries);
    expect(out.map((e) => e.lid)).toEqual(['a', 'b', 'c']);
  });

  it('excludes system-* archetypes (isUserEntry gate)', () => {
    const entries = [
      mkEntry('sys1', 'system-about', '2026-04-20T00:00:00Z'),
      mkEntry('sys2', 'system-settings', '2026-04-21T00:00:00Z'),
      mkEntry('user1', 'text', '2026-04-19T00:00:00Z'),
    ];
    const out = selectRecentEntries(entries);
    expect(out.map((e) => e.lid)).toEqual(['user1']);
  });

  it('respects default limit of 10', () => {
    const entries = Array.from({ length: 25 }, (_, i) =>
      mkEntry(`e${String(i).padStart(2, '0')}`, 'text', `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    );
    const out = selectRecentEntries(entries);
    expect(out).toHaveLength(RECENT_ENTRIES_DEFAULT_LIMIT);
    expect(out).toHaveLength(10);
    // Most recent (highest index) first.
    expect(out[0]!.lid).toBe('e24');
  });

  it('respects an explicit limit', () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      mkEntry(`e${i}`, 'text', `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    );
    expect(selectRecentEntries(entries, 3)).toHaveLength(3);
    expect(selectRecentEntries(entries, 100)).toHaveLength(20);
  });

  it('does not mutate the input array', () => {
    const entries = [
      mkEntry('a', 'text', '2026-01-01T00:00:00Z'),
      mkEntry('b', 'text', '2026-04-20T00:00:00Z'),
    ];
    const snapshot = entries.map((e) => e.lid);
    selectRecentEntries(entries);
    expect(entries.map((e) => e.lid)).toEqual(snapshot);
  });

  it('includes user archetypes of all kinds (folder / attachment / todo / etc.)', () => {
    const T = '2026-04-20T00:00:00Z';
    const entries: Entry[] = [
      mkEntry('f', 'folder', T),
      mkEntry('a', 'attachment', T),
      mkEntry('t', 'todo', T),
      mkEntry('tl', 'textlog', T),
      mkEntry('fo', 'form', T),
      mkEntry('g', 'generic', T),
      mkEntry('o', 'opaque', T),
      mkEntry('tx', 'text', T),
    ];
    const out = selectRecentEntries(entries);
    expect(out).toHaveLength(8);
  });

  it('is deterministic across repeat calls with identical input', () => {
    const entries = [
      mkEntry('b', 'text', '2026-04-20T00:00:00Z'),
      mkEntry('a', 'text', '2026-04-20T00:00:00Z'),
      mkEntry('c', 'text', '2026-04-19T00:00:00Z'),
    ];
    const out1 = selectRecentEntries(entries);
    const out2 = selectRecentEntries(entries);
    expect(out1.map((e) => e.lid)).toEqual(out2.map((e) => e.lid));
  });
});
