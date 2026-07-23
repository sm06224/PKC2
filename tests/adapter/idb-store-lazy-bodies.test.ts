/**
 * #940 案 A 段階1 — storage layout v2(entry meta / body 分離)の unit test。
 *
 * flag ON の saveDiff は entry を meta(body 空)+ `__body__` record に分離
 * して書く。読み込み(段階1)は全 body を復元して挙動不変。OFF 保存で v1 に
 * 収束する双方向設計と、layout をまたぐ差分の全件書込みフォールバックを検証。
 */
import { describe, it, expect } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import type { StorageAdapter } from '@adapter/platform/storage/storage-adapter';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-20T00:00:00Z';

function entry(lid: string, title: string, body: string): Entry {
  return { lid, title, body, archetype: 'text', created_at: T, updated_at: T };
}

function makeContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 'cv2', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries, relations: [], revisions: [], assets: {},
  };
}

/** containers bucket の生 key 一覧(prefix filter)。 */
async function rawKeys(adapter: StorageAdapter, prefix: string): Promise<readonly string[]> {
  return adapter.bucket('containers').getKeysByPrefix(prefix);
}
async function rawGet(adapter: StorageAdapter, key: string): Promise<unknown> {
  return adapter.bucket('containers').get(key);
}

const v2Store = (adapter: StorageAdapter) =>
  createContainerStore(adapter, { lazyEntryBodies: () => true });
const v1Store = (adapter: StorageAdapter) =>
  createContainerStore(adapter, { lazyEntryBodies: () => false });

describe('layout v2 書込(#940 案 A 段階1)', () => {
  it('P2-1(v3): entry meta は core record に inline(body 空)、本文は __body__ record', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    await store.saveDiff(makeContainer([entry('e1', 'One', 'BODY-1')]), null);

    // v3 = meta 単一小レコード: per-entry record は書かれない
    expect(await rawKeys(adapter, '__entry__:cv2:')).toEqual([]);
    const core = await rawGet(adapter, 'cv2') as {
      __pkc_layout__?: number;
      entries: { lid: string; title: string; body: string }[];
    };
    expect(core.__pkc_layout__).toBe(4);
    expect(core.entries).toHaveLength(1);
    expect(core.entries[0]!.title).toBe('One');
    expect(core.entries[0]!.body).toBe(''); // 本文は core に置かない
    expect(await rawGet(adapter, '__body__:cv2:e1')).toBe('BODY-1');
  });

  it('round-trip: load で本文込みの entries が順序どおり復元される', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    await store.saveDiff(makeContainer([entry('b', 'B', 'body-b'), entry('a', 'A', 'body-a')]), null);
    const loaded = await store.load('cv2');
    expect(loaded!.entries.map((e) => [e.lid, e.body])).toEqual([['b', 'body-b'], ['a', 'body-a']]);
  });

  it('差分: title だけの変更は core のみ書き、body record は書き直さない', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    const c1 = makeContainer([entry('e1', 'One', 'BODY-1')]);
    await store.saveDiff(c1, null);
    // body record を直接汚して「再書込されたか」を観測できるようにする
    await adapter.bucket('containers').put('__body__:cv2:e1', 'SENTINEL');
    const c2 = makeContainer([{ ...c1.entries[0]!, title: 'Renamed' }]);
    await store.saveDiff(c2, c1);
    expect(await rawGet(adapter, '__body__:cv2:e1')).toBe('SENTINEL'); // 触っていない
    const core = await rawGet(adapter, 'cv2') as { entries: { title: string }[] };
    expect(core.entries[0]!.title).toBe('Renamed');
  });

  it('差分: body 変更は body record も書く、entry 削除は両 record を消す', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    const c1 = makeContainer([entry('e1', 'One', 'BODY-1'), entry('e2', 'Two', 'BODY-2')]);
    await store.saveDiff(c1, null);
    const c2 = makeContainer([{ ...c1.entries[0]!, body: 'BODY-1v2' }]); // e2 削除
    await store.saveDiff(c2, c1);
    expect(await rawGet(adapter, '__body__:cv2:e1')).toBe('BODY-1v2');
    expect(await rawGet(adapter, '__entry__:cv2:e2')).toBeUndefined();
    expect(await rawGet(adapter, '__body__:cv2:e2')).toBeUndefined();
    expect((await store.load('cv2'))!.entries.map((e) => e.lid)).toEqual(['e1']);
  });
});

