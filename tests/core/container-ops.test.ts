import { describe, it, expect } from 'vitest';
import {
  addEntry,
  updateEntry,
  removeEntry,
  nextSelectedAfterRemove,
  addRelation,
  removeRelation,
  snapshotEntry,
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
