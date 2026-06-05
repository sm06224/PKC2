/**
 * @vitest-environment happy-dom
 *
 * pgc-129 wave-δ #5(MASTER.md §7 todo):Inspector Style tab の
 * **todo 専用 metrics**(status / description 長さ / due date / overdue
 * 判定 / archived)。
 *
 * Inspector Style tab(pgc-118)を archetype-specific に拡張する第 2 弾
 * (pgc-128 textlog に続いて todo)。kanban / calendar から row click で
 * 飛んできて詳細 breath-check する動線に活きる。
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

interface TodoBodyShape {
  status: 'open' | 'done';
  description: string;
  date?: string;
  archived?: boolean;
}

function makeTodoContainer(body: TodoBodyShape): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 't1', title: 'Todo entry', body: JSON.stringify(body), archetype: 'todo', created_at: TS, updated_at: TS },
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

describe('pgc-129 Inspector Style tab — todo 専用 metrics', () => {
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
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
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

  it('flag ON + open todo:"○ open" + description length', () => {
    setFlag(true);
    const d = boot(makeTodoContainer({
      status: 'open', description: 'Buy milk',
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Status');
    expect(text).toContain('○ open');
    expect(text).toContain('Description length');
    expect(text).toContain('8 chars');
  });

  it('flag ON + done todo:"✓ done"', () => {
    setFlag(true);
    const d = boot(makeTodoContainer({
      status: 'done', description: 'Done task',
    }));
    activateStyle(d);
    expect(styleSection()?.textContent).toContain('✓ done');
  });

  it('flag ON + todo with future due date:formatted date(overdue 文言なし)', () => {
    setFlag(true);
    const futureYear = new Date().getFullYear() + 1;
    const d = boot(makeTodoContainer({
      status: 'open', description: 'Future task', date: `${futureYear}-12-25`,
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Due date');
    expect(text).not.toContain('overdue');
  });

  it('flag ON + open todo with past due date:"⚠ <date>(overdue)"', () => {
    setFlag(true);
    const d = boot(makeTodoContainer({
      status: 'open', description: 'Overdue task', date: '2020-01-01',
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Due date');
    expect(text).toContain('⚠');
    expect(text).toContain('overdue');
  });

  it('flag ON + done todo with past date:overdue 文言出ない(done は overdue にならない)', () => {
    setFlag(true);
    const d = boot(makeTodoContainer({
      status: 'done', description: 'Already done', date: '2020-01-01',
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Due date');
    expect(text).not.toContain('overdue');
  });

  it('flag ON + todo without due date:"—"', () => {
    setFlag(true);
    const d = boot(makeTodoContainer({
      status: 'open', description: 'No date',
    }));
    activateStyle(d);
    expect(styleSection()?.textContent).toContain('Due date');
    // "—" は無 due date の placeholder
  });

  it('flag ON + archived todo:"📦 yes" row 表示', () => {
    setFlag(true);
    const d = boot(makeTodoContainer({
      status: 'done', description: 'Old task', archived: true,
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Archived');
    expect(text).toContain('📦 yes');
  });

  it('flag ON + non-archived todo:"Archived" row 出ない', () => {
    setFlag(true);
    const d = boot(makeTodoContainer({
      status: 'open', description: 'Active', archived: false,
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).not.toContain('Archived');
  });

  it('flag ON + text archetype では todo metrics 出ない(scope check)', () => {
    setFlag(true);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        { lid: 't1', title: 'X', body: '# heading', archetype: 'text', created_at: TS, updated_at: TS },
      ],
      relations: [], revisions: [], assets: {},
    };
    const d = boot(c);
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).not.toContain('Description length');
    expect(text).not.toContain('Due date');
  });
});
