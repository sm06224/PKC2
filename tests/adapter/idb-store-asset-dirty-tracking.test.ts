/**
 * #938 R1 — asset dirty-tracking の unit test。
 *
 * 従来: save / saveDiff のたびに `container.assets`(常駐 working-set、最大
 * 48MB)を全 put し直していた。R1 で「persist 済みと確認できた key は書かない」
 * ── 書込は store への write / read 成功でのみ記録し、削除系で落とす。
 *
 * 観測点は adapter の assets bucket に届いた put op 数(spy wrapper)。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import { createContainerStore } from '@adapter/platform/idb-store';
import type { StorageAdapter, StorageBucket, BatchOp } from '@adapter/platform/storage/storage-adapter';
import type { Container } from '@core/model/container';

const T = '2026-07-20T00:00:00Z';

function makeContainer(assets: Record<string, string>): Container {
  return {
    meta: { container_id: 'c1', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [{ lid: 'e1', title: 'E', body: 'x', archetype: 'text', created_at: T, updated_at: T }],
    relations: [], revisions: [], assets,
  };
}

/** assets bucket への put を数える spy adapter。 */
function spyAdapter(base: StorageAdapter): { adapter: StorageAdapter; assetPuts: string[] } {
  const assetPuts: string[] = [];
  const adapter: StorageAdapter = {
    ...base,
    bucket(name): StorageBucket {
      const b = base.bucket(name);
      if (name !== 'assets') return b;
      return {
        ...b,
        async put(key, value) {
          assetPuts.push(key);
          return b.put(key, value);
        },
        async applyBatch(ops: BatchOp[]) {
          for (const op of ops) if (op.kind === 'put') assetPuts.push(op.key);
          return b.applyBatch(ops);
        },
      };
    },
  };
  return { adapter, assetPuts };
}

let base: StorageAdapter;

beforeEach(() => {
  base = createMemoryAdapter();
});

describe('asset dirty-tracking(#938 R1)', () => {
  it('同じ assets での 2 回目の save は asset put ゼロ', async () => {
    const { adapter, assetPuts } = spyAdapter(base);
    const store = createContainerStore(adapter);
    const c = makeContainer({ k1: 'AAAA', k2: 'BBBB' });
    await store.save(c);
    expect(assetPuts).toEqual(['c1:k1', 'c1:k2']);
    assetPuts.length = 0;
    await store.save(c);
    expect(assetPuts).toEqual([]); // 全 skip
  });

  it('新規 asset だけが 2 回目に書かれる', async () => {
    const { adapter, assetPuts } = spyAdapter(base);
    const store = createContainerStore(adapter);
    await store.save(makeContainer({ k1: 'AAAA' }));
    assetPuts.length = 0;
    await store.save(makeContainer({ k1: 'AAAA', k3: 'CCCC' }));
    expect(assetPuts).toEqual(['c1:k3']);
  });

  it('saveDiff(差分保存)経路でも skip される', async () => {
    const { adapter, assetPuts } = spyAdapter(base);
    const store = createContainerStore(adapter);
    const c = makeContainer({ k1: 'AAAA' });
    await store.saveDiff(c, null);
    assetPuts.length = 0;
    await store.saveDiff(makeContainer({ k1: 'AAAA' }), c);
    expect(assetPuts).toEqual([]);
  });

  it('別 store インスタンス(reload 相当)でも loadAsset で読めた key は skip', async () => {
    // 1st session: 書く
    await createContainerStore(base).save(makeContainer({ k1: 'AAAA' }));
    // 2nd session(記録は空)── hydrate(loadAsset)後の save は skip
    const { adapter, assetPuts } = spyAdapter(base);
    const store2 = createContainerStore(adapter);
    expect(await store2.loadAsset('c1', 'k1')).toBe('AAAA');
    await store2.save(makeContainer({ k1: 'AAAA' }));
    expect(assetPuts).toEqual([]);
  });

  it('listAssetKeys で存在確認した key も skip 対象になる', async () => {
    await createContainerStore(base).save(makeContainer({ k1: 'AAAA' }));
    const { adapter, assetPuts } = spyAdapter(base);
    const store2 = createContainerStore(adapter);
    await store2.listAssetKeys('c1');
    await store2.save(makeContainer({ k1: 'AAAA' }));
    expect(assetPuts).toEqual([]);
  });

  it('purgeAssetsExcept で消えた key は記録からも落ち、再 put できる', async () => {
    const { adapter, assetPuts } = spyAdapter(base);
    const store = createContainerStore(adapter);
    await store.save(makeContainer({ k1: 'AAAA', orphan: 'ZZZZ' }));
    await store.purgeAssetsExcept('c1', ['k1']);
    expect(await store.loadAsset('c1', 'orphan')).toBeNull();
    assetPuts.length = 0;
    // orphan を再び持つ container を save → 再 put される(誤 skip しない)
    await store.save(makeContainer({ k1: 'AAAA', orphan: 'ZZZZ' }));
    expect(assetPuts).toEqual(['c1:orphan']);
    expect(await store.loadAsset('c1', 'orphan')).toBe('ZZZZ');
  });

  it('deleteAsset 後は再 put される(unmark)', async () => {
    const { adapter, assetPuts } = spyAdapter(base);
    const store = createContainerStore(adapter);
    await store.save(makeContainer({ k1: 'AAAA' }));
    await store.deleteAsset('c1', 'k1');
    assetPuts.length = 0;
    await store.save(makeContainer({ k1: 'AAAA' }));
    expect(assetPuts).toEqual(['c1:k1']);
  });

  it('invalidatePersistedAssets 後の save は全 asset を書き直す(import 契約)', async () => {
    const { adapter, assetPuts } = spyAdapter(base);
    const store = createContainerStore(adapter);
    await store.save(makeContainer({ k1: 'AAAA' }));
    store.invalidatePersistedAssets('c1');
    assetPuts.length = 0;
    await store.save(makeContainer({ k1: 'NEW-BYTES' }));
    expect(assetPuts).toEqual(['c1:k1']);
    expect(await store.loadAsset('c1', 'k1')).toBe('NEW-BYTES');
  });

  it('skip されても bytes は store に残っている(正しさ検証)', async () => {
    const { adapter } = spyAdapter(base);
    const store = createContainerStore(adapter);
    const c = makeContainer({ k1: 'AAAA' });
    await store.save(c);
    await store.save(c); // skip 発生
    const loaded = await store.load('c1');
    expect(loaded?.assets['k1']).toBe('AAAA');
  });
});
