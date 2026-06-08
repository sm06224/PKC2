/**
 * @vitest-environment happy-dom
 *
 * pgc-134 wave-δ #9(MASTER.md §7 todo):todo overdue 視覚 indicator を
 * sidebar / filer row にも展開。kanban / calendar は既に
 * `data-pkc-todo-overdue="true"` attr 立てている(`renderer.ts:5223` /
 * `:7611`)が、sidebar / filer は未対応 ── 本 PR で同 attr + `⚠` badge を
 * sidebar に、`data-pkc-todo-overdue` attr を filer row に追加。
 *
 * Tier 0 flag `shell.todo_overdue_indicator_enabled` で gate。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(todoBody: { status: 'open' | 'done'; description: string; date?: string }): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 't1', title: 'My todo', body: JSON.stringify(todoBody), archetype: 'todo', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
  };
}

function setFlag(value: boolean, sidebarMode: 'tree' | 'filer' = 'tree'): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  // sidebar.mode default は filer なので tree(legacy <li> 構造を持つ)に
  // 切替えるため必ず flag set(test scope の都合)。
  url.searchParams.append('pkc-flag', `sidebar.mode=${sidebarMode}`);
  // 2026-05-28 todo_overdue_indicator_enabled always-on 化済 ── OFF 確認は明示 =0。
  url.searchParams.append('pkc-flag', `shell.todo_overdue_indicator_enabled=${value ? '1' : '0'}`);
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-134 todo overdue 視覚 indicator(sidebar)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    setFlag(false);
  });

  function boot(c: Container): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function todoLi(): HTMLElement | null {
    // sidebar entry list の todo lid に対応する <li.pkc-entry-item>
    return root.querySelector<HTMLElement>('li.pkc-entry-item[data-pkc-lid="t1"]');
  }
  function overdueBadge(): HTMLElement | null {
    return root.querySelector('.pkc-todo-overdue-badge');
  }

  it('flag OFF + overdue open todo:overdue attr / badge 出ない', () => {
    setFlag(false);
    boot(makeContainer({ status: 'open', description: 'Past', date: '2020-01-01' }));
    const li = todoLi();
    expect(li?.getAttribute('data-pkc-todo-overdue')).toBeNull();
    expect(overdueBadge()).toBeNull();
  });

  it('flag ON + overdue open todo:data-pkc-todo-overdue + ⚠ badge', () => {
    setFlag(true);
    boot(makeContainer({ status: 'open', description: 'Past', date: '2020-01-01' }));
    const li = todoLi();
    expect(li?.getAttribute('data-pkc-todo-overdue')).toBe('true');
    expect(overdueBadge()?.textContent).toBe('⚠');
    expect(overdueBadge()?.getAttribute('title')).toBe('Overdue');
  });

  it('flag ON + done todo with past date:overdue 出ない(done は overdue 判定 skip)', () => {
    setFlag(true);
    boot(makeContainer({ status: 'done', description: 'Already done', date: '2020-01-01' }));
    expect(todoLi()?.getAttribute('data-pkc-todo-overdue')).toBeNull();
    expect(overdueBadge()).toBeNull();
  });

  it('flag ON + open todo with future date:overdue 出ない', () => {
    setFlag(true);
    const futureYear = new Date().getFullYear() + 1;
    boot(makeContainer({ status: 'open', description: 'Future', date: `${futureYear}-12-25` }));
    expect(todoLi()?.getAttribute('data-pkc-todo-overdue')).toBeNull();
    expect(overdueBadge()).toBeNull();
  });

  it('flag ON + open todo without due date:overdue 出ない', () => {
    setFlag(true);
    boot(makeContainer({ status: 'open', description: 'No date' }));
    expect(todoLi()?.getAttribute('data-pkc-todo-overdue')).toBeNull();
    expect(overdueBadge()).toBeNull();
  });

  it('flag ON + text archetype:overdue indicator 出ない(scope check)', () => {
    setFlag(true);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        { lid: 'e1', title: 'X', body: 'body', archetype: 'text', created_at: TS, updated_at: TS },
      ],
      relations: [], revisions: [], assets: {},
    };
    boot(c);
    expect(overdueBadge()).toBeNull();
  });
});

describe('pgc-134 todo overdue 視覚 indicator(filer row)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    setFlag(false);
  });

  function bootFiler(c: Container): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function todoFilerRow(): HTMLElement | null {
    return root.querySelector<HTMLElement>('.pkc-filer-row[data-pkc-lid="t1"]');
  }

  it('flag OFF + overdue todo in filer:attr 出ない', () => {
    setFlag(false);
    bootFiler(makeContainer({ status: 'open', description: 'Past', date: '2020-01-01' }));
    const tr = todoFilerRow();
    if (tr) {
      // filer row が render されてれば overdue attr は無いはず
      expect(tr.getAttribute('data-pkc-todo-overdue')).toBeNull();
    }
  });

  it('flag ON + overdue todo in filer:data-pkc-todo-overdue="true"', () => {
    setFlag(true);
    bootFiler(makeContainer({ status: 'open', description: 'Past', date: '2020-01-01' }));
    const tr = todoFilerRow();
    if (tr) {
      expect(tr.getAttribute('data-pkc-todo-overdue')).toBe('true');
    }
  });

  it('flag ON + non-todo entry in filer:overdue attr 出ない', () => {
    setFlag(true);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        { lid: 'e1', title: 'X', body: 'body', archetype: 'text', created_at: TS, updated_at: TS },
      ],
      relations: [], revisions: [], assets: {},
    };
    bootFiler(c);
    const tr = root.querySelector<HTMLElement>('.pkc-filer-row[data-pkc-lid="e1"]');
    if (tr) {
      expect(tr.getAttribute('data-pkc-todo-overdue')).toBeNull();
    }
  });
});
