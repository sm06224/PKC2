/**
 * @vitest-environment happy-dom
 *
 * pgc-102 wave-γ #4(MASTER.md §6.2):VSCode 流 Activity Bar の最小 scaffold。
 *
 * Tier 0 flag `shell.activity_bar_enabled`:
 *   OFF(default):従来どおり sidebar 単独
 *   ON:sidebar の左に Activity Bar(縦 strip)が prepend される。
 *      6 tab(Explorer / Search / Outline / Relations / Recent / Pinned)、
 *      Explorer は既存 sidebar を表示、他 5 tab は "Coming soon" placeholder。
 *
 * 本 PR の scope は **visual scaffold + tab selection state のみ**。
 * 各 tab の中身は後続 pgc-103〜107 で順次実装。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { resetActivityBarState, getActivityBarActiveTab } from '@adapter/ui/activity-bar';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function emptyContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry 1', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [],
    revisions: [],
    assets: {},
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

describe('pgc-102 Activity Bar scaffold', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetActivityBarState();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
    setFlag(false);
    resetActivityBarState();
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: emptyContainer() });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function activityBar(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="activity-bar"]');
  }
  function tabBtns(): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(
      '[data-pkc-region="activity-bar"] .pkc-activity-bar-btn',
    ));
  }
  function placeholder(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="activity-tab-placeholder"]');
  }
  function sidebar(): HTMLElement | null {
    return root.querySelector('aside.pkc-sidebar:not(.pkc-activity-tab-placeholder)');
  }

  it('flag OFF:Activity Bar 出ない、従来 sidebar のまま', () => {
    setFlag(false);
    boot();
    expect(activityBar()).toBeNull();
    expect(sidebar()).not.toBeNull();
  });

  it('flag ON:Activity Bar + sidebar(Explorer tab active で従来 sidebar 表示)', () => {
    setFlag(true);
    boot();
    expect(activityBar()).not.toBeNull();
    expect(sidebar()).not.toBeNull();
    expect(placeholder()).toBeNull();
  });

  it('flag ON:Activity Bar に 6 tab(Explorer / Search / Outline / Relations / Recent / Pinned)', () => {
    setFlag(true);
    boot();
    const btns = tabBtns();
    expect(btns.length).toBe(6);
    const ids = btns.map((b) => b.getAttribute('data-pkc-activity-tab'));
    expect(ids).toEqual(['explorer', 'search', 'outline', 'relations', 'recent', 'pinned']);
  });

  it('flag ON:default で Explorer tab が active(aria-selected=true + data-pkc-active)', () => {
    setFlag(true);
    boot();
    const explorer = root.querySelector<HTMLElement>(
      '[data-pkc-activity-tab="explorer"]',
    );
    expect(explorer?.getAttribute('aria-selected')).toBe('true');
    expect(explorer?.getAttribute('data-pkc-active')).toBe('true');
  });

  it('flag ON:Search tab click → active 切替 + sidebar が placeholder に', () => {
    setFlag(true);
    boot();
    const search = root.querySelector<HTMLElement>(
      '[data-pkc-activity-tab="search"]',
    )!;
    search.click();
    // active tab state(module-local)が search に切替わる
    expect(getActivityBarActiveTab()).toBe('search');
    // 再描画で active visual + sidebar placeholder
    const stillSearch = root.querySelector<HTMLElement>(
      '[data-pkc-activity-tab="search"]',
    );
    expect(stillSearch?.getAttribute('data-pkc-active')).toBe('true');
    expect(placeholder()).not.toBeNull();
    expect(placeholder()?.getAttribute('data-pkc-activity-tab')).toBe('search');
    expect(sidebar()).toBeNull();
  });

  it('flag ON:Relations → 別の placeholder、Explorer に戻ると sidebar 復活', () => {
    // pgc-103:Outline tab は実装済になったので、placeholder 残り tab で
    // 切替テストする(Relations / Recent / Pinned 等)。
    setFlag(true);
    boot();
    const relations = root.querySelector<HTMLElement>(
      '[data-pkc-activity-tab="relations"]',
    )!;
    relations.click();
    expect(placeholder()?.getAttribute('data-pkc-activity-tab')).toBe('relations');

    const explorer = root.querySelector<HTMLElement>(
      '[data-pkc-activity-tab="explorer"]',
    )!;
    explorer.click();
    expect(getActivityBarActiveTab()).toBe('explorer');
    expect(placeholder()).toBeNull();
    expect(sidebar()).not.toBeNull();
  });

  it('flag ON:placeholder の中に icon / title / "Coming soon" note', () => {
    // pgc-104/105:Recent / Pinned tab は実装済、Search / Relations が
    // placeholder 残り。
    setFlag(true);
    boot();
    const search = root.querySelector<HTMLElement>(
      '[data-pkc-activity-tab="search"]',
    )!;
    search.click();
    const ph = placeholder();
    expect(ph).not.toBeNull();
    expect(ph?.querySelector('.pkc-activity-tab-placeholder-icon')?.textContent).toBe('🔍');
    expect(ph?.querySelector('.pkc-activity-tab-placeholder-title')?.textContent).toBe('Search');
    expect(ph?.querySelector('.pkc-activity-tab-placeholder-note')?.textContent).toContain('Coming soon');
  });

  it('flag ON:不正な tab id は no-op(active 不変)', () => {
    setFlag(true);
    boot();
    expect(getActivityBarActiveTab()).toBe('explorer');
    // 手動で不正な data-pkc-activity-tab を持つ button を投入
    const fake = document.createElement('button');
    fake.setAttribute('data-pkc-action', 'select-activity-tab');
    fake.setAttribute('data-pkc-activity-tab', 'unknown');
    root.appendChild(fake);
    fake.click();
    expect(getActivityBarActiveTab()).toBe('explorer');
  });
});
