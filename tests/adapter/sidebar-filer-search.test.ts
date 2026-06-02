/**
 * @vitest-environment happy-dom
 *
 * filer モード sidebar の検索。pgc-35 の per-folder 絞り込みを起点に、
 * pgc-46 で global 検索化、pgc-47 で `applyFilters` full-text + archetype
 * filter、pgc-48 で color filter strip へ拡張した経緯を被覆する。
 *
 * `SET_SIDEBAR_FILER_QUERY` reducer + 検索窓描画 + query / archetype /
 * color による list 絞り込み + 一致なし案内 + 実 input event → filter の
 * reform-2026-05 Phase 8 順序性を検証する。
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
import { reduce, createInitialState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

/** root に folder 1 + text 4(りんご系 2 / ばなな / Apple)。 */
function makeContainer(): Container {
  const e = (lid: string, title: string, archetype: 'text' | 'folder') => ({
    lid, title, body: '', archetype, created_at: TS, updated_at: TS,
  });
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      e('f1', 'フォルダ', 'folder'),
      e('e1', 'りんご', 'text'),
      e('e2', 'ばなな', 'text'),
      e('e3', 'りんごジュース', 'text'),
      e('e4', 'Apple', 'text'),
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('filer モード sidebar の per-folder 検索 (Phase γ-A1, pgc-35)', () => {
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

  function itemLids(): string[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>('.pkc-sidebar-filer-item[data-pkc-draggable]'),
    ).map((li) => li.getAttribute('data-pkc-lid') ?? '');
  }
  function searchInput(): HTMLInputElement | null {
    return root.querySelector<HTMLInputElement>('.pkc-sidebar-filer-search');
  }
  function count(): string {
    return root.querySelector('[data-pkc-region="filer-sidebar-count"]')?.textContent ?? '';
  }

  // ── reducer ──

  it('SET_SIDEBAR_FILER_QUERY が sidebarFilerQuery を更新', () => {
    const before = { ...createInitialState(), phase: 'ready' as const };
    const { state: after } = reduce(before, {
      type: 'SET_SIDEBAR_FILER_QUERY',
      query: 'りんご',
    });
    expect(after.sidebarFilerQuery).toBe('りんご');
  });

  // ── 検索窓の描画 ──

  it('item がある scope は検索窓を表示', () => {
    boot();
    expect(searchInput()).not.toBeNull();
    expect(searchInput()!.getAttribute('data-pkc-field')).toBe('sidebar-filer-search');
  });

  it('空 container は検索窓を出さない', () => {
    const d = createDispatcher();
    d.onState((s) => render(s, root));
    d.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: { ...makeContainer(), entries: [], relations: [] },
    });
    render(d.getState(), root);
    teardown = bindActions(root, d);
    expect(searchInput()).toBeNull();
  });

  // ── query による絞り込み(consumer)──

  it('query 空:全 item を表示', () => {
    boot();
    expect(itemLids().sort()).toEqual(['e1', 'e2', 'e3', 'e4', 'f1']);
    expect(count()).toBe('5');
  });

  it('query「りんご」:title 部分一致の 2 件に絞る', () => {
    const d = boot();
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'りんご' });
    expect(itemLids().sort()).toEqual(['e1', 'e3']);
    expect(count()).toBe('2');
  });

  it('query は大文字小文字を無視(apple → Apple)', () => {
    const d = boot();
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'apple' });
    expect(itemLids()).toEqual(['e4']);
  });

  it('一致なし:no-match 案内 + count 0、検索窓は残る', () => {
    const d = boot();
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'zzz該当なし' });
    expect(itemLids()).toEqual([]);
    expect(count()).toBe('0');
    expect(
      root.querySelector('[data-pkc-region="filer-sidebar-no-match"]'),
    ).not.toBeNull();
    expect(searchInput()).not.toBeNull(); // 検索窓は出たまま(query 解除導線)
  });

  it('query を空に戻すと全 item が復帰', () => {
    const d = boot();
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'りんご' });
    expect(itemLids()).toHaveLength(2);
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: '' });
    expect(itemLids()).toHaveLength(5);
  });

  it('検索窓に入力 → input event → SET_SIDEBAR_FILER_QUERY → list 絞り込み(Phase 8 順序性)', () => {
    const d = boot();
    const input = searchInput()!;
    input.value = 'ばなな';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(d.getState().sidebarFilerQuery).toBe('ばなな');
    expect(itemLids()).toEqual(['e2']);
  });

  it('絞り込み中も nav-up は残る(scoped)', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' }); // f1 scope(空 folder)
    // f1 は空なので検索窓は出ない、が nav-up は残る
    expect(root.querySelector('.pkc-sidebar-filer-nav-up')).not.toBeNull();
  });

  it('IME 合成中の input は dispatch しない(変換確定まで保持)', () => {
    const d = boot();
    const input = searchInput()!;
    input.dispatchEvent(new Event('compositionstart', { bubbles: true }));
    input.value = 'りん';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(d.getState().sidebarFilerQuery).toBeUndefined(); // 合成中は未 dispatch
    input.value = 'りんご';
    input.dispatchEvent(new Event('compositionend', { bubbles: true }));
    expect(d.getState().sidebarFilerQuery).toBe('りんご'); // 確定で 1 回 dispatch
  });
});

