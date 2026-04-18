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
