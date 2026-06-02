/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountNavHistory } from '@adapter/ui/nav-history';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

/**
 * nav-history bridge contract — PR #197 + 領域 1 / pgc-55 統合。
 *
 * pgc-55 で内部 navigation stack(`navHistory` / `navIndex`)を single
 * source of truth とし、本 bridge はそれを browser history へミラーする。
 * テストは dispatcher ↔ `window.history` の往復を pin する:
 *
 *   1. 初期 mount は boot snapshot を replaceState で記録(pushState で
 *      ない = boot frame は暗黙)。envelope は navIndex を含む。
 *   2. SELECT_ENTRY(navHistory を成長)で新 history entry が積まれ、
 *      envelope.navIndex が進む。
 *   3. SET_VIEW_MODE でも 1 entry 積まれる。
 *   4. navigation でない dispatch(no-op)は積まない。
 *   5. popstate は envelope.navIndex の差分だけ GO_BACK / GO_FORWARD を
 *      dispatch して内部 navIndex を同期する。復元自体は新 entry を
 *      積まない(無限ループなし)。
 *   6. navIndex を持たない旧 frame は SELECT_ENTRY 復元へフォールバック。
 *   7. dispose() は popstate listener を外す。
 *
 * happy-dom は `window.history` を stack 風 semantics で実装しており、
 * `history.go()` は popstate を自動発火しないため popstate は合成する。
 */

const T = '2026-04-28T00:00:00Z';

function fixtureContainer(): Container {
  return {
    meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'a', title: 'A', archetype: 'text', body: 'a', created_at: T, updated_at: T },
      { lid: 'b', title: 'B', archetype: 'text', body: 'b', created_at: T, updated_at: T },
      { lid: 'c', title: 'C', archetype: 'text', body: 'c', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

let dispatcher: ReturnType<typeof createDispatcher>;
let dispose: () => void;

beforeEach(() => {
  dispatcher = createDispatcher();
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: fixtureContainer() });
  const handle = mountNavHistory(dispatcher);
  dispose = handle.dispose;
});

afterEach(() => {
  dispose();
});

interface NavSnap { selectedLid: string | null; viewMode: string; navIndex: number }

function getNavState(): NavSnap | null {
  const env = window.history.state as { pkc2?: NavSnap } | null;
  return env?.pkc2 ?? null;
}

/** envelope を合成して popstate を発火(happy-dom は go() で auto 発火しない)。 */
function firePopstate(snap: Partial<NavSnap>): void {
  window.dispatchEvent(new PopStateEvent('popstate', { state: { pkc2: snap } }));
}

describe('mountNavHistory — PR #197 + pgc-55 統合', () => {
  it('boot snapshot を replaceState で seed(navIndex 含む)', () => {
    const seeded = getNavState();
    expect(seeded).not.toBeNull();
    expect(seeded?.selectedLid).toBeNull();
    expect(seeded?.viewMode).toBe('detail');
    expect(seeded?.navIndex).toBe(-1);
  });

  it('SELECT_ENTRY が history entry を積み envelope.navIndex を進める', () => {
    const beforeLen = window.history.length;
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    expect(window.history.length).toBeGreaterThan(beforeLen);
    expect(getNavState()?.selectedLid).toBe('a');
    expect(getNavState()?.navIndex).toBe(0);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'b' });
    expect(getNavState()?.navIndex).toBe(1);
  });

  it('SET_VIEW_MODE が history entry を積む', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    const beforeLen = window.history.length;
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    expect(window.history.length).toBeGreaterThan(beforeLen);
    expect(getNavState()?.viewMode).toBe('kanban');
  });

  it('navigation でない dispatch(no-op)は積まない', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    const lenAfterFirst = window.history.length;
    dispatcher.dispatch({ type: 'TOGGLE_RECENT_PANE' });
    expect(window.history.length).toBe(lenAfterFirst);
  });

  it('popstate は navIndex 差分だけ GO_BACK して内部 navIndex を同期する', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'b' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c' });
    expect(dispatcher.getState().navIndex).toBe(2);
    // entry 'a'(navIndex 0)の frame へ popstate → GO_BACK ×2。
    firePopstate({ selectedLid: 'a', viewMode: 'detail', navIndex: 0 });
    expect(dispatcher.getState().selectedLid).toBe('a');
    expect(dispatcher.getState().navIndex).toBe(0);
  });

  it('popstate forward は GO_FORWARD で navIndex を進める', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'b' });
    firePopstate({ selectedLid: 'a', viewMode: 'detail', navIndex: 0 });
    expect(dispatcher.getState().navIndex).toBe(0);
    firePopstate({ selectedLid: 'b', viewMode: 'detail', navIndex: 1 });
    expect(dispatcher.getState().selectedLid).toBe('b');
    expect(dispatcher.getState().navIndex).toBe(1);
  });

  it('popstate は viewMode も復元する', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    firePopstate({ selectedLid: 'a', viewMode: 'detail', navIndex: 0 });
    expect(dispatcher.getState().viewMode).toBe('detail');
  });

  it('navIndex を持たない旧 frame は SELECT_ENTRY 復元へフォールバック', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'b' });
    // legacy envelope(navIndex 無し)。
    firePopstate({ selectedLid: 'a', viewMode: 'detail' });
    expect(dispatcher.getState().selectedLid).toBe('a');
  });

  it('popstate 起因の復元は新 history entry を積まない(無限ループなし)', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'b' });
    const lenBefore = window.history.length;
    firePopstate({ selectedLid: 'a', viewMode: 'detail', navIndex: 0 });
    expect(window.history.length).toBe(lenBefore);
  });

  it('dispose() は popstate handler を外す', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'b' });
    dispose();
    dispose = () => { /* idempotent */ };
    firePopstate({ selectedLid: 'a', viewMode: 'detail', navIndex: 0 });
    // navIndex は b(1)のまま、popstate handler は detach 済。
    expect(dispatcher.getState().navIndex).toBe(1);
  });
});
