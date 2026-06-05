/**
 * @vitest-environment happy-dom
 *
 * Phase γ-A1(pgc-36):filer モード sidebar の multi-select + 一括操作バー。
 *
 * multi-select の state(Ctrl/Shift+click)は select-entry handler が汎用
 * 処理済。本 PR は filer-mode sidebar での視覚マーク + 一括操作バー
 * (buildFilerMultiActionBar 再利用)の描画を検証する。Ctrl+click →
 * TOGGLE_MULTI_SELECT → bar 出現 + item マークの Phase 8 順序性まで。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  const e = (lid: string, title: string) => ({
    lid, title, body: 'x', archetype: 'text' as const, created_at: TS, updated_at: TS,
  });
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [e('e1', 'エントリ1'), e('e2', 'エントリ2'), e('e3', 'エントリ3')],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('filer モード sidebar の multi-select (Phase γ-A1, pgc-36)', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
    teardown = null;
  });

  afterEach(() => {
    if (teardown) {
      teardown();
      teardown = null;
    }
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function item(lid: string): HTMLElement {
    const el = root.querySelector<HTMLElement>(
      `.pkc-sidebar-filer-item[data-pkc-lid="${lid}"]`,
    );
    if (!el) throw new Error(`filer item "${lid}" not found`);
    return el;
  }
  function ctrlClick(el: HTMLElement): void {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
  }
  function bar(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="multi-action-bar"]');
  }

  it('multi-select 無し:一括操作バーは出ない', () => {
    boot();
    expect(bar()).toBeNull();
  });

  it('Ctrl+click で multi-select state が立つ', () => {
    const d = boot();
    ctrlClick(item('e1'));
    expect(d.getState().multiSelectedLids).toContain('e1');
  });

  it('Ctrl+click した item は data-pkc-multi-selected でマークされる', () => {
    boot();
    ctrlClick(item('e1'));
    expect(item('e1').getAttribute('data-pkc-multi-selected')).toBe('true');
    expect(item('e2').getAttribute('data-pkc-multi-selected')).toBeNull();
  });

  it('multi-select 中は一括操作バーが出る(view-ctx=sidebar)', () => {
    boot();
    ctrlClick(item('e1'));
    expect(bar()).not.toBeNull();
    expect(bar()!.getAttribute('data-pkc-view-ctx')).toBe('sidebar');
  });

  it('バーは選択数を表示し bulk-delete を持つ', () => {
    boot();
    ctrlClick(item('e1'));
    expect(bar()!.querySelector('.pkc-multi-action-info')!.textContent).toBe(
      '1 selected',
    );
    expect(
      bar()!.querySelector('[data-pkc-action="bulk-delete"]'),
    ).not.toBeNull();
  });

  it('複数 Ctrl+click → 全件マーク + バーが件数追従(Phase 8 順序性)', () => {
    const d = boot();
    ctrlClick(item('e1'));
    ctrlClick(item('e2'));
    expect(d.getState().multiSelectedLids.sort()).toEqual(['e1', 'e2']);
    expect(item('e1').getAttribute('data-pkc-multi-selected')).toBe('true');
    expect(item('e2').getAttribute('data-pkc-multi-selected')).toBe('true');
    expect(bar()!.querySelector('.pkc-multi-action-info')!.textContent).toBe(
      '2 selected',
    );
  });

  it('同じ item を再 Ctrl+click で選択解除 → バーが消える', () => {
    const d = boot();
    ctrlClick(item('e1'));
    expect(bar()).not.toBeNull();
    ctrlClick(item('e1')); // toggle off
    expect(d.getState().multiSelectedLids).not.toContain('e1');
    expect(bar()).toBeNull();
  });
});
