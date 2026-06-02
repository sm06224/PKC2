/**
 * @vitest-environment happy-dom
 *
 * Tab strip test(pgc-85、MASTER.md §4.3)。
 * - recordTabOpen / recordTabClose の状態管理
 * - getOpenTabs / getActiveTabLid
 * - buildTabStripElement の DOM 構造
 * - dirty marker(state.phase === 'editing' で active)
 * - title refresh on container change
 * - wireTabStrip の dispatcher 連動
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordTabOpen,
  recordTabClose,
  refreshTabTitles,
  getOpenTabs,
  getActiveTabLid,
  resetTabState,
  popRecentlyClosed,
  buildTabStripElement,
  wireTabStrip,
} from '../../src/adapter/ui/tab-strip';
import { createDispatcher } from '../../src/adapter/state/dispatcher';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';
import type { AppState } from '../../src/adapter/state/app-state';

function mkEntry(lid: string, title: string, archetype: Entry['archetype'] = 'text'): Entry {
  return {
    lid, title, body: '',
    archetype,
    created_at: '2026-05-23T00:00:00Z',
    updated_at: '2026-05-23T00:00:00Z',
  };
}

function mkContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 't', title: 't', created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z', schema_version: 1, generator: 't' },
    entries, relations: [], revisions: [], assets: {},
  } as Container;
}

function mkState(container: Container | null = null, phase: AppState['phase'] = 'ready', editingLid: string | null = null): AppState {
  return { container, phase, editingLid } as AppState;
}

beforeEach(() => {
  resetTabState();
});

describe('recordTabOpen / recordTabClose', () => {
  it('records new tab + sets active', () => {
    const c = mkContainer([mkEntry('a', 'Alice'), mkEntry('b', 'Bob')]);
    recordTabOpen('a', c);
    expect(getOpenTabs().length).toBe(1);
    expect(getActiveTabLid()).toBe('a');
    recordTabOpen('b', c);
    expect(getOpenTabs().length).toBe(2);
    expect(getActiveTabLid()).toBe('b');
  });

  it('re-opening existing tab only updates active', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    recordTabOpen('a', c);
    expect(getOpenTabs().length).toBe(2);
    expect(getActiveTabLid()).toBe('a');
  });

  it('close removes tab and moves active', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B'), mkEntry('c', 'C')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    recordTabOpen('c', c);
    expect(getActiveTabLid()).toBe('c');
    // close active(c)→ b に移る
    const newActive = recordTabClose('c');
    expect(newActive).toBe('b');
    expect(getActiveTabLid()).toBe('b');
    // close b → a に移る
    recordTabClose('b');
    expect(getActiveTabLid()).toBe('a');
    // close last → null
    recordTabClose('a');
    expect(getActiveTabLid()).toBeNull();
    expect(getOpenTabs().length).toBe(0);
  });

  it('close non-active tab keeps active unchanged', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    expect(getActiveTabLid()).toBe('b');
    recordTabClose('a');
    expect(getActiveTabLid()).toBe('b');
  });

  it('recentlyClosed tracks closed tabs', () => {
    const c = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    recordTabClose('a');
    recordTabClose('b');
    expect(popRecentlyClosed()?.lid).toBe('b');
    expect(popRecentlyClosed()?.lid).toBe('a');
    expect(popRecentlyClosed()).toBeNull();
  });

  it('unknown lid open does nothing', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    recordTabOpen('does-not-exist', c);
    expect(getOpenTabs().length).toBe(0);
  });
});

describe('refreshTabTitles', () => {
  it('updates title when entry title changed', () => {
    const c1 = mkContainer([mkEntry('a', 'Old')]);
    recordTabOpen('a', c1);
    expect(getOpenTabs()[0]?.title).toBe('Old');
    const c2 = mkContainer([mkEntry('a', 'New')]);
    refreshTabTitles(c2);
    expect(getOpenTabs()[0]?.title).toBe('New');
  });

  it('removes tab if entry deleted from container', () => {
    const c1 = mkContainer([mkEntry('a', 'A'), mkEntry('b', 'B')]);
    recordTabOpen('a', c1);
    recordTabOpen('b', c1);
    expect(getOpenTabs().length).toBe(2);
    // b が container から消えた
    const c2 = mkContainer([mkEntry('a', 'A')]);
    refreshTabTitles(c2);
    expect(getOpenTabs().length).toBe(1);
    expect(getOpenTabs()[0]?.lid).toBe('a');
    expect(getActiveTabLid()).toBe('a');
  });
});

describe('buildTabStripElement', () => {
  it('renders empty placeholder when no tabs', () => {
    const el = buildTabStripElement(mkState());
    expect(el.classList.contains('pkc-tab-strip-empty')).toBe(true);
    expect(el.querySelector('.pkc-tab-strip-placeholder')).not.toBeNull();
  });

  it('renders each open tab', () => {
    const c = mkContainer([mkEntry('a', 'Alpha'), mkEntry('b', 'Beta')]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    const el = buildTabStripElement(mkState(c));
    const tabs = el.querySelectorAll('.pkc-tab');
    expect(tabs.length).toBe(2);
    expect(tabs[0]?.getAttribute('data-pkc-lid')).toBe('a');
    expect(tabs[1]?.getAttribute('data-pkc-lid')).toBe('b');
    // active = b
    expect(tabs[1]?.classList.contains('pkc-tab-active')).toBe(true);
    expect(tabs[0]?.classList.contains('pkc-tab-active')).toBe(false);
  });

  it('shows dirty marker when state.phase === editing + active matches', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    recordTabOpen('a', c);
    const el = buildTabStripElement(mkState(c, 'editing', 'a'));
    const tab = el.querySelector('.pkc-tab') as HTMLElement;
    expect(tab.classList.contains('pkc-tab-dirty')).toBe(true);
    const close = tab.querySelector('.pkc-tab-close');
    expect(close?.textContent).toBe('●');
  });

  it('close button has data-pkc-action="close-tab"', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    recordTabOpen('a', c);
    const el = buildTabStripElement(mkState(c));
    const close = el.querySelector('.pkc-tab-close');
    expect(close?.getAttribute('data-pkc-action')).toBe('close-tab');
    expect(close?.getAttribute('data-pkc-lid')).toBe('a');
  });

  it('archetype icon is set per archetype', () => {
    const c = mkContainer([
      mkEntry('a', 'A', 'text'),
      mkEntry('b', 'B', 'textlog'),
      mkEntry('c', 'C', 'todo'),
    ]);
    recordTabOpen('a', c);
    recordTabOpen('b', c);
    recordTabOpen('c', c);
    const el = buildTabStripElement(mkState(c));
    const icons = [...el.querySelectorAll('.pkc-tab-icon')].map((i) => i.textContent);
    expect(icons).toEqual(['📝', '📋', '☑']);
  });
});

describe('wireTabStrip', () => {
  it('subscribes to ENTRY_SELECTED and records', () => {
    const c = mkContainer([mkEntry('a', 'Alice'), mkEntry('b', 'Bob')]);
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    const off = wireTabStrip(d);
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    expect(getOpenTabs().length).toBe(1);
    expect(getActiveTabLid()).toBe('a');
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'b' });
    expect(getOpenTabs().length).toBe(2);
    off();
  });

  it('refreshes title via direct API when container changes (test container 2nd init has no effect)', () => {
    // SYS_INIT_COMPLETE は 1 度しか効かない reducer 設計 ── refreshTabTitles
    // を直接呼んで挙動を確認する unit
    const c1 = mkContainer([mkEntry('a', 'Old')]);
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: c1 });
    const off = wireTabStrip(d);
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    expect(getOpenTabs()[0]?.title).toBe('Old');
    // 直接 refresh API を叩く(本来は dispatcher.onState で発火)
    refreshTabTitles(mkContainer([mkEntry('a', 'New')]));
    expect(getOpenTabs()[0]?.title).toBe('New');
    off();
  });
});
