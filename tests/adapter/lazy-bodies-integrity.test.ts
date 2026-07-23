/** @vitest-environment happy-dom */
/**
 * #940 案 A 段階5 — ストレージ健全性 suite(main 着地判断の材料)。
 *
 * 焦点(user 指示): 「全部やってストレージが壊れるか否か」。
 *  - v1(inline / split)↔ v2 の往復で container 全 field が完全一致
 *  - 意図的に空の body が「未 hydrate」と混同されない
 *  - export barrier(hydrateForExport)が pending 中でも全文を返す
 *  - 書込中断(applyBatch 失敗)後もリトライで収束し、読みは壊れない
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  createContainerStore,
  registerExportStore,
  hydrateForExport,
} from '@adapter/platform/idb-store';
import { mountBodyWorkingSet } from '@adapter/platform/body-working-set';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import type { StorageAdapter, BatchOp } from '@adapter/platform/storage/storage-adapter';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-20T00:00:00Z';

function fullContainer(): Container {
  const e = (lid: string, title: string, body: string, archetype: Entry['archetype'] = 'text'): Entry =>
    ({ lid, title, body, archetype, created_at: T, updated_at: T });
  return {
    meta: { container_id: 'ci', title: 'integrity', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      e('e1', 'Text', '# Hello\n\nworld'),
      e('e2', 'EmptyBody', ''), // 意図的に空
      e('e3', 'Todo', JSON.stringify({ status: 'open', description: 'do it' }), 'todo'),
      e('e4', 'Att', JSON.stringify({ name: 'a.png', mime: 'image/png', asset_key: 'k1' }), 'attachment'),
    ],
    relations: [{ id: 'r1', from: 'e1', to: 'e3', kind: 'structural', created_at: T, updated_at: T }],
    revisions: [{ id: 'rev1', entry_lid: 'e1', snapshot: 'old', created_at: T }],
    assets: { k1: 'QUJD' },
  };
}

/** 比較用正規化(assets は store 側で分離されるため load で戻る)。 */
function normalize(c: Container): unknown {
  return JSON.parse(JSON.stringify({
    meta: c.meta, entries: c.entries, relations: c.relations,
    revisions: c.revisions, assets: c.assets,
  }));
}

afterEach(() => registerExportStore(null));

describe('v1 ↔ v2 往復の完全一致(#940 段階5)', () => {
  it('inline → v2 → 編集 → v1 → v2 の全行程で field が失われない', async () => {
    const adapter = createMemoryAdapter();
    const v1 = createContainerStore(adapter, { lazyEntryBodies: () => false });
    const v2 = createContainerStore(adapter, { lazyEntryBodies: () => true });
    const c0 = fullContainer();

    await v1.save(c0); // inline
    expect(normalize((await v1.load('ci'))!)).toEqual(normalize(c0));

    await v2.saveDiff(c0, null); // → v2
    expect(normalize((await v2.load('ci'))!)).toEqual(normalize(c0));

    // v2 のまま編集(本文 + 新規 entry + revision 追加)
    const c1: Container = {
      ...c0,
      entries: [
        { ...c0.entries[0]!, body: 'EDITED' },
        ...c0.entries.slice(1),
        { lid: 'e5', title: 'New', body: 'fresh', archetype: 'text', created_at: T, updated_at: T },
      ],
      revisions: [...c0.revisions,
        { id: 'rev2', entry_lid: 'e1', snapshot: '# Hello', created_at: T }],
    };
    await v2.saveDiff(c1, c0);
    expect(normalize((await v2.load('ci'))!)).toEqual(normalize(c1));

    // v1 split へ復帰 → v2 へ再移行
    await v1.saveDiff(c1, c1);
    expect(normalize((await v1.load('ci'))!)).toEqual(normalize(c1));
    await v2.saveDiff(c1, c1);
    expect(normalize((await v2.load('ci'))!)).toEqual(normalize(c1));
    // inline へ完全復帰
    await v1.save(c1);
    expect(normalize((await v1.load('ci'))!)).toEqual(normalize(c1));
    expect(await adapter.bucket('containers').getKeysByPrefix('__body__:')).toEqual([]);
  });

  it('意図的に空の body は v2 でも空のまま往復する(未 hydrate と混同しない)', async () => {
    const adapter = createMemoryAdapter();
    const v2 = createContainerStore(adapter, { lazyEntryBodies: () => true });
    await v2.saveDiff(fullContainer(), null);
    const { container } = await v2.loadDefaultMetaShallow();
    // meta-first でも e2 は '' → hydrate 後も ''(record 有無に依らず一致)
    const bodies = await v2.loadBodies('ci');
    expect(bodies['e2']).toBe('');
    expect(container!.entries.find((e) => e.lid === 'e2')!.body).toBe('');
  });
});

describe('export barrier(#940 段階5)', () => {
  it('pending 中の hydrateForExport は全文を復元して返す', async () => {
    const adapter = createMemoryAdapter();
    const bws: { h?: ReturnType<typeof mountBodyWorkingSet> } = {};
    const store = createContainerStore(adapter, {
      lazyEntryBodies: () => true,
      isBodyPending: (c, l) => bws.h?.isPending(c, l) ?? false,
    });
    await store.saveDiff(fullContainer(), null);
    const { container } = await store.loadDefaultMetaShallow();
    const d = createDispatcher();
    bws.h = mountBodyWorkingSet(d, { store });
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container!, bodiesDeferred: true });
    registerExportStore(store);

    const exported = await hydrateForExport(d.getState().container!);
    expect(exported.entries.find((e) => e.lid === 'e1')!.body).toBe('# Hello\n\nworld');
    expect(exported.entries.find((e) => e.lid === 'e3')!.body).toContain('do it');
    bws.h.dispose();
  });
});

describe('書込中断からの収束(#940 段階5)', () => {
  it('applyBatch が途中失敗しても、リトライ保存で完全収束し読みは壊れない', async () => {
    const base = createMemoryAdapter();
    let failOnce = true;
    const flaky: StorageAdapter = {
      ...base,
      bucket(name) {
        const b = base.bucket(name);
        if (name !== 'containers') return b;
        return {
          ...b,
          async applyBatch(ops: BatchOp[]) {
            // P2-3(layout 5)後の containers バッチは [core, __default__] の
            // 2 ops(本文/履歴は segments 側)— 中断シミュレーションの
            // 閾値を新レイアウトに合わせる(core だけ書けて default 前に
            // 落ちる = 実際に起こりうる中断点)。
            if (failOnce && ops.length >= 2) {
              failOnce = false;
              await b.applyBatch(ops.slice(0, Math.floor(ops.length / 2)));
              throw new Error('simulated crash mid-batch');
            }
            return b.applyBatch(ops);
          },
        };
      },
    };
    const store = createContainerStore(flaky, { lazyEntryBodies: () => true });
    const c0 = fullContainer();
    await expect(store.saveDiff(c0, null)).rejects.toThrow('simulated crash');
    // リトライ(次の debounce 保存に相当)→ 収束
    await store.saveDiff(c0, null);
    expect(normalize((await store.load('ci'))!)).toEqual(normalize(c0));
  });
});
