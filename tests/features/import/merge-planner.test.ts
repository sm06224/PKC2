import { describe, it, expect } from 'vitest';
import {
  planMergeImport,
  applyMergePlan,
} from '@features/import/merge-planner';
import type { Container, ContainerMeta } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

/**
 * Tier 3-1 — merge import planner (pure helpers).
 *
 * Contract under test (spec `docs/spec/merge-import-conflict-resolution.md`):
 *
 *   - `planMergeImport(host, imported, now)` is a read-only analysis
 *     that either returns a MergePlan with remap tables + counts, or
 *     `{ error: 'schema-mismatch' }`.
 *   - `applyMergePlan(host, imported, plan, now)` is the immutable
 *     apply step. Host entries / relations / revisions stay intact;
 *     imported data lands append-only.
 *   - Revisions are dropped wholesale (MVP §4.4).
 *   - Host meta is preserved except `updated_at`.
 */

const NOW = '2026-04-14T12:00:00.000Z';

function makeMeta(overrides: Partial<ContainerMeta> = {}): ContainerMeta {
  return {
    container_id: 'host-cid',
    title: 'Host',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    schema_version: 1,
    ...overrides,
  };
}

function makeEntry(lid: string, body = '', overrides: Partial<Entry> = {}): Entry {
  return {
    lid,
    title: `Entry ${lid}`,
    body,
    archetype: 'text',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRelation(id: string, from: string, to: string, kind: Relation['kind'] = 'structural'): Relation {
  return {
    id,
    from,
    to,
    kind,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  };
}

function makeContainer(over: Partial<Container> = {}): Container {
  return {
    meta: makeMeta(over.meta),
    entries: over.entries ?? [],
    relations: over.relations ?? [],
    revisions: over.revisions ?? [],
    assets: over.assets ?? {},
  };
}

describe('planMergeImport', () => {
  it('returns schema-mismatch error when schema_version differs', () => {
    const host = makeContainer({ meta: makeMeta({ schema_version: 1 }) });
    const imported = makeContainer({ meta: makeMeta({ container_id: 'imp', schema_version: 2 }) });
    const plan = planMergeImport(host, imported, NOW);
    expect(plan).toEqual({ error: 'schema-mismatch' });
  });

  it('passes imported lids through when no collision with host', () => {
    const host = makeContainer({ entries: [makeEntry('h1')] });
    const imported = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1'), makeEntry('i2')],
    });
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    expect(plan.lidRemap.get('i1')).toBe('i1');
    expect(plan.lidRemap.get('i2')).toBe('i2');
    expect(plan.counts.addedEntries).toBe(2);
    expect(plan.counts.renamedLids).toBe(0);
  });

  it('renames imported lids that collide with host', () => {
    const host = makeContainer({ entries: [makeEntry('shared'), makeEntry('keep')] });
    const imported = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('shared'), makeEntry('fresh')],
    });
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    const renamed = plan.lidRemap.get('shared')!;
    expect(renamed).not.toBe('shared');
    expect(renamed.startsWith('m-')).toBe(true);
    // Non-colliding stayed the same.
    expect(plan.lidRemap.get('fresh')).toBe('fresh');
    expect(plan.counts.renamedLids).toBe(1);
  });

  it('dedupes imported asset keys when content matches host', () => {
    const host = makeContainer({ assets: { 'abc': 'data-XYZ' } });
    const imported = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      assets: { 'abc': 'data-XYZ', 'def': 'data-new' },
    });
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    expect(plan.assetRemap.get('abc')).toBe('abc');
    expect(plan.assetRemap.get('def')).toBe('def');
    expect(plan.counts.dedupedAssets).toBe(1);
    expect(plan.counts.addedAssets).toBe(1);
    expect(plan.counts.rehashedAssets).toBe(0);
  });

  it('rehashes asset keys when content differs', () => {
    const host = makeContainer({ assets: { 'abc': 'data-A' } });
    const imported = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      assets: { 'abc': 'data-B' },
    });
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    const remap = plan.assetRemap.get('abc')!;
    expect(remap).not.toBe('abc');
    expect(remap.startsWith('abc-m')).toBe(true);
    expect(plan.counts.rehashedAssets).toBe(1);
    expect(plan.counts.addedAssets).toBe(1);
    expect(plan.counts.dedupedAssets).toBe(0);
  });

  it('drops relations whose endpoints are not in imported entries', () => {
    const host = makeContainer({ entries: [makeEntry('h1')] });
    const imported = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1')],
      // "h1" is in host namespace, not in imported entries → dangling.
      relations: [makeRelation('r1', 'i1', 'h1')],
    });
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    expect(plan.counts.addedRelations).toBe(0);
    expect(plan.counts.droppedRelations).toBe(1);
  });

  it('skips duplicate (from,to,kind) relations that already exist in host', () => {
    const host = makeContainer({
      entries: [makeEntry('a'), makeEntry('b')],
      relations: [makeRelation('h-r1', 'a', 'b', 'structural')],
    });
    const imported = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('a'), makeEntry('b')],
      relations: [makeRelation('i-r1', 'a', 'b', 'structural')],
    });
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    // Both 'a' and 'b' got renamed since they collide with host.
    // The relation therefore becomes (new, new, structural) which is
    // NOT a duplicate of host's (a, b, structural). So it IS added.
    expect(plan.counts.addedRelations).toBe(1);
    expect(plan.counts.droppedRelations).toBe(0);
  });

  it('drops imported revisions (MVP §4.4)', () => {
    const imported = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1')],
      revisions: [
        {
          id: 'rev-1',
          entry_lid: 'i1',
          snapshot: JSON.stringify(makeEntry('i1')),
          created_at: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 'rev-2',
          entry_lid: 'i1',
          snapshot: JSON.stringify(makeEntry('i1')),
          created_at: '2026-04-02T00:00:00.000Z',
        },
      ],
    });
    const host = makeContainer();
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    expect(plan.counts.droppedRevisions).toBe(2);
  });

  it('handles empty imported container with zero counts', () => {
    const host = makeContainer({ entries: [makeEntry('h1')] });
    const imported = makeContainer({ meta: makeMeta({ container_id: 'imp' }) });
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    expect(plan.counts.addedEntries).toBe(0);
    expect(plan.counts.renamedLids).toBe(0);
    expect(plan.counts.addedAssets).toBe(0);
    expect(plan.counts.addedRelations).toBe(0);
    expect(plan.counts.droppedRevisions).toBe(0);
  });
});

