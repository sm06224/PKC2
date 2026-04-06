import { describe, it, expect } from 'vitest';
import {
  addEntry,
  updateEntry,
  removeEntry,
  nextSelectedAfterRemove,
  addRelation,
  removeRelation,
  snapshotEntry,
  getEntryRevisions,
  getLatestRevision,
  getRevisionCount,
  parseRevisionSnapshot,
  getRestoreCandidates,
  restoreEntry,
  restoreDeletedEntry,
} from '@core/operations/container-ops';
import type { Container } from '@core/model/container';

const T = '2026-04-06T12:00:00Z';

function emptyContainer(): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'Test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function containerWith3Entries(): Container {
  let c = emptyContainer();
  c = addEntry(c, 'e1', 'text', 'First', T);
  c = addEntry(c, 'e2', 'text', 'Second', T);
  c = addEntry(c, 'e3', 'todo', 'Third', T);
  return c;
}

describe('addEntry', () => {
  it('adds an entry to an empty container', () => {
    const c = addEntry(emptyContainer(), 'e1', 'text', 'Hello', T);
    expect(c.entries).toHaveLength(1);
    expect(c.entries[0]!.lid).toBe('e1');
    expect(c.entries[0]!.title).toBe('Hello');
    expect(c.entries[0]!.archetype).toBe('text');
    expect(c.entries[0]!.body).toBe('');
    expect(c.entries[0]!.created_at).toBe(T);
  });

  it('updates container meta.updated_at', () => {
    const before = emptyContainer();
    const after = addEntry(before, 'e1', 'text', 'X', '2026-04-06T13:00:00Z');
    expect(after.meta.updated_at).toBe('2026-04-06T13:00:00Z');
    expect(before.meta.updated_at).toBe(T); // original unchanged
  });

  it('does not mutate the original container', () => {
    const before = emptyContainer();
    addEntry(before, 'e1', 'text', 'X', T);
    expect(before.entries).toHaveLength(0);
  });
});

describe('updateEntry', () => {
  it('updates title and body of an existing entry', () => {
    const c = containerWith3Entries();
    const updated = updateEntry(c, 'e2', 'New Title', 'New Body', '2026-04-06T14:00:00Z');
    expect(updated.entries[1]!.title).toBe('New Title');
    expect(updated.entries[1]!.body).toBe('New Body');
    expect(updated.entries[1]!.updated_at).toBe('2026-04-06T14:00:00Z');
  });

  it('returns same container if lid not found', () => {
    const c = containerWith3Entries();
    const same = updateEntry(c, 'nonexistent', 'T', 'B', T);
    expect(same).toBe(c);
  });

  it('does not mutate other entries', () => {
    const c = containerWith3Entries();
    const updated = updateEntry(c, 'e2', 'Changed', 'Body', T);
    expect(updated.entries[0]!.title).toBe('First');
    expect(updated.entries[2]!.title).toBe('Third');
  });

  it('does not mutate the original container', () => {
    const c = containerWith3Entries();
    updateEntry(c, 'e1', 'X', 'Y', T);
    expect(c.entries[0]!.title).toBe('First');
  });
});

describe('removeEntry', () => {
  it('removes an entry by lid', () => {
    const c = containerWith3Entries();
    const removed = removeEntry(c, 'e2');
    expect(removed.entries).toHaveLength(2);
    expect(removed.entries.map((e) => e.lid)).toEqual(['e1', 'e3']);
  });

  it('returns same container if lid not found', () => {
    const c = containerWith3Entries();
    const same = removeEntry(c, 'nonexistent');
    expect(same).toBe(c);
  });

  it('also removes relations involving the deleted entry', () => {
    let c = containerWith3Entries();
    c = addRelation(c, 'r1', 'e1', 'e2', 'structural', T);
    c = addRelation(c, 'r2', 'e2', 'e3', 'categorical', T);
    c = addRelation(c, 'r3', 'e1', 'e3', 'semantic', T);

    const removed = removeEntry(c, 'e2');
    expect(removed.relations).toHaveLength(1);
    expect(removed.relations[0]!.id).toBe('r3'); // only e1→e3 survives
  });

  it('does not mutate the original', () => {
    const c = containerWith3Entries();
    removeEntry(c, 'e1');
    expect(c.entries).toHaveLength(3);
  });
});

