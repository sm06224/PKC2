import { describe, it, expect } from 'vitest';
import {
  isSystemArchetype,
  isUserEntry,
  ABOUT_LID,
  SETTINGS_LID,
  isReservedLid,
  type Entry,
} from '@core/model/record';
import {
  getUserEntries,
  hasUserContent,
  mergeSystemEntries,
  type Container,
} from '@core/model/container';

const T = '2026-04-18T00:00:00Z';

function makeEntry(lid: string, archetype: string): Entry {
  return {
    lid,
    title: lid,
    body: '',
    archetype: archetype as Entry['archetype'],
    created_at: T,
    updated_at: T,
  };
}

function makeContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: 'c-test',
      title: 'test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('isSystemArchetype', () => {
  it('returns true for system-about', () => {
    expect(isSystemArchetype('system-about')).toBe(true);
  });

  it('returns true for system-settings (forward-compatible, even before union update)', () => {
    expect(isSystemArchetype('system-settings')).toBe(true);
  });

  it('returns true for any future system-* archetype', () => {
    expect(isSystemArchetype('system-plugin-registry')).toBe(true);
  });

  it('returns false for ordinary archetypes', () => {
    expect(isSystemArchetype('text')).toBe(false);
    expect(isSystemArchetype('todo')).toBe(false);
    expect(isSystemArchetype('folder')).toBe(false);
    expect(isSystemArchetype('attachment')).toBe(false);
  });
});

describe('isUserEntry', () => {
  it('returns false for system-about entries', () => {
    expect(isUserEntry(makeEntry(ABOUT_LID, 'system-about'))).toBe(false);
  });

  it('returns false for system-settings entries', () => {
    expect(isUserEntry(makeEntry(SETTINGS_LID, 'system-settings'))).toBe(false);
  });

  it('returns true for ordinary user entries', () => {
    expect(isUserEntry(makeEntry('e1', 'text'))).toBe(true);
    expect(isUserEntry(makeEntry('e2', 'todo'))).toBe(true);
  });
});

describe('SETTINGS_LID', () => {
  it('exports the canonical reserved settings lid', () => {
    expect(SETTINGS_LID).toBe('__settings__');
  });

  it('matches isReservedLid', () => {
    expect(isReservedLid(SETTINGS_LID)).toBe(true);
    expect(isReservedLid(ABOUT_LID)).toBe(true);
  });
});

describe('getUserEntries', () => {
  it('returns empty when only system entries are present', () => {
    const entries = [
      makeEntry(ABOUT_LID, 'system-about'),
      makeEntry(SETTINGS_LID, 'system-settings'),
    ];
    expect(getUserEntries(entries)).toEqual([]);
  });

  it('strips system entries from a mixed list', () => {
    const userEntry = makeEntry('e1', 'text');
    const entries = [
      makeEntry(ABOUT_LID, 'system-about'),
      userEntry,
      makeEntry(SETTINGS_LID, 'system-settings'),
    ];
    expect(getUserEntries(entries)).toEqual([userEntry]);
  });

  it('returns the input as-is when no system entries are present', () => {
    const entries = [makeEntry('a', 'text'), makeEntry('b', 'todo')];
    expect(getUserEntries(entries)).toEqual(entries);
  });
});

