/**
 * asset-meta 索引の逐次 persist とペーシング(2026-07-27、user 報告
 * 「500MB・添付多め・起動直後に OOM」への対応)。
 *
 * ## 何を守るか
 *
 * 従来の backfill は索引の永続化が **全件走査の完了後 1 回だけ**だった。
 * OOM / タブ close で走査が中断すると進捗ゼロに戻り、**次の起動がまた全添付を
 * 頭から読む** ── 走査が一度も完走できない環境では、起動のたびに全量を
 * 読み直し続ける増幅器になっていた。
 *
 * 本 test が pin するのは 2 つ:
 *   1. **逐次 persist** ── 大量 asset の走査中に索引が途中保存される
 *   2. **中断からの再開** ── 走査が途中で死んでも、次の mount は
 *      保存済みの分を読み直さない(続きだけ読む)
 *
 * ⚠ バッチ間の 50ms yield は少数 asset(< 8 件)では発火しないため、
 * 既存 suite(asset-meta-index.test.ts)の挙動は変わらない。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { createMemoryStore } from '@adapter/platform/idb-store';
import {
  mountAssetMetaIndex,
  getResidentAssetMeta,
  __resetAssetMetaIndexForTest,
} from '@adapter/platform/asset-meta-index';
import type { Container } from '@core/model/container';

const T = '2026-07-27T00:00:00Z';
const N = 80; // PERSIST_EVERY(32)を 2 回跨ぐ規模

function container(): Container {
  return {
    meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [{ lid: 'e1', title: 'A', body: '', archetype: 'text', created_at: T, updated_at: T }],
    relations: [],
    revisions: [],
    assets: {},
  };
}

async function seed(store: ReturnType<typeof createMemoryStore>): Promise<void> {
  for (let i = 0; i < N; i++) {
    await store.saveAsset('c1', `k${String(i).padStart(3, '0')}`, `BYTES-${i}-${'x'.repeat(64)}`);
  }
}

beforeEach(() => __resetAssetMetaIndexForTest());

describe('asset-meta 索引 ── 逐次 persist(OOM 中断への耐性)', () => {
  it('🔴 大量 asset の走査中に索引が途中保存される(完了後 1 回だけではない)', async () => {
    const store = createMemoryStore();
    await seed(store);
    const saves = vi.spyOn(store, 'saveAssetMeta');

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const mgr = mountAssetMetaIndex(dispatcher, store);
    await mgr.reconcile();
    mgr.dispose();

    // 80 件 / PERSIST_EVERY=32 → 途中保存 2 回 + 完了時 1 回以上
    expect(saves.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(getResidentAssetMeta('c1')!)).toHaveLength(N);
  });

  it('🔴 走査が途中で死んでも、次の mount は保存済みの分を読み直さない', async () => {
    const store = createMemoryStore();
    await seed(store);

    // 1 回目: 50 件目で store 読出が死ぬ(OOM / タブ close 相当)。
    // reconcile は例外を握って終わる(進捗は途中保存の分だけ残る)。
    let reads1 = 0;
    const origLoad = store.loadAsset.bind(store);
    const dying = vi.spyOn(store, 'loadAsset').mockImplementation(async (cid, key) => {
      reads1++;
      if (reads1 > 50) throw new Error('simulated OOM');
      return origLoad(cid, key);
    });
    const d1 = createDispatcher();
    d1.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const m1 = mountAssetMetaIndex(d1, store);
    await m1.reconcile();
    m1.dispose();
    dying.mockRestore();

    const persisted = await store.loadAssetMeta('c1');
    expect(persisted).not.toBeNull();
    const persistedCount = Object.keys(persisted!).length;
    // 32 件時点の途中保存が残っている(0 に戻っていない)
    expect(persistedCount).toBeGreaterThanOrEqual(32);
    expect(persistedCount).toBeLessThan(N);

    // 2 回目の mount: 続きだけ読む(保存済みの分を読み直さない)
    __resetAssetMetaIndexForTest();
    let reads2 = 0;
    vi.spyOn(store, 'loadAsset').mockImplementation(async (cid, key) => {
      reads2++;
      return origLoad(cid, key);
    });
    const d2 = createDispatcher();
    d2.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const m2 = mountAssetMetaIndex(d2, store);
    await m2.reconcile();
    m2.dispose();

    expect(reads2).toBe(N - persistedCount);
    expect(Object.keys(getResidentAssetMeta('c1')!)).toHaveLength(N);
  });
});
