/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountMigrationGate } from '@adapter/ui/migration-gate';
import { createDispatcher } from '@adapter/state/dispatcher';
import { setContainerFlagSource } from '@adapter/flags';
import type { Container } from '@core/model/container';

/**
 * storage v3 P2-4(doc M1、#967)— 移行前 ZIP 強制バックアップゲート。
 *
 * 契約:
 *   - lazy_entry_bodies が OFF → ON になった瞬間に backup export が走る
 *   - export 失敗時は flag を自動 OFF に戻す(= 移行を開始させない)
 *   - ON → ON(再通知)や OFF への遷移では走らない
 */

const T = '2026-07-23T00:00:00Z';
const FLAG = 'persistence.lazy_entry_bodies';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-m1', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

beforeEach(() => {
  setContainerFlagSource({});
  document.body.innerHTML = '';
  return () => {
    setContainerFlagSource({});
    document.body.innerHTML = '';
  };
});

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('mountMigrationGate', () => {
  it('OFF → ON でバックアップ export が走り、成功 toast が出る', async () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const exported: string[] = [];
    mountMigrationGate(d, {
      exportZip: (c) => {
        exported.push(c.meta.container_id);
        return Promise.resolve({ success: true });
      },
    });
    d.dispatch({ type: 'SET_FLAG', key: FLAG, value: true });
    await tick();
    expect(exported).toEqual(['c-m1']);
    expect(document.querySelector('.pkc-toast')?.textContent).toContain('移行前バックアップ');
  });

  it('export 失敗時は flag が自動で OFF に戻る(移行させない)', async () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    mountMigrationGate(d, {
      exportZip: () => Promise.resolve({ success: false, error: 'disk full' }),
    });
    d.dispatch({ type: 'SET_FLAG', key: FLAG, value: true });
    await tick();
    await tick();
    // reducer の __flags__ entry から値を確認
    const flagsEntry = d.getState().container!.entries.find((e) => e.lid === '__flags__');
    const values = (JSON.parse(flagsEntry!.body) as { values: Record<string, unknown> }).values;
    expect(values[FLAG]).toBe(false);
    expect(document.querySelector('.pkc-toast')?.textContent).toContain('中止');
  });

  it('ON のままの再通知や OFF 遷移では走らない', async () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    let calls = 0;
    mountMigrationGate(d, {
      exportZip: () => {
        calls += 1;
        return Promise.resolve({ success: true });
      },
    });
    d.dispatch({ type: 'SET_FLAG', key: FLAG, value: true });
    await tick();
    d.dispatch({ type: 'SET_FLAG', key: 'shell.tabs_enabled', value: true }); // 別 flag の FLAGS_CHANGED
    d.dispatch({ type: 'SET_FLAG', key: FLAG, value: false });
    d.dispatch({ type: 'SET_FLAG', key: FLAG, value: true }); // 2 回目の立ち上がり → 走る
    await tick();
    expect(calls).toBe(2);
  });
});