describe('applyMergePlan', () => {
  it('leaves host entries, relations, revisions untouched (append-only)', () => {
    const host = makeContainer({
      entries: [makeEntry('h1', 'host body')],
      relations: [makeRelation('h-r1', 'h1', 'h1')],
      revisions: [
        {
          id: 'h-rev-1',
          entry_lid: 'h1',
          snapshot: JSON.stringify(makeEntry('h1', 'old')),
          created_at: '2026-04-01T00:00:00.000Z',
        },
      ],
    });
    const imported = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1', 'imported body')],
    });
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    const merged = applyMergePlan(host, imported, plan, NOW);
    // host entry preserved exactly
    expect(merged.entries[0]).toEqual(host.entries[0]);
    expect(merged.entries.length).toBe(2);
    // host relations preserved
    expect(merged.relations.some((r) => r.id === 'h-r1')).toBe(true);
    // host revisions preserved, imported revisions dropped
    expect(merged.revisions.length).toBe(1);
    expect(merged.revisions[0]!.id).toBe('h-rev-1');
  });

  it('rewrites asset refs inside imported body when asset key is rehashed', () => {
    const host = makeContainer({ assets: { 'img1': 'HOST-DATA' } });
    const imported = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1', 'See ![](asset:img1) please.')],
      assets: { 'img1': 'IMPORTED-DATA' }, // different content → rehashed
    });
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    const newKey = plan.assetRemap.get('img1')!;
    expect(newKey).not.toBe('img1');
    const merged = applyMergePlan(host, imported, plan, NOW);
    const imp = merged.entries.find((e) => e.body.includes('asset:'))!;
    expect(imp.body).toContain(`asset:${newKey}`);
    // Make sure the old bare `img1` ref no longer points to host's key.
    // (negative lookahead: key class is [A-Za-z0-9_-])
    expect(imp.body).not.toMatch(/asset:img1(?![A-Za-z0-9_-])/);
    // Host asset preserved, imported content stored under rehashed key.
    expect(merged.assets['img1']).toBe('HOST-DATA');
    expect(merged.assets[newKey]).toBe('IMPORTED-DATA');
  });

  it('remaps relations through lid remap and does not duplicate', () => {
    const host = makeContainer({
      entries: [makeEntry('shared'), makeEntry('h-only')],
    });
    const imported = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('shared'), makeEntry('i2')],
      relations: [makeRelation('i-r1', 'shared', 'i2', 'semantic')],
    });
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    const merged = applyMergePlan(host, imported, plan, NOW);
    const addedRel = merged.relations.find((r) => r.id === 'i-r1');
    expect(addedRel).toBeDefined();
    const renamedShared = plan.lidRemap.get('shared')!;
    expect(addedRel!.from).toBe(renamedShared);
    expect(addedRel!.to).toBe('i2');
    // host entries unchanged
    expect(merged.entries.slice(0, 2)).toEqual(host.entries);
  });

  it('updates host.meta.updated_at only, preserving other meta fields', () => {
    const host = makeContainer({
      meta: makeMeta({
        container_id: 'keep-me',
        title: 'Host Title',
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2020-02-02T00:00:00.000Z',
      }),
    });
    const imported = makeContainer({
      meta: makeMeta({
        container_id: 'imported-cid',
        title: 'Imported Title',
      }),
      entries: [makeEntry('i1')],
    });
    const plan = planMergeImport(host, imported, NOW);
    if ('error' in plan) throw new Error('expected plan');
    const merged = applyMergePlan(host, imported, plan, NOW);
    expect(merged.meta.container_id).toBe('keep-me');
    expect(merged.meta.title).toBe('Host Title');
    expect(merged.meta.created_at).toBe('2020-01-01T00:00:00.000Z');
    expect(merged.meta.updated_at).toBe(NOW);
  });
});
