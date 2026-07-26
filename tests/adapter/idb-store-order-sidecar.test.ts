/**
 * 順序リストのサイドカー(`__order__:<cid>:<kind>:<seq>`、2026-07-26)。
 *
 * relations を core record から出した後、残る O(N+M) は
 * `marker.entryOrder`(全 lid)と `marker.revOrder`(全 revision id)だった
 * (`docs/development/save-write-volume-2026-07-26.md` §2-b:
 *  split v1 で revOrder 145 KB / entryOrder 47 KB)。
 *
 * **`revOrder` は毎保存で伸びる**ので「変わった時だけ書く」では効かない。
 * 固定長チャンクに割り、**追記と確認できたときは末尾チャンクだけ**書き直す。
 *
 * 本 test が守るもの:
 *   1. **配列順の意味論**が変わらないこと ── `created_at` 同着時の prev_rid
 *      tie-break(`tests/core/revision-order-tiebreak.test.ts` が pin)は
 *      revisions 配列順に依存するので、復元順が狂うと壊れる
 *   2. **追記以外**(prune / 並べ替え)でも正しく直ること
 *   3. 件数が減ったときに**余りチャンクが残らない**こと
 *   4. サイドカーが無い旧データは marker の inline へ fallback すること
 *   5. inline 復帰・コンテナ削除で回収されること
 */
import { describe, it, expect } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import type { StorageAdapter } from '@adapter/platform/storage/storage-adapter';
import type { Container, Revision } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-26T00:00:00Z';
const CID = 'cord';

function entry(lid: string): Entry {
  return { lid, title: lid, body: `b-${lid}`, archetype: 'text', created_at: T, updated_at: T };
}
function rev(id: string): Revision {
  return { id, entry_lid: 'e0', snapshot: '{}', created_at: T };
}
function makeContainer(nEntries: number, nRevs: number): Container {
  const entries: Entry[] = [];
  for (let i = 0; i < nEntries; i++) entries.push(entry(`e${i}`));
  const revisions: Revision[] = [];
  for (let i = 0; i < nRevs; i++) revisions.push(rev(`r${String(i).padStart(6, '0')}`));
  return {
    meta: { container_id: CID, title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries, relations: [], revisions, assets: {},
  };
}

const orderKeys = (a: StorageAdapter, kind: string): Promise<readonly string[]> =>
  a.bucket('containers').getKeysByPrefix(`__order__:${CID}:${kind}:`);

const store = (a: StorageAdapter) => createContainerStore(a, { lazyEntryBodies: () => false });

/** 復元した revisions の id 列。 */
async function loadedRevIds(a: StorageAdapter): Promise<string[]> {
  const c = await store(a).loadDefault();
  return (c?.revisions ?? []).map((r) => r.id);
}

describe('順序リストのサイドカー', () => {
  it('順序が完全に保たれる(チャンク境界をまたいでも)', async () => {
    const adapter = createMemoryAdapter();
    // ORDER_CHUNK = 2000。境界をまたぐ件数にする
    const c = makeContainer(3, 4500);
    await store(adapter).saveDiff(c, null);

    expect((await orderKeys(adapter, 'rev')).length).toBe(3); // ceil(4500/2000)
    expect(await loadedRevIds(adapter)).toEqual(c.revisions.map((r) => r.id));

    // core の marker は空(サイドカーが正本)
    const core = await adapter.bucket('containers').get(CID) as { __pkc_split__: { revOrder: string[] } };
    expect(core.__pkc_split__.revOrder).toEqual([]);
  });

  it('追記(revision 1 件増)しても順序は正しいまま', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer(3, 4500);
    const s = store(adapter);
    await s.saveDiff(c1, null);

    const c2: Container = { ...c1, revisions: [...c1.revisions, rev('r-new')] };
    await s.saveDiff(c2, c1);

    expect(await loadedRevIds(adapter)).toEqual(c2.revisions.map((r) => r.id));
  });

  it('🔴 prune(件数が減る)でも正しく、余りチャンクが残らない', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer(3, 4500);
    const s = store(adapter);
    await s.saveDiff(c1, null);
    expect((await orderKeys(adapter, 'rev')).length).toBe(3);

    // 4500 → 100 に prune(追記ではないので全チャンク書き直しになる経路)
    const c2: Container = { ...c1, revisions: c1.revisions.slice(0, 100) };
    await s.saveDiff(c2, c1);

    expect((await orderKeys(adapter, 'rev')).length).toBe(1);   // 余りが消えている
    expect(await loadedRevIds(adapter)).toEqual(c2.revisions.map((r) => r.id));
  });

  it('🔴 並べ替え(追記ではない)でも順序が正しく反映される', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer(3, 30);
    const s = store(adapter);
    await s.saveDiff(c1, null);

    const reversed = [...c1.revisions].reverse();
    const c2: Container = { ...c1, revisions: reversed };
    await s.saveDiff(c2, c1);

    expect(await loadedRevIds(adapter)).toEqual(reversed.map((r) => r.id));
  });

  it('entryOrder も分離され、entry の順序が保たれる', async () => {
    const adapter = createMemoryAdapter();
    const c = makeContainer(5, 3);
    await store(adapter).saveDiff(c, null);

    expect((await orderKeys(adapter, 'entry')).length).toBe(1);
    const loaded = await store(adapter).loadDefault();
    expect(loaded?.entries.map((e) => e.lid)).toEqual(c.entries.map((e) => e.lid));
  });

  it('サイドカーが無い旧データは marker の inline を使う', async () => {
    const adapter = createMemoryAdapter();
    const c = makeContainer(3, 5);
    // inline 保存(サイドカーは作られない)
    await store(adapter).save(c);
    expect(await orderKeys(adapter, 'rev')).toEqual([]);
    expect(await loadedRevIds(adapter)).toEqual(c.revisions.map((r) => r.id));
  });

  it('inline 復帰でサイドカーが回収される(古い順序が残らない)', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer(3, 4500);
    await store(adapter).saveDiff(c1, null);
    expect((await orderKeys(adapter, 'rev')).length).toBe(3);

    const c2: Container = { ...c1, revisions: c1.revisions.slice(0, 10) };
    await store(adapter).save(c2);

    expect(await orderKeys(adapter, 'rev')).toEqual([]);
    expect(await loadedRevIds(adapter)).toEqual(c2.revisions.map((r) => r.id));
  });

  it('コンテナ削除で回収される', async () => {
    const adapter = createMemoryAdapter();
    await store(adapter).saveDiff(makeContainer(3, 100), null);
    expect((await orderKeys(adapter, 'rev')).length).toBe(1);
    await store(adapter).delete(CID);
    expect(await orderKeys(adapter, 'rev')).toEqual([]);
    expect(await orderKeys(adapter, 'entry')).toEqual([]);
  });
});
