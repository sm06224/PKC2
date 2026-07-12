/**
 * @vitest-environment happy-dom
 *
 * 差分保存の persistence 統合(改善バッチ④ 2026-07)。
 * `persistence.differential_save` flag ON で自動保存が saveDiff 経路に
 * 乗り、前回保存した container がベースとして渡ること(= 2 回目以降が
 * 差分になること)を、dispatch → debounce flush → store 観測点で assert。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { createMemoryStore } from '@adapter/platform/idb-store';
import { mountPersistence } from '@adapter/platform/persistence';
import { setContainerFlagSource } from '@adapter/flags';
import type { Container } from '@core/model/container';

const T = '2026-07-13T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-pd', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'A', body: 'a', archetype: 'text', created_at: T, updated_at: T },
      { lid: 'e2', title: 'B', body: 'b', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  setContainerFlagSource({ 'persistence.differential_save': true });
});

afterEach(() => {
  vi.useRealTimers();
  setContainerFlagSource({});
});

describe('persistence × differential_save flag', () => {
  it('flag ON: 保存は saveDiff 経由、2 回目は前回 container がベースに渡る', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const diffSpy = vi.spyOn(store, 'saveDiff');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await vi.advanceTimersByTimeAsync(100);

    expect(saveSpy).not.toHaveBeenCalled();
    expect(diffSpy).toHaveBeenCalledTimes(1);
    expect(diffSpy.mock.calls[0]![1]).toBeNull(); // 初回はベース無し
    const firstSaved = diffSpy.mock.calls[0]![0];

    // 編集 → 2 回目の保存はベース = 前回保存した container
    dispatcher.dispatch({
      type: 'QUICK_UPDATE_ENTRY',
      lid: 'e1',
      body: 'edited',
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(diffSpy).toHaveBeenCalledTimes(2);
    expect(diffSpy.mock.calls[1]![1]).toBe(firstSaved);

    // storage 側でも編集が読み戻せる(end-to-end)
    const loaded = await store.load('c-pd');
    expect(loaded!.entries.find((e) => e.lid === 'e1')!.body).toBe('edited');
    expect(loaded!.entries.map((e) => e.lid)).toEqual(['e1', 'e2']);
  });

  it('flag OFF(既定): 従来どおり save() を使い saveDiff は呼ばれない', async () => {
    setContainerFlagSource({}); // 既定 = OFF
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const diffSpy = vi.spyOn(store, 'saveDiff');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await vi.advanceTimersByTimeAsync(100);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(diffSpy).not.toHaveBeenCalled();
  });

  it('セッション中の flag OFF→ON 切替でもデータが欠損しない(inline→split 自己回復)', async () => {
    setContainerFlagSource({}); // OFF で開始
    const store = createMemoryStore();
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await vi.advanceTimersByTimeAsync(100); // inline save

    setContainerFlagSource({ 'persistence.differential_save': true });
    dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e2', body: 'zz' });
    await vi.advanceTimersByTimeAsync(100); // saveDiff(marker 不在 → 全件)

    const loaded = await store.load('c-pd');
    expect(loaded!.entries.map((e) => e.lid)).toEqual(['e1', 'e2']);
    expect(loaded!.entries.find((e) => e.lid === 'e2')!.body).toBe('zz');
  });

  it('flushPending(pagehide 経路)でも saveDiff が使われる', async () => {
    const store = createMemoryStore();
    const diffSpy = vi.spyOn(store, 'saveDiff');
    const dispatcher = createDispatcher();

    const handle = mountPersistence(dispatcher, { store, debounceMs: 5000, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await handle.flushPending();
    expect(diffSpy).toHaveBeenCalledTimes(1);
  });
});
