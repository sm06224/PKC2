import { describe, it, expect } from 'vitest';
import {
  addEntry,
  updateEntry,
  removeEntry,
  snapshotEntry,
  getRevisionsByBulkId,
  parseRevisionSnapshot,
  restoreEntry,
  restoreDeletedEntry,
} from '@core/operations/container-ops';
import type { Container } from '@core/model/container';

/**
 * Bulk-snapshot policy tests.
 *
 * Exercises the `bulk_id` field added to Revision in 2026-04-13 so a
 * single BULK_* action can produce revisions that are recognisable
 * as one group. The policy keeps `bulk_id` strictly additive:
 *
 *   - single-entry snapshots MUST NOT carry `bulk_id`
 *   - bulk snapshots MUST share the same `bulk_id` across the group
 *   - `parseRevisionSnapshot` / `restoreEntry` / `restoreDeletedEntry`
 *     MUST NOT care about `bulk_id` (backward-compat)
 *   - `getRevisionsByBulkId` returns the group in created_at order
 */

const T = '2026-04-13T00:00:00Z';

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

describe('snapshotEntry — bulk_id handling', () => {
  it('omits bulk_id when the optional argument is not provided (single-entry path)', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'T', T);
    c = snapshotEntry(c, 'e1', 'rev-1', T);
    expect(c.revisions).toHaveLength(1);
    expect(c.revisions[0]!.bulk_id).toBeUndefined();
    // The JSON footprint of a single-entry snapshot stays unchanged
    // from pre-2026-04-13 output — important for existing exported
    // containers that don't include the field.
    expect(Object.prototype.hasOwnProperty.call(c.revisions[0], 'bulk_id')).toBe(false);
  });

  it('writes bulk_id when the optional argument is provided', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'todo', 'T', T);
    c = snapshotEntry(c, 'e1', 'rev-1', T, 'bulk-abc');
    expect(c.revisions[0]!.bulk_id).toBe('bulk-abc');
  });

  it('is a no-op (returns input container) when the lid does not exist — same contract as pre-bulk_id', () => {
    const c = emptyContainer();
    const after = snapshotEntry(c, 'nonexistent', 'rev-x', T, 'bulk-xyz');
    expect(after).toBe(c);
    expect(after.revisions).toHaveLength(0);
  });
});

describe('getRevisionsByBulkId', () => {
  it('returns all revisions carrying the given bulk_id, ordered by created_at', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'todo', 'T1', T);
    c = addEntry(c, 'e2', 'todo', 'T2', T);
    c = addEntry(c, 'e3', 'text', 'T3', T);
    // 3 entries, 3 revisions with 2 different bulk_ids.
    c = snapshotEntry(c, 'e1', 'rev-1', '2026-01-01T00:00:00Z', 'bulk-A');
    c = snapshotEntry(c, 'e3', 'rev-3', '2026-01-02T00:00:00Z', 'bulk-A');
    c = snapshotEntry(c, 'e2', 'rev-2', '2026-01-03T00:00:00Z', 'bulk-B');

    const groupA = getRevisionsByBulkId(c, 'bulk-A');
    expect(groupA).toHaveLength(2);
    expect(groupA.map((r) => r.id)).toEqual(['rev-1', 'rev-3']);
    const groupB = getRevisionsByBulkId(c, 'bulk-B');
    expect(groupB).toHaveLength(1);
    expect(groupB[0]!.id).toBe('rev-2');
  });

  it('returns empty array when no revision carries the id', () => {
    const c = emptyContainer();
    expect(getRevisionsByBulkId(c, 'does-not-exist')).toEqual([]);
  });

  it('ignores revisions without bulk_id (single-entry snapshots)', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'todo', 'T', T);
    // Single-entry snapshot — no bulk_id attached.
    c = snapshotEntry(c, 'e1', 'rev-single', T);
    // Bulk snapshot on a different entry.
    c = addEntry(c, 'e2', 'todo', 'T2', T);
    c = snapshotEntry(c, 'e2', 'rev-bulk', T, 'bulk-only-e2');

    const group = getRevisionsByBulkId(c, 'bulk-only-e2');
    expect(group.map((r) => r.id)).toEqual(['rev-bulk']);
    // The single-entry revision is absent even though it exists.
    expect(group.some((r) => r.id === 'rev-single')).toBe(false);
  });
});

describe('bulk_id does not affect parse / restore contracts (backward compat)', () => {
  it('parseRevisionSnapshot ignores bulk_id — it only reads the Entry-shaped snapshot', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'text', 'Title', T);
    c = updateEntry(c, 'e1', 'Title', 'Body', T);
    c = snapshotEntry(c, 'e1', 'rev-with-bulk', T, 'bulk-zzz');

    const parsed = parseRevisionSnapshot(c.revisions[0]!);
    expect(parsed).not.toBeNull();
    expect(parsed!.lid).toBe('e1');
    expect(parsed!.title).toBe('Title');
  });

  it('restoreEntry succeeds for a bulk revision exactly as for a single-entry revision', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'todo', 'T', T);
    c = updateEntry(
      c,
      'e1',
      'T',
      JSON.stringify({ status: 'open', description: 'original' }),
      T,
    );
    // Bulk-style snapshot.
    c = snapshotEntry(c, 'e1', 'rev-bulk', T, 'bulk-123');
    // Simulate the bulk mutation: change status.
    c = updateEntry(
      c,
      'e1',
      'T',
      JSON.stringify({ status: 'done', description: 'original' }),
      '2026-04-13T01:00:00Z',
    );

    const restored = restoreEntry(c, 'e1', 'rev-bulk', 'snap-during-restore', '2026-04-13T02:00:00Z');
    const entry = restored.entries.find((e) => e.lid === 'e1');
    expect(entry).toBeDefined();
    expect(entry!.body).toContain('"status":"open"');
  });

  it('restoreDeletedEntry succeeds for a bulk-delete revision', () => {
    let c = emptyContainer();
    c = addEntry(c, 'e1', 'todo', 'T', T);
    c = snapshotEntry(c, 'e1', 'rev-bulk-del', T, 'bulk-del-1');
    c = removeEntry(c, 'e1');
    expect(c.entries).toHaveLength(0);

    const restored = restoreDeletedEntry(c, 'rev-bulk-del', '2026-04-13T01:00:00Z');
    const entry = restored.entries.find((e) => e.lid === 'e1');
    expect(entry).toBeDefined();
    expect(entry!.archetype).toBe('todo');
  });
});
