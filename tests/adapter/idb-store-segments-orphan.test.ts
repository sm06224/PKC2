/**
 * layout 5 → 従来形式へ戻したときの segments 回収(2026-07-25)。
 *
 * 診察(`docs/development/lazy-entry-bodies-diagnosis-2026-07-25.md` §6)で
 * 見つけた穴の regression test。`save()` の掃除(inline 復帰)も `saveDiff()` の
 * 掃除も `containers` bucket の prefix しか見ておらず、`segments` bucket の
 * gzip Blob(本文・履歴の実体サイズ相当)がコンテナ削除まで回収されない。
 *
 * 正しさは壊れない(layout 1 の load は segments を参照しない)が、
 * 「OFF 保存で従来形式へ自動復元される(双方向に安全)」と謳っている以上、
 * 片道分のゴミが残るのは仕様の穴である。
 *
 * ⚠ 掃除の順序は不変条件:**core record を書いた後**にしか消してはならない。
 *   segments は収束が完了するまで本文の唯一の実体なので、先に消すと
 *   「本文が空で焼き付いた」ときの復旧手段が無くなる。
 */
import { describe, it, expect } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import type { StorageAdapter } from '@adapter/platform/storage/storage-adapter';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-25T00:00:00Z';
const CID = 'corph';

function entry(lid: string, body: string): Entry {
  return { lid, title: lid, body, archetype: 'text', created_at: T, updated_at: T };
}

function makeContainer(n: number): Container {
  const entries: Entry[] = [];
  for (let i = 0; i < n; i++) entries.push(entry(`e${i}`, `BODY-${i}-${'x'.repeat(200)}`));
  return {
    meta: { container_id: CID, title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries,
    relations: [],
    revisions: [
      { id: 'r1', entry_lid: 'e0', snapshot: JSON.stringify(entry('e0', 'OLD')), created_at: T },
    ],
    assets: {},
  };
}

const segKeys = (adapter: StorageAdapter): Promise<readonly string[]> =>
  adapter.bucket('segments').getKeysByPrefix(`${CID}:`);

const lazyStore = (adapter: StorageAdapter) =>
  createContainerStore(adapter, { lazyEntryBodies: () => true });
const plainStore = (adapter: StorageAdapter) =>
  createContainerStore(adapter, { lazyEntryBodies: () => false });

describe('layout 5 → 従来形式への収束で segments を回収する', () => {
  it('inline save() への復帰で segments が残らない', async () => {
    const adapter = createMemoryAdapter();
    const container = makeContainer(3);

    // layout 5 で保存 → segments に本文・履歴の実体ができる
    await lazyStore(adapter).saveDiff(container, null);
    expect((await segKeys(adapter)).length).toBeGreaterThan(0);

    // flag を OFF に戻して保存 = inline(layout 1)へ収束
    await plainStore(adapter).save(container);

    // 収束後、本文は core record 側にある。segments は不要 = 回収されるべき。
    const core = await adapter.bucket('containers').get(CID) as { entries: Entry[] };
    expect(core.entries.map((e) => e.body)).toEqual(container.entries.map((e) => e.body));
    expect(await segKeys(adapter)).toEqual([]);
  });

  it('差分保存のまま lazy だけ OFF にした収束でも segments が残らない', async () => {
    const adapter = createMemoryAdapter();
    const container = makeContainer(3);

    await lazyStore(adapter).saveDiff(container, null);
    expect((await segKeys(adapter)).length).toBeGreaterThan(0);

    // differential_save は ON のまま lazy だけ OFF → saveDiff の targetLayout 1
    await plainStore(adapter).saveDiff(container, null);

    expect(await segKeys(adapter)).toEqual([]);
  });

  it('回収しても layout 5 で保存した内容は完全に読み戻せる', async () => {
    const adapter = createMemoryAdapter();
    const container = makeContainer(3);

    await lazyStore(adapter).saveDiff(container, null);
    await plainStore(adapter).save(container);

    const loaded = await plainStore(adapter).loadDefault();
    expect(loaded?.entries.map((e) => e.body)).toEqual(container.entries.map((e) => e.body));
    expect(loaded?.revisions).toHaveLength(1);
  });
});
