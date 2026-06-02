/**
 * @vitest-environment happy-dom
 *
 * pgc-105 wave-γ #7(MASTER.md §6.2):Activity Bar の Pinned tab 実装。
 *
 * pinned tab(pgc-88 で導入された tab-strip の pinned 機構)を data source
 * に sidebar 領域に list 表示。row click で `SELECT_ENTRY` dispatch。
 * pinned が無い場合は empty hint で「pin tab via Ctrl+K Ctrl+W」を案内。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { resetActivityBarState, setActivityBarActiveTab } from '@adapter/ui/activity-bar';
import { recordTabOpen, togglePinTab, resetTabState, getOpenTabs } from '@adapter/ui/tab-strip';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'A', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'B', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e3', title: 'C', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.activity_bar_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-105 Activity Bar Pinned tab', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetActivityBarState();
    resetTabState();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
    setFlag(false);
    resetActivityBarState();
    resetTabState();
  });

  function boot(c: Container, selectLid: string | null = null): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    if (selectLid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectLid });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function activatePinned(d: ReturnType<typeof createDispatcher>): void {
    setActivityBarActiveTab('pinned');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
  }

  function pinnedTab(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="activity-tab-pinned"]');
  }
  function pinnedLinks(): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.pkc-pinned-link'));
  }

  it('flag ON + pinned tab + 0 pinned → empty hint(Ctrl+K Ctrl+W 案内)', () => {
    setFlag(true);
    const d = boot(makeContainer());
    activatePinned(d);
    expect(pinnedTab()).not.toBeNull();
    expect(pinnedLinks().length).toBe(0);
    expect(pinnedTab()?.querySelector('.pkc-outline-empty-hint')?.textContent).toContain('Ctrl+K Ctrl+W');
  });

  it('flag ON + 2 entries pinned → 2 list items', () => {
    setFlag(true);
    const c = makeContainer();
    const d = boot(c);
    // open e1, e2, e3 then pin e1, e3
    recordTabOpen('e1', c);
    recordTabOpen('e2', c);
    recordTabOpen('e3', c);
    togglePinTab('e1');
    togglePinTab('e3');
    activatePinned(d);
    const links = pinnedLinks();
    expect(links.length).toBe(2);
    const lids = links.map((l) => l.getAttribute('data-pkc-lid'));
    expect(lids).toContain('e1');
    expect(lids).toContain('e3');
    expect(lids).not.toContain('e2');
  });

  it('flag ON + row click → SELECT_ENTRY dispatch', () => {
    setFlag(true);
    const c = makeContainer();
    const d = boot(c);
    recordTabOpen('e1', c);
    togglePinTab('e1');
    activatePinned(d);
    expect(d.getState().selectedLid).toBeNull();
    pinnedLinks()[0]?.click();
    expect(d.getState().selectedLid).toBe('e1');
  });

  it('flag ON + 選択中 pinned entry が highlight', () => {
    setFlag(true);
    const c = makeContainer();
    const d = boot(c, 'e1');
    recordTabOpen('e1', c);
    togglePinTab('e1');
    activatePinned(d);
    const item = root.querySelector<HTMLElement>('.pkc-pinned-item');
    expect(item?.getAttribute('data-pkc-active')).toBe('true');
  });

  it('flag ON:view tab(workspace-level)は Pinned に出ない', () => {
    setFlag(true);
    const c = makeContainer();
    const d = boot(c);
    // open + pin view tab(calendar)
    const calLid = '__view:calendar';
    recordTabOpen(calLid, c);
    togglePinTab(calLid);
    // entry tab e1 も pin
    recordTabOpen('e1', c);
    togglePinTab('e1');
    activatePinned(d);
    const links = pinnedLinks();
    // view tab は除外、entry tab e1 のみ
    expect(links.length).toBe(1);
    expect(links[0]?.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('pinned tab(pgc-88)機構を data source として透過利用(getOpenTabs filter)', () => {
    setFlag(true);
    const c = makeContainer();
    const d = boot(c);
    recordTabOpen('e1', c);
    togglePinTab('e1');
    activatePinned(d);
    // tab-strip の data に直接 query しても 1 件 pinned が見える
    const pinnedSource = getOpenTabs().filter((t) => t.pinned === true);
    expect(pinnedSource.length).toBe(1);
    expect(pinnedSource[0]?.lid).toBe('e1');
    // 描画と data が一致
    expect(pinnedLinks().length).toBe(1);
  });
});
