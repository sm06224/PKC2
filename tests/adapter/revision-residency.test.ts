/** @vitest-environment happy-dom */
/**
 * P4a(wasm-sqlite §7-d)── revision residency の統合 test。
 *
 * pin する不変条件:
 *  1. deferred 中の件数 = COUNT 索引 + boot 後の追記数(常駐配列に依らない)
 *  2. ensureEntry の hydrate merge は id 重複せず、SAVE_TRIGGERS を発火しない
 *  3. 追記の観測: reducer の revision 追記が件数に反映される
 *  4. ensureAll 後は全量常駐 = 従来導出へ戻る(purge の前提)
 *  5. SYS_REVISIONS_HYDRATED の reducer merge(重複排除・created_at 安定 sort)
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createDispatcher } from '../../src/adapter/state/dispatcher';
import {
  ensureAllRevisionsResident,
  isRevisionHydrationPending,
  mountRevisionResidency,
  revisionCountOf,
  type RevisionResidencyHandle,
} from '../../src/adapter/platform/revision-residency';
import type { ContainerStore } from '../../src/adapter/platform/idb-store';
import type { Container, Revision } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';

const T = '2026-07-01T00:00:00Z';

function entry(lid: string): Entry {
  return { lid, title: lid, body: 'b', archetype: 'text', created_at: T, updated_at: T };
}
function rev(id: string, lid: string, at: string): Revision {
  return { id, entry_lid: lid, snapshot: '{}', created_at: at };
}
function makeContainer(revisions: Revision[]): Container {
  return {
    meta: { container_id: 'c1', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [entry('e1'), entry('e2')],
    relations: [],
    revisions,
    assets: {},
  };
}

/** 全 revisions を持つ fake store(optional P4a メソッドだけ実装)。 */
function fakeStore(all: Revision[]): Pick<
  ContainerStore,
  'loadRevisionCounts' | 'loadRevisionsFor' | 'loadAllRevisions' | 'noteHydratedRevisions'
> & { hydratedNotes: Revision[][] } {
  const hydratedNotes: Revision[][] = [];
  return {
    hydratedNotes,
    async loadRevisionCounts() {
      const out: Record<string, number> = {};
      for (const r of all) out[r.entry_lid] = (out[r.entry_lid] ?? 0) + 1;
      return out;
    },
    async loadRevisionsFor(_cid: string, lid: string) {
      return all.filter((r) => r.entry_lid === lid);
    },
    async loadAllRevisions() {
      return [...all];
    },
    noteHydratedRevisions(_cid, revisions) {
      hydratedNotes.push([...revisions]);
    },
  };
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let handle: RevisionResidencyHandle | null = null;
afterEach(() => {
  handle?.dispose();
  handle = null;
});

describe('revision residency(P4a)', () => {
  it('件数 = COUNT 索引 + 追記数。hydrate merge は保存 trigger を出さない', async () => {
    const stored = [rev('r1', 'e1', '2026-07-01T01:00:00Z'), rev('r2', 'e1', '2026-07-02T01:00:00Z')];
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer([]) });

    const store = fakeStore(stored);
    handle = mountRevisionResidency(d, { store: store as unknown as ContainerStore, cid: 'c1' });
    await flush();

    // COUNT 索引が効いている(常駐 0 件でも 2)
    const c = d.getState().container!;
    expect(revisionCountOf(c, 'e1')).toBe(2);
    expect(revisionCountOf(c, 'e2')).toBe(0);
    expect(isRevisionHydrationPending(c, 'e1')).toBe(true);

    const saveEvents: string[] = [];
    d.onEvent((e) => saveEvents.push(e.type));

    await handle.ensureEntry('e1');
    await flush();
    const c2 = d.getState().container!;
    expect(c2.revisions.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(isRevisionHydrationPending(c2, 'e1')).toBe(false);
    expect(saveEvents).toEqual(['REVISIONS_HYDRATED']);
    // baseline へ行が渡っている(再 upsert 防止)
    expect(store.hydratedNotes.at(-1)!.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('reducer の追記が件数に乗る(選択 entry の需要駆動と独立)', async () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer([]) });
    const store = fakeStore([rev('r1', 'e1', '2026-07-01T01:00:00Z')]);
    handle = mountRevisionResidency(d, { store: store as unknown as ContainerStore, cid: 'c1' });
    await flush();

    // reducer 追記を模す: 直接 SYS_REVISIONS_HYDRATED は使わず、追記型の
    // container 差し替え(UPDATE 系 action の帰結)を最小の形で再現する。
    const cur = d.getState().container!;
    const appended = { ...cur, revisions: [...cur.revisions, rev('rNew', 'e2', '2026-07-03T00:00:00Z')] };
    d.dispatch({ type: 'SYS_IMPORT_COMPLETE', container: appended, source: 'test' });

    const c = d.getState().container!;
    expect(revisionCountOf(c, 'e2')).toBe(1);
    expect(revisionCountOf(c, 'e1')).toBe(1); // COUNT 索引の分
  });

  it('ensureAll 後は導出へ戻る(全量常駐 = purge の前提)', async () => {
    const stored = [rev('r1', 'e1', '2026-07-01T01:00:00Z'), rev('r2', 'e2', '2026-07-02T01:00:00Z')];
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer([]) });
    const store = fakeStore(stored);
    handle = mountRevisionResidency(d, { store: store as unknown as ContainerStore, cid: 'c1' });
    await flush();

    await ensureAllRevisionsResident();
    const c = d.getState().container!;
    expect(c.revisions).toHaveLength(2);
    expect(revisionCountOf(c, 'e1')).toBe(1); // 導出(配列)と一致
    expect(isRevisionHydrationPending(c, 'e1')).toBe(false);
  });
});

describe('SYS_REVISIONS_HYDRATED reducer merge', () => {
  it('id 重複は既存優先、created_at で安定 sort、空配列は参照だけ更新', () => {
    const d = createDispatcher();
    const boot = makeContainer([rev('dup', 'e1', '2026-07-05T00:00:00Z')]);
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: boot });

    d.dispatch({
      type: 'SYS_REVISIONS_HYDRATED',
      revisions: [
        rev('old', 'e1', '2026-07-01T00:00:00Z'),
        { ...rev('dup', 'e1', '2026-07-05T00:00:00Z'), snapshot: '{"stale":true}' },
      ],
    });
    const c = d.getState().container!;
    expect(c.revisions.map((r) => r.id)).toEqual(['old', 'dup']);
    expect(c.revisions[1]!.snapshot).toBe('{}'); // 既存優先(hydrate が追記を上書きしない)

    const before = d.getState();
    d.dispatch({ type: 'SYS_REVISIONS_HYDRATED', revisions: [] });
    const after = d.getState();
    expect(after).not.toBe(before); // 再 render 合図
    expect(after.container).toBe(before.container); // container は不変
  });
});
