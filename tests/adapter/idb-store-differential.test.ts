/**
 * @vitest-environment happy-dom
 *
 * 差分保存(改善バッチ④ 2026-07)— ContainerStore.saveDiff / split 形式の
 * end-to-end test。memory adapter を put/delete 計数プロキシで包み、
 * 「変更した entry だけが書かれる」ことを storage 観測点で assert する。
 * さらに legacy(inline)⇄ split の双方向移行と順序復元の忠実性を確認。
 */
import { describe, it, expect } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import type { StorageAdapter, StorageBucket, BatchOp, BucketName } from '@adapter/platform/storage/storage-adapter';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-13T00:00:00Z';

function entry(lid: string, title: string, body = ''): Entry {
  return { lid, title, body, archetype: 'text', created_at: T, updated_at: T };
}

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-diff', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    // 順序が辞書順と異なる並びにして、復元が order リスト経由なことを確認
    entries: [entry('e3', 'C'), entry('e1', 'A'), entry('e2', 'B')],
    relations: [
      { id: 'r1', from: 'e3', to: 'e1', kind: 'structural', created_at: T, updated_at: T },
    ],
    revisions: [
      { id: 'v2', entry_lid: 'e1', snapshot: 's2', created_at: T },
      { id: 'v1', entry_lid: 'e1', snapshot: 's1', created_at: T },
    ],
    assets: {},
  };
}

/** adapter を包んで containers bucket の書込みを記録する。 */
function countingAdapter(): { adapter: StorageAdapter; writes: string[]; deletes: string[] } {
  const inner = createMemoryAdapter();
  const writes: string[] = [];
  const deletes: string[] = [];
  function wrap(bucket: StorageBucket, record: boolean): StorageBucket {
    return {
      ...bucket,
      put: (key, value) => {
        if (record) writes.push(key);
        return bucket.put(key, value);
      },
      delete: (key) => {
        if (record) deletes.push(key);
        return bucket.delete(key);
      },
      applyBatch: (ops: BatchOp[]) => {
        if (record) {
          for (const op of ops) (op.kind === 'put' ? writes : deletes).push(op.key);
        }
        return bucket.applyBatch(ops);
      },
    };
  }
  return {
    adapter: {
      bucket: (name: BucketName) => wrap(inner.bucket(name), name === 'containers'),
      close: () => inner.close(),
    },
    writes,
    deletes,
  };
}

