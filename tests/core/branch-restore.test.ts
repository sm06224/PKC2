import { describe, it, expect } from 'vitest';
import {
  addEntry,
  updateEntry,
  snapshotEntry,
  removeEntry,
  branchRestoreRevision,
} from '@core/operations/container-ops';
import type { Container } from '@core/model/container';

/**
 * C-1 revision-branch-restore v1 — pure slice tests.
 *
 * Contract: `docs/spec/revision-branch-restore-v1-behavior-contract.md`
 *   - §1.3  operation
 *   - §3    I-Rbr1〜10 invariants
 *   - §4.1  provenance metadata schema
 *   - §8    error paths
 */

const T0 = '2026-04-17T00:00:00Z';
const T1 = '2026-04-17T01:00:00Z';
const NOW = '2026-04-17T12:00:00Z';

function baseContainer(): Container {
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

function containerWithHistory(): Container {
  // Build: entry "e1" edited once, so it has 1 revision capturing
  // the pre-edit state ("First" / body "v1 body").
  let c = baseContainer();
  c = addEntry(c, 'e1', 'text', 'First', T0);
  c = updateEntry(c, 'e1', 'First', 'v1 body', T0);
  c = snapshotEntry(c, 'e1', 'rev-1', T1);
  c = updateEntry(c, 'e1', 'Edited Title', 'edited body', T1);
  return c;
}

describe('branchRestoreRevision', () => {
  it('1. creates a new entry from the revision snapshot', () => {
    const c = containerWithHistory();
    const next = branchRestoreRevision(c, 'e1', 'rev-1', 'e2', 'rel-1', NOW);

    expect(next).not.toBe(c);
    expect(next.entries).toHaveLength(2);

    const branched = next.entries.find((e) => e.lid === 'e2');
    expect(branched).toBeDefined();
    expect(branched!.archetype).toBe('text');
  });

  it('2. leaves the source entry unchanged', () => {
    const c = containerWithHistory();
    const sourceBefore = c.entries.find((e) => e.lid === 'e1')!;
    const next = branchRestoreRevision(c, 'e1', 'rev-1', 'e2', 'rel-1', NOW);

    const sourceAfter = next.entries.find((e) => e.lid === 'e1')!;
    expect(sourceAfter).toEqual(sourceBefore);
    expect(sourceAfter.title).toBe('Edited Title');
    expect(sourceAfter.body).toBe('edited body');
    expect(sourceAfter.updated_at).toBe(T1);
  });

  it('3. the new entry uses the injected newLid (not the source lid)', () => {
    const c = containerWithHistory();
    const next = branchRestoreRevision(c, 'e1', 'rev-1', 'branch-lid-xyz', 'rel-1', NOW);

    expect(next.entries.some((e) => e.lid === 'branch-lid-xyz')).toBe(true);
    expect(next.entries.filter((e) => e.lid === 'e1')).toHaveLength(1);
  });

  it('4. copies title / body / archetype from the snapshot verbatim', () => {
    const c = containerWithHistory();
    // rev-1 captured state pre-T1 edit: title='First', body='v1 body'
    const next = branchRestoreRevision(c, 'e1', 'rev-1', 'e2', 'rel-1', NOW);

    const branched = next.entries.find((e) => e.lid === 'e2')!;
    expect(branched.title).toBe('First');
    expect(branched.body).toBe('v1 body');
    expect(branched.archetype).toBe('text');
  });

  it('5. sets created_at / updated_at on the new entry to the injected now', () => {
    const c = containerWithHistory();
    const next = branchRestoreRevision(c, 'e1', 'rev-1', 'e2', 'rel-1', NOW);

    const branched = next.entries.find((e) => e.lid === 'e2')!;
    expect(branched.created_at).toBe(NOW);
    expect(branched.updated_at).toBe(NOW);
    // meta.updated_at also advances on additive mutation
    expect(next.meta.updated_at).toBe(NOW);
  });

  it('6. does not extend the source entry\'s revision chain (cross-entry non-interference)', () => {
    const c = containerWithHistory();
    const next = branchRestoreRevision(c, 'e1', 'rev-1', 'e2', 'rel-1', NOW);

    // Source entry's revisions unchanged
    const sourceRevs = next.revisions.filter((r) => r.entry_lid === 'e1');
    expect(sourceRevs).toHaveLength(1);
    expect(sourceRevs[0]!.id).toBe('rev-1');

    // New entry has no revisions yet (I-Rbr2)
    const branchRevs = next.revisions.filter((r) => r.entry_lid === 'e2');
    expect(branchRevs).toHaveLength(0);

    // Total revisions unchanged
    expect(next.revisions).toHaveLength(c.revisions.length);
  });

  it('7. appends a provenance relation from source → derived (canonical direction)', () => {
    const c = containerWithHistory();
    const next = branchRestoreRevision(c, 'e1', 'rev-1', 'e2', 'rel-1', NOW);

    expect(next.relations).toHaveLength(1);
    const rel = next.relations[0]!;
    expect(rel.id).toBe('rel-1');
    expect(rel.kind).toBe('provenance');
    // I-Rbr9: from = source (elid), to = derived (new entry)
    expect(rel.from).toBe('e1');
    expect(rel.to).toBe('e2');
    expect(rel.created_at).toBe(NOW);
    expect(rel.updated_at).toBe(NOW);

    const meta = rel.metadata as Record<string, string>;
    expect(meta.conversion_kind).toBe('revision-branch');
    expect(meta.converted_at).toBe(NOW);
    expect(meta.source_revision_id).toBe('rev-1');
  });

  it('8a. copies source_content_hash when the revision carries one (H-6+ revisions)', () => {
    const c = containerWithHistory();
    // snapshotEntry always populates content_hash, so rev-1 has it
    const rev1 = c.revisions.find((r) => r.id === 'rev-1')!;
    expect(rev1.content_hash).toBeDefined();

    const next = branchRestoreRevision(c, 'e1', 'rev-1', 'e2', 'rel-1', NOW);
    const meta = next.relations[0]!.metadata as Record<string, string>;
    expect(meta.source_content_hash).toBe(rev1.content_hash);
  });

  it('8b. omits source_content_hash when the revision lacks one (pre-H-6 revisions)', () => {
    // Hand-craft a pre-H-6 revision (no content_hash field).
    let c = baseContainer();
    c = addEntry(c, 'e1', 'text', 'First', T0);
    c = updateEntry(c, 'e1', 'First', 'v1 body', T0);
    c = {
      ...c,
      revisions: [
        {
          id: 'rev-legacy',
          entry_lid: 'e1',
          snapshot: JSON.stringify({
            lid: 'e1',
            title: 'First',
            body: 'v1 body',
            archetype: 'text',
            created_at: T0,
            updated_at: T0,
          }),
          created_at: T0,
          // no content_hash, no prev_rid (legacy)
        },
      ],
    };

    const next = branchRestoreRevision(c, 'e1', 'rev-legacy', 'e2', 'rel-1', NOW);
    const meta = next.relations[0]!.metadata as Record<string, string>;
    expect(meta.conversion_kind).toBe('revision-branch');
    expect(meta.converted_at).toBe(NOW);
    expect(meta.source_revision_id).toBe('rev-legacy');
    expect('source_content_hash' in meta).toBe(false);
  });

  it('9. returns the same container (reference equality) when revisionId is unknown', () => {
    const c = containerWithHistory();
    const next = branchRestoreRevision(c, 'e1', 'nonexistent', 'e2', 'rel-1', NOW);
    expect(next).toBe(c);
  });

  it('10. returns the same container when the source entry does not exist', () => {
    let c = containerWithHistory();
    c = removeEntry(c, 'e1'); // source deleted; rev-1 still exists
    const next = branchRestoreRevision(c, 'e1', 'rev-1', 'e2', 'rel-1', NOW);
    expect(next).toBe(c);
  });

  it('10b. returns the same container when revision.entry_lid mismatches entryLid', () => {
    // Snapshot belongs to e1; caller passes a different entryLid.
    const c = containerWithHistory();
    const next = branchRestoreRevision(c, 'other-lid', 'rev-1', 'e2', 'rel-1', NOW);
    expect(next).toBe(c);
  });

  it('10c. rejects when newLid collides with an existing entry', () => {
    const c = containerWithHistory();
    const next = branchRestoreRevision(c, 'e1', 'rev-1', 'e1', 'rel-1', NOW);
    expect(next).toBe(c);
  });

  it('11. is deterministic: same inputs produce structurally equal output', () => {
    const c = containerWithHistory();
    const a = branchRestoreRevision(c, 'e1', 'rev-1', 'e2', 'rel-1', NOW);
    const b = branchRestoreRevision(c, 'e1', 'rev-1', 'e2', 'rel-1', NOW);
    expect(a).toEqual(b);
    // And it must not mutate the input
    expect(c.entries).toHaveLength(1);
    expect(c.relations).toHaveLength(0);
  });
});
