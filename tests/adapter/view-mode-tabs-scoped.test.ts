/**
 * @vitest-environment happy-dom
 *
 * pgc-111 wave-γ #12(MASTER.md §6.5):view-mode tabs に scope mark +
 * 視覚 separator + Detail tab(entry-level)の選択無し disabled 化。
 *
 * Tier 0 flag `shell.view_mode_tabs_scoped_enabled`:
 *   OFF(default):従来 6 tab 並列(scope mark 無し、separator 無し、
 *                  Detail 常時 enabled)
 *   ON:Detail = entry / 他 5 = workspace の scope mark、Detail と
 *      Calendar 間に `|` separator、選択無で Detail disabled。
 *
 * MASTER §6.5 の最終形(workspace-level を tab strip 統合)への段階移行
 * の最初の step ── 行動 / 視覚分離のみ、tab 自体は維持。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
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
    url.searchParams.set('pkc-flag', 'shell.view_mode_tabs_scoped_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-111 view-mode tabs scope mark + 視覚 separator', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
    setFlag(false);
  });

  function boot(selectLid: string | null = null): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    if (selectLid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectLid });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function viewModeBar(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="view-mode-bar"]');
  }
  function viewModeBtns(): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.pkc-view-mode-btn'));
  }
  function detailBtn(): HTMLButtonElement | null {
    return root.querySelector<HTMLButtonElement>('[data-pkc-view-mode="detail"]');
  }
  function sep(): HTMLElement | null {
    return root.querySelector('.pkc-view-mode-sep');
  }

  it('flag OFF:scope mark 無し、separator 無し、Detail enabled(従来挙動)', () => {
    setFlag(false);
    boot();
    expect(viewModeBar()).not.toBeNull();
    expect(viewModeBar()?.getAttribute('data-pkc-scoped')).toBeNull();
    expect(sep()).toBeNull();
    for (const btn of viewModeBtns()) {
      expect(btn.getAttribute('data-pkc-tab-scope')).toBeNull();
    }
    expect(detailBtn()?.disabled).toBe(false);
  });

  it('flag ON:bar に data-pkc-scoped="true"、各 tab に scope attr', () => {
    setFlag(true);
    boot();
    expect(viewModeBar()?.getAttribute('data-pkc-scoped')).toBe('true');
    expect(detailBtn()?.getAttribute('data-pkc-tab-scope')).toBe('entry');
    const calendar = root.querySelector<HTMLElement>('[data-pkc-view-mode="calendar"]');
    expect(calendar?.getAttribute('data-pkc-tab-scope')).toBe('workspace');
    const launcher = root.querySelector<HTMLElement>('[data-pkc-view-mode="launcher"]');
    expect(launcher?.getAttribute('data-pkc-tab-scope')).toBe('workspace');
  });

  it('flag ON:Detail と Calendar の間に separator(`|`)が 1 個', () => {
    setFlag(true);
    boot();
    const seps = root.querySelectorAll('.pkc-view-mode-sep');
    expect(seps.length).toBe(1);
    expect(sep()?.textContent).toBe('|');
    // separator は detail と calendar の間にある
    const allChildren = Array.from(viewModeBar()!.children);
    const detailIdx = allChildren.findIndex((c) => c.getAttribute('data-pkc-view-mode') === 'detail');
    const calendarIdx = allChildren.findIndex((c) => c.getAttribute('data-pkc-view-mode') === 'calendar');
    const sepIdx = allChildren.findIndex((c) => c.classList.contains('pkc-view-mode-sep'));
    expect(sepIdx).toBeGreaterThan(detailIdx);
    expect(sepIdx).toBeLessThan(calendarIdx);
  });

  it('flag ON + 選択無し → Detail tab disabled + title hint', () => {
    setFlag(true);
    boot(null);
    expect(detailBtn()?.disabled).toBe(true);
    expect(detailBtn()?.getAttribute('data-pkc-disabled-reason')).toBe('no-selection');
    expect(detailBtn()?.getAttribute('title')).toContain('Select');
  });

  it('flag ON + 選択あり → Detail tab enabled', () => {
    setFlag(true);
    boot('e1');
    expect(detailBtn()?.disabled).toBe(false);
    expect(detailBtn()?.getAttribute('data-pkc-disabled-reason')).toBeNull();
  });

  it('flag ON:workspace tabs(Calendar 等)は選択有無に関わらず常時 enabled', () => {
    setFlag(true);
    boot(null);
    const calendar = root.querySelector<HTMLButtonElement>('[data-pkc-view-mode="calendar"]');
    const kanban = root.querySelector<HTMLButtonElement>('[data-pkc-view-mode="kanban"]');
    const launcher = root.querySelector<HTMLButtonElement>('[data-pkc-view-mode="launcher"]');
    expect(calendar?.disabled).toBe(false);
    expect(kanban?.disabled).toBe(false);
    expect(launcher?.disabled).toBe(false);
  });

  it('flag ON:6 tab + 1 separator = 7 子要素', () => {
    setFlag(true);
    boot();
    expect(viewModeBar()?.children.length).toBe(7);
  });

  it('flag OFF:6 tab のみ(separator 無し)', () => {
    setFlag(false);
    boot();
    expect(viewModeBar()?.children.length).toBe(6);
  });
});
