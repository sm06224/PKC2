/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkAssetDuplicate,
  __assetDedupeCacheSize,
  __resetAssetDedupeCacheForTest,
} from '@adapter/ui/asset-dedupe';
import type { Container } from '@core/model/container';

/**
 * PR #184 — asset dedupe cache contract.
 *
 * The previous implementation re-hashed every asset value on every
 * `checkAssetDuplicate` call, costing O(N) hashes for an O(N²) total
 * across a multi-file drop. The cache memoizes
 *   value-string-ref → hash
 * and
 *   container.entries-ref → Map<asset_key, size>
 * so that a 30-file drop pays N hashes total (not N²).
 *
 * Tests pin:
 *   1. correctness still holds (existing P-1 .. P-7 invariants)
 *   2. cache hit: the same value reference doesn't re-hash on a
 *      subsequent call (proxied by counting fnv1a64Hex calls
 *      indirectly — direct counting requires module mocking which
 *      vitest doesn't gracefully support here, so we use timing
 *      heuristic + correctness preservation as proxies)
 *   3. cache invalidation: changing `container.meta.container_id`
 *      forces re-hashing on next call
 *   4. entries-ref invalidation: a new entries array re-builds the
 *      asset_key→size map (proxied by deleting an attachment entry
 *      and re-checking)
 */

const T = '2026-04-28T00:00:00Z';

