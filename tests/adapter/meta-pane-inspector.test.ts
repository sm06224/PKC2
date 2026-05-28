/**
 * @vitest-environment happy-dom
 *
 * pgc-109 wave-γ #10(MASTER.md §6.3):meta pane Inspector tab strip。
 *
 * Tier 0 flag `shell.meta_pane_inspector_enabled`:
 *   OFF(default):従来 meta pane(13+ section の縦長 list)
 *   ON:meta pane の頭に 5 tab strip(Properties / References / History /
 *      Style / AI)、tab 別に section 可視性切替。Style / AI は placeholder。
 *
 * 本 PR の scope は scaffold + tab selection state のみ ── 各 tab の中身の
 * 肉付けは後続 PR。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  resetMetaPaneInspectorState,
  getMetaPaneInspectorActiveTab,
  setMetaPaneInspectorActiveTab,
} from '@adapter/ui/meta-pane-inspector';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry', body: '# heading\n\nbody', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  url.searchParams.set('pkc-flag', `shell.meta_pane_inspector_enabled=${value ? '1' : '0'}`);
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-109 meta pane Inspector tab strip scaffold', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetMetaPaneInspectorState();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
    setFlag(false);
    resetMetaPaneInspectorState();
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function tabStrip(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="meta-inspector-tabs"]');
  }
  function tabBtns(): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.pkc-meta-inspector-tab'));
  }
  function inspectorPlaceholder(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="meta-inspector-placeholder"]');
  }

  it('flag OFF:Inspector tab strip 出ない', () => {
    setFlag(false);
    boot();
    expect(tabStrip()).toBeNull();
  });

  it('flag ON:Inspector tab strip + 5 tab', () => {
    setFlag(true);
    boot();
    expect(tabStrip()).not.toBeNull();
    const btns = tabBtns();
    expect(btns.length).toBe(5);
    const ids = btns.map((b) => b.getAttribute('data-pkc-meta-pane-tab'));
    expect(ids).toEqual(['properties', 'references', 'history', 'style', 'ai']);
  });

  it('flag ON:default で Properties tab active', () => {
    setFlag(true);
    boot();
    const props = root.querySelector<HTMLElement>('[data-pkc-meta-pane-tab="properties"]');
    expect(props?.getAttribute('data-pkc-active')).toBe('true');
    expect(props?.getAttribute('aria-selected')).toBe('true');
    expect(getMetaPaneInspectorActiveTab()).toBe('properties');
  });

  it('flag ON:AI tab click → active 切替 + empty hint(pgc-147 で flag opt-in 案内へ更新)', () => {
    // pgc-118:Style tab は metrics 実装されたので、placeholder 残りの
    // AI tab で test。pgc-147 で AI tab の visibleRegions が
    // `['inspector-ai-suggestions']` に変更 ── `shell.inspector_ai_local_enabled`
    // OFF の本 test では matched region 0 件 → applyInspectorTabFilter の
    // appendNoContentHint(empty hint)が表示、note は flag opt-in 案内。
    setFlag(true);
    boot();
    const ai = root.querySelector<HTMLElement>('[data-pkc-meta-pane-tab="ai"]')!;
    ai.click();
    expect(getMetaPaneInspectorActiveTab()).toBe('ai');
    const stillAi = root.querySelector<HTMLElement>('[data-pkc-meta-pane-tab="ai"]');
    expect(stillAi?.getAttribute('data-pkc-active')).toBe('true');
    const hint = root.querySelector('[data-pkc-region="meta-inspector-empty-hint"]');
    expect(hint).not.toBeNull();
    // pgc-166 で AI tab を Hints tab に rename(icon 🧠 → 💡、label AI → Hints)
    expect(hint?.querySelector('.pkc-meta-inspector-placeholder-icon')?.textContent).toBe('💡');
    expect(hint?.querySelector('.pkc-meta-inspector-placeholder-title')?.textContent).toBe('No Hints yet');
    expect(hint?.querySelector('.pkc-meta-inspector-placeholder-note')?.textContent).toContain('inspector_ai_local_enabled');
  });

  it('flag ON:Style tab(pgc-118 で実装済)は placeholder ではなく Style metrics section', () => {
    // pgc-118 で Style tab に metrics 実装。
    setFlag(true);
    boot();
    const style = root.querySelector<HTMLElement>('[data-pkc-meta-pane-tab="style"]')!;
    style.click();
    expect(inspectorPlaceholder()).toBeNull();
    expect(root.querySelector('[data-pkc-region="inspector-style-metrics"]')).not.toBeNull();
  });

  it('flag ON:Properties に戻ると empty hint が Properties 用に切替わる(AI tab 経由、pgc-147 更新)', () => {
    // pgc-147 で AI tab も empty hint 経路になったため、tab 切替で同じ
    // `meta-inspector-empty-hint` region 内の title / note が tab 用に
    // 切替わる(pane 内に frontmatter / revision 等が無い test fixture では
    // 全 tab で empty hint が出る)。tab 切替の効果は title の遷移で assert。
    setFlag(true);
    boot();
    const ai = root.querySelector<HTMLElement>('[data-pkc-meta-pane-tab="ai"]')!;
    ai.click();
    const aiHint = root.querySelector('[data-pkc-region="meta-inspector-empty-hint"]');
    expect(aiHint?.querySelector('.pkc-meta-inspector-placeholder-title')?.textContent).toBe('No Hints yet');
    const props = root.querySelector<HTMLElement>('[data-pkc-meta-pane-tab="properties"]')!;
    props.click();
    const propsHint = root.querySelector('[data-pkc-region="meta-inspector-empty-hint"]');
    expect(propsHint?.querySelector('.pkc-meta-inspector-placeholder-title')?.textContent).toBe('No Properties yet');
    expect(inspectorPlaceholder()).toBeNull();
  });

  it('flag ON:不正な tab id は no-op(active 不変)', () => {
    setFlag(true);
    boot();
    expect(getMetaPaneInspectorActiveTab()).toBe('properties');
    const fake = document.createElement('button');
    fake.setAttribute('data-pkc-action', 'select-meta-pane-tab');
    fake.setAttribute('data-pkc-meta-pane-tab', 'unknown');
    root.appendChild(fake);
    fake.click();
    expect(getMetaPaneInspectorActiveTab()).toBe('properties');
  });

  it('flag ON:setMetaPaneInspectorActiveTab で programmatic 切替も反映', () => {
    setFlag(true);
    const d = boot();
    setMetaPaneInspectorActiveTab('history');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    const hist = root.querySelector<HTMLElement>('[data-pkc-meta-pane-tab="history"]');
    expect(hist?.getAttribute('data-pkc-active')).toBe('true');
  });
});
