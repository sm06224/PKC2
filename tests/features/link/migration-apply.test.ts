import { describe, it, expect } from 'vitest';
import { buildLinkMigrationPreview } from '@features/link/migration-scanner';
import { applyLinkMigrations } from '@features/link/migration-apply';
import type { LinkMigrationCandidate } from '@features/link/migration-scanner';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

/**
 * Phase 2 Slice 3 — pure apply planner.
 *
 * Pins:
 *   - Applies every v1 kind (A empty-label, B legacy log fragment,
 *     C same-container portable reference).
 *   - Rewrites textlog rows without disturbing row `id` / `createdAt`
 *     / `flags`.
 *   - Multiple candidates in the same body are applied offset-desc
 *     so earlier rewrites don't shift later offsets.
 *   - Stale candidates (source text drifted between preview and
 *     apply) are skipped without throwing; surrounding candidates
 *     still apply.
 *   - Per-entry revision snapshots are recorded with a shared
 *     `bulk_id`, carry the pre-apply JSON snapshot, and carry a
 *     `prev_rid` chain off any prior revision.
 *   - Title / lid / archetype / created_at are never changed.
 */

const T = '2026-04-24T00:00:00Z';
const NOW = '2026-04-24T01:00:00Z';
const SELF = 'c-self';

// Deterministic id supplier — tests never care about the exact
// shape of revision ids as long as they're unique.
function makeIdSupplier(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function text(lid: string, body: string, title: string = `Entry ${lid}`): Entry {
  return { lid, title, body, archetype: 'text', created_at: T, updated_at: T };
}

function attachment(lid: string, name: string, assetKey: string): Entry {
  return {
    lid,
    title: name,
    body: JSON.stringify({ name, mime: 'image/png', size: 10, asset_key: assetKey }),
    archetype: 'attachment',
    created_at: T,
    updated_at: T,
  };
}

function textlog(
  lid: string,
  title: string,
  rows: Array<{ id: string; text: string }>,
): Entry {
  return {
    lid,
    title,
    body: JSON.stringify({
      entries: rows.map((r) => ({
        id: r.id,
        text: r.text,
        createdAt: T,
        flags: [],
      })),
    }),
    archetype: 'textlog',
    created_at: T,
    updated_at: T,
  };
}

function container(entries: Entry[], cid: string = SELF): Container {
  return {
    meta: {
      container_id: cid,
      title: 'Test',
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

function scanSafe(c: Container): readonly LinkMigrationCandidate[] {
  return buildLinkMigrationPreview(c).candidates.filter(
    (x) => x.confidence === 'safe',
  );
}

describe('applyLinkMigrations — Candidate A (empty label)', () => {
  it('rewrites `[](entry:<lid>)` to `[<Entry Title>](entry:<lid>)`', () => {
    const c = container([
      text('src', 'Check [](entry:dst) for details.'),
      text('dst', '', 'Destination'),
    ]);
    const candidates = scanSafe(c);
    const res = applyLinkMigrations(c, candidates, NOW, makeIdSupplier('r'), 'b-1');
    expect(res.applied).toBe(1);
    expect(res.skipped).toBe(0);
    expect(res.entriesAffected).toBe(1);
    const src = res.container.entries.find((e) => e.lid === 'src')!;
    expect(src.body).toBe('Check [Destination](entry:dst) for details.');
    expect(src.updated_at).toBe(NOW);
    expect(src.title).toBe('Entry src');
    expect(src.lid).toBe('src');
    expect(src.archetype).toBe('text');
    expect(src.created_at).toBe(T);
  });

  it('rewrites `[](asset:<key>)` using the attachment name', () => {
    const c = container([
      text('src', '[](asset:ast-001)'),
      attachment('att', 'photo.png', 'ast-001'),
    ]);
    const res = applyLinkMigrations(c, scanSafe(c), NOW, makeIdSupplier('r'), 'b-1');
    expect(res.applied).toBe(1);
    const src = res.container.entries.find((e) => e.lid === 'src')!;
    expect(src.body).toBe('[photo.png](asset:ast-001)');
  });
});

describe('applyLinkMigrations — Candidate B (legacy log fragment)', () => {
  it('rewrites `#<logId>` to `#log/<logId>` when the row exists', () => {
    const c = container([
      text('src', '[memo](entry:tl#log-1)'),
      textlog('tl', 'Work Log', [{ id: 'log-1', text: 'first' }]),
    ]);
    const res = applyLinkMigrations(c, scanSafe(c), NOW, makeIdSupplier('r'), 'b-1');
    expect(res.applied).toBe(1);
    const src = res.container.entries.find((e) => e.lid === 'src')!;
    expect(src.body).toBe('[memo](entry:tl#log/log-1)');
  });
});

describe('applyLinkMigrations — Candidate C (same-container portable reference)', () => {
  it('rewrites `pkc://<self>/entry/<lid>` to `entry:<lid>`', () => {
    const c = container([
      text('src', `[Go](pkc://${SELF}/entry/dst)`),
      text('dst', '', 'Destination'),
    ]);
    const res = applyLinkMigrations(c, scanSafe(c), NOW, makeIdSupplier('r'), 'b-1');
    expect(res.applied).toBe(1);
    const src = res.container.entries.find((e) => e.lid === 'src')!;
    expect(src.body).toBe('[Go](entry:dst)');
  });

  it('rewrites `pkc://<self>/asset/<key>` to `asset:<key>`', () => {
    const c = container([
      text('src', `[file](pkc://${SELF}/asset/ast-001)`),
      attachment('att', 'photo.png', 'ast-001'),
    ]);
    const res = applyLinkMigrations(c, scanSafe(c), NOW, makeIdSupplier('r'), 'b-1');
    expect(res.applied).toBe(1);
    const src = res.container.entries.find((e) => e.lid === 'src')!;
    expect(src.body).toBe('[file](asset:ast-001)');
  });
});

describe('applyLinkMigrations — TEXTLOG row candidates', () => {
  it('rewrites a candidate inside a specific log row without touching other rows', () => {
    const c = container([
      textlog('src-tl', 'Src Log', [
        { id: 'log-1', text: 'see [](entry:dst)' },
        { id: 'log-2', text: 'no link here' },
      ]),
      text('dst', '', 'Destination'),
    ]);
    const res = applyLinkMigrations(c, scanSafe(c), NOW, makeIdSupplier('r'), 'b-1');
    expect(res.applied).toBe(1);
    const parsed = JSON.parse(res.container.entries.find((e) => e.lid === 'src-tl')!.body);
    expect(parsed.entries[0].text).toBe('see [Destination](entry:dst)');
    expect(parsed.entries[1].text).toBe('no link here');
    // Row ids / createdAt / flags must survive verbatim.
    expect(parsed.entries[0].id).toBe('log-1');
    expect(parsed.entries[1].id).toBe('log-2');
    expect(parsed.entries[0].createdAt).toBe(T);
    expect(parsed.entries[0].flags).toEqual([]);
  });
});

describe('applyLinkMigrations — multiple candidates in one body', () => {
  it('applies offset-descending so earlier replacements do not shift later offsets', () => {
    // Two empty-label links in the same body. `after` lengths differ
    // from `before`, so any non-descending pass would mis-apply the
    // second one.
    const c = container([
      text('src', 'A [](entry:dst) B [](entry:dst) C'),
      text('dst', '', 'Destination'),
    ]);
    const res = applyLinkMigrations(c, scanSafe(c), NOW, makeIdSupplier('r'), 'b-1');
    expect(res.applied).toBe(2);
    expect(res.skipped).toBe(0);
    expect(res.entriesAffected).toBe(1);
    const src = res.container.entries.find((e) => e.lid === 'src')!;
    expect(src.body).toBe('A [Destination](entry:dst) B [Destination](entry:dst) C');
  });
});

describe('applyLinkMigrations — stale candidate handling', () => {
  it('skips a candidate whose `before` no longer matches the source text', () => {
    const c = container([text('src', 'different body now')]);
    // Hand-rolled stale candidate — pretending the scanner ran on an
    // older body. The apply path must skip it without throwing.
    const stale: LinkMigrationCandidate = {
      entryLid: 'src',
      archetype: 'text',
      location: { kind: 'body', start: 0, end: 13 },
      kind: 'empty-label',
      before: '[](entry:dst)',
      after: '[Destination](entry:dst)',
      confidence: 'safe',
      reason: '...',
    };
    const res = applyLinkMigrations(c, [stale], NOW, makeIdSupplier('r'), 'b-1');
    expect(res.applied).toBe(0);
    expect(res.skipped).toBe(1);
    expect(res.entriesAffected).toBe(0);
    // No revision should be recorded for a no-op.
    expect(res.container.revisions.length).toBe(0);
    // Body must be untouched.
    expect(res.container.entries[0]!.body).toBe('different body now');
  });

  it('applies the fresh candidate while skipping the stale one', () => {
    const c = container([
      text('src', 'A [](entry:dst) B'),
      text('dst', '', 'Destination'),
    ]);
    const fresh = scanSafe(c)[0]!;
    const stale: LinkMigrationCandidate = {
      ...fresh,
      location: { kind: 'body', start: 100, end: 200 },
    };
    const res = applyLinkMigrations(c, [fresh, stale], NOW, makeIdSupplier('r'), 'b-1');
    expect(res.applied).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.entriesAffected).toBe(1);
    const src = res.container.entries.find((e) => e.lid === 'src')!;
    expect(src.body).toBe('A [Destination](entry:dst) B');
  });

  it('skips a textlog candidate whose row id no longer exists', () => {
    const c = container([
      textlog('tl', 'Work Log', [{ id: 'log-1', text: 'first' }]),
    ]);
    const ghost: LinkMigrationCandidate = {
      entryLid: 'tl',
      archetype: 'textlog',
      location: { kind: 'textlog', logId: 'log-deleted', start: 0, end: 10 },
      kind: 'empty-label',
      before: '[](entry:dst)',
      after: '[x](entry:dst)',
      confidence: 'safe',
      reason: '...',
    };
    const res = applyLinkMigrations(c, [ghost], NOW, makeIdSupplier('r'), 'b-1');
    expect(res.applied).toBe(0);
    expect(res.skipped).toBe(1);
    expect(res.entriesAffected).toBe(0);
  });
});

describe('applyLinkMigrations — revision recording', () => {
  it('records exactly one revision per affected entry, tagged with the shared bulk_id', () => {
    const c = container([
      text('src1', '[](entry:dst)'),
      text('src2', '[](entry:dst)'),
      text('dst', '', 'Destination'),
    ]);
    const res = applyLinkMigrations(c, scanSafe(c), NOW, makeIdSupplier('r'), 'b-1');
    expect(res.entriesAffected).toBe(2);
    const src1Revs = res.container.revisions.filter((r) => r.entry_lid === 'src1');
    const src2Revs = res.container.revisions.filter((r) => r.entry_lid === 'src2');
    expect(src1Revs.length).toBe(1);
    expect(src2Revs.length).toBe(1);
    expect(src1Revs[0]!.bulk_id).toBe('b-1');
    expect(src2Revs[0]!.bulk_id).toBe('b-1');
    // Snapshots contain the pre-apply body.
    expect(src1Revs[0]!.snapshot).toContain('[](entry:dst)');
    expect(src2Revs[0]!.snapshot).toContain('[](entry:dst)');
  });

  it('chains prev_rid off an earlier revision if one exists', () => {
    const c: Container = {
      meta: {
        container_id: SELF,
        title: 'Test',
        created_at: T,
        updated_at: T,
        schema_version: 1,
      },
      entries: [
        text('src', '[](entry:dst)'),
        text('dst', '', 'Destination'),
      ],
      relations: [],
      revisions: [
        {
          id: 'prior-1',
          entry_lid: 'src',
          snapshot: JSON.stringify({ lid: 'src', title: 'Entry src', body: 'old' }),
          created_at: '2026-04-23T00:00:00Z',
        },
      ],
      assets: {},
    };
    const res = applyLinkMigrations(c, scanSafe(c), NOW, makeIdSupplier('r'), 'b-1');
    const newRev = res.container.revisions.find(
      (r) => r.entry_lid === 'src' && r.id !== 'prior-1',
    )!;
    expect(newRev).toBeDefined();
    expect(newRev.prev_rid).toBe('prior-1');
  });

  it('records no revision when the candidate set is empty', () => {
    const c = container([text('src', 'canonical body')]);
    const res = applyLinkMigrations(c, [], NOW, makeIdSupplier('r'), 'b-1');
    expect(res.container.revisions.length).toBe(0);
    expect(res.applied).toBe(0);
    expect(res.entriesAffected).toBe(0);
  });
});

describe('applyLinkMigrations — invariants', () => {
  it('does not mutate the input container', () => {
    const original = container([
      text('src', '[](entry:dst)'),
      text('dst', '', 'Destination'),
    ]);
    const originalBody = original.entries.find((e) => e.lid === 'src')!.body;
    applyLinkMigrations(original, scanSafe(original), NOW, makeIdSupplier('r'), 'b-1');
    // The input's src body string must still be the pre-apply value.
    expect(original.entries.find((e) => e.lid === 'src')!.body).toBe(originalBody);
    expect(original.revisions.length).toBe(0);
  });

  it('never rewrites title / lid / archetype / created_at', () => {
    const c = container([
      text('src', '[](entry:dst)'),
      text('dst', '', 'Destination'),
    ]);
    const before = c.entries.find((e) => e.lid === 'src')!;
    const res = applyLinkMigrations(c, scanSafe(c), NOW, makeIdSupplier('r'), 'b-1');
    const after = res.container.entries.find((e) => e.lid === 'src')!;
    expect(after.lid).toBe(before.lid);
    expect(after.title).toBe(before.title);
    expect(after.archetype).toBe(before.archetype);
    expect(after.created_at).toBe(before.created_at);
  });

  it('empty body and no candidates → returns the container unchanged (identity)', () => {
    const c = container([text('src', '')]);
    const res = applyLinkMigrations(c, [], NOW, makeIdSupplier('r'), 'b-1');
    expect(res.container).toBe(c); // same reference
    expect(res.applied).toBe(0);
    expect(res.skipped).toBe(0);
    expect(res.entriesAffected).toBe(0);
  });
});
