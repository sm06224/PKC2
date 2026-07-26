/** @vitest-environment happy-dom */
/**
 * export 時の hydrate 順序(2026-07-26 hotfix)。
 *
 * `hydrateForExport` は 2 段構えになっている:
 *   1. `hydrateReferencedAssets` — entry の body を走査して参照 asset を集め、store から読む
 *   2. `hydratePendingBodiesForExport` — 未 hydrate の本文を store から戻す
 *
 * **この順序が逆だった。** asset の参照源は entry の body だけである
 * (`features/asset/asset-scan.ts`: attachment body の JSON `asset_key` /
 *  text・textlog body の `![](asset:K)`)。
 *
 * `lazy_entry_bodies` ON の meta-first boot 直後は **全 entry の body が `''`** なので、
 * 1 の時点で参照集合が空になり、**添付を 1 件も含まない ZIP / HTML** が出来ていた。
 * 本文だけは 2 で戻るため、**「本文はあるのに添付が全部無い」バックアップ**になる。
 *
 * 影響していた経路(すべて `hydrateForExport` を通る):
 *   - Backup ZIP(`zip-package.ts`)
 *   - HTML full export(`exporter.ts`)
 *   - **移行前バックアップ ZIP**(`migration-gate.ts` / `pre-migration-backup.ts`)
 *   - フォルダ sink の常時バックアップ(`folder-sink.ts`)
 *
 * つまり **「移行前に強制生成する安全網」自体が壊れていた**。
 * `pre-migration-backup.ts` の doc「参照 asset は export 側で hydrate されるため
 * working-set が部分でも欠落しない」は lazy body 下では成立していなかった。
 *
 * 修正は順序の入れ替え(本文を戻してから asset を集める)。
 * 本 test はその順序を pin する。
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  createContainerStore,
  registerExportStore,
  hydrateForExport,
} from '@adapter/platform/idb-store';
import { mountBodyWorkingSet } from '@adapter/platform/body-working-set';
import { createMemoryAdapter } from '@adapter/platform/storage/memory-adapter';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-26T00:00:00Z';
const entry = (
  lid: string,
  title: string,
  body: string,
  archetype: Entry['archetype'] = 'text',
): Entry => ({ lid, title, body, archetype, created_at: T, updated_at: T });

/** 参照の 2 経路(markdown の `asset:` と attachment の `asset_key`)を両方持たせる。 */
function seedContainer(): Container {
  return {
    meta: { container_id: 'cx', title: 'x', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      entry('e1', 'Text', '# Hi\n\n![](asset:K2)'),
      entry('e2', 'Att', JSON.stringify({ name: 'a.png', mime: 'image/png', asset_key: 'K1' }), 'attachment'),
    ],
    relations: [],
    revisions: [],
    assets: { K1: 'QUJD', K2: 'REVG' },
  };
}

afterEach(() => registerExportStore(null));

/** layout 5 で保存 → meta-first boot(本文は pending)まで進めた状態を作る。 */
async function bootLazy(): Promise<{
  dispatcher: ReturnType<typeof createDispatcher>;
  workingSet: ReturnType<typeof mountBodyWorkingSet>;
}> {
  const adapter = createMemoryAdapter();
  const holder: { h?: ReturnType<typeof mountBodyWorkingSet> } = {};
  const store = createContainerStore(adapter, {
    lazyEntryBodies: () => true,
    isBodyPending: (c, l) => holder.h?.isPending(c, l) ?? false,
  });
  await store.saveDiff(seedContainer(), null);

  const { container, bodiesDeferred } = await store.loadDefaultMetaShallow();
  expect(bodiesDeferred).toBe(true); // 前提が崩れたら test の意味が無い
  const dispatcher = createDispatcher();
  holder.h = mountBodyWorkingSet(dispatcher, { store });
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: container!, bodiesDeferred: true });
  registerExportStore(store);
  return { dispatcher, workingSet: holder.h };
}

describe('export の hydrate 順序(本文 → asset)', () => {
  it('🔴 meta-first boot 直後でも、export は参照 asset を全件含む', async () => {
    const { dispatcher, workingSet } = await bootLazy();
    const booted = dispatcher.getState().container!;

    // 前提: boot 直後は本文が空で、resident な asset も無い
    expect(booted.entries.map((e) => e.body)).toEqual(['', '']);
    expect(Object.keys(booted.assets)).toEqual([]);

    const exported = await hydrateForExport(booted);

    // 🔴 ここが壊れていた ── 順序が逆だと [] になる
    expect(Object.keys(exported.assets).sort()).toEqual(['K1', 'K2']);
    expect(exported.assets.K1).toBe('QUJD');
    expect(exported.assets.K2).toBe('REVG');
    // 本文も従来どおり戻っていること(barrier の本来の役目)
    expect(exported.entries[0]?.body).toContain('asset:K2');
    workingSet.dispose();
  });

  it('本文が既に resident なら従来どおり(回帰していない)', async () => {
    const { dispatcher, workingSet } = await bootLazy();
    // 本文を先に hydrate しておく(通常の閲覧で起きる状態)
    await workingSet.ensure(['e1', 'e2']);
    const withBodies = dispatcher.getState().container!;
    expect(withBodies.entries[0]?.body).toContain('asset:K2');

    const exported = await hydrateForExport(withBodies);
    expect(Object.keys(exported.assets).sort()).toEqual(['K1', 'K2']);
    workingSet.dispose();
  });

  it('resident な asset は store の値に上書きされない(resident wins)', async () => {
    const { dispatcher, workingSet } = await bootLazy();
    const booted = dispatcher.getState().container!;
    const withResident: Container = { ...booted, assets: { K1: 'RESIDENT' } };

    const exported = await hydrateForExport(withResident);
    expect(exported.assets.K1).toBe('RESIDENT'); // 手元の値が勝つ
    expect(exported.assets.K2).toBe('REVG');     // 足りない分は store から
    workingSet.dispose();
  });
});
