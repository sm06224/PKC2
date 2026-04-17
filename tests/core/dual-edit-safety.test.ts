import { describe, it, expect } from 'vitest';
import {
  addEntry,
  updateEntry,
  snapshotEntry,
  removeEntry,
} from '@core/operations/container-ops';
import {
  captureEditBase,
  checkSaveConflict,
  isSaveSafe,
  branchFromDualEditConflict,
  type EditBaseSnapshot,
} from '@core/operations/dual-edit-safety';
import type { Container } from '@core/model/container';

/**
 * FI-01 dual-edit-safety v1 — pure slice tests.
 *
 * Contract: `docs/spec/dual-edit-safety-v1-behavior-contract.md`
 *   - §2.2  judgement decision table
 *   - §3    pure helpers
 *   - §4    invariants I-Dual1〜10
 *   - §6    provenance direction / metadata
 */

const T0 = '2026-04-17T00:00:00Z';
const T1 = '2026-04-17T01:00:00Z';
const T2 = '2026-04-17T02:00:00Z';
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

function containerWithEntry(): Container {
  // Entry "e1" with 1 revision carrying a content_hash.
  let c = baseContainer();
  c = addEntry(c, 'e1', 'text', 'Title', T0);
  c = updateEntry(c, 'e1', 'Title', 'body v1', T1);
  // snapshotEntry creates a revision for current state with content_hash.
  c = snapshotEntry(c, 'e1', 'rev-1', T1);
  return c;
}

describe('captureEditBase', () => {
  it('1. returns lid / archetype / updated_at for an existing entry', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1');

    expect(base).not.toBeNull();
    expect(base!.lid).toBe('e1');
    expect(base!.archetype).toBe('text');
    expect(base!.updated_at).toBe(T1);
  });

  it('2. populates content_hash from the latest revision when present', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1');

    expect(base!.content_hash).toBeDefined();
    // Matches the revision's hash exactly.
    const latest = c.revisions.find((r) => r.id === 'rev-1')!;
    expect(base!.content_hash).toBe(latest.content_hash);
  });

  it('3. omits content_hash for pre-H-6 revisions (none carry a hash)', () => {
    // Hand-craft a container whose revision lacks content_hash.
    let c = baseContainer();
    c = addEntry(c, 'e1', 'text', 'Title', T0);
    c = updateEntry(c, 'e1', 'Title', 'body', T1);
    // Insert a revision manually WITHOUT content_hash.
    c = {
      ...c,
      revisions: [
        {
          id: 'rev-legacy',
          entry_lid: 'e1',
          snapshot: JSON.stringify(c.entries[0]),
          created_at: T1,
          // intentionally no content_hash
        },
      ],
    };
    const base = captureEditBase(c, 'e1');
    expect(base!.content_hash).toBeUndefined();
  });

  it('4. returns null when the lid does not exist', () => {
    const c = containerWithEntry();
    expect(captureEditBase(c, 'nope')).toBeNull();
  });
});

describe('checkSaveConflict', () => {
  it('5. safe when updated_at matches and hashes agree', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;

    const result = checkSaveConflict(base, c);
    expect(result.kind).toBe('safe');
  });

  it('6. version-mismatch when updated_at differs (primary key)', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;
    // Simulate a concurrent save that advanced the entry.
    const moved = updateEntry(c, 'e1', 'Title', 'body v2', T2);

    const result = checkSaveConflict(base, moved);
    expect(result.kind).toBe('version-mismatch');
    if (result.kind === 'version-mismatch') {
      expect(result.currentUpdatedAt).toBe(T2);
    }
  });

  it('7. version-mismatch when updated_at matches but content_hash differs (auxiliary)', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;
    expect(base.content_hash).toBeDefined();

    // Fake a container whose latest revision has a different hash, but
    // the entry's updated_at is unchanged.
    const divergent: Container = {
      ...c,
      revisions: [
        ...c.revisions.filter((r) => r.id !== 'rev-1'),
        {
          id: 'rev-1',
          entry_lid: 'e1',
          snapshot: c.revisions.find((r) => r.id === 'rev-1')!.snapshot,
          created_at: T1,
          content_hash: 'deadbeefdeadbeef',
        },
      ],
    };

    const result = checkSaveConflict(base, divergent);
    expect(result.kind).toBe('version-mismatch');
    if (result.kind === 'version-mismatch') {
      expect(result.currentUpdatedAt).toBe(T1);
      expect(result.currentContentHash).toBe('deadbeefdeadbeef');
    }
  });

  it('8. safe when updated_at matches and content_hash is missing on one side (pre-H-6 fallback)', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;
    // Drop content_hash from base (simulating a legacy pre-H-6 capture).
    const legacyBase: EditBaseSnapshot = {
      lid: base.lid,
      archetype: base.archetype,
      updated_at: base.updated_at,
    };

    const result = checkSaveConflict(legacyBase, c);
    expect(result.kind).toBe('safe');
  });

  it('9. entry-missing when the base lid is no longer in the container', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;
    const gone = removeEntry(c, 'e1');

    const result = checkSaveConflict(base, gone);
    expect(result.kind).toBe('entry-missing');
  });

  it('10. archetype-changed when the entry archetype was swapped', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;

    const swapped: Container = {
      ...c,
      entries: c.entries.map((e) =>
        e.lid === 'e1' ? { ...e, archetype: 'textlog' } : e,
      ),
    };
    const result = checkSaveConflict(base, swapped);
    expect(result.kind).toBe('archetype-changed');
    if (result.kind === 'archetype-changed') {
      expect(result.currentArchetype).toBe('textlog');
    }
  });

  it('11. isSaveSafe mirrors checkSaveConflict.kind === "safe"', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;
    expect(isSaveSafe(base, c)).toBe(true);

    const moved = updateEntry(c, 'e1', 'Title', 'body v2', T2);
    expect(isSaveSafe(base, moved)).toBe(false);
  });
});

