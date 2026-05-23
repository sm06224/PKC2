/**
 * @vitest-environment happy-dom
 *
 * View tab(workspace-level)test(pgc-87、MASTER.md §4.3)。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  openViewTab,
  recordTabOpen,
  recordTabClose,
  resetTabState,
  getOpenTabs,
  getActiveTabLid,
  buildTabStripElement,
  isViewTabInfo,
  syncActiveViewTab,
  persistTabState,
  restoreTabState,
} from '../../src/adapter/ui/tab-strip';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';
import type { AppState } from '../../src/adapter/state/app-state';

function mkEntry(lid: string, title: string, archetype: Entry['archetype'] = 'text'): Entry {
  return { lid, title, body: '', archetype, created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z' };
}
function mkContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 't', title: 't', created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z', schema_version: 1, generator: 't' },
    entries, relations: [], revisions: [], assets: {},
  } as Container;
}
function mkState(c: Container | null = null): AppState {
  return { container: c, phase: 'ready' } as AppState;
}

beforeEach(() => {
  resetTabState();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

describe('openViewTab', () => {
  it('opens a view tab with sentinel lid', () => {
    const lid = openViewTab('calendar');
    expect(lid).toBe('__view:calendar');
    const tabs = getOpenTabs();
    expect(tabs.length).toBe(1);
    expect(isViewTabInfo(tabs[0]!)).toBe(true);
    expect(tabs[0]?.mode).toBe('calendar');
  });

  it('multiple view tabs coexist', () => {
    openViewTab('calendar');
    openViewTab('kanban');
    openViewTab('filer');
    expect(getOpenTabs().length).toBe(3);
    expect(getActiveTabLid()).toBe('__view:filer');
  });

  it('re-opening same view tab updates active only', () => {
    openViewTab('calendar');
    openViewTab('kanban');
    openViewTab('calendar');
    expect(getOpenTabs().length).toBe(2);
    expect(getActiveTabLid()).toBe('__view:calendar');
  });

  it('entry tabs + view tabs coexist', () => {
    const c = mkContainer([mkEntry('a', 'Alice')]);
    recordTabOpen('a', c);
    openViewTab('graph');
    expect(getOpenTabs().length).toBe(2);
  });
});

describe('recordTabOpen ignores view sentinel', () => {
  it('recordTabOpen with __view: lid is no-op', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    recordTabOpen('__view:calendar', c);
    expect(getOpenTabs().length).toBe(0);
  });
});

describe('recordTabClose works on view tabs', () => {
  it('close view tab returns null when only tab', () => {
    openViewTab('calendar');
    expect(getOpenTabs().length).toBe(1);
    const newActive = recordTabClose('__view:calendar');
    expect(newActive).toBeNull();
    expect(getOpenTabs().length).toBe(0);
  });

  it('close view tab among others moves active', () => {
    openViewTab('calendar');
    openViewTab('kanban');
    expect(getActiveTabLid()).toBe('__view:kanban');
    const newActive = recordTabClose('__view:kanban');
    expect(newActive).toBe('__view:calendar');
  });
});

describe('syncActiveViewTab', () => {
  it('sets activeLid to view tab when matching mode open', () => {
    openViewTab('calendar');
    openViewTab('kanban');
    syncActiveViewTab('calendar');
    expect(getActiveTabLid()).toBe('__view:calendar');
  });

  it('no-op when matching view tab not open', () => {
    openViewTab('calendar');
    syncActiveViewTab('kanban');
    expect(getActiveTabLid()).toBe('__view:calendar');
  });
});

describe('buildTabStripElement renders view tab differently', () => {
  it('view tab has switch-view-tab action', () => {
    openViewTab('calendar');
    const el = buildTabStripElement(mkState());
    const tab = el.querySelector('.pkc-tab') as HTMLElement;
    expect(tab.getAttribute('data-pkc-action')).toBe('switch-view-tab');
    expect(tab.getAttribute('data-pkc-view-mode')).toBe('calendar');
    expect(tab.classList.contains('pkc-tab-view')).toBe(true);
  });

  it('view tab has calendar icon 📅', () => {
    openViewTab('calendar');
    const el = buildTabStripElement(mkState());
    const icon = el.querySelector('.pkc-tab-icon');
    expect(icon?.textContent).toBe('📅');
  });

  it('view tab title uses VIEW_TAB_META', () => {
    openViewTab('graph');
    const el = buildTabStripElement(mkState());
    const title = el.querySelector('.pkc-tab-title');
    expect(title?.textContent).toContain('グラフ');
  });

  it('entry tab + view tab render with correct actions', () => {
    const c = mkContainer([mkEntry('a', 'Alice')]);
    recordTabOpen('a', c);
    openViewTab('calendar');
    const el = buildTabStripElement(mkState(c));
    const tabs = el.querySelectorAll('.pkc-tab');
    expect(tabs.length).toBe(2);
    expect(tabs[0]?.getAttribute('data-pkc-action')).toBe('select-entry');
    expect(tabs[1]?.getAttribute('data-pkc-action')).toBe('switch-view-tab');
  });
});

describe('view tab persistence', () => {
  it('view tab is saved + restored', () => {
    openViewTab('calendar');
    openViewTab('kanban');
    persistTabState();
    resetTabState();

    const c = mkContainer([]);
    const restored = restoreTabState(c);
    expect(restored).toBe('__view:kanban');
    expect(getOpenTabs().length).toBe(2);
    expect(getOpenTabs().every(isViewTabInfo)).toBe(true);
  });

  it('mixed entry + view tabs round-trip', () => {
    const c = mkContainer([mkEntry('a', 'Alice')]);
    recordTabOpen('a', c);
    openViewTab('graph');
    persistTabState();
    resetTabState();

    const restored = restoreTabState(c);
    expect(restored).toBe('__view:graph');
    expect(getOpenTabs().length).toBe(2);
  });

  it('unknown view mode in saved data is skipped', () => {
    localStorage.setItem('pkc2.tabStrip', JSON.stringify({
      lids: ['__view:notreal', '__view:calendar'],
      active: '__view:notreal',
    }));
    const c = mkContainer([]);
    const restored = restoreTabState(c);
    expect(restored).toBe('__view:calendar');
    expect(getOpenTabs().length).toBe(1);
  });
});
