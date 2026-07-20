/** @vitest-environment happy-dom */
/**
 * #940 案 A 段階2 — meta-first boot の統合 test。
 *
 * - loadDefaultMetaShallow: v2 storage では本文を読まず bodiesDeferred=true
 * - SYS_BODIES_LOADED: body='' の entry にだけ merge(boot 後の編集を守る)
 * - persistence: bodiesPending 中は保存を保留し、復元後の保存で本文を失わない
 */
import { describe, it, expect } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import { createDispatcher } from '@adapter/state/dispatcher';
import { mountPersistence } from '@adapter/platform/persistence';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-20T00:00:00Z';

function entry(lid: string, title: string, body: string): Entry {
  return { lid, title, body, archetype: 'text', created_at: T, updated_at: T };
}
function makeContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 'cv2', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries, relations: [], revisions: [], assets: {},
  };
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('meta-first 読み込み(#940 段階2)', () => {
  it('v2: loadDefaultMetaShallow は本文空 + bodiesDeferred、loadBodies で復元できる', async () => {
    const adapter = createMemoryAdapter();
    const store = createContainerStore(adapter, { lazyEntryBodies: () => true });
    await store.saveDiff(makeContainer([entry('e1', 'One', 'BODY-1')]), null);

    const { container, bodiesDeferred } = await store.loadDefaultMetaShallow();
    expect(bodiesDeferred).toBe(true);
    expect(container!.entries[0]!.body).toBe('');
    expect(container!.entries[0]!.title).toBe('One');
    expect(await store.loadBodies('cv2')).toEqual({ e1: 'BODY-1' });
  });

  it('v1(inline / split): bodiesDeferred=false で本文込み', async () => {
    const adapter = createMemoryAdapter();
    const store = createContainerStore(adapter, { lazyEntryBodies: () => false });
    await store.save(makeContainer([entry('e1', 'One', 'BODY-1')]));
    const { container, bodiesDeferred } = await store.loadDefaultMetaShallow();
    expect(bodiesDeferred).toBe(false);
    expect(container!.entries[0]!.body).toBe('BODY-1');
  });
});

describe('SYS_BODIES_LOADED の merge(#940 段階2)', () => {
  it('body="" の entry にだけ適用し、boot 後の編集は守る。flag と event も遷移', () => {
    const d = createDispatcher();
    const events: string[] = [];
    d.onEvent((ev) => events.push(ev.type));
    d.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: makeContainer([entry('e1', 'One', ''), entry('e2', 'Two', '')]),
      bodiesDeferred: true,
    });
    expect(d.getState().bodiesPending).toBe(true);
    // boot 直後に user が e2 を編集した想定(メモリ上 body 非空)
    d.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e2', body: 'USER-EDIT' });
    d.dispatch({ type: 'SYS_BODIES_LOADED', bodies: { e1: 'STORED-1', e2: 'STORED-2' } });
    const st = d.getState();
    expect(st.bodiesPending).toBe(false);
    expect(st.container!.entries.find((e) => e.lid === 'e1')!.body).toBe('STORED-1');
    expect(st.container!.entries.find((e) => e.lid === 'e2')!.body).toBe('USER-EDIT');
    expect(events).toContain('BODIES_HYDRATED');
  });
});

describe('persistence の保存保留(#940 段階2)', () => {
  it('bodiesPending 中の編集は保存されず、復元後の保存で本文が失われない', async () => {
    const adapter = createMemoryAdapter();
    const storeV2 = createContainerStore(adapter, { lazyEntryBodies: () => true });
    await storeV2.saveDiff(makeContainer([entry('e1', 'One', 'BODY-1'), entry('e2', 'Two', 'BODY-2')]), null);

    // meta-first boot を再現(本文空 + pending)
    const { container } = await storeV2.loadDefaultMetaShallow();
    const d = createDispatcher();
    const handle = mountPersistence(d, { store: storeV2, debounceMs: 0, unloadTarget: null });
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container!, bodiesDeferred: true });
    // pending 中に e1 を編集 → 保存は保留される(storage の本文は無傷)
    d.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'EDITED-1' });
    await sleep(30);
    expect(await storeV2.loadBodies('cv2')).toMatchObject({ e2: 'BODY-2' });

    // 本文復元 → 保留されていた保存が流れる
    const bodies = await storeV2.loadBodies('cv2');
    d.dispatch({ type: 'SYS_BODIES_LOADED', bodies });
    await sleep(60);
    await handle.flushPending();
    // persistence 既定は inline save(差分保存 flag OFF)なので v1 へ収束
    // する ── layout に依らず load() で本文を検証する。
    const loaded = await storeV2.load('cv2');
    const byLid = new Map(loaded!.entries.map((e) => [e.lid, e.body]));
    expect(byLid.get('e1')).toBe('EDITED-1'); // 編集は着地
    expect(byLid.get('e2')).toBe('BODY-2');   // 未編集の本文は失われない
    handle.dispose();
  });
});

// ── #940 段階3: body working-set(需要駆動 hydrate + pending 保護)──
import { mountBodyWorkingSet } from '@adapter/platform/body-working-set';

describe('body working-set(#940 段階3)', () => {
  it('選択で需要 hydrate、idle backfill で全件収束、pending 中の full-write は本文を守る', async () => {
    const adapter = createMemoryAdapter();
    const bws: { handle?: ReturnType<typeof mountBodyWorkingSet> } = {};
    const store = createContainerStore(adapter, {
      lazyEntryBodies: () => true,
      isBodyPending: (cid, lid) => bws.handle?.isPending(cid, lid) ?? false,
    });
    await store.saveDiff(makeContainer([entry('e1', 'One', 'BODY-1'), entry('e2', 'Two', 'BODY-2')]), null);

    const { container } = await store.loadDefaultMetaShallow();
    const d = createDispatcher();
    bws.handle = mountBodyWorkingSet(d, { store });
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container!, bodiesDeferred: true });
    expect(bws.handle.pendingCount()).toBe(2);

    // pending 中の full-write(previous=null)でも本文 record は無傷
    await store.saveDiff(d.getState().container!, null);
    expect(await store.loadBodies('cv2')).toEqual({ e1: 'BODY-1', e2: 'BODY-2' });

    // 選択 → 需要 hydrate
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    await bws.handle.ensure(['e1']);
    expect(d.getState().container!.entries.find((e) => e.lid === 'e1')!.body).toBe('BODY-1');
    expect(d.getState().bodiesPending).toBe(true); // まだ e2 が pending

    // barrier で全件
    await bws.handle.ensureAll();
    expect(d.getState().bodiesPending).toBe(false);
    expect(d.getState().container!.entries.find((e) => e.lid === 'e2')!.body).toBe('BODY-2');
    bws.handle.dispose();
  });
});
