/**
 * @vitest-environment happy-dom
 *
 * pgc-103 wave-γ #5(MASTER.md §4.5):Activity Bar の Outline tab 実装。
 *
 * pgc-102 で導入した Activity Bar scaffold を利用し、`outline` tab を選択
 * すると sidebar 領域に現在 entry の見出しアウトラインが出る。click で
 * center pane の heading anchor へ scroll(scrollIntoView 経由)。
 *
 * 検証:
 *   - flag ON + outline tab:現 entry の h1〜h3 を list 化
 *   - no selection / non-markdown archetype / no headings の empty hint
 *   - heading click で `scroll-to-heading` action(scrollIntoView 呼ばれる)
 *   - heading の indent(`data-pkc-outline-level`)が level 通り
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { resetActivityBarState, setActivityBarActiveTab } from '@adapter/ui/activity-bar';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function containerWith(entries: Container['entries']): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
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

describe('pgc-103 Activity Bar Outline tab', () => {
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

  function boot(c: Container, selectLid: string | null): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    if (selectLid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectLid });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function activateOutline(d: ReturnType<typeof createDispatcher>): void {
    setActivityBarActiveTab('outline');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
  }

  function outlineTab(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="activity-tab-outline"]');
  }
  function outlineLinks(): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.pkc-outline-link'));
  }

  it('flag ON + outline tab + text entry with 3 headings → 3 outline items', () => {
    setFlag(true);
    const c = containerWith([
      { lid: 'e1', title: 'Foo', body: '# H1\n\nbody\n\n## H2\n\nbody\n\n### H3', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const d = boot(c, 'e1');
    activateOutline(d);
    expect(outlineTab()).not.toBeNull();
    const links = outlineLinks();
    expect(links.length).toBe(3);
    expect(links.map((l) => l.textContent)).toEqual(['H1', 'H2', 'H3']);
  });

  it('flag ON + outline tab + no selection → empty hint', () => {
    setFlag(true);
    const d = boot(containerWith([
      { lid: 'e1', title: 'X', body: '# H1', archetype: 'text', created_at: TS, updated_at: TS },
    ]), null);
    activateOutline(d);
    expect(outlineTab()).not.toBeNull();
    expect(outlineLinks().length).toBe(0);
    expect(outlineTab()?.querySelector('.pkc-outline-empty-hint')?.textContent).toContain('Select an entry');
  });

  it('flag ON + outline tab + non-markdown archetype → archetype-specific hint', () => {
    setFlag(true);
    const c = containerWith([
      { lid: 'e1', title: 'T', body: '{"status":"open","description":"x"}', archetype: 'todo', created_at: TS, updated_at: TS },
    ]);
    const d = boot(c, 'e1');
    activateOutline(d);
    const hint = outlineTab()?.querySelector('.pkc-outline-empty-hint');
    expect(hint?.textContent).toContain('todo');
    expect(outlineLinks().length).toBe(0);
  });

  it('flag ON + outline tab + entry with no headings → "No headings" hint', () => {
    setFlag(true);
    const c = containerWith([
      { lid: 'e1', title: 'X', body: 'just text, no heading', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const d = boot(c, 'e1');
    activateOutline(d);
    expect(outlineTab()?.querySelector('.pkc-outline-empty-hint')?.textContent).toContain('No headings');
  });

  it('outline items carry data-pkc-outline-level matching heading level', () => {
    setFlag(true);
    const c = containerWith([
      { lid: 'e1', title: 'X', body: '# A\n\n## B\n\n### C', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const d = boot(c, 'e1');
    activateOutline(d);
    const items = Array.from(root.querySelectorAll<HTMLElement>('.pkc-outline-item'));
    expect(items.map((i) => i.getAttribute('data-pkc-outline-level'))).toEqual(['1', '2', '3']);
  });

  it('outline link carries data-pkc-action="scroll-to-heading" + data-pkc-heading-slug', () => {
    setFlag(true);
    const c = containerWith([
      { lid: 'e1', title: 'X', body: '# Hello World', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const d = boot(c, 'e1');
    activateOutline(d);
    const link = outlineLinks()[0]!;
    expect(link.getAttribute('data-pkc-action')).toBe('scroll-to-heading');
    expect(link.getAttribute('data-pkc-heading-slug')).toBe('hello-world');
  });

  it('outline link click triggers scrollIntoView on matching heading id', () => {
    setFlag(true);
    const c = containerWith([
      { lid: 'e1', title: 'X', body: '# Target', archetype: 'text', created_at: TS, updated_at: TS },
    ]);
    const d = boot(c, 'e1');
    activateOutline(d);
    // The rendered entry in center pane has <h1 id="target">. Spy on
    // HTMLElement.prototype.scrollIntoView so any call triggers it.
    const scrollSpy = vi.fn();
    const proto = HTMLElement.prototype as unknown as { scrollIntoView: (...args: unknown[]) => void };
    const orig = proto.scrollIntoView;
    proto.scrollIntoView = scrollSpy;
    try {
      const link = outlineLinks()[0]!;
      link.click();
      expect(scrollSpy).toHaveBeenCalled();
    } finally {
      proto.scrollIntoView = orig;
    }
  });

  it('flag ON + textlog entry with headings → outline shown (text/textlog both supported)', () => {
    setFlag(true);
    const c = containerWith([
      { lid: 'l1', title: 'Log', body: '# Top\n\n## Sub', archetype: 'textlog', created_at: TS, updated_at: TS },
    ]);
    const d = boot(c, 'l1');
    activateOutline(d);
    expect(outlineLinks().length).toBeGreaterThan(0);
  });
});
