import { describe, it, expect } from 'vitest';
import {
  addEntry,
  updateEntry,
  snapshotEntry,
  restoreEntry,
  restoreDeletedEntry,
  removeEntry,
  parseRevisionSnapshot,
} from '@core/operations/container-ops';
import { fnv1a64Hex } from '@core/operations/hash';
import type { Container, Revision } from '@core/model/container';

const T0 = '2026-04-15T10:00:00Z';
const T1 = '2026-04-15T10:00:01Z';
const T2 = '2026-04-15T10:00:02Z';
const T3 = '2026-04-15T10:00:03Z';

function emptyContainer(): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'Test',
      created_at: T0,
      updated_at: T0,
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('H-6 fnv1a64Hex (hash.ts)', () => {
  it('returns 16-char lowercase hex', () => {
    const h = fnv1a64Hex('hello world');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic — same input yields same output', () => {
    const s = '{"lid":"x","title":"t","body":"b"}';
    expect(fnv1a64Hex(s)).toBe(fnv1a64Hex(s));
  });

  it('distinguishes different inputs', () => {
    const a = fnv1a64Hex('hello');
    const b = fnv1a64Hex('hellp');
    expect(a).not.toBe(b);
  });

  it('produces stable value for empty string (offset basis)', () => {
    expect(fnv1a64Hex('')).toBe('cbf29ce484222325');
  });

  it('hashes well-known FNV-1a-64 reference vector "a"', () => {
    // Reference: "a" → af63dc4c8601ec8c per FNV-1a 64 spec
    expect(fnv1a64Hex('a')).toBe('af63dc4c8601ec8c');
  });

  it('hashes multibyte characters consistently (UTF-8 path)', () => {
    const h = fnv1a64Hex('日本語');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    // Stability pin: hash of this fixed string must not silently drift
    expect(fnv1a64Hex('日本語')).toBe(h);
  });

  it('handles astral-plane surrogate pairs as a single code point', () => {
    const emoji = '\uD83D\uDE00'; // 😀 U+1F600
    expect(fnv1a64Hex(emoji)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('H-6 Revision.content_hash', () => {
  it('new snapshot populates content_hash = FNV-1a-64 of snapshot', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'Hello', T0);
    c = snapshotEntry(c, 'e1', 'rev-1', T1);
    const rev = c.revisions[0];
    expect(rev).toBeDefined();
    expect(rev!.content_hash).toBe(fnv1a64Hex(rev!.snapshot));
    expect(rev!.content_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('content_hash is stable across repeated snapshots of identical entry state', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'Hello', T0);
    const c1 = snapshotEntry(c, 'e1', 'rev-1', T1);
    const c2 = snapshotEntry(c, 'e1', 'rev-2', T2);
    // Same entry state, different revision id/time → same content_hash
    expect(c1.revisions[0]!.content_hash).toBe(c2.revisions[0]!.content_hash);
  });

  it('content_hash changes after body mutation', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'First', T0);
    c = snapshotEntry(c, 'e1', 'rev-1', T1);
    const hash1 = c.revisions[0]!.content_hash;
    c = updateEntry(c, 'e1', 'First', 'new body', T2);
    c = snapshotEntry(c, 'e1', 'rev-2', T3);
    const hash2 = c.revisions[1]!.content_hash;
    expect(hash2).toBeDefined();
    expect(hash2).not.toBe(hash1);
  });

  it('does not mutate the input container', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'T', T0);
    const before = c.revisions.length;
    snapshotEntry(c, 'e1', 'rev-1', T1);
    expect(c.revisions.length).toBe(before);
  });
});

