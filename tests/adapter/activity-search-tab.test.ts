/**
 * @vitest-environment happy-dom
 *
 * pgc-107 wave-γ #8(MASTER.md §6.2):Activity Bar の Search tab 実装。
 *
 * container 内 entry を `filterEntries`(title + body 部分一致)で絞り込み、
 * 最大 50 件を list 表示。input 連動 module-local state、IME 合成中 skip。
 * row click で `SELECT_ENTRY` dispatch(既存 select-entry handler 透過)。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { resetActivityBarState, setActivityBarActiveTab } from '@adapter/ui/activity-bar';
import { resetActivitySearchQuery, getActivitySearchQuery } from '@adapter/ui/activity-search-tab';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Apple Pie', body: 'recipe for apple pie', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'Banana Bread', body: 'recipe for banana bread', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e3', title: 'Cherry Cake', body: 'classic cherry cake recipe', archetype: 'text', created_at: TS, updated_at: TS },
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

describe('pgc-107 Activity Bar Search tab', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetActivityBarState();
    resetActivitySearchQuery();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
    setFlag(false);
    resetActivityBarState();
    resetActivitySearchQuery();
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

  function activateSearch(d: ReturnType<typeof createDispatcher>): void {
    setActivityBarActiveTab('search');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
  }

  function searchTab(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="activity-tab-search"]');
  }
  function searchInput(): HTMLInputElement | null {
    return root.querySelector('input.pkc-activity-search-input');
  }
  function searchLinks(): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.pkc-search-link'));
  }

  function typeQuery(value: string): void {
    const input = searchInput()!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('flag ON + search tab 初期表示:input 表示 + empty hint', () => {
    setFlag(true);
    const d = boot(makeContainer());
    activateSearch(d);
    expect(searchTab()).not.toBeNull();
    expect(searchInput()).not.toBeNull();
    expect(searchLinks().length).toBe(0);
    expect(searchTab()?.querySelector('.pkc-outline-empty-hint')?.textContent).toContain('Type to search');
  });

  it('flag ON:query を type すると filterEntries 経由で matches 表示', () => {
    setFlag(true);
    const d = boot(makeContainer());
    activateSearch(d);
    typeQuery('apple');
    expect(getActivitySearchQuery()).toBe('apple');
    const links = searchLinks();
    expect(links.length).toBe(1);
    expect(links[0]?.querySelector('.pkc-search-text')?.textContent).toBe('Apple Pie');
  });

  it('flag ON:body にだけ match する query でも引っかかる', () => {
    setFlag(true);
    const d = boot(makeContainer());
    activateSearch(d);
    typeQuery('classic');
    const links = searchLinks();
    expect(links.length).toBe(1);
    expect(links[0]?.getAttribute('data-pkc-lid')).toBe('e3');
  });

  it('flag ON:matches 無で "No matches" hint', () => {
    setFlag(true);
    const d = boot(makeContainer());
    activateSearch(d);
    typeQuery('zzznomatchzzz');
    expect(searchLinks().length).toBe(0);
    expect(searchTab()?.querySelector('.pkc-outline-empty-hint')?.textContent).toContain('No matches');
  });

  it('flag ON:matches 数を count 行に表示', () => {
    setFlag(true);
    const d = boot(makeContainer());
    activateSearch(d);
    typeQuery('recipe'); // matches e1 + e2 + e3 (all)
    const count = searchTab()?.querySelector('.pkc-activity-search-count');
    expect(count?.textContent).toBe('3 matches');
  });

  it('flag ON:1 match で "1 match"(単数形)', () => {
    setFlag(true);
    const d = boot(makeContainer());
    activateSearch(d);
    typeQuery('apple');
    expect(searchTab()?.querySelector('.pkc-activity-search-count')?.textContent).toBe('1 match');
  });

  it('flag ON:row click で SELECT_ENTRY dispatch', () => {
    setFlag(true);
    const d = boot(makeContainer());
    activateSearch(d);
    typeQuery('banana');
    searchLinks()[0]?.click();
    expect(d.getState().selectedLid).toBe('e2');
  });

  it('flag ON:選択中 entry が結果内で highlight', () => {
    setFlag(true);
    const d = boot(makeContainer(), 'e1');
    activateSearch(d);
    typeQuery('Pie');
    const item = root.querySelector<HTMLElement>('.pkc-search-item');
    expect(item?.getAttribute('data-pkc-active')).toBe('true');
  });

  it('flag ON:max result 50 件 cap(50+ matches 表示)', () => {
    setFlag(true);
    const lots: Container['entries'] = [];
    for (let i = 0; i < 60; i++) {
      lots.push({ lid: `e${i}`, title: `kw${i}`, body: 'shared keyword text', archetype: 'text', created_at: TS, updated_at: TS });
    }
    const d = boot({
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: lots, relations: [], revisions: [], assets: {},
    });
    activateSearch(d);
    typeQuery('shared');
    expect(searchLinks().length).toBe(50);
    expect(searchTab()?.querySelector('.pkc-activity-search-count')?.textContent).toBe('50+ matches');
  });
});
