/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  findDuplicateAssetKey,
  checkAssetDuplicate,
  __resetAssetDedupeCacheForTest,
} from '@adapter/ui/asset-dedupe';
import type { Container } from '@core/model/container';

/**
 * ② ハッシュ重複排除 — `findDuplicateAssetKey`。
 *
 * 重複検出時に「既存 asset_key を返す」ことで、呼び出し側(編集中
 * ファイルドロップ)が新規 attachment / storage を作らず既存を参照
 * (anchor 挿入)できるようにする。`checkAssetDuplicate` は本関数の
 * boolean ラッパー。
 */
const T = '2026-05-21T00:00:00Z';

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

describe('② findDuplicateAssetKey', () => {
  beforeEach(() => {
    __resetAssetDedupeCacheForTest();
  });

  it('hash + size 一致で既存 asset_key を返す', () => {
    const data = btoa('hello world');
    const c = makeContainer('c1', { k1: data }, [{ assetKey: 'k1', size: 11 }]);
    expect(findDuplicateAssetKey(data, 11, c)).toBe('k1');
  });

  it('hash 一致 + size 不一致は null', () => {
    const data = btoa('hello world');
    const c = makeContainer('c1', { k1: data }, [{ assetKey: 'k1', size: 99 }]);
    expect(findDuplicateAssetKey(data, 11, c)).toBeNull();
  });

  it('内容が異なれば(hash 不一致)null', () => {
    const c = makeContainer('c1', { k1: btoa('hello world') }, [{ assetKey: 'k1', size: 11 }]);
    expect(findDuplicateAssetKey(btoa('different content'), 16, c)).toBeNull();
  });

  it('container が null なら null', () => {
    expect(findDuplicateAssetKey(btoa('x'), 1, null)).toBeNull();
  });

  it('assets が空なら null', () => {
    const c = makeContainer('c1', {}, []);
    expect(findDuplicateAssetKey(btoa('x'), 1, c)).toBeNull();
  });

  it('複数 asset のうち一致する key を返す', () => {
    const dataA = btoa('alpha content');
    const dataB = btoa('beta content here');
    const c = makeContainer(
      'c1',
      { ka: dataA, kb: dataB },
      [{ assetKey: 'ka', size: 13 }, { assetKey: 'kb', size: 17 }],
    );
    expect(findDuplicateAssetKey(dataB, 17, c)).toBe('kb');
    expect(findDuplicateAssetKey(dataA, 13, c)).toBe('ka');
  });

  it('checkAssetDuplicate は findDuplicateAssetKey の boolean ラッパー', () => {
    const data = btoa('hello world');
    const match = makeContainer('c1', { k1: data }, [{ assetKey: 'k1', size: 11 }]);
    expect(checkAssetDuplicate(data, 11, match)).toBe(true);
    expect(checkAssetDuplicate(data, 99, match)).toBe(false);
  });
});
