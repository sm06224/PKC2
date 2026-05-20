/**
 * @vitest-environment happy-dom
 *
 * pgc-43:マルチウィンドウを state machine の前提に組み込む。
 *
 * child entry-window の open/close は `SYS_SYNC_CHILD_WINDOWS` で
 * `AppState.childWindowLids` に同期される。その state を 2 つの consumer が
 * 参照する:
 *   (a) `BEGIN_EDIT` の二重編集 guard — child window で開いている entry の
 *       inline 編集を弾く。
 *   (b) renderer — sidebar 行の `data-pkc-in-window` marker と center pane の
 *       「別ウィンドウで編集中」hint。
 *
 * reform-2026-05 Phase 8 順序性:dispatch → childWindowLids → consumer の
 * 観測点(reducer の phase / 描画 DOM)まで end-to-end で assert する。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { reduce, createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import { focusEntryWindow, setEntryWindowsChangedListener } from '@adapter/ui/entry-window';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

/** f1(folder)> e1(text)、root 直下 e2(text)。 */
function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'フォルダ', body: '', archetype: 'folder', created_at: TS, updated_at: TS },
      { lid: 'e1', title: '記事1', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: '記事2', body: 'y', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [
      { id: 'r1', from: 'f1', to: 'e1', kind: 'structural', created_at: TS, updated_at: TS },
    ],
    revisions: [],
    assets: {},
  };
}

/** ready phase の AppState を作る。 */
function readyState(overrides: Partial<AppState> = {}): AppState {
  return {
    ...createInitialState(),
    phase: 'ready',
    container: makeContainer(),
    ...overrides,
  };
}

describe('multi-window state (pgc-43)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
  });

  // ── reducer:SYS_SYNC_CHILD_WINDOWS ──────────────────────

  it('createInitialState は childWindowLids を空配列で持つ', () => {
    expect(createInitialState().childWindowLids).toEqual([]);
  });

  it('SYS_SYNC_CHILD_WINDOWS は childWindowLids を設定する', () => {
    const r = reduce(readyState(), { type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['e1', 'e2'] });
    expect(r.state.childWindowLids).toEqual(['e1', 'e2']);
    expect(r.events).toEqual([]);
  });

  it('SYS_SYNC_CHILD_WINDOWS は前回の集合を置換する(open/close の同期)', () => {
    const s1 = reduce(readyState(), { type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['e1', 'e2'] }).state;
    const s2 = reduce(s1, { type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['e2'] }).state;
    expect(s2.childWindowLids).toEqual(['e2']);
  });

  it('SYS_SYNC_CHILD_WINDOWS 空配列で全 window close を反映', () => {
    const s1 = reduce(readyState(), { type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['e1'] }).state;
    const s2 = reduce(s1, { type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] }).state;
    expect(s2.childWindowLids).toEqual([]);
  });

  it('SYS_SYNC_CHILD_WINDOWS は editing phase でも機能する(phase 非依存)', () => {
    const editing = readyState({ phase: 'editing', editingLid: 'e2', selectedLid: 'e2' });
    const r = reduce(editing, { type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['e1'] });
    expect(r.state.childWindowLids).toEqual(['e1']);
    expect(r.state.phase).toBe('editing'); // phase は変えない
  });

  it('SYS_SYNC_CHILD_WINDOWS は他 state を変えない', () => {
    const before = readyState({ selectedLid: 'e2' });
    const r = reduce(before, { type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['e1'] });
    expect(r.state.selectedLid).toBe('e2');
    expect(r.state.phase).toBe('ready');
    expect(r.state.container).toBe(before.container);
  });

  // ── reducer:BEGIN_EDIT 二重編集 guard ────────────────────

  it('child window で開いている entry の BEGIN_EDIT は blocked(phase 不変)', () => {
    const s = readyState({ selectedLid: 'e1', childWindowLids: ['e1'] });
    const r = reduce(s, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(r.state.phase).toBe('ready'); // editing に入らない
    expect(r.state.editingLid).toBeNull();
    expect(r.events).toEqual([]);
  });

  it('child window に無い entry の BEGIN_EDIT は通常通り editing に入る', () => {
    const s = readyState({ selectedLid: 'e2', childWindowLids: ['e1'] });
    const r = reduce(s, { type: 'BEGIN_EDIT', lid: 'e2' });
    expect(r.state.phase).toBe('editing');
    expect(r.state.editingLid).toBe('e2');
  });

  it('childWindowLids 空なら BEGIN_EDIT は従来通り(guard 影響なし)', () => {
    const s = readyState({ selectedLid: 'e1', childWindowLids: [] });
    const r = reduce(s, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(r.state.phase).toBe('editing');
  });

  // ── renderer:sidebar marker + center hint(end-to-end)────

  function boot(): { root: HTMLElement; dispatcher: ReturnType<typeof createDispatcher> } {
    const root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    return { root, dispatcher };
  }

  it('childWindowLids の entry は sidebar 行に data-pkc-in-window が付く', () => {
    const { root, dispatcher } = boot();
    dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['e1'] });
    const marked = root.querySelector(
      '[data-pkc-region="sidebar"] [data-pkc-lid="e1"][data-pkc-in-window="true"]',
    );
    expect(marked).not.toBeNull();
  });

  it('child window に無い entry の sidebar 行に marker は付かない', () => {
    const { root, dispatcher } = boot();
    dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['e1'] });
    const e2Row = root.querySelector('[data-pkc-region="sidebar"] [data-pkc-lid="e2"]');
    expect(e2Row).not.toBeNull();
    expect(e2Row!.getAttribute('data-pkc-in-window')).toBeNull();
  });

  it('windowed entry を選択中:center pane に「別ウィンドウで編集中」hint', () => {
    const { root, dispatcher } = boot();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['e1'] });
    expect(root.querySelector('[data-pkc-region="entry-in-window-hint"]')).not.toBeNull();
  });

  it('非 windowed entry を選択中:center pane に hint は出ない', () => {
    const { root, dispatcher } = boot();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['e1'] });
    expect(root.querySelector('[data-pkc-region="entry-in-window-hint"]')).toBeNull();
  });

  it('window が閉じる(SYS_SYNC_CHILD_WINDOWS [])と marker / hint が消える', () => {
    const { root, dispatcher } = boot();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: ['e1'] });
    expect(root.querySelector('[data-pkc-region="entry-in-window-hint"]')).not.toBeNull();
    // window close を同期。
    dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    expect(root.querySelector('[data-pkc-region="entry-in-window-hint"]')).toBeNull();
    expect(
      root.querySelector('[data-pkc-region="sidebar"] [data-pkc-in-window="true"]'),
    ).toBeNull();
  });

  // ── entry-window:focusEntryWindow / listener ─────────────

  it('focusEntryWindow は window が無い lid に false を返す', () => {
    expect(focusEntryWindow('e1')).toBe(false);
  });

  it('setEntryWindowsChangedListener は null でも例外なく外せる', () => {
    expect(() => {
      setEntryWindowsChangedListener(() => {});
      setEntryWindowsChangedListener(null);
    }).not.toThrow();
  });
});
