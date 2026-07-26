/**
 * @vitest-environment happy-dom
 *
 * `persistence.differential_save` の退役と「次回起動での強制マイグレーション」
 * (2026-07-26、user 指示「差分保存のユーザーが次回起動したら、強制的に
 * マイグレーションしてください」)。
 *
 * ## なぜ退役するのか(性能ではなくデータの話)
 *
 * #1022 が relations と順序リストを core record から `__rel__:` / `__order__:`
 * サイドカーへ出した。読み側は「サイドカーがあればそれが正本、無ければ core の
 * inline」で両立させているが、**#1022 より前のビルドにはこの合流が無い**。
 * よって差分保存 ON の storage を古い `pkc2.html` で開くと
 * **relations が 0 件に見え、その状態で保存すると実際に消える**。
 * PKC2 は単一 HTML 製品で、旧 `pkc2.html` を手元に残す運用が実在する。
 *
 * ## 本 test が守るもの
 *
 *   1. **導線の封鎖** ── どの source から指定されても有効にならない
 *   2. **強制マイグレーションの経路** ── 起動しただけで inline へ書き戻り、
 *      サイドカーが掃除され、データが完全に保たれる
 *   3. 🔴 **退役の目的そのもの** ── 旧ビルド相当の読み方で relations と
 *      revision 順序が戻ること(移行前は壊れて見えることも同時に pin する)
 *   4. **#1024 の最適化に潰されないこと** ── split storage は
 *      `storedInline === false` なので、起動時保存が skip されない
 *
 * ⚠ 4 つはどれも「性能最適化」で消えうる。落ちたら最適化ではなく退行である。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createContainerStore } from '@adapter/platform/idb-store';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import { mountPersistence } from '@adapter/platform/persistence';
import { createDispatcher } from '@adapter/state/dispatcher';
import { setFlagSource, getRegisteredFlags } from '@core/flags';
import type { StorageAdapter } from '@adapter/platform/storage/storage-adapter';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { vi } from 'vitest';

const T = '2026-07-26T00:00:00Z';
const CID = 'c-dsr';
const KEY = 'persistence.differential_save';

function entry(lid: string, body: string): Entry {
  return { lid, title: lid, body, archetype: 'text', created_at: T, updated_at: T };
}

/**
 * revision の配列順が失われたことを観測できる形にする。
 * 保存順は `v2, v1` ── prefix scan は key 昇順(`v1, v2`)を返すので、
 * 「順序リストを読めない読み手」では順序が入れ替わる。
 */