describe('branchFromDualEditConflict', () => {
  const DRAFT = { title: 'My Draft Title', body: 'my draft body content' };

  it('12. creates a new entry with the draft title / body', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;

    const next = branchFromDualEditConflict(
      c, base, DRAFT, 'e2', 'rel-1', NOW,
    );

    expect(next).not.toBe(c);
    expect(next.entries).toHaveLength(2);
    const branch = next.entries.find((e) => e.lid === 'e2');
    expect(branch).toBeDefined();
    expect(branch!.title).toBe('My Draft Title');
    expect(branch!.body).toBe('my draft body content');
    expect(branch!.archetype).toBe('text');
    expect(branch!.created_at).toBe(NOW);
    expect(branch!.updated_at).toBe(NOW);
  });

  it('13. leaves the source entry untouched', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;
    const sourceBefore = c.entries.find((e) => e.lid === 'e1')!;

    const next = branchFromDualEditConflict(
      c, base, DRAFT, 'e2', 'rel-1', NOW,
    );
    const sourceAfter = next.entries.find((e) => e.lid === 'e1')!;
    expect(sourceAfter).toEqual(sourceBefore);
  });

  it('14. appends a provenance relation with canonical direction (base.lid → newLid)', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;

    const next = branchFromDualEditConflict(
      c, base, DRAFT, 'e2', 'rel-1', NOW,
    );
    const rel = next.relations.find((r) => r.id === 'rel-1');
    expect(rel).toBeDefined();
    expect(rel!.kind).toBe('provenance');
    expect(rel!.from).toBe('e1'); // source
    expect(rel!.to).toBe('e2');   // derived
    expect(rel!.created_at).toBe(NOW);
    expect(rel!.updated_at).toBe(NOW);
  });

  it('15. relation metadata carries conversion_kind=concurrent-edit plus source_updated_at', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;

    const next = branchFromDualEditConflict(
      c, base, DRAFT, 'e2', 'rel-1', NOW,
    );
    const rel = next.relations.find((r) => r.id === 'rel-1')!;
    const metadata = rel.metadata as Record<string, string>;

    expect(metadata.conversion_kind).toBe('concurrent-edit');
    expect(metadata.converted_at).toBe(NOW);
    expect(metadata.source_updated_at).toBe(T1);
    expect(metadata.source_content_hash).toBeDefined();
    expect(metadata.source_content_hash).toBe(base.content_hash);
    // source_revision_id MUST NOT be present (I-Dual8 distinction
    // from C-1 branch restore).
    expect(metadata.source_revision_id).toBeUndefined();
  });

  it('16. omits source_content_hash from metadata when base has no hash', () => {
    const c = containerWithEntry();
    const base: EditBaseSnapshot = {
      lid: 'e1', archetype: 'text', updated_at: T1,
      // no content_hash
    };

    const next = branchFromDualEditConflict(
      c, base, DRAFT, 'e2', 'rel-1', NOW,
    );
    const rel = next.relations.find((r) => r.id === 'rel-1')!;
    const metadata = rel.metadata as Record<string, string>;

    expect(metadata.source_content_hash).toBeUndefined();
    expect(metadata.source_updated_at).toBe(T1);
  });

  it('17. still creates the branch entry when the source entry was deleted (entry-missing case)', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;
    const gone = removeEntry(c, 'e1');

    const next = branchFromDualEditConflict(
      gone, base, DRAFT, 'e2', 'rel-1', NOW,
    );
    const branch = next.entries.find((e) => e.lid === 'e2');
    expect(branch).toBeDefined();
    expect(branch!.body).toBe('my draft body content');
    // Provenance relation is recorded with dangling from (intent preservation).
    const rel = next.relations.find((r) => r.id === 'rel-1');
    expect(rel).toBeDefined();
    expect(rel!.from).toBe('e1');
  });

  it('18. rejects (returns the container untouched) when newLid collides', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;

    const next = branchFromDualEditConflict(
      c, base, DRAFT, 'e1', 'rel-1', NOW, // newLid collides with existing
    );
    expect(next).toBe(c);
  });

  it('19. rejects (returns the container untouched) when relationId collides', () => {
    let c = containerWithEntry();
    // Pre-populate a relation with id 'rel-1'.
    c = {
      ...c,
      relations: [
        ...c.relations,
        {
          id: 'rel-1', from: 'e1', to: 'e1',
          kind: 'categorical', created_at: T1, updated_at: T1,
        },
      ],
    };
    const base = captureEditBase(c, 'e1')!;

    const next = branchFromDualEditConflict(
      c, base, DRAFT, 'e2', 'rel-1', NOW,
    );
    expect(next).toBe(c);
  });

  it('20. is deterministic given identical inputs (pure helper contract, I-Dual10)', () => {
    const c = containerWithEntry();
    const base = captureEditBase(c, 'e1')!;

    const r1 = branchFromDualEditConflict(c, base, DRAFT, 'e2', 'rel-1', NOW);
    const r2 = branchFromDualEditConflict(c, base, DRAFT, 'e2', 'rel-1', NOW);

    expect(r1).toEqual(r2);
    // Revisions chain untouched (I-Dual5).
    expect(r1.revisions).toEqual(c.revisions);
  });
});
