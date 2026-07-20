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
  it('meta record は body 空、本文は __body__ record、core に layout marker', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    await store.saveDiff(makeContainer([entry('e1', 'One', 'BODY-1')]), null);

    const meta = await rawGet(adapter, '__entry__:cv2:e1') as { body: string; title: string };
    expect(meta.title).toBe('One');
    expect(meta.body).toBe(''); // 本文は meta に置かない
    expect(await rawGet(adapter, '__body__:cv2:e1')).toBe('BODY-1');
    const core = await rawGet(adapter, 'cv2') as { __pkc_layout__?: number };
    expect(core.__pkc_layout__).toBe(2);
  });

  it('round-trip: load で本文込みの entries が順序どおり復元される', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    await store.saveDiff(makeContainer([entry('b', 'B', 'body-b'), entry('a', 'A', 'body-a')]), null);
    const loaded = await store.load('cv2');
    expect(loaded!.entries.map((e) => [e.lid, e.body])).toEqual([['b', 'body-b'], ['a', 'body-a']]);
  });

  it('差分: title だけの変更は meta のみ書き、body record は書き直さない', async () => {
    const adapter = createMemoryAdapter();
    const store = v2Store(adapter);
    const c1 = makeContainer([entry('e1', 'One', 'BODY-1')]);
    await store.saveDiff(c1, null);
    // body record を直接汚して「再書込されたか」を観測できるようにする
    await adapter.bucket('containers').put('__body__:cv2:e1', 'SENTINEL');
    const c2 = makeContainer([{ ...c1.entries[0]!, title: 'Renamed' }]);
    await store.saveDiff(c2, c1);
    expect(await rawGet(adapter, '__body__:cv2:e1')).toBe('SENTINEL'); // 触っていない
    const meta = await rawGet(adapter, '__entry__:cv2:e1') as { title: string };
    expect(meta.title).toBe('Renamed');
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

  it('v1 split → flag ON の saveDiff は全件書込みで v2 へ移行する', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer([entry('e1', 'One', 'BODY-1')]);
    await v1Store(adapter).saveDiff(c1, null);
    await v2Store(adapter).saveDiff(c1, c1); // layout 不一致 → full write
    expect(await rawGet(adapter, '__body__:cv2:e1')).toBe('BODY-1');
    const meta = await rawGet(adapter, '__entry__:cv2:e1') as { body: string };
    expect(meta.body).toBe('');
    expect((await v2Store(adapter).load('cv2'))!.entries[0]!.body).toBe('BODY-1');
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
