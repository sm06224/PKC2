/**
 * @vitest-environment happy-dom
 *
 * Phase γ-A1:filer モード sidebar(`sidebar.mode='filer'`)。
 *
 * 既存機能(領域 10-6)だが active test 被覆が皆無だったため、γ-A1 の
 * 品質固めとして happy-dom 被覆を新設。flag gate → filer sidebar 描画 →
 * item 属性 → folder scope ナビゲーション(click → SELECT_ENTRY →
 * sidebar が scope 内へ再描画)の reform-2026-05 Phase 8 順序性まで検証。
 * 実 OS click parity は `tests/smoke/sidebar-filer-mode.spec.ts`。
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

/** f1(folder)> e1(text)、e2(text, root)の 2 階層 container。 */
function makeContainer(): Container {
  return {
    meta: {
      container_id: 't',
      title: 'T',
      created_at: TS,
      updated_at: TS,
      schema_version: 1,
    },
    entries: [
      { lid: 'f1', title: '親フォルダ', body: '', archetype: 'folder', created_at: TS, updated_at: TS },
      { lid: 'e1', title: '子エントリ', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'ルートエントリ', body: 'y', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [
      { id: 'r1', from: 'f1', to: 'e1', kind: 'structural', created_at: TS, updated_at: TS },
    ],
    revisions: [],
    assets: {},
  };
}

function emptyContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('filer モード sidebar (Phase γ-A1)', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
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

  function boot(container: Container = makeContainer()): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function filerSidebar(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"]');
  }
  function filerItems(): HTMLElement[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>('.pkc-sidebar-filer-item'),
    );
  }

  it('flag OFF:filer モード sidebar は出ない(従来 tree)', () => {
    boot();
    expect(filerSidebar()).toBeNull();
  });

  it('flag ON:filer モード sidebar が描画される', () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    boot();
    expect(filerSidebar()).not.toBeNull();
  });

  it('flag ON:root scope は root entry(folder + root text)を列挙', () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    boot();
    const lids = filerItems().map((li) => li.getAttribute('data-pkc-lid'));
    expect(lids).toContain('f1');
    expect(lids).toContain('e2');
    // e1 は f1 の structural child なので root には出ない
    expect(lids).not.toContain('e1');
  });

  it('flag ON:各 item は select-entry action + lid + archetype を持つ', () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    boot();
    const folder = root.querySelector('.pkc-sidebar-filer-item[data-pkc-lid="f1"]')!;
    expect(folder.getAttribute('data-pkc-action')).toBe('select-entry');
    expect(folder.getAttribute('data-pkc-archetype')).toBe('folder');
    const text = root.querySelector('.pkc-sidebar-filer-item[data-pkc-lid="e2"]')!;
    expect(text.getAttribute('data-pkc-archetype')).toBe('text');
  });

  it('flag ON:folder 選択で sidebar が scope 内へ(子エントリを表示 + nav-up)', () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    const lids = filerItems().map((li) => li.getAttribute('data-pkc-lid'));
    expect(lids).toContain('e1'); // f1 の child
    expect(
      root.querySelector('.pkc-sidebar-filer-nav-up'),
    ).not.toBeNull(); // 上階層へ戻る row
  });

  it('flag ON:子エントリ選択時、その entry が active marker を持つ', () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    const e1 = root.querySelector('.pkc-sidebar-filer-item[data-pkc-lid="e1"]')!;
    expect(e1.getAttribute('data-pkc-active')).toBe('true');
  });

  it('flag ON:filer item を click → SELECT_ENTRY → sidebar が scope 内へ再描画(Phase 8 順序性)', async () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    const d = boot();
    // root scope:folder f1 を click
    root.querySelector<HTMLElement>('.pkc-sidebar-filer-item[data-pkc-lid="f1"]')!.click();
    // sidebar click は dblclick window(250ms)分 debounce される(PR-MMM)
    expect(d.getState().selectedLid).toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(d.getState().selectedLid).toBe('f1');
    // consumer:sidebar が f1 scope に入り子エントリ e1 を表示
    const lids = filerItems().map((li) => li.getAttribute('data-pkc-lid'));
    expect(lids).toContain('e1');
  });

  it('flag ON:user entry が無い container は (empty) を表示', () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    boot(emptyContainer());
    expect(filerSidebar()).not.toBeNull();
    expect(
      root.querySelector('.pkc-sidebar-filer-empty'),
    ).not.toBeNull();
  });

  // ── pgc-34:result count / interaction hint / empty 案内 ──

  it('flag ON:header に現スコープの item 数(root = 2)', () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    boot(); // makeContainer:root は f1 + e2 の 2 件
    const count = root.querySelector('[data-pkc-region="filer-sidebar-count"]');
    expect(count).not.toBeNull();
    expect(count!.textContent).toBe('2');
  });

  it('flag ON:scope 変更で count が追従(f1 内 = 1)', () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' }); // f1 scope(child e1 のみ)
    expect(
      root.querySelector('[data-pkc-region="filer-sidebar-count"]')!.textContent,
    ).toBe('1');
  });

  it('flag ON:item がある scope は操作ヒントを表示', () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    boot();
    expect(
      root.querySelector('[data-pkc-region="filer-sidebar-hint"]'),
    ).not.toBeNull();
  });

  it('flag ON:空 container はヒントを出さず empty 案内のみ', () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    boot(emptyContainer());
    expect(
      root.querySelector('[data-pkc-region="filer-sidebar-hint"]'),
    ).toBeNull();
    expect(
      root.querySelector('.pkc-sidebar-filer-empty')!.textContent,
    ).toBe('項目がありません');
  });

  it('flag ON:空 folder に入ると empty 案内 + 戻る nav-up が共存', () => {
    setContainerFlagSource({ 'sidebar.mode': 'filer' });
    // 空 folder fe を 1 つだけ持つ container
    const c = emptyContainer();
    c.entries.push({
      lid: 'fe',
      title: '空フォルダ',
      body: '',
      archetype: 'folder',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    const d = boot(c);
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'fe' }); // fe scope(0 children)
    const empty = root.querySelector('.pkc-sidebar-filer-empty');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toBe('このフォルダは空です');
    // 空でも上階層へ戻る導線(nav-up)は残る
    expect(root.querySelector('.pkc-sidebar-filer-nav-up')).not.toBeNull();
  });
});
