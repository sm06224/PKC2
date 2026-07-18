/** @vitest-environment happy-dom */
/**
 * #932(user 指摘 2026-07-17)tab strip の統合 test。
 *
 * 1. 「エントリを開いた際にタブが増えるべきのところ、次の操作の render で
 *    タブが増える」1 テンポ遅れの fix ── main.ts と同じ listener 順
 *    (render の onState → wireTabStrip)を再現し、SELECT_ENTRY の
 *    **同一 dispatch 内の render** でタブが出ることを assert。
 * 2. tab strip 右クリック → タブ一覧 menu(開いているタブの選択 / 最近
 *    閉じたタブの復元 / このタブを閉じる)。
 * 3. 最後の tab を閉じたら DESELECT され、render 時同期で復活しないこと。
 * 4. opt-in flag `shell.compact_entry_labels`(小字 + 折り返し class)と
 *    entry title の常時 tooltip。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache, setContainerFlagSource } from '@adapter/flags';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import { resetTabState, resetTabOpenFeedback, wireTabStrip, getOpenTabs } from '@adapter/ui/tab-strip';
import type { Container } from '@core/model/container';
import type { Dispatcher } from '@adapter/state/dispatcher';

const T = '2026-07-17T00:00:00Z';

function makeContainer(): Container {
  const mk = (lid: string, title: string) => ({
    lid, title, body: 'x', archetype: 'text' as const,
    created_at: T, updated_at: T,
  });
  return {
    meta: { container_id: 'c-932', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [mk('e1', 'Entry One'), mk('e2', 'Entry Two'), mk('e3', 'Entry Three')],
    relations: [], revisions: [], assets: {},
  };
}

let root: HTMLElement;
let cleanups: (() => void)[] = [];

beforeEach(() => {
  __resetRegistry();
  __resetUrlCache();
  resetTabState();
  resetTabOpenFeedback();
  localStorage.clear();
  setContainerFlagSource({ 'shell.tabs_enabled': true });
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  for (const c of cleanups) c();
  cleanups = [];
  setContainerFlagSource({});
  root.remove();
});

/** main.ts と同じ順序: render onState を先に、wireTabStrip を後に登録。 */
function setup(): Dispatcher {
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  render(dispatcher.getState(), root);
  cleanups.push(bindActions(root, dispatcher));
  cleanups.push(wireTabStrip(dispatcher));
  return dispatcher;
}

function stripTabs(): string[] {
  return [...root.querySelectorAll<HTMLElement>('[data-pkc-region="tab-strip"] .pkc-tab')]
    .map((t) => t.getAttribute('data-pkc-lid')!);
}
function contextMenu(): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-pkc-region="context-menu"]');
}
function rightClickStrip(target?: HTMLElement): void {
  const el = target ?? root.querySelector<HTMLElement>('[data-pkc-region="tab-strip"]')!;
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
}

describe('render 時同期 ── タブは開いた瞬間の render で出る(#932 fix)', () => {
  it('SELECT_ENTRY の同一 dispatch 内の render でタブが増える', () => {
    const d = setup();
    expect(stripTabs()).toEqual([]);
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    // ここで追加操作をせずに DOM を見る ── 1 テンポ遅れなら空のまま
    expect(stripTabs()).toEqual(['e1']);
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    expect(stripTabs()).toEqual(['e1', 'e2']);
  });
});

describe('tab strip 右クリック menu(#932)', () => {
  it('開いているタブの一覧が出て、click で選択が移る', () => {
    const d = setup();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    rightClickStrip();
    const menu = contextMenu()!;
    expect(menu).not.toBeNull();
    const items = [...menu.querySelectorAll<HTMLElement>('[data-pkc-action="select-entry"]')];
    expect(items.map((i) => i.getAttribute('data-pkc-lid'))).toEqual(['e1', 'e2']);
    // active(e2)は ✓ 付き
    expect(items[1]!.getAttribute('data-pkc-tab-menu-active')).toBe('true');
    items[0]!.click();
    expect(d.getState().selectedLid).toBe('e1');
  });

  it('tab 上で右クリックすると「このタブを閉じる」が出て閉じられる', () => {
    const d = setup();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    const tabE1 = root.querySelector<HTMLElement>('[data-pkc-region="tab-strip"] .pkc-tab[data-pkc-lid="e1"]')!;
    rightClickStrip(tabE1);
    const closeItem = contextMenu()!.querySelector<HTMLElement>('[data-pkc-action="close-tab"][data-pkc-lid="e1"]');
    expect(closeItem).not.toBeNull();
    expect(closeItem!.textContent).toContain('Entry One');
    closeItem!.click();
    expect(stripTabs()).toEqual(['e2']);
  });

  it('閉じたタブが「最近閉じたタブ」に並び、click で復元・選択される', () => {
    const d = setup();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    // e1 を × で閉じる
    root.querySelector<HTMLElement>('[data-pkc-action="close-tab"][data-pkc-lid="e1"]')!.click();
    expect(stripTabs()).toEqual(['e2']);
    rightClickStrip();
    const reopen = contextMenu()!.querySelector<HTMLElement>('[data-pkc-action="reopen-closed-tab"][data-pkc-lid="e1"]');
    expect(reopen).not.toBeNull();
    reopen!.click();
    expect(stripTabs()).toEqual(['e2', 'e1']);
    expect(d.getState().selectedLid).toBe('e1');
    // 復元済みの項目は list から消える
    rightClickStrip();
    expect(contextMenu()!.querySelector('[data-pkc-action="reopen-closed-tab"]')).toBeNull();
  });
});

describe('最後の tab を閉じる(#932 regression guard)', () => {
  it('DESELECT され、render 時同期でタブが復活しない', () => {
    const d = setup();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    expect(stripTabs()).toEqual(['e1']);
    root.querySelector<HTMLElement>('[data-pkc-action="close-tab"][data-pkc-lid="e1"]')!.click();
    expect(d.getState().selectedLid).toBeNull();
    expect(stripTabs()).toEqual([]);
    expect(getOpenTabs().length).toBe(0);
  });
});

describe('opt-in 小字 + 折り返し(shell.compact_entry_labels)+ tooltip', () => {
  it('flag ON で entry list と tab strip に compact class が付く', () => {
    setContainerFlagSource({ 'shell.tabs_enabled': true, 'shell.compact_entry_labels': true });
    const d = setup();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    expect(root.querySelector('[data-pkc-region="entry-list"]')!.classList.contains('pkc-compact-labels')).toBe(true);
    expect(root.querySelector('[data-pkc-region="tab-strip"]')!.classList.contains('pkc-compact-labels')).toBe(true);
  });

  it('flag OFF では compact class なし、tooltip(title 属性)は常時付く', () => {
    setup();
    expect(root.querySelector('[data-pkc-region="entry-list"]')!.classList.contains('pkc-compact-labels')).toBe(false);
    const title = root.querySelector<HTMLElement>('[data-pkc-region="entry-list"] .pkc-entry-title')!;
    expect(title.getAttribute('title')).toBeTruthy();
  });
});
