/**
 * @vitest-environment happy-dom
 *
 * Tab pin test(pgc-88、MASTER.md §4.3)。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordTabOpen,
  recordTabClose,
  resetTabState,
  getOpenTabs,
  getActiveTabLid,
  togglePinTab,
  getPinnedTabLids,
  closeActiveTab,
  buildTabStripElement,
  persistTabState,
  restoreTabState,
  openViewTab,
} from '../../src/adapter/ui/tab-strip';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';
import type { AppState } from '../../src/adapter/state/app-state';

function mkEntry(lid: string, title: string): Entry {
  return { lid, title, body: '', archetype: 'text', created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z' };
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

describe('togglePinTab', () => {
  it('initially unpinned, toggle adds pinned', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    recordTabOpen('a', c);
    expect(getPinnedTabLids()).toEqual([]);
    const next = togglePinTab('a');
    expect(next).toBe(true);
    expect(getPinnedTabLids()).toEqual(['a']);
  });

  it('toggle twice restores unpinned', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    recordTabOpen('a', c);
    togglePinTab('a');
    togglePinTab('a');
    expect(getPinnedTabLids()).toEqual([]);
  });

  it('returns null for unknown lid', () => {
    expect(togglePinTab('does-not-exist')).toBeNull();
  });
});

describe('recordTabClose respects pinned', () => {
  it('close pinned tab is no-op', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    togglePinTab('a');
    // Close pinned 'a' → no-op
    const result = recordTabClose('a');
    expect(getOpenTabs().length).toBe(2);
    // activeLid should still be 'b' (was active before)
    expect(result).toBe('b');
  });

  it('close non-pinned tab works normally', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    togglePinTab('a');
    recordTabClose('b');
    expect(getOpenTabs().length).toBe(1);
    expect(getOpenTabs()[0]?.lid).toBe('a');
  });
});

describe('closeActiveTab respects pinned', () => {
  it('closeActiveTab when active is pinned: no-op', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    recordTabOpen('a', c);
    togglePinTab('a');
    expect(getActiveTabLid()).toBe('a');
    const result = closeActiveTab();
    expect(result).toBe('a');
    expect(getOpenTabs().length).toBe(1);
  });

  it('closeActiveTab when active is not pinned: closes', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    // b is active, not pinned
    expect(closeActiveTab()).toBe('a');
    expect(getOpenTabs().length).toBe(1);
  });
});

describe('buildTabStripElement renders pinned tab differently', () => {
  it('pinned tab has 🔒 instead of × button', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    recordTabOpen('a', c);
    togglePinTab('a');
    const el = buildTabStripElement(mkState(c));
    const pinBtn = el.querySelector<HTMLElement>('.pkc-tab-pin');
    expect(pinBtn).not.toBeNull();
    expect(pinBtn?.textContent).toBe('🔒');
    expect(pinBtn?.getAttribute('data-pkc-action')).toBe('toggle-pin-tab');
    // No close button
    expect(el.querySelector('.pkc-tab-close')).toBeNull();
  });

  it('pinned tab has pkc-tab-pinned class', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    recordTabOpen('a', c);
    togglePinTab('a');
    const el = buildTabStripElement(mkState(c));
    const tab = el.querySelector('.pkc-tab');
    expect(tab?.classList.contains('pkc-tab-pinned')).toBe(true);
  });

  it('unpinned tab has × button (no 🔒)', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    recordTabOpen('a', c);
    const el = buildTabStripElement(mkState(c));
    expect(el.querySelector('.pkc-tab-close')).not.toBeNull();
    expect(el.querySelector('.pkc-tab-pin')).toBeNull();
  });

  it('view tab can be pinned too', () => {
    openViewTab('calendar');
    togglePinTab('__view:calendar');
    const el = buildTabStripElement(mkState());
    const tab = el.querySelector('.pkc-tab');
    expect(tab?.classList.contains('pkc-tab-pinned')).toBe(true);
    expect(el.querySelector('.pkc-tab-pin')).not.toBeNull();
  });
});

describe('pin persistence', () => {
  it('pinned state is saved + restored', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    togglePinTab('a');
    persistTabState();
    resetTabState();

    restoreTabState(c);
    const tabs = getOpenTabs();
    expect(tabs.length).toBe(2);
    const aTab = tabs.find((t) => t.lid === 'a');
    const bTab = tabs.find((t) => t.lid === 'b');
    expect(aTab?.pinned).toBe(true);
    expect(bTab?.pinned).toBeFalsy();
  });

  it('old saved data without pinned field still restores (backward compat)', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    localStorage.setItem('pkc2.tabStrip', JSON.stringify({ lids: ['a'], active: 'a' }));
    restoreTabState(c);
    expect(getOpenTabs().length).toBe(1);
    expect(getOpenTabs()[0]?.pinned).toBeFalsy();
  });

  it('pinned view tab survives reload', () => {
    openViewTab('graph');
    togglePinTab('__view:graph');
    persistTabState();
    resetTabState();

    restoreTabState(mkContainer([]));
    expect(getOpenTabs()[0]?.lid).toBe('__view:graph');
    expect(getOpenTabs()[0]?.pinned).toBe(true);
  });
});