describe('ContainerStore.saveDiff(差分保存)', () => {
  it('初回(previous=null)は全件を split 形式で書き、load で配列順まで忠実に復元', async () => {
    const store = createContainerStore(createMemoryAdapter());
    const c = makeContainer();
    await store.saveDiff(c, null);
    const loaded = await store.load('c-diff');
    expect(loaded).not.toBeNull();
    expect(loaded!.entries.map((e) => e.lid)).toEqual(['e3', 'e1', 'e2']);
    expect(loaded!.revisions.map((r) => r.id)).toEqual(['v2', 'v1']);
    expect(loaded!.relations).toEqual(c.relations);
    expect(loaded!.meta).toEqual(c.meta);
    // loadDefault / loadShallow も同経路
    const shallow = await store.loadDefaultShallow();
    expect(shallow!.entries.map((e) => e.lid)).toEqual(['e3', 'e1', 'e2']);
    expect(shallow!.assets).toEqual({});
  });

  it('2 回目は変更された entry / 追加 revision だけを書く(未変更は書かない)', async () => {
    const { adapter, writes } = countingAdapter();
    const store = createContainerStore(adapter);
    const c1 = makeContainer();
    await store.saveDiff(c1, null);
    writes.length = 0;

    // e1 だけ変更(immutable update:他 entry は参照を共有)+ revision 追加
    const c2: Container = {
      ...c1,
      entries: c1.entries.map((e) => (e.lid === 'e1' ? { ...e, body: 'edited' } : e)),
      revisions: [...c1.revisions, { id: 'v3', entry_lid: 'e1', snapshot: 'edited', created_at: T }],
    };
    await store.saveDiff(c2, c1);

    const entryWrites = writes.filter((k) => k.startsWith('__entry__:'));
    const revWrites = writes.filter((k) => k.startsWith('__rev__:'));
    expect(entryWrites).toEqual(['__entry__:c-diff:e1']);
    expect(revWrites).toEqual(['__rev__:c-diff:v3']);
    // core record + default pointer は毎回
    expect(writes).toContain('c-diff');
    expect(writes).toContain('__default__');

    const loaded = await store.load('c-diff');
    expect(loaded!.entries.find((e) => e.lid === 'e1')!.body).toBe('edited');
    expect(loaded!.revisions.map((r) => r.id)).toEqual(['v2', 'v1', 'v3']);
  });

  it('entry 削除は差分として delete され、load から消える', async () => {
    const { adapter, deletes } = countingAdapter();
    const store = createContainerStore(adapter);
    const c1 = makeContainer();
    await store.saveDiff(c1, null);
    deletes.length = 0;

    const c2: Container = { ...c1, entries: c1.entries.filter((e) => e.lid !== 'e2') };
    await store.saveDiff(c2, c1);
    expect(deletes).toContain('__entry__:c-diff:e2');
    const loaded = await store.load('c-diff');
    expect(loaded!.entries.map((e) => e.lid)).toEqual(['e3', 'e1']);
  });

  it('legacy(inline)→ split 移行:save() 済みの storage に saveDiff しても load が一致', async () => {
    const store = createContainerStore(createMemoryAdapter());
    const c1 = makeContainer();
    await store.save(c1); // inline 形式
    const c2: Container = {
      ...c1,
      entries: c1.entries.map((e) => (e.lid === 'e1' ? { ...e, body: 'x' } : e)),
    };
    // previous を渡しても storage が inline なら全件書込みへフォールバック
    await store.saveDiff(c2, c1);
    const loaded = await store.load('c-diff');
    expect(loaded!.entries.map((e) => e.lid)).toEqual(['e3', 'e1', 'e2']);
    expect(loaded!.entries.find((e) => e.lid === 'e1')!.body).toBe('x');
  });

  it('split → legacy 復帰:save() が inline へ書き戻し、split keys を掃除する', async () => {
    const adapter = createMemoryAdapter();
    const store = createContainerStore(adapter);
    const c1 = makeContainer();
    await store.saveDiff(c1, null);
    // split record が存在することを前提確認
    const before = await adapter.bucket('containers').getKeysByPrefix('__entry__:');
    expect(before.length).toBe(3);

    await store.save(c1); // flag OFF 相当:inline へ
    const after = await adapter.bucket('containers').getKeysByPrefix('__entry__:');
    const afterRev = await adapter.bucket('containers').getKeysByPrefix('__rev__:');
    expect(after).toEqual([]);
    expect(afterRev).toEqual([]);
    const loaded = await store.load('c-diff');
    expect(loaded!.entries.map((e) => e.lid)).toEqual(['e3', 'e1', 'e2']);
  });

  it('inline 復帰後に stale な previous で saveDiff しても全件書込みで自己回復(データ欠損なし)', async () => {
    const store = createContainerStore(createMemoryAdapter());
    const c1 = makeContainer();
    await store.saveDiff(c1, null); // split
    await store.save(c1); // inline へ復帰(split keys 掃除)
    // caller が古い diff ベースを持ったまま saveDiff → marker 不在検出 → 全件
    const c2: Container = {
      ...c1,
      entries: c1.entries.map((e) => (e.lid === 'e2' ? { ...e, body: 'y' } : e)),
    };
    await store.saveDiff(c2, c1);
    const loaded = await store.load('c-diff');
    expect(loaded!.entries.map((e) => e.lid)).toEqual(['e3', 'e1', 'e2']);
    expect(loaded!.entries.find((e) => e.lid === 'e2')!.body).toBe('y');
  });

  it('delete() は split record も一緒に消す', async () => {
    const adapter = createMemoryAdapter();
    const store = createContainerStore(adapter);
    await store.saveDiff(makeContainer(), null);
    await store.delete('c-diff');
    expect(await store.load('c-diff')).toBeNull();
    expect(await adapter.bucket('containers').getKeysByPrefix('__entry__:')).toEqual([]);
    expect(await adapter.bucket('containers').getKeysByPrefix('__rev__:')).toEqual([]);
  });

  it('listContainers は split 形式でも per-entry record を container と誤認しない', async () => {
    const store = createContainerStore(createMemoryAdapter());
    await store.saveDiff(makeContainer(), null);
    const list = await store.listContainers();
    expect(list).toEqual([{ id: 'c-diff', title: 't' }]);
  });

  it('assets は additive-only(saveDiff でも既存 asset を消さない)', async () => {
    const store = createContainerStore(createMemoryAdapter());
    const c1: Container = { ...makeContainer(), assets: { 'a.png': 'AAA', 'b.png': 'BBB' } };
    await store.saveDiff(c1, null);
    // 部分 working-set(b.png 非常駐)で再保存しても b.png は残る。
    // #938 R1: byte 差し替え(AAA→AAA2)は invalidate 経由の契約。
    store.invalidatePersistedAssets('c-diff');
    const c2: Container = { ...c1, assets: { 'a.png': 'AAA2' } };
    await store.saveDiff(c2, c1);
    expect(await store.loadAsset('c-diff', 'a.png')).toBe('AAA2');
    expect(await store.loadAsset('c-diff', 'b.png')).toBe('BBB');
  });
});