describe('nextSelectedAfterRemove', () => {
  const entries = containerWith3Entries().entries;

  it('keeps selection if removed entry was not selected', () => {
    expect(nextSelectedAfterRemove(entries, 'e2', 'e1')).toBe('e1');
  });

  it('selects next entry when middle entry removed', () => {
    // e1, e2, e3 → remove e2 → remaining: e1, e3 → index 1 = e3
    expect(nextSelectedAfterRemove(entries, 'e2', 'e2')).toBe('e3');
  });

  it('selects previous (last) when last entry removed', () => {
    // e1, e2, e3 → remove e3 → remaining: e1, e2 → index 2 clamped to 1 = e2
    expect(nextSelectedAfterRemove(entries, 'e3', 'e3')).toBe('e2');
  });

  it('selects next when first entry removed', () => {
    // e1, e2, e3 → remove e1 → remaining: e2, e3 → index 0 = e2
    expect(nextSelectedAfterRemove(entries, 'e1', 'e1')).toBe('e2');
  });

  it('returns null when last remaining entry removed', () => {
    const singleEntry = [entries[0]!];
    expect(nextSelectedAfterRemove(singleEntry, 'e1', 'e1')).toBeNull();
  });

  it('returns null when no selection', () => {
    expect(nextSelectedAfterRemove(entries, 'e1', null)).toBeNull();
  });
});

describe('addRelation', () => {
  it('adds a relation to the container', () => {
    const c = addRelation(emptyContainer(), 'r1', 'e1', 'e2', 'structural', T);
    expect(c.relations).toHaveLength(1);
    expect(c.relations[0]!.from).toBe('e1');
    expect(c.relations[0]!.to).toBe('e2');
    expect(c.relations[0]!.kind).toBe('structural');
  });
});

describe('removeRelation', () => {
  it('removes a relation by id', () => {
    let c = emptyContainer();
    c = addRelation(c, 'r1', 'a', 'b', 'structural', T);
    c = addRelation(c, 'r2', 'b', 'c', 'semantic', T);
    const removed = removeRelation(c, 'r1');
    expect(removed.relations).toHaveLength(1);
    expect(removed.relations[0]!.id).toBe('r2');
  });

  it('returns same container if id not found', () => {
    const c = emptyContainer();
    expect(removeRelation(c, 'nonexistent')).toBe(c);
  });
});

describe('snapshotEntry', () => {
  it('creates a revision with serialized entry', () => {
    const c = containerWith3Entries();
    const snapped = snapshotEntry(c, 'e1', 'rev-1', T);
    expect(snapped.revisions).toHaveLength(1);
    expect(snapped.revisions[0]!.entry_lid).toBe('e1');
    const parsed = JSON.parse(snapped.revisions[0]!.snapshot);
    expect(parsed.lid).toBe('e1');
    expect(parsed.title).toBe('First');
  });

  it('returns same container if lid not found', () => {
    const c = containerWith3Entries();
    expect(snapshotEntry(c, 'nonexistent', 'rev-1', T)).toBe(c);
  });

  it('does not mutate original', () => {
    const c = containerWith3Entries();
    snapshotEntry(c, 'e1', 'rev-1', T);
    expect(c.revisions).toHaveLength(0);
  });
});

describe('getEntryRevisions', () => {
  it('returns revisions for a specific entry sorted by time', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', '2026-01-01T00:00:00Z');
    c = snapshotEntry(c, 'e1', 'rev-2', '2026-01-02T00:00:00Z');
    c = snapshotEntry(c, 'e2', 'rev-3', '2026-01-03T00:00:00Z');

    const revs = getEntryRevisions(c, 'e1');
    expect(revs).toHaveLength(2);
    expect(revs[0]!.id).toBe('rev-1');
    expect(revs[1]!.id).toBe('rev-2');
  });

  it('returns empty array for entry with no revisions', () => {
    const c = containerWith3Entries();
    expect(getEntryRevisions(c, 'e1')).toEqual([]);
  });
});

describe('getLatestRevision', () => {
  it('returns the most recent revision', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', '2026-01-01T00:00:00Z');
    c = snapshotEntry(c, 'e1', 'rev-2', '2026-01-02T00:00:00Z');

    const latest = getLatestRevision(c, 'e1');
    expect(latest).not.toBeNull();
    expect(latest!.id).toBe('rev-2');
  });

  it('returns null for entry with no revisions', () => {
    expect(getLatestRevision(containerWith3Entries(), 'e1')).toBeNull();
  });
});

describe('getRevisionCount', () => {
  it('counts revisions for a specific entry', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    c = snapshotEntry(c, 'e1', 'rev-2', T);
    c = snapshotEntry(c, 'e2', 'rev-3', T);

    expect(getRevisionCount(c, 'e1')).toBe(2);
    expect(getRevisionCount(c, 'e2')).toBe(1);
    expect(getRevisionCount(c, 'e3')).toBe(0);
  });
});

