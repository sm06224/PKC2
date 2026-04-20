import { describe, it, expect } from 'vitest';
import {
  addEntry,
  updateEntry,
  removeEntry,
  nextSelectedAfterRemove,
  addRelation,
  removeRelation,
  updateRelationKind,
  snapshotEntry,
  getEntryRevisions,
  getLatestRevision,
  getRevisionCount,
  parseRevisionSnapshot,
  getRestoreCandidates,
  restoreEntry,
  restoreDeletedEntry,
  setAsset,
  mergeAssets,
  purgeTrash,
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

describe('updateRelationKind', () => {
  const T2 = '2026-04-20T09:00:00Z';

  it('updates the kind and updated_at of a matching relation', () => {
    let c = emptyContainer();
    c = addRelation(c, 'r1', 'a', 'b', 'structural', T);
    const updated = updateRelationKind(c, 'r1', 'semantic', T2);
    expect(updated.relations).toHaveLength(1);
    expect(updated.relations[0]!.kind).toBe('semantic');
    expect(updated.relations[0]!.updated_at).toBe(T2);
    expect(updated.relations[0]!.created_at).toBe(T); // preserved
    expect(updated.meta.updated_at).toBe(T2);
  });

  it('leaves other relations untouched', () => {
    let c = emptyContainer();
    c = addRelation(c, 'r1', 'a', 'b', 'structural', T);
    c = addRelation(c, 'r2', 'b', 'c', 'categorical', T);
    const updated = updateRelationKind(c, 'r1', 'temporal', T2);
    const r2 = updated.relations.find((r) => r.id === 'r2')!;
    expect(r2.kind).toBe('categorical');
    expect(r2.updated_at).toBe(T);
  });

  it('returns same container if id not found', () => {
    let c = emptyContainer();
    c = addRelation(c, 'r1', 'a', 'b', 'structural', T);
    expect(updateRelationKind(c, 'nonexistent', 'semantic', T2)).toBe(c);
  });

  it('returns same container if kind is unchanged (no-op)', () => {
    let c = emptyContainer();
    c = addRelation(c, 'r1', 'a', 'b', 'structural', T);
    expect(updateRelationKind(c, 'r1', 'structural', T2)).toBe(c);
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

// ── P0-4: strict failure contract for parseRevisionSnapshot ──────────
//
// Every branch below pins one reason the strict parse (P0-4,
// 2026-04-13) returns `null`. Silent corruption of the restore
// pipeline is the risk we are guarding against — see
// `docs/spec/data-model.md` §6.4.
describe('parseRevisionSnapshot — strict failure contract (P0-4)', () => {
  /** Build a Revision carrying an arbitrary JSON payload as snapshot. */
  function revWith(snapshotObj: unknown) {
    return {
      id: 'r',
      entry_lid: 'e1',
      snapshot: JSON.stringify(snapshotObj),
      created_at: T,
    };
  }

  const baseValidEntry = {
    lid: 'e1',
    title: 'Title',
    body: 'Body',
    archetype: 'text',
    created_at: T,
    updated_at: T,
  };

  // ── accepted (regression guards) ───────────────────────────

  it('accepts a full, valid Entry-shaped snapshot', () => {
    const out = parseRevisionSnapshot(revWith(baseValidEntry));
    expect(out).not.toBeNull();
    expect(out!.lid).toBe('e1');
    expect(out!.archetype).toBe('text');
  });

  it('accepts empty title', () => {
    const out = parseRevisionSnapshot(revWith({ ...baseValidEntry, title: '' }));
    expect(out).not.toBeNull();
    expect(out!.title).toBe('');
  });

  it('accepts empty body', () => {
    const out = parseRevisionSnapshot(revWith({ ...baseValidEntry, body: '' }));
    expect(out).not.toBeNull();
    expect(out!.body).toBe('');
  });

  it('tolerates extra fields (preserved on the returned Entry)', () => {
    const withExtra = { ...baseValidEntry, custom: 'keep-me' } as unknown as typeof baseValidEntry;
    const out = parseRevisionSnapshot(revWith(withExtra));
    expect(out).not.toBeNull();
    expect((out as unknown as Record<string, unknown>).custom).toBe('keep-me');
  });

  it('accepts each of the 8 known ArchetypeId values', () => {
    const known = ['text', 'textlog', 'todo', 'form', 'attachment', 'folder', 'generic', 'opaque'];
    for (const a of known) {
      const out = parseRevisionSnapshot(revWith({ ...baseValidEntry, archetype: a }));
      expect(out, `archetype=${a}`).not.toBeNull();
      expect(out!.archetype).toBe(a);
    }
  });

  // ── rejected (silent corruption vectors) ────────────────────

  it('rejects JSON that is not a plain object (null)', () => {
    const rev = { id: 'r', entry_lid: 'e1', snapshot: 'null', created_at: T };
    expect(parseRevisionSnapshot(rev)).toBeNull();
  });

  it('rejects JSON that is not a plain object (array)', () => {
    const rev = { id: 'r', entry_lid: 'e1', snapshot: '[1,2,3]', created_at: T };
    expect(parseRevisionSnapshot(rev)).toBeNull();
  });

  it('rejects JSON that is not a plain object (number)', () => {
    const rev = { id: 'r', entry_lid: 'e1', snapshot: '42', created_at: T };
    expect(parseRevisionSnapshot(rev)).toBeNull();
  });

  it('rejects JSON that is not a plain object (string)', () => {
    const rev = { id: 'r', entry_lid: 'e1', snapshot: '"just a string"', created_at: T };
    expect(parseRevisionSnapshot(rev)).toBeNull();
  });

  it('rejects missing lid', () => {
    const { lid: _lid, ...withoutLid } = baseValidEntry;
    expect(parseRevisionSnapshot(revWith(withoutLid))).toBeNull();
  });

  it('rejects empty-string lid', () => {
    expect(parseRevisionSnapshot(revWith({ ...baseValidEntry, lid: '' }))).toBeNull();
  });

  it('rejects non-string lid', () => {
    expect(parseRevisionSnapshot(revWith({ ...baseValidEntry, lid: 42 }))).toBeNull();
  });

  it('rejects missing title', () => {
    const { title: _t, ...withoutTitle } = baseValidEntry;
    expect(parseRevisionSnapshot(revWith(withoutTitle))).toBeNull();
  });

  it('rejects non-string title (null)', () => {
    expect(parseRevisionSnapshot(revWith({ ...baseValidEntry, title: null }))).toBeNull();
  });

  it('rejects missing body', () => {
    const { body: _b, ...withoutBody } = baseValidEntry;
    expect(parseRevisionSnapshot(revWith(withoutBody))).toBeNull();
  });

  it('rejects non-string body (object)', () => {
    expect(parseRevisionSnapshot(revWith({ ...baseValidEntry, body: { x: 1 } }))).toBeNull();
  });

  it('rejects missing archetype (silent corruption vector pre-P0-4)', () => {
    const { archetype: _a, ...withoutArchetype } = baseValidEntry;
    expect(parseRevisionSnapshot(revWith(withoutArchetype))).toBeNull();
  });

  it('rejects unknown archetype string (silent corruption vector pre-P0-4)', () => {
    expect(parseRevisionSnapshot(revWith({ ...baseValidEntry, archetype: 'bogus' }))).toBeNull();
  });

  it('rejects non-string archetype (number)', () => {
    expect(parseRevisionSnapshot(revWith({ ...baseValidEntry, archetype: 42 }))).toBeNull();
  });

  it('rejects missing created_at', () => {
    const { created_at: _c, ...withoutCreated } = baseValidEntry;
    expect(parseRevisionSnapshot(revWith(withoutCreated))).toBeNull();
  });

  it('rejects missing updated_at', () => {
    const { updated_at: _u, ...withoutUpdated } = baseValidEntry;
    expect(parseRevisionSnapshot(revWith(withoutUpdated))).toBeNull();
  });

  it('rejects non-string created_at', () => {
    expect(parseRevisionSnapshot(revWith({ ...baseValidEntry, created_at: 0 }))).toBeNull();
  });

  // ── round-trip invariant: every snapshotEntry output parses ─

  it('round-trips every archetype that snapshotEntry can produce', () => {
    // snapshotEntry always writes `JSON.stringify(entry)` where
    // entry is a real Entry — the strict parse must accept every
    // such output unconditionally. This is the backward-compat
    // invariant for existing user data.
    let c = emptyContainer();
    c = addEntry(c, 'eT', 'text', 'T', T);
    c = addEntry(c, 'eL', 'textlog', 'L', T);
    c = addEntry(c, 'eD', 'todo', 'D', T);
    c = addEntry(c, 'eF', 'form', 'F', T);
    c = addEntry(c, 'eA', 'attachment', 'A', T);
    c = addEntry(c, 'eO', 'folder', 'O', T);
    c = addEntry(c, 'eG', 'generic', 'G', T);
    c = addEntry(c, 'eX', 'opaque', 'X', T);
    let i = 0;
    for (const entry of c.entries) {
      c = snapshotEntry(c, entry.lid, `snap-${i++}`, T);
    }
    for (const rev of c.revisions) {
      const parsed = parseRevisionSnapshot(rev);
      expect(parsed, `failed to round-trip: ${rev.entry_lid}`).not.toBeNull();
      expect(parsed!.lid).toBe(rev.entry_lid);
    }
  });
});

// ── P0-4: restoreEntry failure contract (archetype mismatch) ─────────
describe('restoreEntry — strict failure contract (P0-4)', () => {
  it('rejects archetype mismatch between existing entry and snapshot', () => {
    // Scenario: hand-crafted (or migrated) data in which a revision
    // carries archetype='todo' for a lid that currently lives as
    // archetype='text'. Without the guard, restoreEntry would
    // overwrite the TEXT body with the TODO JSON body (silent
    // corruption). With the guard it returns the input unchanged.
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'Text entry', T);
    c = updateEntry(c, 'e1', 'Text entry', '# my text', T);

    const mismatchedRevision = {
      id: 'mismatched',
      entry_lid: 'e1',
      snapshot: JSON.stringify({
        lid: 'e1',
        title: 'Was a todo',
        body: JSON.stringify({ status: 'open', description: 'milk' }),
        archetype: 'todo',
        created_at: T,
        updated_at: T,
      }),
      created_at: T,
    };
    c = { ...c, revisions: [...c.revisions, mismatchedRevision] };

    const result = restoreEntry(c, 'e1', 'mismatched', 'snap-guard', T);

    // Container unchanged: same object reference and the entry still
    // has its TEXT body.
    expect(result).toBe(c);
    const entry = result.entries.find((e) => e.lid === 'e1');
    expect(entry!.archetype).toBe('text');
    expect(entry!.body).toBe('# my text');
  });

  it('still succeeds for matching archetype', () => {
    // Regression guard — the archetype-match check must not
    // mis-reject legitimate restores produced by snapshotEntry.
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'Original', T);
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    c = updateEntry(c, 'e1', 'Mutated', 'new body', T);
    const restored = restoreEntry(c, 'e1', 'rev-1', 'snap-ok', T);
    const entry = restored.entries.find((e) => e.lid === 'e1');
    expect(entry!.title).toBe('Original');
  });

  it('rejects when the snapshot itself is malformed (no archetype)', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'T', T);
    const bad = {
      id: 'bad',
      entry_lid: 'e1',
      snapshot: JSON.stringify({ lid: 'e1', title: 'x', body: 'y' }),
      created_at: T,
    };
    c = { ...c, revisions: [...c.revisions, bad] };
    expect(restoreEntry(c, 'e1', 'bad', 'snap-fail', T)).toBe(c);
  });
});

// ── P0-4: restoreDeletedEntry failure contract ───────────────────────
describe('restoreDeletedEntry — strict failure contract (P0-4)', () => {
  it('rejects when the snapshot has an invalid archetype', () => {
    // Pre-P0-4 this created an entry with `archetype: 'unknown'`,
    // a silent corruption that rendering code papered over by
    // falling back to 'generic'. Now the parse itself rejects, so
    // restoreDeletedEntry returns unchanged container.
    const bad = {
      id: 'bad',
      entry_lid: 'e-ghost',
      snapshot: JSON.stringify({
        lid: 'e-ghost',
        title: 'Ghost',
        body: '',
        archetype: 'unknown-future-archetype',
        created_at: T,
        updated_at: T,
      }),
      created_at: T,
    };
    const c = { ...emptyContainer(), revisions: [bad] };

    const result = restoreDeletedEntry(c, 'bad', T);
    expect(result).toBe(c);
    // No entry was added.
    expect(result.entries).toHaveLength(0);
  });

  it('rejects when the snapshot is missing timestamps', () => {
    const bad = {
      id: 'bad',
      entry_lid: 'e-ghost',
      snapshot: JSON.stringify({
        lid: 'e-ghost',
        title: 'x',
        body: '',
        archetype: 'text',
        // created_at / updated_at missing
      }),
      created_at: T,
    };
    const c = { ...emptyContainer(), revisions: [bad] };
    expect(restoreDeletedEntry(c, 'bad', T)).toBe(c);
  });

  it('still succeeds for a well-formed deleted-entry revision', () => {
    // Regression guard: the tighter parse must not break the
    // legitimate restore path.
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'todo', 'Task', T);
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    c = removeEntry(c, 'e1');
    expect(c.entries).toHaveLength(0);
    const restored = restoreDeletedEntry(c, 'rev-1', T);
    const entry = restored.entries.find((e) => e.lid === 'e1');
    expect(entry).toBeDefined();
    expect(entry!.archetype).toBe('todo');
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

describe('purgeTrash', () => {
  it('removes revisions for deleted entries only', () => {
    let c = containerWith3Entries();
    // Snapshot e1 (active) and e2 (will be deleted)
    c = snapshotEntry(c, 'e1', 'rev-active', T);
    c = snapshotEntry(c, 'e2', 'rev-before-del', T);
    c = removeEntry(c, 'e2');
    expect(c.revisions).toHaveLength(2);
    const result = purgeTrash(c);
    // Only e2's revision should be purged (e1's kept)
    expect(result.purgedCount).toBe(1);
    expect(result.container.revisions).toHaveLength(1);
    expect(result.container.revisions[0]!.entry_lid).toBe('e1');
  });

  it('returns 0 when no deleted entries exist', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    const result = purgeTrash(c);
    expect(result.purgedCount).toBe(0);
    expect(result.container).toBe(c); // same reference
  });

  it('purges all revisions when all entries are deleted', () => {
    let c = containerWith3Entries();
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    c = snapshotEntry(c, 'e2', 'rev-2', T);
    c = removeEntry(c, 'e1');
    c = removeEntry(c, 'e2');
    const result = purgeTrash(c);
    expect(result.purgedCount).toBe(2);
    expect(result.container.revisions).toHaveLength(0);
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

// ── Asset operations ────────────────────────────

describe('setAsset', () => {
  it('adds a new asset', () => {
    const e = emptyContainer();
    const c = setAsset(e, 'ast-1', 'data1');
    expect(c.assets['ast-1']).toBe('data1');
    expect(e.assets['ast-1']).toBeUndefined(); // immutable
  });

  it('overwrites an existing asset', () => {
    let c = setAsset(emptyContainer(), 'ast-1', 'data1');
    c = setAsset(c, 'ast-1', 'data2');
    expect(c.assets['ast-1']).toBe('data2');
  });
});

describe('mergeAssets', () => {
  it('merges multiple assets', () => {
    const c = mergeAssets(emptyContainer(), { 'ast-1': 'a', 'ast-2': 'b' });
    expect(c.assets['ast-1']).toBe('a');
    expect(c.assets['ast-2']).toBe('b');
  });

  it('returns same container for empty assets', () => {
    const e = emptyContainer();
    const c = mergeAssets(e, {});
    expect(c).toBe(e);
  });

  it('preserves existing assets', () => {
    let c = setAsset(emptyContainer(), 'ast-existing', 'old');
    c = mergeAssets(c, { 'ast-new': 'new' });
    expect(c.assets['ast-existing']).toBe('old');
    expect(c.assets['ast-new']).toBe('new');
  });
});
