/** @vitest-environment happy-dom */
/**
 * 読めなかった本文を「空の本文」に化けさせない(2026-07-26、監査 S2)。
 *
 * `fetchAndMerge` は以前、**返ってきたかどうかに関わらず** pending を外していた:
 *
 * ```ts
 * const bodies = await store.loadBodiesFor(cid, lids);
 * // record が無い lid(本当に空の body)も pending から外す。
 * for (const lid of lids) pending.delete(lid);
 * ```
 *
 * コメントの想定は「本当に空の本文」だが、segments 形式では
 * **本文が空の entry も `''` として索引に載る**(`saveDiff` が
 * `bodies[e.lid] = e.body` を無条件に積む)。つまり **返ってこない = 読み失敗**。
 * そして `loadBodyPack` は gunzip / JSON.parse に失敗すると `{}` を返すので、
 * **1 パック(最大 1MB)ぶんの本文がまとめて「空が正本」に化ける**。
 *
 * pending が外れると `isBodyPending` が false になり、保存側のガード
 * (`idb-store.save()` の未読チェック、#1027)も素通りする ──
 * 空の本文が storage へ焼き付き、`dropSegments` が実体を消す。
 *
 * 本 test は「解決できなかった lid は pending のまま残る」を pin する。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mountBodyWorkingSet } from '@adapter/platform/body-working-set';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { ContainerStore } from '@adapter/platform/idb-store';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-07-26T00:00:00Z';
const CID = 'cws';

function entry(lid: string): Entry {
  return { lid, title: lid, body: '', archetype: 'text', created_at: T, updated_at: T };
}
function bootContainer(): Container {
  return {
    meta: { container_id: CID, title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [entry('e1'), entry('e2'), entry('e3')],
    relations: [],
    revisions: [],
    assets: {},
  };
}

/** 指定した lid だけ返す store(残りは「読めなかった」扱いになる)。 */
function storeReturning(resolvable: Record<string, string>): ContainerStore {
  return {
    loadBodiesFor: vi.fn(async (_c: string, lids: readonly string[]) => {
      const out: Record<string, string> = {};
      for (const l of lids) if (resolvable[l] !== undefined) out[l] = resolvable[l]!;
      return out;
    }),
  } as unknown as ContainerStore;
}

const handles: Array<{ dispose: () => void }> = [];
afterEach(() => {
  while (handles.length) handles.pop()!.dispose();
});

function boot(store: ContainerStore): {
  d: ReturnType<typeof createDispatcher>;
  ws: ReturnType<typeof mountBodyWorkingSet>;
} {
  const d = createDispatcher();
  const ws = mountBodyWorkingSet(d, { store });
  handles.push(ws);
  d.dispatch({ type: 'SYS_INIT_COMPLETE', container: bootContainer(), bodiesDeferred: true });
  return { d, ws };
}

describe('読めなかった本文の扱い', () => {
  it('🔴 解決できなかった lid は pending のまま残る(空で確定させない)', async () => {
    // e1 だけ読める。e2 / e3 は「読めなかった」
    const { ws } = boot(storeReturning({ e1: '本文1' }));
    await ws.ensure(['e1', 'e2', 'e3']);

    expect(ws.isPending(CID, 'e1')).toBe(false); // 読めたので解決
    expect(ws.isPending(CID, 'e2')).toBe(true);  // 🔴 読めていない = pending 継続
    expect(ws.isPending(CID, 'e3')).toBe(true);
  });

  it('本文が空文字で返ってきた lid は解決済みになる(本当に空のケース)', async () => {
    const { ws } = boot(storeReturning({ e1: '', e2: '', e3: '' }));
    await ws.ensure(['e1', 'e2', 'e3']);
    expect(ws.isPending(CID, 'e1')).toBe(false);
    expect(ws.pendingCount()).toBe(0);
  });

  it('あとから読めるようになれば解決する(恒久的に諦めない)', async () => {
    const resolvable: Record<string, string> = { e1: '本文1' };
    const store = storeReturning(resolvable);
    const { ws } = boot(store);
    await ws.ensure(['e2']);
    expect(ws.isPending(CID, 'e2')).toBe(true);

    resolvable.e2 = '本文2'; // 一過性の失敗が解消した状況
    await ws.ensure(['e2']);
    expect(ws.isPending(CID, 'e2')).toBe(false);
  });

  it('読めない lid を無限にリトライしない(backfill が止まる)', async () => {
    const store = storeReturning({});
    const { ws } = boot(store);
    // 上限(2 回)まで試す
    await ws.ensure(['e1']);
    await ws.ensure(['e1']);
    const callsAfterLimit = (store.loadBodiesFor as ReturnType<typeof vi.fn>).mock.calls.length;

    // ensureAll / backfill の対象からは外れる(他の pending は拾ってよい)
    await ws.ensureAll();
    const spy = store.loadBodiesFor as ReturnType<typeof vi.fn>;
    const laterCalls = spy.mock.calls.slice(callsAfterLimit);
    for (const [, lids] of laterCalls) {
      expect(lids as readonly string[]).not.toContain('e1');
    }
    // ただし pending には残り続ける(保存側のガードを効かせるため)
    expect(ws.isPending(CID, 'e1')).toBe(true);
  });
});
