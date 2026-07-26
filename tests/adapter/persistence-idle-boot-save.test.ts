/** @vitest-environment happy-dom */
/**
 * 「起動しただけでコンテナ全体を書く」を止める(2026-07-26)。
 *
 * `CONTAINER_LOADED` は `SAVE_TRIGGERS` の一員である(`persistence.ts:56`)。
 * boot は `SYS_INIT_COMPLETE` → reducer が `CONTAINER_LOADED`(`app-state.ts:1380`)
 * を出すので、**編集を 1 回もしなくても起動のたびにコンテナ全体が保存される**。
 *
 * put 計器での実測(`bench-fixtures/c-5000-rev.json`、N=5000 / M=15000):
 *
 *   ■ A 既定(inline) — **起動しただけ**で put 3 回 / 25685 KB
 *         25685 KB  put 1 回  core record
 *
 * 既定パスなので全 user が毎起動これを踏む。
 *
 * ただし trigger 自体は消せない ── `mergeSystemEntries`(`main.ts`)が
 * system entry を足した場合、その差分は保存しなければならない。
 * よって「**変わっていないなら書かない**」で止める。
 *
 * 判定は **参照比較のみ**。Container は immutable に更新されるので
 * 参照が同じなら中身も同じ(偽陽性なし)。参照が違って中身が同じ場合は
 * 保存が 1 回走るだけで安全側に倒れる。
 *
 * ⚠ 基準値を立ててよいのは storage が既に「書き戻しても変わらない形式」の
 * ときだけ(`loadDefaultMetaShallow().storedInline`)。split / layout 5 から
 * flag を戻した直後の保存は**形式を戻す作業**なので止めてはならない。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountPersistence, notePersistedBaseline } from '@adapter/platform/persistence';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { ContainerStore } from '@adapter/platform/idb-store';
import type { Container } from '@core/model/container';

const T = '2026-07-26T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'cb', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'A', body: 'a', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function fakeStore(): ContainerStore {
  return {
    save: vi.fn(async () => undefined),
    saveDiff: vi.fn(async () => undefined),
    load: vi.fn(async () => null),
    loadShallow: vi.fn(async () => null),
    loadDefault: vi.fn(async () => null),
    loadDefaultShallow: vi.fn(async () => null),
    loadDefaultMetaShallow: vi.fn(async () => ({
      container: null, bodiesDeferred: false, storedInline: false,
    })),
    loadBodies: vi.fn(async () => ({})),
    loadBodiesFor: vi.fn(async () => ({})),
    loadAsset: vi.fn(async () => null),
    loadAssets: vi.fn(async () => ({})),
    listContainers: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    purgeAssetsExcept: vi.fn(async () => undefined),
    invalidatePersistedAssets: vi.fn(),
    saveWorkspace: vi.fn(async () => undefined),
    loadWorkspace: vi.fn(async () => null),
  } as unknown as ContainerStore;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('起動しただけの保存を止める', () => {
  it('🔴 基準値を立てた container を CONTAINER_LOADED で保存しない', async () => {
    const store = fakeStore();
    const dispatcher = createDispatcher();
    const handle = mountPersistence(dispatcher, { store, debounceMs: 20, unloadTarget: null });

    const container = makeContainer();
    notePersistedBaseline(container); // boot: storage と一致していると判明している
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container, viewOnlySource: false });

    await vi.advanceTimersByTimeAsync(100);
    expect(store.save).not.toHaveBeenCalled();
    handle.dispose();
  });

  it('基準値を立てなければ従来どおり保存する(storedInline=false の経路)', async () => {
    const store = fakeStore();
    const dispatcher = createDispatcher();
    const handle = mountPersistence(dispatcher, { store, debounceMs: 20, unloadTarget: null });

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer(), viewOnlySource: false });

    await vi.advanceTimersByTimeAsync(100);
    expect(store.save).toHaveBeenCalledTimes(1);
    handle.dispose();
  });

  it('🔴 基準値を立てても、その後の編集は必ず保存される', async () => {
    const store = fakeStore();
    const dispatcher = createDispatcher();
    const handle = mountPersistence(dispatcher, { store, debounceMs: 20, unloadTarget: null });

    const container = makeContainer();
    notePersistedBaseline(container);
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container, viewOnlySource: false });
    await vi.advanceTimersByTimeAsync(100);
    expect(store.save).not.toHaveBeenCalled();

    // 本文を変える = container の参照が変わる
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'changed' });
    await vi.advanceTimersByTimeAsync(100);
    expect(store.save).toHaveBeenCalledTimes(1);

    // 保存後に何も変えなければ、二度目は走らない
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    await vi.advanceTimersByTimeAsync(100);
    expect(store.save).toHaveBeenCalledTimes(1);
    handle.dispose();
  });

  it('dispose 後は module hook が外れる(別 mount を汚さない)', async () => {
    const s1 = fakeStore();
    const d1 = createDispatcher();
    const h1 = mountPersistence(d1, { store: s1, debounceMs: 20, unloadTarget: null });
    h1.dispose();

    // dispose 済みの persistence に基準値を渡しても、次の mount には効かない
    const container = makeContainer();
    notePersistedBaseline(container);

    const s2 = fakeStore();
    const d2 = createDispatcher();
    const h2 = mountPersistence(d2, { store: s2, debounceMs: 20, unloadTarget: null });
    d2.dispatch({ type: 'SYS_INIT_COMPLETE', container, viewOnlySource: false });
    await vi.advanceTimersByTimeAsync(100);
    expect(s2.save).toHaveBeenCalledTimes(1);
    h2.dispose();
  });
});