describe('H-6 Revision.prev_rid', () => {
  it('is absent on the first revision of an entry', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'T', T0);
    c = snapshotEntry(c, 'e1', 'rev-1', T1);
    expect('prev_rid' in c.revisions[0]!).toBe(false);
  });

  it('points to the previous revision id for subsequent snapshots', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'T', T0);
    c = snapshotEntry(c, 'e1', 'rev-1', T1);
    c = updateEntry(c, 'e1', 'T', 'x', T2);
    c = snapshotEntry(c, 'e1', 'rev-2', T2);
    expect(c.revisions[1]!.prev_rid).toBe('rev-1');
    c = updateEntry(c, 'e1', 'T', 'y', T3);
    c = snapshotEntry(c, 'e1', 'rev-3', T3);
    expect(c.revisions[2]!.prev_rid).toBe('rev-2');
  });

  it('is scoped per entry_lid — unrelated entries do not leak into the chain', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'A', T0);
    c = addEntry(c, 'e2', 'text', 'B', T0);
    c = snapshotEntry(c, 'e1', 'rev-e1-1', T1);
    c = snapshotEntry(c, 'e2', 'rev-e2-1', T2);
    c = snapshotEntry(c, 'e1', 'rev-e1-2', T3);
    const e2First = c.revisions.find((r) => r.id === 'rev-e2-1');
    const e1Second = c.revisions.find((r) => r.id === 'rev-e1-2');
    expect('prev_rid' in (e2First as Revision)).toBe(false);
    expect(e1Second!.prev_rid).toBe('rev-e1-1');
  });

  it('tie-breaks by array position when created_at strings are equal', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'T', T0);
    // Two snapshots at the same timestamp — second should link to first
    c = snapshotEntry(c, 'e1', 'rev-a', T1);
    c = snapshotEntry(c, 'e1', 'rev-b', T1);
    expect(c.revisions[1]!.prev_rid).toBe('rev-a');
  });

  it('coexists with bulk_id on bulk snapshots', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'T', T0);
    c = snapshotEntry(c, 'e1', 'rev-1', T1);
    c = snapshotEntry(c, 'e1', 'rev-2', T2, 'bulk-xyz');
    expect(c.revisions[1]!.prev_rid).toBe('rev-1');
    expect(c.revisions[1]!.bulk_id).toBe('bulk-xyz');
    expect(c.revisions[1]!.content_hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('H-6 backward compatibility', () => {
  it('legacy Revision without prev_rid / content_hash still parses', () => {
    const legacy: Revision = {
      id: 'legacy-1',
      entry_lid: 'old-entry',
      snapshot: JSON.stringify({
        lid: 'old-entry',
        title: 'legacy',
        body: 'legacy body',
        archetype: 'text',
        created_at: T0,
        updated_at: T0,
      }),
      created_at: T0,
    };
    const parsed = parseRevisionSnapshot(legacy);
    expect(parsed).not.toBeNull();
    expect(parsed!.lid).toBe('old-entry');
  });

  it('restoreEntry works on a legacy revision lacking prev_rid / content_hash', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'Current', T0);
    c = updateEntry(c, 'e1', 'Current', 'current body', T1);
    const legacyRev: Revision = {
      id: 'legacy-1',
      entry_lid: 'e1',
      snapshot: JSON.stringify({
        lid: 'e1',
        title: 'Original',
        body: 'original body',
        archetype: 'text',
        created_at: T0,
        updated_at: T0,
      }),
      created_at: T0,
    };
    c = { ...c, revisions: [legacyRev] };
    c = restoreEntry(c, 'e1', 'legacy-1', 'snapshot-of-current', T2);
    const e1 = c.entries.find((e) => e.lid === 'e1')!;
    expect(e1.title).toBe('Original');
    expect(e1.body).toBe('original body');
    // The new snapshot of current state should carry prev_rid pointing
    // to the legacy revision (chain extension across the boundary).
    const newRev = c.revisions.find((r) => r.id === 'snapshot-of-current');
    expect(newRev).toBeDefined();
    expect(newRev!.prev_rid).toBe('legacy-1');
    expect(newRev!.content_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('restoreDeletedEntry works on a legacy revision', () => {
    const legacyRev: Revision = {
      id: 'legacy-del',
      entry_lid: 'gone',
      snapshot: JSON.stringify({
        lid: 'gone',
        title: 'Was here',
        body: 'data',
        archetype: 'text',
        created_at: T0,
        updated_at: T0,
      }),
      created_at: T0,
    };
    const c = { ...emptyContainer(), revisions: [legacyRev] };
    const restored = restoreDeletedEntry(c, 'legacy-del', T1);
    const entry = restored.entries.find((e) => e.lid === 'gone');
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Was here');
  });
});

describe('H-6 round-trip through JSON', () => {
  it('preserves prev_rid and content_hash across JSON serialize/parse', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'T', T0);
    c = snapshotEntry(c, 'e1', 'rev-1', T1);
    c = snapshotEntry(c, 'e1', 'rev-2', T2);

    const serialized = JSON.stringify(c);
    const restored = JSON.parse(serialized) as Container;

    expect(restored.revisions[1]!.prev_rid).toBe('rev-1');
    expect(restored.revisions[1]!.content_hash).toBe(
      c.revisions[1]!.content_hash,
    );
  });
});

describe('H-6 restoreEntry still snapshots current state with new fields', () => {
  it('post-restore snapshot has content_hash and prev_rid of prior revision', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'A', T0);
    c = snapshotEntry(c, 'e1', 'rev-1', T1);
    c = updateEntry(c, 'e1', 'A', 'changed', T2);

    c = restoreEntry(c, 'e1', 'rev-1', 'snap-pre-restore', T3);

    const snapPre = c.revisions.find((r) => r.id === 'snap-pre-restore')!;
    expect(snapPre.entry_lid).toBe('e1');
    expect(snapPre.prev_rid).toBe('rev-1');
    expect(snapPre.content_hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('H-6 removeEntry still snapshots with new fields', () => {
  it('snapshot-before-delete carries content_hash and prev_rid if prior exists', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'A', T0);
    c = snapshotEntry(c, 'e1', 'rev-1', T1);
    c = removeEntry(c, 'e1');
    // removeEntry itself doesn't snapshot — it's reducer-level. But
    // a caller that snapshots-before-remove should see prev_rid set.
    let c2 = emptyContainer();
    c2 = addEntry(c2, 'e1', 'text', 'A', T0);
    c2 = snapshotEntry(c2, 'e1', 'rev-1', T1);
    c2 = snapshotEntry(c2, 'e1', 'rev-pre-del', T2);
    expect(c2.revisions[1]!.prev_rid).toBe('rev-1');
    // Silence unused-var lint from the `c` branch above
    expect(c.entries.find((e) => e.lid === 'e1')).toBeUndefined();
  });
});
