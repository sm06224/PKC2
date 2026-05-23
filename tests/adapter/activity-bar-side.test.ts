/**
 * @vitest-environment happy-dom
 *
 * pgc-116 wave-γ #16(MASTER.md §6.2 後続):Activity Bar の left / right
 * 配置切替。default 'left'(VSCode 既定)、bar 下端の `↔` button click で
 * 'right' に flip、もう一度押せば 'left' に戻る。
 *
 * 'right' 時は main pane の **末尾**(meta pane / right tray の更に右)に
 * 描画される。data-pkc-side attr で CSS が border-left/right を flip。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  resetActivityBarState,
  getActivityBarSide,
  setActivityBarSide,
} from '@adapter/ui/activity-bar';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
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

describe('pgc-116 Activity Bar left / right 配置切替', () => {
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
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function activityBar(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="activity-bar"]');
  }
  function sideToggle(): HTMLElement | null {
    return root.querySelector('[data-pkc-action="toggle-activity-bar-side"]');
  }
  function mainPane(): HTMLElement | null {
    return root.querySelector('.pkc-main');
  }

  it('default は left(activity-bar が sidebar より前)', () => {
    setFlag(true);
    boot();
    expect(getActivityBarSide()).toBe('left');
    expect(activityBar()?.getAttribute('data-pkc-side')).toBe('left');
    // activity-bar が sidebar より index 上で前
    const children = Array.from(mainPane()?.children ?? []);
    const barIdx = children.indexOf(activityBar()!);
    const sidebarIdx = children.findIndex((c) => c.classList.contains('pkc-sidebar'));
    expect(barIdx).toBeGreaterThanOrEqual(0);
    expect(sidebarIdx).toBeGreaterThan(barIdx);
  });

  it('flag ON:Activity Bar に side-toggle button(↔) が含まれる', () => {
    setFlag(true);
    boot();
    const toggle = sideToggle();
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toBe('↔');
    expect(toggle?.getAttribute('data-pkc-current-side')).toBe('left');
  });

  it('side toggle click → right に flip + activity-bar が main の最後の子', () => {
    setFlag(true);
    boot();
    sideToggle()?.click();
    expect(getActivityBarSide()).toBe('right');
    const bar = activityBar();
    expect(bar?.getAttribute('data-pkc-side')).toBe('right');
    expect(mainPane()?.lastElementChild).toBe(bar);
  });

  it('2nd click で left に戻る(toggle)', () => {
    setFlag(true);
    boot();
    sideToggle()?.click();
    expect(getActivityBarSide()).toBe('right');
    sideToggle()?.click();
    expect(getActivityBarSide()).toBe('left');
    expect(activityBar()?.getAttribute('data-pkc-side')).toBe('left');
  });

  it('right configuration で側 button tooltip が変化', () => {
    setFlag(true);
    const d = boot();
    setActivityBarSide('right');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    expect(sideToggle()?.getAttribute('title')).toContain('left');
  });

  it('flag OFF:side toggle 出ない(activity bar 自体が無いため)', () => {
    setFlag(false);
    boot();
    expect(sideToggle()).toBeNull();
  });
});
