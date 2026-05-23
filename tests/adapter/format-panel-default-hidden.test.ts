/**
 * @vitest-environment happy-dom
 *
 * pgc-110 wave-γ #11(MASTER.md §6.4):Format panel default 非表示 +
 * 「🎨 Format」 toggle button による表示切替。
 *
 * Tier 0 flag `shell.format_panel_default_hidden_enabled`:
 *   OFF(default):従来挙動(format panel 常時表示)
 *   ON:format panel default 非表示 + toggle button「🎨 Format」追加、
 *      click で表示 / 非表示 flip
 *
 * 既存の `editor.format_panel_enabled` flag(format panel 自体の有効化、
 * default ON)は不変 ── 本 PR は「表示するか否か」の上位 gate のみ追加。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  resetFormatPanelVisibility,
  isFormatPanelVisible,
} from '@adapter/ui/format-panel-visibility';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Text Entry', body: 'hello', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.format_panel_default_hidden_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-110 Format panel default hidden + toggle button', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetFormatPanelVisibility();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
    setFlag(false);
    resetFormatPanelVisibility();
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function formatPanelWrap(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="format-panel-wrap"]');
  }
  function formatPanel(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="format-panel"]');
  }
  function toggleBtn(): HTMLElement | null {
    return root.querySelector('[data-pkc-action="toggle-format-panel"]');
  }

  it('flag OFF:wrap 出ない、format panel が直接表示(従来挙動)', () => {
    setFlag(false);
    boot();
    expect(formatPanelWrap()).toBeNull();
    // format panel は editor.format_panel_enabled が default ON なので
    // 普通に出る(既存挙動)。
    expect(formatPanel()).not.toBeNull();
    expect(toggleBtn()).toBeNull();
  });

  it('flag ON:wrap + toggle button のみ(format panel は非表示で start)', () => {
    setFlag(true);
    boot();
    expect(formatPanelWrap()).not.toBeNull();
    expect(toggleBtn()).not.toBeNull();
    expect(toggleBtn()?.textContent).toContain('🎨 Format');
    expect(toggleBtn()?.textContent).toContain('▸');
    expect(toggleBtn()?.getAttribute('aria-pressed')).toBe('false');
    // format panel は非表示
    expect(formatPanel()).toBeNull();
    expect(isFormatPanelVisible()).toBe(false);
  });

  it('flag ON:toggle button click で format panel 表示 + button が ▾ + data-pkc-active', () => {
    setFlag(true);
    boot();
    toggleBtn()?.click();
    expect(isFormatPanelVisible()).toBe(true);
    // 再描画で format panel が出現、button は ▾ になる
    expect(formatPanel()).not.toBeNull();
    const btn2 = toggleBtn();
    expect(btn2?.getAttribute('data-pkc-active')).toBe('true');
    expect(btn2?.getAttribute('aria-pressed')).toBe('true');
    expect(btn2?.textContent).toContain('▾');
  });

  it('flag ON:2nd click で再び非表示に戻る(toggle)', () => {
    setFlag(true);
    boot();
    toggleBtn()?.click();
    expect(formatPanel()).not.toBeNull();
    toggleBtn()?.click();
    expect(isFormatPanelVisible()).toBe(false);
    expect(formatPanel()).toBeNull();
    expect(toggleBtn()?.getAttribute('aria-pressed')).toBe('false');
  });

  it('flag ON:wrap は format-panel-wrap region + toggle button が先頭子', () => {
    setFlag(true);
    boot();
    const wrap = formatPanelWrap();
    expect(wrap?.firstElementChild?.getAttribute('data-pkc-action')).toBe('toggle-format-panel');
  });

  it('flag ON でも textlog でも同じ動作(format panel は text / textlog 両方対象)', () => {
    setFlag(true);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        { lid: 'l1', title: 'Log', body: '', archetype: 'textlog', created_at: TS, updated_at: TS },
      ],
      relations: [], revisions: [], assets: {},
    };
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'l1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'l1' });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    expect(formatPanelWrap()).not.toBeNull();
    expect(toggleBtn()).not.toBeNull();
    expect(formatPanel()).toBeNull();
  });
});