describe('filer モード sidebar の global 検索 (pgc-46)', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  /** f1 > e1(りんご)、f2 > e2(ばなな)の 2 階層 nested container。 */
  function nestedContainer(): Container {
    const e = (lid: string, title: string, archetype: 'text' | 'folder') => ({
      lid, title, body: '', archetype, created_at: TS, updated_at: TS,
    });
    return {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        e('f1', 'フォルダ1', 'folder'),
        e('f2', 'フォルダ2', 'folder'),
        e('e1', 'りんご', 'text'),
        e('e2', 'ばなな', 'text'),
      ],
      relations: [
        { id: 'r1', from: 'f1', to: 'e1', kind: 'structural', created_at: TS, updated_at: TS },
        { id: 'r2', from: 'f2', to: 'e2', kind: 'structural', created_at: TS, updated_at: TS },
      ],
      revisions: [],
      assets: {},
    };
  }

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
    if (teardown) { teardown(); teardown = null; }
  });

  function boot(selectLid?: string): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: nestedContainer() });
    if (selectLid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectLid });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function itemLids(): string[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>('.pkc-sidebar-filer-item[data-pkc-draggable]'),
    ).map((li) => li.getAttribute('data-pkc-lid') ?? '');
  }

  it('query 空 + folder scope:現フォルダの直下の子のみ表示(folder navigation)', () => {
    boot('f1');
    expect(itemLids()).toEqual(['e1']);
  });

  it('query 入力:現スコープ外の entry も container 全体から見つかる(global)', () => {
    const d = boot('f1');
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'ばなな' });
    // e2 は f2 の子で f1 scope 外。global search なので見つかる。
    expect(itemLids()).toContain('e2');
  });

  it('global 検索はフォルダも entry も横断ヒットする', () => {
    const d = boot();
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'フォルダ' });
    expect(itemLids().sort()).toEqual(['f1', 'f2']);
  });

  it('global 検索中は nav-up を出さない(flat な検索結果)', () => {
    const d = boot('f1');
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'りんご' });
    expect(root.querySelector('.pkc-sidebar-filer-nav-up')).toBeNull();
  });

  it('global 検索 query を消すと folder navigation に戻る', () => {
    const d = boot('f1');
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'ばなな' });
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: '' });
    expect(itemLids()).toEqual(['e1']);
  });

  it('一致なしは no-match 案内を出す', () => {
    const d = boot('f1');
    d.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: 'zzz存在しない語' });
    expect(
      root.querySelector('[data-pkc-region="filer-sidebar-no-match"]'),
    ).not.toBeNull();
  });
});

describe('filer モード sidebar の archetype filter (pgc-47)', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  /** root に folder 1 + text 2 の mixed container。 */
  function mixedContainer(): Container {
    const e = (lid: string, title: string, archetype: 'text' | 'folder') => ({
      lid, title, body: '', archetype, created_at: TS, updated_at: TS,
    });
    return {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        e('f1', 'フォルダA', 'folder'),
        e('e1', '記事A', 'text'),
        e('e2', '記事B', 'text'),
      ],
      relations: [],
      revisions: [],
      assets: {},
    };
  }

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
    if (teardown) { teardown(); teardown = null; }
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mixedContainer() });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function archetypeRail(): HTMLElement | null {
    return root.querySelector<HTMLElement>(
      '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"] [data-pkc-region="archetype-filter"]',
    );
  }
  function itemLids(): string[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>('.pkc-sidebar-filer-item[data-pkc-draggable]'),
    ).map((li) => li.getAttribute('data-pkc-lid') ?? '');
  }

  it('filer sidebar は tree 同等の archetype filter rail を描画する', () => {
    boot();
    expect(archetypeRail()).not.toBeNull();
  });

  it('archetype filter button click で結果を type 絞り込み(Phase 8 順序性)', () => {
    boot();
    const folderBtn = archetypeRail()!.querySelector<HTMLElement>(
      '[data-pkc-action="toggle-archetype-filter"][data-pkc-archetype="folder"]',
    );
    expect(folderBtn).not.toBeNull();
    folderBtn!.click();
    // archetype=folder で絞ると folder の f1 のみ。
    expect(itemLids()).toEqual(['f1']);
  });

  it('archetype filter 解除で folder navigation に戻る', () => {
    boot();
    archetypeRail()!
      .querySelector<HTMLElement>(
        '[data-pkc-action="toggle-archetype-filter"][data-pkc-archetype="folder"]',
      )!
      .click();
    expect(itemLids()).toEqual(['f1']);
    // All button(archetype='')で解除 → 全 root entry。click ごとに sidebar が
    // rebuild されるため、rail は stale 参照を避けて再 query する。
    archetypeRail()!
      .querySelector<HTMLElement>('[data-pkc-action="set-archetype-filter"][data-pkc-archetype=""]')!
      .click();
    expect(itemLids().sort()).toEqual(['e1', 'e2', 'f1']);
  });
});

describe('filer モード sidebar の color filter (pgc-48)', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  const META = { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 };

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
    if (teardown) { teardown(); teardown = null; }
  });

  function bootWith(container: Container): void {
    const d = createDispatcher();
    d.onState((s) => render(s, root));
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(d.getState(), root);
    teardown = bindActions(root, d);
  }
  function colorStrip(): HTMLElement | null {
    return root.querySelector<HTMLElement>(
      '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"] .pkc-color-filter-strip',
    );
  }

  it('color tag 付き entry があると filer に color filter strip が出る', () => {
    bootWith({
      meta: META,
      entries: [
        { lid: 'e1', title: 'A', body: '', archetype: 'text', color_tag: 'red', created_at: TS, updated_at: TS },
      ],
      relations: [],
      revisions: [],
      assets: {},
    });
    expect(colorStrip()).not.toBeNull();
  });

  it('color tag が無ければ color filter strip は出ない', () => {
    bootWith({
      meta: META,
      entries: [
        { lid: 'e1', title: 'A', body: '', archetype: 'text', created_at: TS, updated_at: TS },
      ],
      relations: [],
      revisions: [],
      assets: {},
    });
    expect(colorStrip()).toBeNull();
  });
});
