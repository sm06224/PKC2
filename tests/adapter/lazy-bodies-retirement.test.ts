/**
 * `persistence.lazy_entry_bodies` の退役と「戻し道」(2026-07-26)。
 *
 * > user 裁定:「効果が少なく、リスクが多いなら廃止したい / 3 ヶ月後に廃止する
 * >  方向性で調整に入りましょう / **まずは導線の封鎖と戻し道をつけてください** /
 * >  3 ヶ月の間にユーザーが一度でも上書きすれば、安全な道に戻る」
 *
 * 本 test が守るのは 3 つ:
 *
 *   1. **導線の封鎖** ── どの source から指定されても有効にならない。
 *      UI から消すだけでは足りない(URL flag / container の `__flags__` が
 *      素通りする穴は 2026-07-25 に移行前 ZIP ゲートで実際に踏んでいる)
 *   2. **戻し道** ── 既に layout 5 で保存されている storage が、
 *      次の保存で従来形式へ戻り、segments が回収される
 *   3. 🔴 **戻し道が本文を空で焼かない** ── ここが一番危ない。
 *      `save()` には `bodyPending` guard が無く、未 hydrate のまま走ると
 *      `body: ''` が正本として書かれ、直後の `dropSegments` が実体を消す。
 *      退役は全 user をこの経路に乗せるので、必ず塞がっていること。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import { setFlagSource, getRegisteredFlags } from '@core/flags';
import { lazyEntryBodiesEnabled } from '@adapter/platform/idb-store';
import type { StorageAdapter } from '@adapter/platform/storage/storage-adapter';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-26T00:00:00Z';
const CID = 'cret';
const KEY = 'persistence.lazy_entry_bodies';

function entry(lid: string, body: string): Entry {
  return { lid, title: lid, body, archetype: 'text', created_at: T, updated_at: T };
}
function makeContainer(): Container {
  return {
    meta: { container_id: CID, title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [entry('e1', '本文1'), entry('e2', '本文2')],
    relations: [],
    revisions: [],
    assets: {},
  };
}

const segKeys = (a: StorageAdapter): Promise<readonly string[]> =>
  a.bucket('segments').getKeysByPrefix(`${CID}:`);

const src = (value: unknown) => (k: string) =>
  (k === KEY ? (value as never) : undefined);

afterEach(() => {
  setFlagSource('url', () => undefined);
  setFlagSource('container', () => undefined);
});

describe('lazy_entry_bodies の退役 ── 導線の封鎖', () => {
  it('🔴 どの source から指定されても有効にならない', () => {
    // URL flag 相当
    setFlagSource('url', src(true));
    expect(lazyEntryBodiesEnabled()).toBe(false);
    // container の __flags__ 相当
    setFlagSource('container', src(true));
    expect(lazyEntryBodiesEnabled()).toBe(false);
    // 文字列で来ても同じ
    setFlagSource('url', src('true'));
    expect(lazyEntryBodiesEnabled()).toBe(false);
  });

  it('Flags Inspector の一覧に現れない', () => {
    expect(getRegisteredFlags().some((f) => f.key === KEY)).toBe(false);
  });
});

describe('lazy_entry_bodies の退役 ── 戻し道', () => {
  it('🔴 layout 5 の storage が次の保存で従来形式へ戻り、segments が回収される', async () => {
    const adapter = createMemoryAdapter();
    // 退役前に layout 5 で保存されていた状態を作る(store options で直接指定)
    const lazy = createContainerStore(adapter, { lazyEntryBodies: () => true });
    await lazy.saveDiff(makeContainer(), null);
    expect((await segKeys(adapter)).length).toBeGreaterThan(0);

    // 退役後の store(flag は常に false)で保存 = user が 1 度上書きした状態
    const retired = createContainerStore(adapter);
    await retired.save(makeContainer());

    expect(await segKeys(adapter)).toEqual([]);
    const loaded = await retired.loadDefault();
    expect(loaded?.entries.map((e) => e.body)).toEqual(['本文1', '本文2']);
  });

  it('🔴 本文が未 hydrate のときは inline へ書き戻さない(空で焼かない)', async () => {
    const adapter = createMemoryAdapter();
    const pending = new Set<string>(['e1', 'e2']);
    const lazy = createContainerStore(adapter, {
      lazyEntryBodies: () => true,
      isBodyPending: (_c, lid) => pending.has(lid),
    });
    // まず本文を持った状態で layout 5 保存(pending は書込対象から外れるので
    // 一旦 pending を空にして保存する)
    pending.clear();
    await lazy.saveDiff(makeContainer(), null);
    const segsBefore = [...(await segKeys(adapter))];
    expect(segsBefore.length).toBeGreaterThan(0);

    // meta-first boot 相当: 本文は '' で、pending が立っている
    pending.add('e1');
    pending.add('e2');
    const store = createContainerStore(adapter, {
      isBodyPending: (_c, lid) => pending.has(lid),
    });
    const emptyBodies: Container = {
      ...makeContainer(),
      entries: [entry('e1', ''), entry('e2', '')],
    };
    await store.save(emptyBodies);

    // 本文は segments から復元できるので、書き戻し自体は成立してよい。
    // 重要なのは **空で焼かれていない**こと。
    const loaded = await createContainerStore(adapter).loadDefault();
    expect(loaded?.entries.map((e) => e.body)).toEqual(['本文1', '本文2']);
  });

  it('🔴 本文が復元できないときは storage を現状のまま残す(実体を消さない)', async () => {
    const adapter = createMemoryAdapter();
    const lazy = createContainerStore(adapter, { lazyEntryBodies: () => true });
    await lazy.saveDiff(makeContainer(), null);
    const segsBefore = [...(await segKeys(adapter))].sort();
    expect(segsBefore.length).toBeGreaterThan(0);

    // 本文 segments を復号不能にする = 復元できない状況
    for (const k of segsBefore) {
      if (k.includes(':body:')) {
        await adapter.bucket('segments').put(k, new Blob([new Uint8Array([9, 9, 9])]));
      }
    }

    const store = createContainerStore(adapter, { isBodyPending: () => true });
    await store.save({ ...makeContainer(), entries: [entry('e1', ''), entry('e2', '')] });

    // 変換は中止され、segments は残っている(復旧手段が消えていない)
    expect([...(await segKeys(adapter))].sort()).toEqual(segsBefore);
  });
});