function makeContainer(): Container {
  return {
    meta: { container_id: CID, title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [entry('e1', '本文1'), entry('e2', '本文2')],
    relations: [
      { id: 'r1', from: 'e1', to: 'e2', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r2', from: 'e2', to: 'e1', kind: 'semantic', created_at: T, updated_at: T },
    ],
    revisions: [
      { id: 'v2', entry_lid: 'e1', snapshot: 's2', created_at: T },
      { id: 'v1', entry_lid: 'e1', snapshot: 's1', created_at: T },
    ],
    assets: {},
  };
}

const src = (value: unknown) => (k: string) => (k === KEY ? (value as never) : undefined);

/**
 * **#1022 より前のビルドの読み方**を忠実に再現する。
 *
 * - `__pkc_split__` marker があれば `__entry__:` / `__rev__:` を読んで復元する
 *   (split 自体は #1022 より前から在る)
 * - 並び順は **marker の順序リスト**だけを見る(`__order__:` サイドカーを知らない)
 * - relations は **core record の inline** をそのまま採る(`__rel__:` を知らない)
 *
 * 出典: `git show d5aef45^:src/adapter/platform/idb-store.ts` の `reassembleSplit`。
 */
async function readAsPreSidecarBuild(
  adapter: StorageAdapter,
  cid: string,
): Promise<Container | null> {
  const bucket = adapter.bucket('containers');
  const rec = (await bucket.get(cid)) as (Container & {
    __pkc_split__?: { entryOrder: string[]; revOrder: string[] };
  }) | undefined;
  if (!rec) return null;
  const marker = rec.__pkc_split__;
  if (!marker) return rec;

  const ePrefix = `__entry__:${cid}:`;
  const rPrefix = `__rev__:${cid}:`;
  const entryByLid = new Map<string, Entry>();
  for (const { key, value } of await bucket.getAllByPrefix(ePrefix)) {
    entryByLid.set(key.slice(ePrefix.length), value as Entry);
  }
  const revById = new Map<string, Container['revisions'][number]>();
  for (const { key, value } of await bucket.getAllByPrefix(rPrefix)) {
    revById.set(key.slice(rPrefix.length), value as Container['revisions'][number]);
  }
  const entries: Entry[] = [];
  for (const lid of marker.entryOrder) {
    const e = entryByLid.get(lid);
    if (e) { entries.push(e); entryByLid.delete(lid); }
  }
  for (const e of entryByLid.values()) entries.push(e);
  const revisions: Container['revisions'][number][] = [];
  for (const id of marker.revOrder) {
    const r = revById.get(id);
    if (r) { revisions.push(r); revById.delete(id); }
  }
  for (const r of revById.values()) revisions.push(r);

  return { ...rec, entries, revisions, relations: rec.relations ?? [] };
}

const sidecarKeys = async (a: StorageAdapter): Promise<string[]> => {
  const b = a.bucket('containers');
  return [
    ...(await b.getKeysByPrefix(`__entry__:${CID}:`)),
    ...(await b.getKeysByPrefix(`__rev__:${CID}:`)),
    ...(await b.getKeysByPrefix(`__rel__:${CID}`)),
    ...(await b.getKeysByPrefix(`__order__:${CID}:`)),
  ];
};

/** 退役前に差分保存で書かれていた storage を作る。 */
async function seedSplitStorage(adapter: StorageAdapter): Promise<void> {
  const writer = createContainerStore(adapter);
  await writer.saveDiff(makeContainer(), null);
}

afterEach(() => {
  setFlagSource('url', () => undefined);
  setFlagSource('container', () => undefined);
});

describe('differential_save の退役 ── 導線の封鎖', () => {
  it('🔴 どの source から指定されても有効にならない', async () => {
    const adapter = createMemoryAdapter();
    await seedSplitStorage(adapter);
    const store = createContainerStore(adapter);
    const diffSpy = vi.spyOn(store, 'saveDiff');
    const saveSpy = vi.spyOn(store, 'save');

    // URL flag 相当 / container の __flags__ 相当 / 文字列表記 ── すべて素通りさせない
    setFlagSource('url', src(true));
    setFlagSource('container', src(true));
    const dispatcher = createDispatcher();
    const handle = mountPersistence(dispatcher, { store, debounceMs: 0, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await handle.flushPending();
    handle.dispose();

    expect(diffSpy).not.toHaveBeenCalled();
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('文字列 "true" でも有効にならない', async () => {
    const adapter = createMemoryAdapter();
    const store = createContainerStore(adapter);
    const diffSpy = vi.spyOn(store, 'saveDiff');

    setFlagSource('url', src('true'));
    const dispatcher = createDispatcher();
    const handle = mountPersistence(dispatcher, { store, debounceMs: 0, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await handle.flushPending();
    handle.dispose();

    expect(diffSpy).not.toHaveBeenCalled();
  });

  it('Flags Inspector の一覧に現れない', () => {
    expect(getRegisteredFlags().some((f) => f.key === KEY)).toBe(false);
  });
});

describe('differential_save の退役 ── 次回起動での強制マイグレーション', () => {
  it('🔴 起動しただけで inline へ書き戻り、サイドカーが掃除される', async () => {
    const adapter = createMemoryAdapter();
    await seedSplitStorage(adapter);
    // 退役前の状態: split marker あり + サイドカーあり
    const before = (await adapter.bucket('containers').get(CID)) as Record<string, unknown>;
    expect(before['__pkc_split__']).toBeDefined();
    expect((await sidecarKeys(adapter)).length).toBeGreaterThan(0);

    // 退役後の起動: container を読んで dispatch するだけ(編集は 1 回もしない)
    const store = createContainerStore(adapter);
    const loaded = await store.loadDefault();
    const dispatcher = createDispatcher();
    const handle = mountPersistence(dispatcher, { store, debounceMs: 0, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: loaded! });
    await handle.flushPending();
    handle.dispose();

    const after = (await adapter.bucket('containers').get(CID)) as Record<string, unknown>;
    expect(after['__pkc_split__']).toBeUndefined();
    expect(after['__pkc_layout__']).toBeUndefined();
    expect(await sidecarKeys(adapter)).toEqual([]);
  });

  it('🔴 移行でデータが 1 件も失われない(entries / relations / revisions / 順序)', async () => {
    const adapter = createMemoryAdapter();
    await seedSplitStorage(adapter);

    const store = createContainerStore(adapter);
    const loaded = await store.loadDefault();
    const dispatcher = createDispatcher();
    const handle = mountPersistence(dispatcher, { store, debounceMs: 0, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: loaded! });
    await handle.flushPending();
    handle.dispose();

    const after = await createContainerStore(adapter).loadDefault();
    const want = makeContainer();
    expect(after!.entries.map((e) => e.lid)).toEqual(['e1', 'e2']);
    expect(after!.entries.map((e) => e.body)).toEqual(['本文1', '本文2']);
    expect(after!.relations).toEqual(want.relations);
    // 配列順は同着 revision の tie-break として効いているので、順序ごと保つ
    expect(after!.revisions.map((r) => r.id)).toEqual(['v2', 'v1']);
  });

  it('🔴 #1024 の「変わっていないなら書かない」に潰されない(storedInline が false)', async () => {
    const adapter = createMemoryAdapter();
    await seedSplitStorage(adapter);

    // main.ts はこの値が false のとき notePersistedBaseline() を呼ばない。
    // ここが true に化けると起動時保存が skip され、移行が永久に起きない。
    const shallow = await createContainerStore(adapter).loadDefaultMetaShallow();
    expect(shallow.storedInline).toBe(false);

    // 移行後は true になる(= 以後の起動は無駄書きしない)
    const store = createContainerStore(adapter);
    await store.save((await store.loadDefault())!);
    expect((await createContainerStore(adapter).loadDefaultMetaShallow()).storedInline).toBe(true);
  });
});

describe('differential_save の退役 ── 退役の目的(旧ビルド互換の回復)', () => {
  it('🔴 移行前: 旧ビルド相当の読み方では relations が 0 件になり、revision 順序も失われる', async () => {
    const adapter = createMemoryAdapter();
    await seedSplitStorage(adapter);

    const asOld = await readAsPreSidecarBuild(adapter, CID);
    // これが退役の理由そのもの ── この状態で保存されると relations が実際に消える
    expect(asOld!.relations).toEqual([]);
    expect(asOld!.revisions.map((r) => r.id)).toEqual(['v1', 'v2']); // 保存順は v2, v1
  });

  it('🔴 移行後: 旧ビルド相当の読み方でも relations と revision 順序が完全に読める', async () => {
    const adapter = createMemoryAdapter();
    await seedSplitStorage(adapter);

    const store = createContainerStore(adapter);
    const loaded = await store.loadDefault();
    const dispatcher = createDispatcher();
    const handle = mountPersistence(dispatcher, { store, debounceMs: 0, unloadTarget: null });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: loaded! });
    await handle.flushPending();
    handle.dispose();

    const asOld = await readAsPreSidecarBuild(adapter, CID);
    expect(asOld!.relations).toEqual(makeContainer().relations);
    expect(asOld!.revisions.map((r) => r.id)).toEqual(['v2', 'v1']);
    expect(asOld!.entries.map((e) => e.lid)).toEqual(['e1', 'e2']);
    expect(asOld!.entries.map((e) => e.body)).toEqual(['本文1', '本文2']);
  });
});