describe('layout 切替の収束(#940 案 A 段階1)', () => {
  it('v2 → flag OFF の saveDiff で v1 split に戻り body record は掃除される', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer([entry('e1', 'One', 'BODY-1')]);
    await v2Store(adapter).saveDiff(c1, null);
    // 別 session 相当(新 store)で OFF 保存 ── previous を渡しても layout
    // 不一致で全件書込みに落ちる(混在 state を作らない)
    await v1Store(adapter).saveDiff(c1, c1);
    const meta = await rawGet(adapter, '__entry__:cv2:e1') as { body: string };
    expect(meta.body).toBe('BODY-1'); // v1 split = 本文 inline
    expect(await rawKeys(adapter, '__body__:cv2:')).toEqual([]);
    const core = await rawGet(adapter, 'cv2') as { __pkc_layout__?: number };
    expect(core.__pkc_layout__).toBeUndefined();
    expect((await v1Store(adapter).load('cv2'))!.entries[0]!.body).toBe('BODY-1');
  });

  it('v2 → inline save() でも body record が掃除される', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer([entry('e1', 'One', 'BODY-1')]);
    await v2Store(adapter).saveDiff(c1, null);
    await v1Store(adapter).save(c1);
    expect(await rawKeys(adapter, '__body__:cv2:')).toEqual([]);
    expect(await rawKeys(adapter, '__entry__:cv2:')).toEqual([]);
    expect((await v1Store(adapter).load('cv2'))!.entries[0]!.body).toBe('BODY-1');
  });

  it('v1 split → flag ON の saveDiff は全件書込みで v4 へ移行する(__entry__ 掃除込み)', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer([entry('e1', 'One', 'BODY-1')]);
    await v1Store(adapter).saveDiff(c1, null);
    expect((await rawKeys(adapter, '__entry__:cv2:')).length).toBe(1); // v1 split の残骸元
    await v2Store(adapter).saveDiff(c1, c1); // layout 不一致 → full write
    expect(await rawGet(adapter, '__body__:cv2:e1')).toBe('BODY-1');
    // v3: per-entry record は掃除され、meta は core に inline
    expect(await rawKeys(adapter, '__entry__:cv2:')).toEqual([]);
    const core = await rawGet(adapter, 'cv2') as { __pkc_layout__?: number; entries: { body: string }[] };
    expect(core.__pkc_layout__).toBe(4);
    expect(core.entries[0]!.body).toBe('');
    expect((await v2Store(adapter).load('cv2'))!.entries[0]!.body).toBe('BODY-1');
  });

  it('P2-1: 旧 v2 record(per-entry meta)は両読みでき、次の保存で v4 に収束する', async () => {
    const adapter = createMemoryAdapter();
    // 旧ビルドが書いた v2 形式を手組みで再現
    const bucket = adapter.bucket('containers');
    const e1 = entry('e1', 'One', '');
    await bucket.put('cv2', {
      ...makeContainer([]),
      __pkc_split__: { entryOrder: ['e1'], revOrder: [] },
      __pkc_layout__: 2,
    });
    await bucket.put('__entry__:cv2:e1', e1);
    await bucket.put('__body__:cv2:e1', 'BODY-1');
    await bucket.put('__default__', 'cv2');

    const store = v2Store(adapter);
    // 両読み: v2 のまま完全復元できる
    const loaded = await store.load('cv2');
    expect(loaded!.entries.map((e) => [e.lid, e.body])).toEqual([['e1', 'BODY-1']]);
    // meta-first boot も v2 で成立
    const shallow = await store.loadDefaultMetaShallow();
    expect(shallow.bodiesDeferred).toBe(true);
    expect(shallow.container!.entries[0]!.body).toBe('');
    // 次の保存(layout 2 ≠ target 3)で全件書込み → v3 へ収束
    await store.saveDiff(loaded!, loaded!);
    expect(await rawKeys(adapter, '__entry__:cv2:')).toEqual([]);
    const core = await rawGet(adapter, 'cv2') as { __pkc_layout__?: number };
    expect(core.__pkc_layout__).toBe(4);
    expect((await store.load('cv2'))!.entries[0]!.body).toBe('BODY-1');
  });

  it('P2-1: v3 の meta-first boot は bodiesDeferred=true で body 空の entries を返す', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    await store.saveDiff(makeContainer([entry('e1', 'One', 'BODY-1')]), null);
    const { container, bodiesDeferred } = await store.loadDefaultMetaShallow();
    expect(bodiesDeferred).toBe(true);
    expect(container!.entries.map((e) => [e.lid, e.body])).toEqual([['e1', '']]);
    // 需要読みで本文が取れる
    expect(await store.loadBodies('cv2')).toEqual({ e1: 'BODY-1' });
  });

  it('delete で __body__ record も消える', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    await store.saveDiff(makeContainer([entry('e1', 'One', 'BODY-1')]), null);
    await store.delete('cv2');
    expect(await rawKeys(adapter, '__body__:cv2:')).toEqual([]);
    expect(await rawKeys(adapter, '__entry__:cv2:')).toEqual([]);
  });
});

