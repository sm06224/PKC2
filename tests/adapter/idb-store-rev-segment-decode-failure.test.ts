/**
 * rev segment の復号に失敗したときに履歴を壊さない(2026-07-26)。
 *
 * `appendRevSegments`(`idb-store.ts`)は追記のたびに **active(末尾)segment だけ**を
 * 読み戻して合流し、同じ key へ書き戻す。ここで読み戻しに失敗したときの扱いが
 * **失敗の種類によって非対称**だった:
 *
 *   json あり + JSON.parse 成功 → 合流して active を上書き        … 正しい
 *   json あり + JSON.parse 失敗 → baseSeq 据え置き = 新 seq へ逃がす … 非破壊
 *   json が null(gunzip 失敗)  → tail=[] のまま active を上書き   … 🔴 履歴が消える
 *
 * `gunzipSegment` は例外を握って `null` を返すので、この失敗は **データ破損とは
 * 限らない**(メモリ不足 / stream 中断など一過性でも起きる)。バイト自体は無事なのに
 * 上書きすれば確実に失われる。JSON 破損側と同じく**非破壊**に揃える。
 *
 * 本 test は memory adapter 上で active segment を「復号できない値」に差し替え、
 * その後の追記で **既存 revision が消えないこと**を pin する。
 */
import { describe, it, expect } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import type { StorageAdapter } from '@adapter/platform/storage/storage-adapter';
import type { Container, Revision } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-26T00:00:00Z';
const CID = 'cdec';

function entry(lid: string): Entry {
  return { lid, title: lid, body: `b-${lid}`, archetype: 'text', created_at: T, updated_at: T };
}
function rev(id: string): Revision {
  return { id, entry_lid: 'e0', snapshot: '{}', created_at: T };
}
function makeContainer(nRevs: number): Container {
  const revisions: Revision[] = [];
  for (let i = 0; i < nRevs; i++) revisions.push(rev(`r${String(i).padStart(4, '0')}`));
  return {
    meta: { container_id: CID, title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [entry('e0'), entry('e1')],
    relations: [],
    revisions,
    assets: {},
  };
}

const lazyStore = (a: StorageAdapter) =>
  createContainerStore(a, { lazyEntryBodies: () => true });

const revSegKeys = (a: StorageAdapter): Promise<readonly string[]> =>
  a.bucket('segments').getKeysByPrefix(`${CID}:rev:`);

/** active(末尾)segment を「復号できない値」に差し替える。 */
async function breakActiveRevSegment(a: StorageAdapter): Promise<string> {
  const keys = [...(await revSegKeys(a))].sort();
  const last = keys[keys.length - 1]!;
  // Blob だが gzip ではない = DecompressionStream が throw → gunzipSegment が null
  await a.bucket('segments').put(last, new Blob([new Uint8Array([1, 2, 3, 4, 5])]));
  return last;
}

describe('rev segment の復号失敗', () => {
  it('🔴 復号できない active segment を上書きせず、既存 revision を消さない', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer(20);
    const store = lazyStore(adapter);
    await store.saveDiff(c1, null);

    const brokenKey = await breakActiveRevSegment(adapter);
    const keysBefore = [...(await revSegKeys(adapter))].sort();

    // revision を 1 件追記
    const c2: Container = { ...c1, revisions: [...c1.revisions, rev('r-new')] };
    await lazyStore(adapter).saveDiff(c2, c1);

    // 壊れた segment は残っている(上書きされていない)
    const keysAfter = [...(await revSegKeys(adapter))].sort();
    expect(keysAfter).toContain(brokenKey);
    // 追記分は **新しい seq** に載っている
    expect(keysAfter.length).toBeGreaterThan(keysBefore.length);

    // 復元は壊れない(読めない segment は skip される)
    const loaded = await lazyStore(adapter).loadDefault();
    expect(loaded?.revisions.map((r) => r.id)).toContain('r-new');
  });

  it('正常な追記では active segment を上書きし、seq が増えない', async () => {
    const adapter = createMemoryAdapter();
    const c1 = makeContainer(20);
    const store = lazyStore(adapter);
    await store.saveDiff(c1, null);
    const before = [...(await revSegKeys(adapter))].sort();

    const c2: Container = { ...c1, revisions: [...c1.revisions, rev('r-new')] };
    await store.saveDiff(c2, c1);

    // 小さいので 1 pack に収まる = key は増えない(回帰していないことの確認)
    expect([...(await revSegKeys(adapter))].sort()).toEqual(before);
    const loaded = await lazyStore(adapter).loadDefault();
    expect(loaded?.revisions.map((r) => r.id)).toEqual(c2.revisions.map((r) => r.id));
  });
});
