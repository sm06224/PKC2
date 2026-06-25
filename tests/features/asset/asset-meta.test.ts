import { describe, it, expect } from 'vitest';
import { computeAssetMeta, totalIndexBytes, type AssetMetaIndex } from '@features/asset/asset-meta';
import { estimateBase64Size } from '@features/asset/storage-profile';
import { fnv1a64Hex } from '@core/operations/hash';
import { collectOrphanAssetKeys } from '@features/asset/asset-scan';
import { buildStorageProfile } from '@features/asset/storage-profile';
import type { Container } from '@core/model/container';

const T = '2026-06-25T00:00:00Z';

describe('computeAssetMeta (段階4 #868)', () => {
  it('derives size (estimateBase64Size) and hash (fnv1a64Hex)', () => {
    const b64 = 'QkFTRTY0REFUQQ==';
    expect(computeAssetMeta(b64)).toEqual({
      size: estimateBase64Size(b64),
      hash: fnv1a64Hex(b64),
    });
  });

  it('totalIndexBytes sums sizes across the index', () => {
    const idx: AssetMetaIndex = {
      a: { size: 10, hash: 'x' },
      b: { size: 25, hash: 'y' },
    };
    expect(totalIndexBytes(idx)).toBe(35);
  });
});

describe('collectOrphanAssetKeys with full-store key universe (段階4 #868)', () => {
  function c(body: string, assets: Record<string, string>): Container {
    return {
      meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [{ lid: 'e1', title: 'A', body, archetype: 'text', created_at: T, updated_at: T }],
      relations: [],
      revisions: [],
      assets,
    };
  }

  it('counts orphans across allAssetKeys even when container.assets is partial', () => {
    // Working-set holds only the referenced asset; 'orphan-1/2' are in the
    // store (full key set) but not resident.
    const container = c('![x](asset:ref-1)', { 'ref-1': 'RESIDENT' });
    const allKeys = ['ref-1', 'orphan-1', 'orphan-2'];
    const orphans = collectOrphanAssetKeys(container, allKeys);
    expect([...orphans].sort()).toEqual(['orphan-1', 'orphan-2']);
  });

  it('falls back to container.assets keys when no universe supplied', () => {
    const container = c('![x](asset:ref-1)', { 'ref-1': 'R', 'stray': 'S' });
    const orphans = collectOrphanAssetKeys(container);
    expect([...orphans]).toEqual(['stray']);
  });
});

describe('buildStorageProfile with full-store sizes (段階4 #868)', () => {
  function c(): Container {
    return {
      meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [
        {
          lid: 'att-1',
          title: 'Pic',
          body: JSON.stringify({ name: 'p.png', mime: 'image/png', size: 9, asset_key: 'k-1' }),
          archetype: 'attachment',
          created_at: T,
          updated_at: T,
        },
      ],
      relations: [],
      revisions: [],
      // Working-set is EMPTY (lazy boot) — without the size index the
      // profile would report 0 bytes.
      assets: {},
    };
  }

  it('reports totals from the supplied size index, not the partial working-set', () => {
    const sizes = { 'k-1': 1234 };
    const profile = buildStorageProfile(c(), sizes);
    expect(profile.summary.assetCount).toBe(1);
    expect(profile.summary.totalBytes).toBe(1234);
  });

  it('reports near-zero without the index (documents the lazy degrade)', () => {
    const profile = buildStorageProfile(c());
    expect(profile.summary.assetCount).toBe(0); // working-set empty
    expect(profile.summary.totalBytes).toBe(0);
  });
});
