/**
 * relations サイドカー record(2026-07-26)。
 *
 * 実測(`docs/development/save-write-volume-2026-07-26.md` §2-b)で、
 * 差分保存の core record の**最大項が relations**だと判明した:
 *
 *   N=5000 / M=15000 / R=3074、1 保存あたりの core record
 *     split v1 : relations 442 KB(70%)/ revOrder 145 KB / entryOrder 47 KB
 *
 * `core` が `...container` を spread しているため、**本文 1 文字の編集でも
 * relations が全件書き直されていた**。relations は滅多に変わらないので、
 * 変わったときだけ `__rel__:<cid>` へ書くようにした。
 *
 * 読み側は「サイドカーがあればそれが正本、無ければ core の inline」。
 * 形式フラグを増やさずに旧データと両立させるための判定なので、
 * **inline へ復帰する経路でサイドカーを消し忘れると、
 * 古い relations が正しい inline を上書きして見える**。
 * 本 test はその境界を pin する。
 */
import { describe, it, expect } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import type { StorageAdapter } from '@adapter/platform/storage/storage-adapter';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

const T = '2026-07-26T00:00:00Z';
const CID = 'crel';

function entry(lid: string): Entry {
  return { lid, title: lid, body: `body-${lid}`, archetype: 'text', created_at: T, updated_at: T };
}
function rel(id: string, from: string, to: string): Relation {
  return { id, from, to, kind: 'structural', created_at: T, updated_at: T };
}
function makeContainer(relations: Relation[]): Container {
  return {
    meta: { container_id: CID, title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [entry('e1'), entry('e2'), entry('e3')],
    relations,
    revisions: [],
    assets: {},
  };
}

const relKeys = (a: StorageAdapter): Promise<readonly string[]> =>
  a.bucket('containers').getKeysByPrefix(`__rel__:${CID}`);

const diffStore = (a: StorageAdapter) => createContainerStore(a, { lazyEntryBodies: () => false });
const lazyStore = (a: StorageAdapter) => createContainerStore(a, { lazyEntryBodies: () => true });

describe('relations サイドカー', () => {
  it('差分保存すると relations は別 record に出て、core からは消える', async () => {
    const adapter = createMemoryAdapter();
    const c = makeContainer([rel('r1', 'e1', 'e2')]);
    await diffStore(adapter).saveDiff(c, null);

    expect((await relKeys(adapter)).length).toBe(1);
    const core = await adapter.bucket('containers').get(CID) as { relations: unknown[] };
    expect(core.relations).toEqual([]);

    // 読み戻すと元どおり
    const loaded = await diffStore(adapter).loadDefault();
    expect(loaded?.relations).toEqual(c.relations);
  });

  it('relations が変わらない保存では、サイドカーを書き直さない', async () => {
    const adapter = createMemoryAdapter();
    const relations = [rel('r1', 'e1', 'e2')];
    const c1 = makeContainer(relations);
    const store = diffStore(adapter);
    await store.saveDiff(c1, null);

    // 本文だけ変えて再保存(relations は**同じ配列参照**を渡す)
    const c2: Container = {
      ...c1,
      entries: c1.entries.map((e) => (e.lid === 'e1' ? { ...e, body: 'changed' } : e)),
      relations,
    };
    let putCount = 0;
    const spy: StorageAdapter = {
      ...adapter,
      bucket: (name) => {
        const b = adapter.bucket(name);
        return {
          ...b,
          applyBatch: async (ops) => {
            if (name === 'containers') {
              putCount += ops.filter((o) => o.kind === 'put' && o.key.startsWith('__rel__:')).length;
            }
            return b.applyBatch(ops);
          },
        };
      },
    };
    await diffStore(spy).saveDiff(c2, c1);
    expect(putCount).toBe(0);

    // それでも読み戻しは正しい
    expect((await diffStore(adapter).loadDefault())?.relations).toEqual(relations);
  });

  it('relations が変わった保存では書き直される', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer([rel('r1', 'e1', 'e2')]);
    const store = diffStore(adapter);
    await store.saveDiff(c1, null);

    const c2 = { ...c1, relations: [rel('r1', 'e1', 'e2'), rel('r2', 'e2', 'e3')] };
    await store.saveDiff(c2, c1);

    expect((await diffStore(adapter).loadDefault())?.relations).toHaveLength(2);
  });

  it('🔴 inline(save)へ復帰するとサイドカーは回収され、古い relations が残らない', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer([rel('r1', 'e1', 'e2'), rel('r2', 'e2', 'e3')]);
    await diffStore(adapter).saveDiff(c1, null);
    expect((await relKeys(adapter)).length).toBe(1);

    // relations を減らして inline 保存(= flag OFF 相当の従来形式へ復帰)
    const c2 = { ...c1, relations: [rel('r1', 'e1', 'e2')] };
    await diffStore(adapter).save(c2);

    // サイドカーが消えていること。残っていると古い 2 件が読まれてしまう
    expect(await relKeys(adapter)).toEqual([]);
    const loaded = await diffStore(adapter).loadDefault();
    expect(loaded?.relations).toHaveLength(1);
    expect(loaded?.relations[0]?.id).toBe('r1');
  });

  it('layout 5(lazy)でも同じく分離され、読み戻せる', async () => {
    const adapter = createMemoryAdapter();
    const c = makeContainer([rel('r1', 'e1', 'e2')]);
    await lazyStore(adapter).saveDiff(c, null);

    const core = await adapter.bucket('containers').get(CID) as { relations: unknown[]; __pkc_layout__?: number };
    expect(core.__pkc_layout__).toBe(5);
    expect(core.relations).toEqual([]);
    expect((await lazyStore(adapter).loadDefault())?.relations).toEqual(c.relations);
  });

  it('サイドカーを持たない旧データは inline の relations をそのまま読む', async () => {
    const adapter = createMemoryAdapter();
    const c = makeContainer([rel('r1', 'e1', 'e2')]);
    // 旧形式 = inline 保存(サイドカーは作られない)
    await diffStore(adapter).save(c);
    expect(await relKeys(adapter)).toEqual([]);
    expect((await diffStore(adapter).loadDefault())?.relations).toEqual(c.relations);
  });

  it('コンテナ削除でサイドカーも回収される', async () => {
    const adapter = createMemoryAdapter();
    await diffStore(adapter).saveDiff(makeContainer([rel('r1', 'e1', 'e2')]), null);
    expect((await relKeys(adapter)).length).toBe(1);
    await diffStore(adapter).delete(CID);
    expect(await relKeys(adapter)).toEqual([]);
  });
});
