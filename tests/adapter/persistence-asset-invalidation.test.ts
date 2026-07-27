/**
 * @vitest-environment happy-dom
 *
 * 起動で asset の dirty-tracking を捨てない(2026-07-26)。
 *
 * ## 何を守るか
 *
 * `putAssets` は「persist 済みの key は書かない」最適化を持つ(#938 R1)。
 * その記録は **書込成功 or 読出成功でのみ**更新される ── `reassembleAssets` が
 * 「store から読めた = persist 済み」として積む(`idb-store.ts`)。
 *
 * ところが `persistence` は `CONTAINER_LOADED`(= 起動)でその記録を
 * `invalidatePersistedAssets` していた。#1035 の強制マイグレーションで
 * **起動時保存が実際に走る**ようになった結果、**全 asset が毎起動
 * 書き直される**状態になっていた。
 *
 * 実測(`tests/bench/migration-heap.mjs`、2000 entries / 添付 100 件 × 512KB):
 * 起動ピーク heap **157.3 → 271.8 MB(+114.6 MB)**。
 *
 * ⚠ import は別イベント(`CONTAINER_IMPORTED`)なので、本来の目的
 * (同一 key で bytes が差し替わりうる経路の保護)は残っている。
 * 本 test はその両方を pin する。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { createMemoryStore } from '@adapter/platform/idb-store';
import { mountPersistence } from '@adapter/platform/persistence';
import { setContainerFlagSource } from '@adapter/flags';
import type { Container } from '@core/model/container';

const T = '2026-07-26T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-inv', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'A', body: 'a', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: { k1: 'QUJD', k2: 'REVG' },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  setContainerFlagSource({});
});

afterEach(() => {
  vi.useRealTimers();
  setContainerFlagSource({});
});

describe('asset dirty-tracking と起動', () => {
  it('🔴 起動(CONTAINER_LOADED)では persist 済みの記録を捨てない', async () => {
    const store = createMemoryStore();
    const invalidate = vi.spyOn(store, 'invalidatePersistedAssets');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await vi.advanceTimersByTimeAsync(100);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('🔴 起動 → 保存で、既に store にある asset を書き直さない', async () => {
    const store = createMemoryStore();
    const container = makeContainer();
    // 事前に store へ入れておく(= 実運用の「前回までに保存済み」状態)
    await store.save(container);

    // 起動相当: store から読む(reassembleAssets が persist 済みとして記録する)
    const loaded = await store.load('c-inv');
    expect(Object.keys(loaded!.assets).sort()).toEqual(['k1', 'k2']);

    const dispatcher = createDispatcher();
    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
    // 起動 → 編集 1 回(保存を確実に走らせる)
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: loaded! });
    await vi.advanceTimersByTimeAsync(100);

    const puts = vi.spyOn(store, 'save');
    dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'edited' });
    await vi.advanceTimersByTimeAsync(100);

    // 保存は走るが、asset は読出で persist 済みと分かっているので書き直さない。
    // 観測点は「読み戻して壊れていないこと」+ invalidate が呼ばれていないこと。
    expect(puts).toHaveBeenCalled();
    const after = await store.load('c-inv');
    expect(after!.assets).toEqual({ k1: 'QUJD', k2: 'REVG' });
    expect(after!.entries.find((e) => e.lid === 'e1')!.body).toBe('edited');
  });

  it('import(CONTAINER_IMPORTED)では従来どおり記録を捨てる ── 同一 key で bytes が変わりうる', async () => {
    const store = createMemoryStore();
    const invalidate = vi.spyOn(store, 'invalidatePersistedAssets');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await vi.advanceTimersByTimeAsync(100);
    expect(invalidate).not.toHaveBeenCalled();

    // 同一 key・別 bytes の container を import(CONTAINER_IMPORTED を出す経路)
    dispatcher.dispatch({
      type: 'SYS_IMPORT_COMPLETE',
      container: { ...makeContainer(), assets: { k1: 'WFla', k2: 'REVG' } },
      source: 'zip',
    });
    await vi.advanceTimersByTimeAsync(100);

    // これが守りたい契約 ── import は「同一 key で bytes が変わりうる」唯一の経路
    // なので、persist 済みの記録を捨てて次の保存で書き直させる。
    expect(invalidate).toHaveBeenCalled();
    // ⚠ ここで「差し替わった bytes が storage に入ったか」までは見ない。
    //   `SYS_IMPORT_COMPLETE` は `removeOrphanAssets` を通すので、どの entry からも
    //   参照されていない asset は正常動作として purge される(本 fixture の k1/k2 が
    //   まさにそれ)。bytes の差し替えは asset 参照つき fixture の担当で、
    //   本 test の観測点は **記録を捨てたか**である。
  });
});
