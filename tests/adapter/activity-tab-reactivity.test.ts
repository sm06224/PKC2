/**
 * @vitest-environment happy-dom
 *
 * pgc-136 wave-δ #10(user bug report 2026-05-24):
 * 「左の縦型UIラベルを押下した際に左paneが反応しない時がある」
 *
 * Activity Bar tab の押下動線を確実にする 2 つの fix:
 *   1. **tap target 拡大**:36px → 40px(WCAG 2.5.8 推奨 44px に近づける、
 *      高密度 display / touch device での miss-click を減らす)
 *   2. **click 視覚 feedback**:`data-pkc-just-clicked="true"` を 150ms
 *      attach、CSS animation で短い accent flash ── 「押されたが反応
 *      しない」体感事故を防ぐ
 *
 * 加えて既存の reactivity ── setActivityBarActiveTab + SYS_SYNC dispatch
 * ── は維持(state 反映 path は不変、視覚 path を補強)。
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

describe('pgc-136 Activity Bar reactivity fix', () => {
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

  function tabByName(name: string): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[data-pkc-activity-tab="${name}"]`);
  }

  it('click → setActivityBarActiveTab が更新される(reactivity 確認)', () => {
    setFlag(true);
    boot();
    expect(getActivityBarActiveTab()).toBe('explorer');
    tabByName('outline')?.click();
    expect(getActivityBarActiveTab()).toBe('outline');
    // 再描画で sidebar が outline tab content に切替わる
    expect(root.querySelector('[data-pkc-region="activity-tab-outline"]')).not.toBeNull();
  });

  it('click 直後に data-pkc-just-clicked="true"(視覚 feedback flash)', () => {
    setFlag(true);
    boot();
    tabByName('search')?.click();
    // click 直後は最新の button が data-pkc-just-clicked attr を持つ
    const fresh = tabByName('search');
    expect(fresh?.getAttribute('data-pkc-just-clicked')).toBe('true');
  });

  it('150ms 後に data-pkc-just-clicked が消える', async () => {
    setFlag(true);
    boot();
    tabByName('recent')?.click();
    expect(tabByName('recent')?.getAttribute('data-pkc-just-clicked')).toBe('true');
    // 150ms 待つ
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(tabByName('recent')?.getAttribute('data-pkc-just-clicked')).toBeNull();
  });

  it('連続 click で各 tab が即時に切替わる(rapid switching)', () => {
    setFlag(true);
    boot();
    tabByName('search')?.click();
    expect(getActivityBarActiveTab()).toBe('search');
    tabByName('outline')?.click();
    expect(getActivityBarActiveTab()).toBe('outline');
    tabByName('pinned')?.click();
    expect(getActivityBarActiveTab()).toBe('pinned');
    tabByName('explorer')?.click();
    expect(getActivityBarActiveTab()).toBe('explorer');
  });

  it('同 tab 連続 click でも attr フラッシュは毎回設定される', () => {
    setFlag(true);
    boot();
    tabByName('outline')?.click();
    expect(tabByName('outline')?.getAttribute('data-pkc-just-clicked')).toBe('true');
    // 即座に再 click
    tabByName('outline')?.click();
    expect(tabByName('outline')?.getAttribute('data-pkc-just-clicked')).toBe('true');
  });

  it('不正 tab id click は flash 無し(no-op)', () => {
    setFlag(true);
    boot();
    const fake = document.createElement('button');
    fake.setAttribute('data-pkc-action', 'select-activity-tab');
    fake.setAttribute('data-pkc-activity-tab', 'unknown-tab');
    root.appendChild(fake);
    fake.click();
    expect(fake.getAttribute('data-pkc-just-clicked')).toBeNull();
    expect(getActivityBarActiveTab()).toBe('explorer'); // unchanged
  });
});
