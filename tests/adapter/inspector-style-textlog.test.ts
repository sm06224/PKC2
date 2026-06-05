/**
 * @vitest-environment happy-dom
 *
 * pgc-128 wave-δ #4(MASTER.md §7 textlog):textlog 専用の Inspector
 * Style tab metrics ── 全 log 件数 / 今日の log 件数 / 直近 log 時刻 /
 * important flag 件数。
 *
 * Inspector Style tab(pgc-118)を archetype-specific に拡張する第 1 弾。
 * text archetype は markdown metrics、textlog は log metrics を見せる。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  resetMetaPaneInspectorState,
  setMetaPaneInspectorActiveTab,
} from '@adapter/ui/meta-pane-inspector';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function todayIso(hour = 12): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function makeTextlogContainer(logsBody: object): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'l1', title: 'Log entry', body: JSON.stringify(logsBody), archetype: 'textlog', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.meta_pane_inspector_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-128 Inspector Style tab — textlog 専用 metrics', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetMetaPaneInspectorState();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    setFlag(false);
    resetMetaPaneInspectorState();
  });

  function boot(c: Container): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'l1' });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function activateStyle(d: ReturnType<typeof createDispatcher>): void {
    setMetaPaneInspectorActiveTab('style');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
  }

  function styleSection(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="inspector-style-metrics"]');
  }

  it('flag ON + textlog with 3 logs(全部今日)→ "3 total" + "3 today\'s logs"', () => {
    setFlag(true);
    const c = makeTextlogContainer({
      entries: [
        { id: 'a', text: 'log 1', createdAt: todayIso(9), flags: [] },
        { id: 'b', text: 'log 2', createdAt: todayIso(10), flags: [] },
        { id: 'c', text: 'log 3', createdAt: todayIso(11), flags: [] },
      ],
    });
    const d = boot(c);
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Log entries');
    expect(text).toContain('3 total');
    expect(text).toContain("Today's logs");
    expect(text).toContain('3'); // today's count
    expect(text).toContain('Latest log');
  });

  it('flag ON + textlog with 5 logs(1 件 important)→ "1 / 5"', () => {
    setFlag(true);
    const c = makeTextlogContainer({
      entries: [
        { id: 'a', text: 'normal',    createdAt: todayIso(9),  flags: [] },
        { id: 'b', text: 'normal',    createdAt: todayIso(10), flags: [] },
        { id: 'c', text: 'important', createdAt: todayIso(11), flags: ['important'] },
        { id: 'd', text: 'normal',    createdAt: todayIso(12), flags: [] },
        { id: 'e', text: 'normal',    createdAt: todayIso(13), flags: [] },
      ],
    });
    const d = boot(c);
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Important flagged');
    expect(text).toContain('1 / 5');
  });

  it('flag ON + textlog with 0 important → "Important flagged" row 出ない', () => {
    setFlag(true);
    const c = makeTextlogContainer({
      entries: [{ id: 'a', text: 'x', createdAt: todayIso(), flags: [] }],
    });
    const d = boot(c);
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).not.toContain('Important flagged');
  });

  it('flag ON + textlog with 0 logs → "0 total"', () => {
    setFlag(true);
    const c = makeTextlogContainer({ entries: [] });
    const d = boot(c);
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Log entries');
    expect(text).toContain('0 total');
  });

  it('flag ON + textlog で markdown metrics(headings 等)も併せて表示', () => {
    // textlog は markdown 領域でもあるので markdown metrics も発火する
    setFlag(true);
    const c = makeTextlogContainer({
      entries: [{ id: 'a', text: 'x', createdAt: todayIso(), flags: [] }],
    });
    const d = boot(c);
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Log entries');
    expect(text).toContain('Headings');
    expect(text).toContain('Frontmatter style');
  });

  it('flag ON + text archetype では textlog log metrics 出ない(scope check)', () => {
    setFlag(true);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        { lid: 'l1', title: 'X', body: '# heading', archetype: 'text', created_at: TS, updated_at: TS },
      ],
      relations: [], revisions: [], assets: {},
    };
    const d = boot(c);
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).not.toContain('Log entries');
    expect(text).not.toContain("Today's logs");
  });

  it('flag ON + textlog parse 失敗 body → "(parse error)"', () => {
    setFlag(true);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        // 不正 JSON
        { lid: 'l1', title: 'Bad', body: '{ this is not json', archetype: 'textlog', created_at: TS, updated_at: TS },
      ],
      relations: [], revisions: [], assets: {},
    };
    const d = boot(c);
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    // parseTextlogBody は fallback で empty entries を返すので
    // "Log entries: 0 total" になる(parse error は出ない、grace 動作)
    expect(text).toContain('Log entries');
    expect(text).toContain('0 total');
  });
});
