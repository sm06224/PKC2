/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFilterIndexes,
  __resetFilterIndexCacheForTest,
} from '@adapter/ui/filter-cache';
import type { Container } from '@core/model/container';

/**
 * PR #189 — filter-pipeline cache contract.
 *
 * The cache memoizes three derived Sets keyed by container reference:
 *   - hiddenBucketLids (bucket folders + descendants → treeHide)
 *   - bucketChildLids  (entries whose parent is a bucket → searchHide)
 *   - unreferencedAttachmentLids (cleanup lens)
 *
 * Tests pin:
 *   1. Identity-stable cache across repeated calls with the same
 *      container reference (no rebuild) — proxied by reference
 *      equality of the returned Sets
 *   2. Cache invalidates when the container reference changes
 *   3. hiddenBucketLids includes bucket folder + every descendant
 *   4. bucketChildLids contains direct children of bucket folders
 *      (NOT the bucket folder itself, NOT transitive grandchildren)
 *   5. unreferencedAttachmentLids matches collectUnreferencedAttachmentLids
 */

const T = '2026-04-28T00:00:00Z';

beforeEach(() => {
  __resetFilterIndexCacheForTest();
});

function makeContainer(): Container {
  return {
    meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'fld', title: 'Project', archetype: 'folder', body: '', created_at: T, updated_at: T },
      { lid: 'asts', title: 'ASSETS', archetype: 'folder', body: '', created_at: T, updated_at: T },
      { lid: 'a1', title: 'pic.png', archetype: 'attachment',
        body: JSON.stringify({ name: 'p', mime: 'image/png', size: 4, asset_key: 'k1' }),
        created_at: T, updated_at: T },
      { lid: 'a2', title: 'doc.pdf', archetype: 'attachment',
        body: JSON.stringify({ name: 'd', mime: 'application/pdf', size: 4, asset_key: 'k2' }),
        created_at: T, updated_at: T },
      { lid: 'note', title: 'Note', archetype: 'text', body: 'hi', created_at: T, updated_at: T },
    ],
    relations: [
      { id: 'r1', from: 'fld', to: 'asts', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r2', from: 'asts', to: 'a1', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r3', from: 'asts', to: 'a2', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r4', from: 'fld', to: 'note', kind: 'structural', created_at: T, updated_at: T },
    ],
    revisions: [],
    assets: { k1: 'data1', k2: 'data2' },
  };
}

