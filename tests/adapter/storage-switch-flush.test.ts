/** @vitest-environment happy-dom */
/**
 * ストレージ切替バグ修正(user 報告 2026-06-24「ストレージ切り替えの動作が
 * バグってる」)。原因:`set-storage-backend` / `pick-storage-folder` が保留中の
 * debounce 保存を flush せずに `location.reload()` していたため、切替直前の編集が
 * 失われ、IDB→OPFS 非破壊移行も stale な内容をコピーしていた。
 *
 * 修正:reload 前に `flushActivePersistence()`(現在マウント中 persistence の
 * pending save を確定)を await する。本 test はその flush 機構と、切替 handler が
 * reload 前に flush することを検証する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { mountPersistence, flushActivePersistence } from '@adapter/platform/persistence';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import type { Container } from '@core/model/container';

const NOW = '2026-06-24T00:00:00.000Z';
function container(body: string): Container {
  return {
    meta: { container_id: 'c', title: 'T', created_at: NOW, updated_at: NOW, schema_version: 1 },
    entries: [{ lid: 'e1', title: 'T', body, archetype: 'text', created_at: NOW, updated_at: NOW }],
    relations: [], revisions: [], assets: {},
  };
}
const bodyInStore = async (store: ReturnType<typeof createContainerStore>): Promise<string | undefined> =>
  (await store.loadDefault())?.entries.find((e) => e.lid === 'e1')?.body;
const tick = () => new Promise((r) => setTimeout(r, 20));

describe('flushActivePersistence(切替前フラッシュ機構)', () => {
  beforeEach(() => localStorage.clear());

  it('マウント中 persistence の保留 save を確定する', async () => {
    const store = createContainerStore(createMemoryAdapter());
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: container('orig') });
    await store.save(dispatcher.getState().container!);
    const handle = mountPersistence(dispatcher, { store, debounceMs: 100000, onError: () => {}, unloadTarget: null });

    // 編集 → debounce 100s なので自動保存はまだ走らない(保留)。
    dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'EDITED' });
    expect(await bodyInStore(store)).toBe('orig'); // まだ未保存

    await flushActivePersistence(); // = 切替 handler が reload 前に呼ぶもの
    expect(await bodyInStore(store)).toBe('EDITED'); // 保留分が確定した

    handle.dispose();
  });

  it('dispose 後は no-op(別 mount を消さない / 例外なし)', async () => {
    const store = createContainerStore(createMemoryAdapter());
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: container('orig') });
    const handle = mountPersistence(dispatcher, { store, debounceMs: 100000, onError: () => {}, unloadTarget: null });
    handle.dispose();
    await expect(flushActivePersistence()).resolves.toBeUndefined();
  });
});

describe('set-storage-backend は reload 前に pending save を flush する', () => {
  beforeEach(() => localStorage.clear());

  it('切替時に直前の編集が失われない(flush→reload の順)', async () => {
    const store = createContainerStore(createMemoryAdapter());
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: container('orig') });
    await store.save(dispatcher.getState().container!);
    const handle = mountPersistence(dispatcher, { store, debounceMs: 100000, onError: () => {}, unloadTarget: null });

    const root = document.createElement('div');
    document.body.appendChild(root);
    const cleanup = bindActions(root, dispatcher);

    // 切替直前の編集(保留 save)。
    dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'EDITED' });
    expect(await bodyInStore(store)).toBe('orig');

    // reload を spy(実際の location.reload は happy-dom で副作用を持つため stub)。
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    // idb(既定)→ opfs 切替ボタンの click を action-binder delegation に流す。
    const btn = document.createElement('button');
    btn.setAttribute('data-pkc-action', 'set-storage-backend');
    btn.setAttribute('data-pkc-backend', 'opfs');
    root.appendChild(btn);
    btn.click();

    await tick(); // async handler(flush → reload)の解決を待つ

    expect(reload).toHaveBeenCalledTimes(1);
    // reload が呼ばれた = flush を await し終えた → 編集は store に確定済み。
    expect(await bodyInStore(store)).toBe('EDITED');

    vi.unstubAllGlobals();
    cleanup();
    handle.dispose();
    root.remove();
  });

  it('同一 backend への切替は no-op(reload しない)', async () => {
    localStorage.setItem('pkc2.storageBackend', 'opfs');
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: container('orig') });
    const root = document.createElement('div');
    document.body.appendChild(root);
    const cleanup = bindActions(root, dispatcher);
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    const btn = document.createElement('button');
    btn.setAttribute('data-pkc-action', 'set-storage-backend');
    btn.setAttribute('data-pkc-backend', 'opfs'); // 現在 pref と同じ
    root.appendChild(btn);
    btn.click();
    await tick();

    expect(reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    cleanup();
    root.remove();
  });
});