describe('parseRevisionSnapshot', () => {
  it('parses a valid snapshot back to Entry', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', T);

    const entry = parseRevisionSnapshot(c.revisions[0]!);
    expect(entry).not.toBeNull();
    expect(entry!.lid).toBe('e1');
    expect(entry!.title).toBe('First');
  });

  it('returns null for malformed snapshot', () => {
    const rev = { id: 'r1', entry_lid: 'e1', snapshot: 'not-json', created_at: T };
    expect(parseRevisionSnapshot(rev)).toBeNull();
  });

  it('returns null for snapshot missing required fields', () => {
    const rev = { id: 'r1', entry_lid: 'e1', snapshot: '{"foo":"bar"}', created_at: T };
    expect(parseRevisionSnapshot(rev)).toBeNull();
  });
});

describe('getRestoreCandidates', () => {
  it('returns latest revision for deleted entries', () => {
    let c = containerWith3Entries();
    // Snapshot e1 twice, then remove it
    c = snapshotEntry(c, 'e1', 'rev-1', '2026-01-01T00:00:00Z');
    c = snapshotEntry(c, 'e1', 'rev-2', '2026-01-02T00:00:00Z');
    c = removeEntry(c, 'e1');

    const candidates = getRestoreCandidates(c);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.entry_lid).toBe('e1');
    expect(candidates[0]!.id).toBe('rev-2'); // latest
  });

  it('excludes entries that still exist', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    // e1 still exists, so no restore candidates
    expect(getRestoreCandidates(c)).toEqual([]);
  });

  it('returns empty when no revisions exist', () => {
    expect(getRestoreCandidates(containerWith3Entries())).toEqual([]);
  });

  it('handles multiple deleted entries', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', '2026-01-01T00:00:00Z');
    c = snapshotEntry(c, 'e2', 'rev-2', '2026-01-02T00:00:00Z');
    c = removeEntry(c, 'e1');
    c = removeEntry(c, 'e2');

    const candidates = getRestoreCandidates(c);
    expect(candidates).toHaveLength(2);
    // Sorted by created_at descending
    expect(candidates[0]!.entry_lid).toBe('e2');
    expect(candidates[1]!.entry_lid).toBe('e1');
  });
});

describe('restoreEntry', () => {
  it('snapshots current state and restores from revision', () => {
    let c = containerWith3Entries();
    // Edit e1 to create a revision (addEntry sets body='')
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    c = updateEntry(c, 'e1', 'Updated Title', 'Updated Body', T);

    // Now restore from rev-1 (which has old content: title='First', body='')
    const restored = restoreEntry(c, 'e1', 'rev-1', 'snap-1', '2026-02-01T00:00:00Z');

    // Entry should have original content
    const entry = restored.entries.find((e) => e.lid === 'e1');
    expect(entry!.title).toBe('First');
    expect(entry!.body).toBe(''); // addEntry creates with empty body
    expect(entry!.updated_at).toBe('2026-02-01T00:00:00Z');

    // Should have 2 revisions: original + pre-restore snapshot
    expect(restored.revisions).toHaveLength(2);
  });

  it('returns same container if revision not found', () => {
    const c = containerWith3Entries();
    expect(restoreEntry(c, 'e1', 'nonexistent', 'snap-1', T)).toBe(c);
  });

  it('returns same container if entry not found', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    expect(restoreEntry(c, 'nonexistent', 'rev-1', 'snap-1', T)).toBe(c);
  });

  it('does not mutate original', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    c = updateEntry(c, 'e1', 'Changed', 'Changed Body', T);
    const before = c.entries.find((e) => e.lid === 'e1')!.title;
    restoreEntry(c, 'e1', 'rev-1', 'snap-1', T);
    expect(c.entries.find((e) => e.lid === 'e1')!.title).toBe(before);
  });
});

describe('restoreDeletedEntry', () => {
  it('re-creates a deleted entry from revision', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    c = removeEntry(c, 'e1');
    expect(c.entries).toHaveLength(2);

    const restored = restoreDeletedEntry(c, 'rev-1', '2026-02-01T00:00:00Z');
    expect(restored.entries).toHaveLength(3);

    const entry = restored.entries.find((e) => e.lid === 'e1');
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('First');
    expect(entry!.body).toBe(''); // addEntry creates with empty body
  });

  it('returns same container if revision not found', () => {
    const c = containerWith3Entries();
    expect(restoreDeletedEntry(c, 'nonexistent', T)).toBe(c);
  });

  it('returns same container if entry still exists', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    // e1 still exists
    expect(restoreDeletedEntry(c, 'rev-1', T)).toBe(c);
  });
});
