/**
 * @vitest-environment happy-dom
 *
 * pgc-104 wave-γ #6(MASTER.md §6.2):Activity Bar の Recent tab 実装。
 *
 * `selectRecentEntries`(pure feature)で最新 N 件を抽出 → sidebar 領域に
 * list 表示。row click で `SELECT_ENTRY` dispatch(既存 select-entry
 * handler 透過)。Recent は updated_at desc → created_at desc → lid asc の
 * sort で deterministic。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { resetActivityBarState, setActivityBarActiveTab } from '@adapter/ui/activity-bar';
import type { Container } from '@core/model/container';

function entry(lid: string, title: string, updated: string): Container['entries'][number] {
  return {
    lid, title, body: 'x', archetype: 'text',
    created_at: '2026-01-01T00:00:00Z', updated_at: updated,
  };
}

function makeContainer(entries: Container['entries']): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
    entries, relations: [], revisions: [], assets: {},
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

describe('pgc-104 Activity Bar Recent tab', () => {
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

  function boot(c: Container, selectLid: string | null = null): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    if (selectLid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectLid });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function activateRecent(d: ReturnType<typeof createDispatcher>): void {
    setActivityBarActiveTab('recent');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
  }

  function recentTab(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="activity-tab-recent"]');
  }
  function recentLinks(): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.pkc-recent-link'));
  }

  it('flag ON + recent tab + 3 entries → 3 list items, updated_at desc', () => {
    setFlag(true);
    const c = makeContainer([
      entry('e1', 'Oldest', '2026-01-01T00:00:00Z'),
      entry('e3', 'Newest', '2026-01-03T00:00:00Z'),
      entry('e2', 'Middle', '2026-01-02T00:00:00Z'),
    ]);
    const d = boot(c);
    activateRecent(d);
    const titles = recentLinks().map((l) => l.querySelector('.pkc-recent-text')?.textContent);
    expect(titles).toEqual(['Newest', 'Middle', 'Oldest']);
  });

  it('flag ON + recent tab + empty container → "No entries yet." hint', () => {
    setFlag(true);
    const d = boot(makeContainer([]));
    activateRecent(d);
    expect(recentTab()).not.toBeNull();
    expect(recentLinks().length).toBe(0);
    expect(recentTab()?.querySelector('.pkc-outline-empty-hint')?.textContent).toContain('No entries');
  });

  it('flag ON + selected entry is highlighted in recent list', () => {
    setFlag(true);
    const c = makeContainer([
      entry('e1', 'A', '2026-01-01T00:00:00Z'),
      entry('e2', 'B', '2026-01-02T00:00:00Z'),
    ]);
    const d = boot(c, 'e1');
    activateRecent(d);
    const items = Array.from(root.querySelectorAll<HTMLElement>('.pkc-recent-item'));
    const active = items.find((i) => i.getAttribute('data-pkc-active') === 'true');
    expect(active).not.toBeUndefined();
    expect(active?.querySelector('.pkc-recent-link')?.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('flag ON:row click → SELECT_ENTRY dispatch(汎用 handler 透過)', () => {
    setFlag(true);
    const c = makeContainer([
      entry('e1', 'A', '2026-01-01T00:00:00Z'),
      entry('e2', 'B', '2026-01-02T00:00:00Z'),
    ]);
    const d = boot(c);
    activateRecent(d);
    expect(d.getState().selectedLid).toBeNull();
    const links = recentLinks();
    links.find((l) => l.getAttribute('data-pkc-lid') === 'e1')?.click();
    expect(d.getState().selectedLid).toBe('e1');
  });

  it('flag ON:archetype icon が row 内に出る', () => {
    setFlag(true);
    const c = makeContainer([entry('e1', 'X', '2026-01-01T00:00:00Z')]);
    const d = boot(c);
    activateRecent(d);
    const icon = root.querySelector('.pkc-recent-icon');
    expect(icon?.textContent).toBe('📝');
  });

  it('flag ON:recent list が最大 N 件(`recent.default_limit` flag、default 10)', () => {
    setFlag(true);
    const lots: Container['entries'] = [];
    for (let i = 0; i < 25; i++) {
      lots.push(entry(`e${i}`, `T${i}`, `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`));
    }
    const d = boot(makeContainer(lots));
    activateRecent(d);
    // default 10 件以上は cut される。
    expect(recentLinks().length).toBe(10);
  });
});