describe('filter-cache (PR #189)', () => {
  it('returns the same Set reference on repeated calls with the same container ref', () => {
    const c = makeContainer();
    const a = getFilterIndexes(c);
    const b = getFilterIndexes(c);
    expect(b.hiddenBucketLids).toBe(a.hiddenBucketLids);
    expect(b.bucketChildLids).toBe(a.bucketChildLids);
    expect(b.unreferencedAttachmentLids).toBe(a.unreferencedAttachmentLids);
  });

  it('invalidates the cache when the container reference changes', () => {
    const c1 = makeContainer();
    const a = getFilterIndexes(c1);
    const c2: Container = { ...c1 }; // new ref, same content
    const b = getFilterIndexes(c2);
    expect(b.hiddenBucketLids).not.toBe(a.hiddenBucketLids);
  });

  it('hiddenBucketLids includes bucket folder + every descendant', () => {
    const c = makeContainer();
    const idx = getFilterIndexes(c);
    expect(idx.hiddenBucketLids.has('asts')).toBe(true);  // bucket folder itself
    expect(idx.hiddenBucketLids.has('a1')).toBe(true);    // direct child
    expect(idx.hiddenBucketLids.has('a2')).toBe(true);    // sibling
    expect(idx.hiddenBucketLids.has('note')).toBe(false); // outside ASSETS
    expect(idx.hiddenBucketLids.has('fld')).toBe(false);  // ancestor of ASSETS
  });

  it('bucketChildLids contains direct children of bucket folders only', () => {
    const c = makeContainer();
    const idx = getFilterIndexes(c);
    expect(idx.bucketChildLids.has('a1')).toBe(true);
    expect(idx.bucketChildLids.has('a2')).toBe(true);
    expect(idx.bucketChildLids.has('asts')).toBe(false); // bucket itself
    expect(idx.bucketChildLids.has('note')).toBe(false); // not under bucket
  });

  it('unreferencedAttachmentLids surfaces attachments with no body-link references', () => {
    const c = makeContainer();
    const idx = getFilterIndexes(c);
    // Both attachments are structural children of ASSETS but no
    // entry body references them via `asset:` link → both surface
    // as unreferenced (the lens's intended target — orphaned
    // attachments the user can bulk-delete).
    expect(idx.unreferencedAttachmentLids.has('a1')).toBe(true);
    expect(idx.unreferencedAttachmentLids.has('a2')).toBe(true);
  });

  it('handles container with no bucket folders', () => {
    const c: Container = {
      meta: { container_id: 'c2', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [
        { lid: 'n1', title: 'note', archetype: 'text', body: '', created_at: T, updated_at: T },
      ],
      relations: [],
      revisions: [],
      assets: {},
    };
    const idx = getFilterIndexes(c);
    expect(idx.hiddenBucketLids.size).toBe(0);
    expect(idx.bucketChildLids.size).toBe(0);
  });

  it('TODOS bucket also recognized', () => {
    const c: Container = {
      meta: { container_id: 'c3', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [
        { lid: 'todos', title: 'TODOS', archetype: 'folder', body: '', created_at: T, updated_at: T },
        { lid: 't1', title: 'todo', archetype: 'todo',
          body: '{"status":"open","description":"x"}', created_at: T, updated_at: T },
      ],
      relations: [
        { id: 'r1', from: 'todos', to: 't1', kind: 'structural', created_at: T, updated_at: T },
      ],
      revisions: [],
      assets: {},
    };
    const idx = getFilterIndexes(c);
    expect(idx.hiddenBucketLids.has('todos')).toBe(true);
    expect(idx.hiddenBucketLids.has('t1')).toBe(true);
    expect(idx.bucketChildLids.has('t1')).toBe(true);
  });

  // ── PR #192 relation-derived caches ──
  it('PR #192: backlinkCounts is cached by container ref', () => {
    const c = makeContainer();
    const a = getFilterIndexes(c);
    const b = getFilterIndexes(c);
    expect(b.backlinkCounts).toBe(a.backlinkCounts);
  });

  it('PR #192: backlinkCounts contains incoming relation counts per target', () => {
    const c = makeContainer();
    const idx = getFilterIndexes(c);
    // a1 has 1 incoming (asts → a1)
    expect(idx.backlinkCounts.get('a1')).toBeGreaterThanOrEqual(1);
    // asts has 1 incoming (fld → asts)
    expect(idx.backlinkCounts.get('asts')).toBeGreaterThanOrEqual(1);
    // fld has 0 incoming
    expect(idx.backlinkCounts.get('fld') ?? 0).toBe(0);
  });

  it('PR #192: connectedLids contains lids from any relation end', () => {
    const c = makeContainer();
    const idx = getFilterIndexes(c);
    expect(idx.connectedLids.has('fld')).toBe(true);   // from end of r1
    expect(idx.connectedLids.has('asts')).toBe(true);  // both ends
    expect(idx.connectedLids.has('a1')).toBe(true);    // to end
    expect(idx.connectedLids.has('note')).toBe(true);  // to end of r4
  });

  it('PR #192: relation-derived cache invalidates with container ref', () => {
    const c1 = makeContainer();
    const a = getFilterIndexes(c1);
    const c2: Container = { ...c1 };
    const b = getFilterIndexes(c2);
    expect(b.backlinkCounts).not.toBe(a.backlinkCounts);
    expect(b.connectedLids).not.toBe(a.connectedLids);
  });
});
