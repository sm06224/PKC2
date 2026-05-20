/**
 * @vitest-environment happy-dom
 *
 * filer モード sidebar の Saved Searches Pane(pgc-51)。
 *
 * pgc-46〜50 で filer は search / archetype / color / 4 toggle / Recent
 * pane を獲得した。pgc-51 は最後の検索オプション ── Saved Searches Pane
 * ── を filer へ移植する。saved search の query 軸は tree が `searchQuery`、
 * filer が `sidebarFilerQuery` と別 field のため、`SAVE_SEARCH` は両者の
 * OR で捕捉、`APPLY_SAVED_SEARCH` は両者へ復元する形で reconcile した
 * (両 field は active sidebar mode で排他)。
 *
 * reform-2026-05 Phase 8 順序性に従い、★ quick-save → SAVE_SEARCH →
 * APPLY_SAVED_SEARCH → filer list 絞り込みの round-trip を end-to-end で
 * assert する。
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

const T = '2026-05-20T00:00:00.000Z';

/** root 直下に text 3(りんご / ばなな / みかん)+ folder 1。 */
function makeContainer(): Container {
  const e = (lid: string, title: string, archetype: 'text' | 'folder') => ({
    lid, title, body: '', archetype, created_at: T, updated_at: T,
  });
  return {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      e('e1', 'りんご', 'text'),
      e('e2', 'ばなな', 'text'),
      e('e3', 'みかん', 'text'),
      e('f1', 'フォルダ', 'folder'),
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  __resetRegistry();
  __resetUrlCache();
  setContainerFlagSource({ 'sidebar.mode': 'filer' });
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  root.remove();
});

function setup(container: Container = makeContainer(), readonly = false) {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container, readonly });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return dispatcher;
}

function filerSidebar(): HTMLElement {
  const el = root.querySelector<HTMLElement>(
    '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"]',
  );
  if (!el) throw new Error('filer sidebar not rendered');
  return el;
}

function savedPane(): HTMLElement | null {
  return filerSidebar().querySelector<HTMLElement>(
    'details[data-pkc-region="saved-searches"]',
  );
}

function quickSaveBtn(): HTMLElement | null {
  return filerSidebar().querySelector<HTMLElement>(
    'button[data-pkc-action="quick-save-search"]',
  );
}

function filerLids(): string[] {
  return Array.from(
    filerSidebar().querySelectorAll<HTMLElement>(
      '.pkc-sidebar-filer-item[data-pkc-draggable]',
    ),
  ).map((el) => el.getAttribute('data-pkc-lid')!);
}

describe('filer Saved Searches Pane の描画 (pgc-51)', () => {
  it('filer の検索行に ★ quick-save button がある', () => {
    setup();
    expect(quickSaveBtn()).not.toBeNull();
  });

  it('readonly では ★ quick-save button は出ない', () => {
    setup(makeContainer(), true);
    expect(quickSaveBtn()).toBeNull();
  });

  it('saved_searches が空なら saved pane は出ない', () => {
    setup();
    expect(savedPane()).toBeNull();
  });

  it('saved search があると filer に saved pane が出る', () => {
    const d = setup();
    d.dispatch({ type: 'SAVE_SEARCH', name: 'テスト保存' });
    render(d.getState(), root);
    const pane = savedPane();
    expect(pane).not.toBeNull();
    expect(pane!.textContent).toContain('テスト保存');
  });

  it('saved pane の各 row に削除 button がある', () => {
    const d = setup();
    d.dispatch({ type: 'SAVE_SEARCH', name: 'テスト保存' });
    render(d.getState(), root);
    expect(
      savedPane()!.querySelector('[data-pkc-action="delete-saved-search"]'),
    ).not.toBeNull();
  });
});

describe('filer Saved Searches の query 軸 reconcile (pgc-51)', () => {
  it('SAVE_SEARCH は filer の sidebarFilerQuery を query として捕捉する', () => {
    const d = setup();
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'りんご' });
    d.dispatch({ type: 'SAVE_SEARCH', name: 'りんご検索' });
    // query をクリアしてから apply → sidebarFilerQuery が復元されれば
    // SAVE が filer query を捕捉できていた証拠。
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: '' });
    const id = d.getState().container!.meta.saved_searches![0].id;
    d.dispatch({ type: 'APPLY_SAVED_SEARCH', id });
    expect(d.getState().sidebarFilerQuery).toBe('りんご');
  });

  it('APPLY_SAVED_SEARCH は searchQuery と sidebarFilerQuery の両方へ復元する', () => {
    const d = setup();
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'みかん' });
    d.dispatch({ type: 'SAVE_SEARCH', name: 'みかん検索' });
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: '' });
    const id = d.getState().container!.meta.saved_searches![0].id;
    d.dispatch({ type: 'APPLY_SAVED_SEARCH', id });
    // tree / filer どちらの sidebar mode でも効くよう両 field へ復元。
    expect(d.getState().searchQuery).toBe('みかん');
    expect(d.getState().sidebarFilerQuery).toBe('みかん');
  });
});

describe('filer Saved Searches の順序性 (pgc-51)', () => {
  it('★ の実 click で saved_searches が 1 件増える(consumer 経路)', () => {
    const d = setup();
    expect((d.getState().container!.meta.saved_searches ?? []).length).toBe(0);
    quickSaveBtn()!.click();
    expect((d.getState().container!.meta.saved_searches ?? []).length).toBe(1);
  });

  it('filer query → ★ 保存 → クリア → saved row click で filer list が再絞り込み', () => {
    const d = setup();
    // りんご で絞り込み。
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'りんご' });
    render(d.getState(), root);
    expect(filerLids()).toEqual(['e1']);

    // ★ で現在の検索を保存。
    quickSaveBtn()!.click();

    // query をクリア → 全件表示へ戻る。
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: '' });
    render(d.getState(), root);
    expect(filerLids()).toHaveLength(4);

    // saved pane の row を click → APPLY_SAVED_SEARCH → 再び りんご 絞り込み。
    const row = savedPane()!.querySelector<HTMLElement>('.pkc-saved-search-item');
    expect(row).not.toBeNull();
    row!.click();
    expect(filerLids()).toEqual(['e1']);
  });

  it('saved search が restore する archetype filter は filer list に連動する', () => {
    const d = setup();
    // archetype=folder で絞ってから保存。
    d.dispatch({ type: 'TOGGLE_ARCHETYPE_FILTER', archetype: 'folder' });
    render(d.getState(), root);
    expect(filerLids()).toEqual(['f1']);
    quickSaveBtn()!.click();

    // archetype filter を解除 → 全件。
    d.dispatch({ type: 'TOGGLE_ARCHETYPE_FILTER', archetype: 'folder' });
    render(d.getState(), root);
    expect(filerLids()).toHaveLength(4);

    // saved search を apply → archetype=folder が復活し folder のみ。
    const id = d.getState().container!.meta.saved_searches![0].id;
    d.dispatch({ type: 'APPLY_SAVED_SEARCH', id });
    render(d.getState(), root);
    expect(filerLids()).toEqual(['f1']);
  });
});