function makeContainer(
  cid: string,
  assets: Record<string, string>,
  attachmentBodies: Array<{ assetKey: string; size: number }>,
): Container {
  return {
    meta: { container_id: cid, title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: attachmentBodies.map((b, i) => ({
      lid: `att-${i}`,
      title: `att${i}`,
      archetype: 'attachment' as const,
      body: JSON.stringify({ asset_key: b.assetKey, size: b.size, mime: 'image/png', name: `f${i}` }),
      created_at: T,
      updated_at: T,
    })),
    relations: [],
    revisions: [],
    assets,
  };
}

describe('checkAssetDuplicate — PR #184 cached behaviour', () => {
  beforeEach(() => {
    __resetAssetDedupeCacheForTest();
  });

  it('preserves correctness for hash + size match (P-1 unchanged)', () => {
    const data = btoa('hello world');
    const c = makeContainer('c1', { 'k1': data }, [{ assetKey: 'k1', size: 11 }]);
    expect(checkAssetDuplicate(data, 11, c)).toBe(true);
  });

  it('preserves correctness for hash match + size mismatch', () => {
    const data = btoa('hello world');
    const c = makeContainer('c1', { 'k1': data }, [{ assetKey: 'k1', size: 99 }]);
    expect(checkAssetDuplicate(data, 11, c)).toBe(false);
  });

  it('preserves correctness for hash mismatch', () => {
    const c = makeContainer('c1', { 'k1': btoa('hello') }, [{ assetKey: 'k1', size: 5 }]);
    expect(checkAssetDuplicate(btoa('GOODBYE'), 5, c)).toBe(false);
  });

  it('returns false for null container', () => {
    expect(checkAssetDuplicate('any', 0, null)).toBe(false);
  });

  it('returns false for empty container.assets', () => {
    const c = makeContainer('c1', {}, []);
    expect(checkAssetDuplicate('any', 0, c)).toBe(false);
  });

  it('returns true on cache-hit path: same value ref across two container snapshots', () => {
    const dataA = btoa('A-body');
    const dataB = btoa('B-body');
    // Snapshot 1: only A
    const c1 = makeContainer('c1', { kA: dataA }, [{ assetKey: 'kA', size: 6 }]);
    expect(checkAssetDuplicate(dataA, 6, c1)).toBe(true);

    // Snapshot 2: A (same string ref) + B added. The cache should
    // still recognise dataA from snapshot 1; dataB hits cold.
    const c2 = makeContainer('c1', { kA: dataA, kB: dataB }, [
      { assetKey: 'kA', size: 6 },
      { assetKey: 'kB', size: 6 },
    ]);
    expect(checkAssetDuplicate(dataA, 6, c2)).toBe(true);
    expect(checkAssetDuplicate(dataB, 6, c2)).toBe(true);
  });

  it('container_id swap clears the cache', () => {
    const dataA = btoa('A-body');
    const c1 = makeContainer('c1', { kA: dataA }, [{ assetKey: 'kA', size: 6 }]);
    expect(checkAssetDuplicate(dataA, 6, c1)).toBe(true);

    // Different container_id. Even though dataA is the same string
    // ref, the cache should be cleared and the lookup must operate
    // against c2's assets only.
    const c2 = makeContainer('c2', {}, []);
    expect(checkAssetDuplicate(dataA, 6, c2)).toBe(false);
  });

  it('entries reference change rebuilds the size index', () => {
    const dataA = btoa('A-body');
    // Snapshot 1: one attachment, size 6.
    const c1 = makeContainer('c1', { kA: dataA }, [{ assetKey: 'kA', size: 6 }]);
    expect(checkAssetDuplicate(dataA, 6, c1)).toBe(true);

    // Snapshot 2: same assets, but the attachment's declared size
    // changed (simulating COMMIT_EDIT). The cache by-entries-ref
    // must rebuild the size map.
    const c2 = makeContainer('c1', { kA: dataA }, [{ assetKey: 'kA', size: 99 }]);
    expect(checkAssetDuplicate(dataA, 6, c2)).toBe(false);
    expect(checkAssetDuplicate(dataA, 99, c2)).toBe(true);
  });

  it('safe-biased: malformed attachment body does not throw', () => {
    const dataA = btoa('A-body');
    const c: Container = {
      meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [{
        lid: 'att-0',
        title: 'broken',
        archetype: 'attachment',
        body: '<<not json>>',
        created_at: T,
        updated_at: T,
      }],
      relations: [],
      revisions: [],
      assets: { kA: dataA },
    };
    expect(() => checkAssetDuplicate(dataA, 6, c)).not.toThrow();
  });
});

// 段階4 (#868): with the resident asset-meta index, dedupe detects a
// duplicate of an asset that is NOT in the working-set (container.assets
// partial under lazy loading).
describe('findDuplicateAssetKey — metaIndex path (段階4 #868)', () => {
  beforeEach(() => {
    __resetAssetDedupeCacheForTest();
  });

  it('detects a duplicate of a non-resident asset via the meta index', async () => {
    const { findDuplicateAssetKey } = await import('@adapter/ui/asset-dedupe');
    const { computeAssetMeta } = await import('@features/asset/asset-meta');
    const data = btoa('hello world');
    // Asset 'k1' is referenced by an attachment entry (size known) but its
    // bytes are NOT resident (working-set is empty under lazy loading).
    const c = makeContainer('c1', {}, [{ assetKey: 'k1', size: 11 }]);
    const metaIndex = { k1: computeAssetMeta(data) };

    // Without the index: not found (bytes absent from container.assets).
    expect(findDuplicateAssetKey(data, 11, c)).toBeNull();
    // With the index: detected.
    expect(findDuplicateAssetKey(data, 11, c, metaIndex)).toBe('k1');
  });

  it('falls back to index size when no owner entry is resident', async () => {
    const { findDuplicateAssetKey } = await import('@adapter/ui/asset-dedupe');
    const { computeAssetMeta } = await import('@features/asset/asset-meta');
    const data = btoa('payload');
    const meta = computeAssetMeta(data);
    // No attachment entries at all (e.g. inline text-pasted image).
    const c = makeContainer('c1', {}, []);
    const metaIndex = { k2: meta };
    expect(findDuplicateAssetKey(data, meta.size, c, metaIndex)).toBe('k2');
    // Size mismatch → no false positive.
    expect(findDuplicateAssetKey(data, meta.size + 1, c, metaIndex)).toBeNull();
  });
});

/**
 * B13(2026-07-27):memo が **判定しただけの候補**を掴み続けないこと。
 *
 * 旧実装は `Map<base64本文, hash>` で、キー = base64 本文だった。Map のキーは
 * 強参照なので、**保存もしていない候補ファイル**(重複判定に通しただけの
 * drop / paste)の base64 が上限なく焼き付いた。node 実測で 5MB×20 件を
 * 「判定しただけ」で heapUsed +99.0 MB(修正後 +4.0 MB)。
 *
 * 観測点は保持数(`__assetDedupeCacheSize`)── heap を test で測るのは不安定
 * なので、「memo は**生きている asset の数を超えない**」という構造の性質で pin する。
 */
describe('asset dedupe memo の保持範囲(B13)', () => {
  beforeEach(() => {
    __resetAssetDedupeCacheForTest();
  });

  function containerWith(assets: Record<string, string>): Container {
    return {
      meta: {
        container_id: 'c-b13',
        title: 'C',
        created_at: T,
        updated_at: T,
        schema_version: 1,
      },
      entries: [],
      relations: [],
      revisions: [],
      assets,
    } as unknown as Container;
  }

  it('保存していない候補は memo に残らない', () => {
    const container = containerWith({});
    for (let i = 0; i < 5; i++) {
      expect(checkAssetDuplicate(`candidate-${i}-`.repeat(64), 1024, container)).toBe(false);
    }
    // container.assets は空 ── memo も空でなければ候補を掴んでいる
    expect(__assetDedupeCacheSize()).toBe(0);
  });

  it('memo の保持数は生きている asset を超えない(削除ぶんは落ちる)', () => {
    const assets: Record<string, string> = { a: 'AAAA', b: 'BBBB', c: 'CCCC' };
    const container = containerWith(assets);
    checkAssetDuplicate('ZZZZ', 4, container);
    expect(__assetDedupeCacheSize()).toBe(3);

    delete assets.b;
    checkAssetDuplicate('ZZZZ', 4, container);
    expect(__assetDedupeCacheSize()).toBe(2);
  });

  it('値が差し替わったら hash を取り直す(同じ key の使い回しで誤判定しない)', () => {
    const assets: Record<string, string> = { a: 'AAAA' };
    const container = containerWith(assets);
    const entries = [
      {
        lid: 'e1',
        title: 'a',
        archetype: 'attachment',
        created_at: T,
        updated_at: T,
        body: JSON.stringify({ asset_key: 'a', size: 4 }),
      },
    ];
    (container as unknown as { entries: unknown[] }).entries = entries;

    expect(checkAssetDuplicate('AAAA', 4, container)).toBe(true);
    // 同じ key のまま中身だけ差し替える
    assets.a = 'BBBB';
    expect(checkAssetDuplicate('AAAA', 4, container)).toBe(false);
    expect(checkAssetDuplicate('BBBB', 4, container)).toBe(true);
  });
});