describe('P2-2: revisions セグメントログ(layout 4)', () => {
  const rev = (id: string, snap: string) =>
    ({ id, entry_lid: 'e1', snapshot: snap, created_at: T }) as unknown as import('@core/model/container').Revision;

  it('revisions は __rev__ ではなく segments に入り、round-trip で順序復元される', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    const c = { ...makeContainer([entry('e1', 'One', 'B')]), revisions: [rev('r1', 's1'), rev('r2', 's2')] };
    await store.saveDiff(c, null);
    expect(await rawKeys(adapter, '__rev__:cv2:')).toEqual([]);
    expect((await adapter.bucket('segments').getKeysByPrefix('cv2:rev:')).length).toBeGreaterThan(0);
    const loaded = await store.load('cv2');
    expect(loaded!.revisions.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('差分追記は active segment だけを書き直す(封印分は不変)', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    // 大きい snapshot で複数 segment を作る(~0.6MB × 3 = seal 2 + active 1)
    const big = 'x'.repeat(600 * 1024);
    const c1 = { ...makeContainer([entry('e1', 'One', 'B')]), revisions: [rev('r1', big), rev('r2', big), rev('r3', big)] };
    await store.saveDiff(c1, null);
    const segBucket = adapter.bucket('segments');
    const keysBefore = [...(await segBucket.getKeysByPrefix('cv2:rev:'))].sort();
    expect(keysBefore.length).toBeGreaterThanOrEqual(2);
    // 封印(先頭)segment を SENTINEL 化して「触られていない」ことを観測
    const sealed = keysBefore[0]!;
    const sealedValue = await segBucket.get(sealed);
    const c2 = { ...c1, revisions: [...c1.revisions, rev('r4', 'small')] };
    await store.saveDiff(c2, c1);
    expect(await segBucket.get(sealed)).toBe(sealedValue); // 参照同一 = 再書込なし
    const loaded = await store.load('cv2');
    expect(loaded!.revisions.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
  });

  it('revision の削除(prune)は全再構築で stale segment も消える', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    const big = 'x'.repeat(600 * 1024);
    const c1 = { ...makeContainer([entry('e1', 'One', 'B')]), revisions: [rev('r1', big), rev('r2', big), rev('r3', big)] };
    await store.saveDiff(c1, null);
    const c2 = { ...c1, revisions: [c1.revisions[2]!] }; // r1, r2 prune
    await store.saveDiff(c2, c1);
    const loaded = await store.load('cv2');
    expect(loaded!.revisions.map((r) => r.id)).toEqual(['r3']);
  });
});