describe('mergeSystemEntries', () => {
  it('replaces existing system entries with the supplied set', () => {
    const staleAbout = { ...makeEntry(ABOUT_LID, 'system-about'), body: 'STALE' };
    const freshAbout = { ...makeEntry(ABOUT_LID, 'system-about'), body: 'FRESH' };
    const result = mergeSystemEntries(makeContainer([staleAbout]), [freshAbout]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.body).toBe('FRESH');
  });

  it('preserves user entries while replacing system entries', () => {
    const userA = makeEntry('a', 'text');
    const userB = makeEntry('b', 'todo');
    const staleAbout = { ...makeEntry(ABOUT_LID, 'system-about'), body: 'STALE' };
    const freshAbout = { ...makeEntry(ABOUT_LID, 'system-about'), body: 'FRESH' };
    const result = mergeSystemEntries(
      makeContainer([userA, staleAbout, userB]),
      [freshAbout],
    );
    expect(result.entries).toHaveLength(3);
    expect(result.entries.filter((e) => e.archetype === 'text')).toHaveLength(1);
    expect(result.entries.filter((e) => e.archetype === 'todo')).toHaveLength(1);
    expect(result.entries.find((e) => e.lid === ABOUT_LID)!.body).toBe('FRESH');
  });

  it('adds system entries to a container that has none', () => {
    const userA = makeEntry('a', 'text');
    const freshAbout = { ...makeEntry(ABOUT_LID, 'system-about'), body: 'FRESH' };
    const result = mergeSystemEntries(makeContainer([userA]), [freshAbout]);
    expect(result.entries).toHaveLength(2);
  });

  it('preserves unmentioned system entries when given an empty supply', () => {
    // Per-lid upsert (FI-Settings v1, 2026-04-18): supplying nothing
    // means "no changes." Pre-existing system entries whose lid is not
    // in the supply list must survive — otherwise IDB's `__settings__`
    // is wiped on every reboot (pkc-data only supplies `__about__`).
    const userA = makeEntry('a', 'text');
    const existingAbout = makeEntry(ABOUT_LID, 'system-about');
    const existingSettings = makeEntry(SETTINGS_LID, 'system-settings');
    const result = mergeSystemEntries(
      makeContainer([userA, existingAbout, existingSettings]),
      [],
    );
    expect(result.entries).toHaveLength(3);
    expect(result.entries.find((e) => e.lid === ABOUT_LID)).toBeDefined();
    expect(result.entries.find((e) => e.lid === SETTINGS_LID)).toBeDefined();
  });

  it('preserves unmentioned system entries while upserting supplied ones', () => {
    // pkc-data supplies `__about__` but not `__settings__`. The new
    // `__about__` must overwrite the stale one while `__settings__`
    // from IDB is kept intact.
    const userA = makeEntry('a', 'text');
    const staleAbout = { ...makeEntry(ABOUT_LID, 'system-about'), body: 'STALE' };
    const existingSettings = { ...makeEntry(SETTINGS_LID, 'system-settings'), body: 'USER_PREFS' };
    const freshAbout = { ...makeEntry(ABOUT_LID, 'system-about'), body: 'FRESH' };
    const result = mergeSystemEntries(
      makeContainer([userA, staleAbout, existingSettings]),
      [freshAbout],
    );
    expect(result.entries).toHaveLength(3);
    expect(result.entries.find((e) => e.lid === ABOUT_LID)!.body).toBe('FRESH');
    expect(result.entries.find((e) => e.lid === SETTINGS_LID)!.body).toBe('USER_PREFS');
  });

  it('preserves meta / relations / revisions / assets', () => {
    const base: Container = {
      ...makeContainer([makeEntry('a', 'text')]),
      relations: [{ id: 'r1', kind: 'categorical', from: 'a', to: 'tag:foo', created_at: T, updated_at: T }],
      revisions: [{ id: 'rev1', entry_lid: 'a', snapshot: '{}', created_at: T }],
      assets: { 'asset-1': 'data:...' },
    };
    const freshAbout = makeEntry(ABOUT_LID, 'system-about');
    const result = mergeSystemEntries(base, [freshAbout]);
    expect(result.meta).toBe(base.meta);
    expect(result.relations).toBe(base.relations);
    expect(result.revisions).toBe(base.revisions);
    expect(result.assets).toBe(base.assets);
  });

  it('does not mutate the input container', () => {
    const userA = makeEntry('a', 'text');
    const staleAbout = makeEntry(ABOUT_LID, 'system-about');
    const base = makeContainer([userA, staleAbout]);
    const baseEntriesCopy = [...base.entries];
    mergeSystemEntries(base, []);
    expect(base.entries).toEqual(baseEntriesCopy);
  });
});

describe('hasUserContent', () => {
  it('returns false for an empty container', () => {
    expect(hasUserContent(makeContainer([]))).toBe(false);
  });

  it('returns false for a container with only __about__', () => {
    expect(hasUserContent(makeContainer([
      makeEntry(ABOUT_LID, 'system-about'),
    ]))).toBe(false);
  });

  it('returns false for a container with only system entries (about + settings)', () => {
    expect(hasUserContent(makeContainer([
      makeEntry(ABOUT_LID, 'system-about'),
      makeEntry(SETTINGS_LID, 'system-settings'),
    ]))).toBe(false);
  });

  it('returns true once a user entry is added', () => {
    expect(hasUserContent(makeContainer([
      makeEntry(ABOUT_LID, 'system-about'),
      makeEntry('e1', 'text'),
    ]))).toBe(true);
  });

  it('returns true for any container with at least one user entry', () => {
    expect(hasUserContent(makeContainer([
      makeEntry('e1', 'todo'),
    ]))).toBe(true);
  });
});
