/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { createCoalescedListener } from '@adapter/state/coalesced-listener';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

/**
 * #938 R11 — render coalescing utility の単体テスト。
 *
 * 契約:
 *   - enabled=false → 通知ごとに同期実行(従来挙動の pass-through)
 *   - enabled=true  → 同一 tick 内の複数通知は 1 つの microtask に集約
 *   - run は実行時点の最新 state を読む(中間 state を掴まない)
 *   - pending 中の OFF flip は同期実行 + 積み残し microtask の no-op 化
 */

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const T = '2026-07-01T00:00:00.000Z';

function fixture(): Container {
  return {
    meta: { container_id: 'c', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('createCoalescedListener(#938 R11)', () => {
  it('OFF: 通知ごとに同期実行される(従来挙動)', () => {
    let runs = 0;
    const notify = createCoalescedListener(() => { runs++; }, () => false);
    notify();
    notify();
    notify();
    expect(runs).toBe(3);
  });

  it('ON: 同一 tick 内の連続通知は microtask 後に 1 回だけ実行', async () => {
    let runs = 0;
    const notify = createCoalescedListener(() => { runs++; }, () => true);
    notify();
    notify();
    notify();
    expect(runs).toBe(0); // 同期時点ではまだ走らない
    await tick();
    expect(runs).toBe(1);
  });

  it('ON: tick が分かれれば tick ごとに 1 回ずつ実行', async () => {
    let runs = 0;
    const notify = createCoalescedListener(() => { runs++; }, () => true);
    notify();
    await tick();
    notify();
    await tick();
    expect(runs).toBe(2);
  });

  it('ON: dispatcher 連射 → run は最終 state だけを観測する', async () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: fixture() });
    const observed: string[] = [];
    const notify = createCoalescedListener(
      () => { observed.push(d.getState().searchQuery); },
      () => true,
    );
    d.onState(() => notify());
    d.dispatch({ type: 'SET_SEARCH_QUERY', query: 'a' });
    d.dispatch({ type: 'SET_SEARCH_QUERY', query: 'ab' });
    d.dispatch({ type: 'SET_SEARCH_QUERY', query: 'abc' });
    await tick();
    // 3 dispatch → 1 run、しかも最終 state('abc')のみ。中間は描画されない。
    expect(observed).toEqual(['abc']);
  });

  it('pending 中に OFF へ flip → 同期実行 1 回、積み残し microtask は no-op', async () => {
    let runs = 0;
    let on = true;
    const notify = createCoalescedListener(() => { runs++; }, () => on);
    notify();          // ON: microtask 積み
    on = false;
    notify();          // OFF: 同期実行 + pending 解除
    expect(runs).toBe(1);
    await tick();      // 積み残し microtask は走らない
    expect(runs).toBe(1);
  });
});
