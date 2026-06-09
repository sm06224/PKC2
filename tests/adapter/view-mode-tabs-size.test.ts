/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render } from '../../src/adapter/ui/renderer';
import { createDispatcher } from '../../src/adapter/state/dispatcher';
import { __resetRegistry, __resetUrlCache } from '../../src/adapter/flags';
import type { Container } from '../../src/core/model/container';

function makeContainer(): Container {
  const TS = '2026-05-24T00:00:00Z';
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'X', body: 'body', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('pgc-161 view-mode tabs size(user bug fix)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function setFlag(headerCompact: boolean): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('pkc-flag');
    if (headerCompact) {
      url.searchParams.set('pkc-flag', 'shell.header_compact_enabled=1');
    }
    window.history.replaceState({}, '', url.toString());
    __resetUrlCache();
  }

  function bootAndGetTabs() {
    const d = createDispatcher();
    d.onState((s) => render(s, root));
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(d.getState(), root);
    return Array.from(root.querySelectorAll<HTMLButtonElement>('.pkc-view-mode-btn'));
  }

  it('case 1: compact-header OFF で 5 view-mode tabs(Detail / Calendar / Kanban / Filer / Launcher、graph 撤去 #790)', () => {
    setFlag(false);
    const tabs = bootAndGetTabs();
    expect(tabs.length).toBe(5);
    const labels = tabs.map((t) => t.textContent);
    expect(labels).toContain('Detail');
    expect(labels).toContain('Calendar');
    expect(labels).toContain('Kanban');
    expect(labels).toContain('Filer');
    expect(labels).toContain('Launcher');
  });

  it('case 2: compact-header ON でも 5 tab + class 経路(min-width / padding CSS が適用される)', () => {
    setFlag(true);
    const tabs = bootAndGetTabs();
    expect(tabs.length).toBe(5);
    // 全 tab が pkc-view-mode-btn class を持つ(min-width CSS rule が cascading で適用)。
    for (const t of tabs) {
      expect(t.classList.contains('pkc-view-mode-btn')).toBe(true);
    }
  });

  it('case 3: shell root に data-pkc-compact-header attr が立つ', () => {
    setFlag(true);
    bootAndGetTabs();
    const shellRoot = root.querySelector('[data-pkc-compact-header]');
    expect(shellRoot?.getAttribute('data-pkc-compact-header')).toBe('true');
  });

  it('case 4: 各 tab に data-pkc-action="set-view-mode" + data-pkc-view-mode', () => {
    setFlag(false);
    const tabs = bootAndGetTabs();
    for (const t of tabs) {
      expect(t.getAttribute('data-pkc-action')).toBe('set-view-mode');
      expect(t.getAttribute('data-pkc-view-mode')).toBeTruthy();
    }
  });
});
