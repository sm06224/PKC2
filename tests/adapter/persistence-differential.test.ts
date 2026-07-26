/**
 * @vitest-environment happy-dom
 *
 * 差分保存の persistence 統合(改善バッチ④ 2026-07)。
 * 自動保存が saveDiff 経路に乗り、前回保存した container がベースとして
 * 渡ること(= 2 回目以降が差分になること)を、dispatch → debounce flush →
 * store 観測点で assert。
 *
 * ⚠ **`persistence.differential_save` は 2026-07-26 に退役した**ため、
 * flag source 経由では ON にできない(退役 flag はどの source も見ない)。
 * split 機構そのものは残っている(FS backend の委譲元)ので、本 suite は
 * `mountPersistence` の `differentialSave` 注入口で機構を動かす。
 * 「退役後の既定経路が inline である」ことの pin は
 * `tests/adapter/differential-save-retirement.test.ts` が持つ。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { createMemoryStore } from '@adapter/platform/idb-store';
import { mountPersistence } from '@adapter/platform/persistence';
import { setContainerFlagSource } from '@adapter/flags';
import type { Container } from '@core/model/container';

const T = '2026-07-13T00:00:00Z';

/** 退役 flag の代わりに機構を動かす注入口の値。 */
let diffOn = true;
const differentialSave = (): boolean => diffOn;

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
  diffOn = true;
  setContainerFlagSource({});
});

afterEach(() => {
  vi.useRealTimers();
  diffOn = true;
  setContainerFlagSource({});
});

describe('persistence × 差分保存機構(退役後は注入口経由)', () => {
  it('差分保存 ON: 保存は saveDiff 経由、2 回目は前回 container がベースに渡る', async () => {
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const diffSpy = vi.spyOn(store, 'saveDiff');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null, differentialSave });
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

  it('既定(#958 で OFF へ撤回・2026-07-26 に退役): 注入口なしなら inline save 経路', async () => {
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

  it('差分保存 OFF(オプトアウト): 従来どおり save() を使い saveDiff は呼ばれない', async () => {
    diffOn = false;
    const store = createMemoryStore();
    const saveSpy = vi.spyOn(store, 'save');
    const diffSpy = vi.spyOn(store, 'saveDiff');
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null, differentialSave });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await vi.advanceTimersByTimeAsync(100);

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(diffSpy).not.toHaveBeenCalled();
  });

  it('セッション中の OFF→ON 切替でもデータが欠損しない(inline→split 自己回復)', async () => {
    diffOn = false; // OFF で開始
    const store = createMemoryStore();
    const dispatcher = createDispatcher();

    mountPersistence(dispatcher, { store, debounceMs: 50, unloadTarget: null, differentialSave });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await vi.advanceTimersByTimeAsync(100); // inline save

    diffOn = true;
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

    const handle = mountPersistence(dispatcher, {
      store, debounceMs: 5000, unloadTarget: null, differentialSave,
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await handle.flushPending();
    expect(diffSpy).toHaveBeenCalledTimes(1);
  });
});
