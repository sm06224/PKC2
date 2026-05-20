/**
 * @vitest-environment happy-dom
 *
 * Phase γ-A2:編集モード picker + window-mode 配線。
 *
 * flag gate → action bar の picker 表示 → picker click で SET_EDIT_MODE →
 * editMode に応じて ✏️ Edit が inline 編集(BEGIN_EDIT)か entry-window に
 * 分岐することを end-to-end で検証する。reform-2026-05 Phase 8 順序性:
 * state mutation(editMode)で止めず、consumer(編集トリガ)の挙動が
 * user-visible 観測点(phase 遷移 / window.open 呼出)で変化することまで
 * assert する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { loadEditMode } from '@adapter/platform/edit-mode-prefs';
import type { Container } from '@core/model/container';

function makeContainer(): Container {
  const ts = '2026-01-01T00:00:00Z';
  return {
    meta: {
      container_id: 't',
      title: 'T',
      created_at: ts,
      updated_at: ts,
      schema_version: 1,
    },
    entries: [
      {
        lid: 'e1',
        title: 'A',
        body: 'hello',
        archetype: 'text',
        created_at: ts,
        updated_at: ts,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('編集モード picker + window 配線 (Phase γ-A2)', () => {
  let root: HTMLElement;
  let origOpen: typeof window.open;
  // bindActions は document レベル listener(keydown 等)を張るため、
  // 各テストで teardown を呼ばないと listener が累積し keyboard test が
  // 他テストの dispatcher を巻き込む(stale-listener-prevention.md)。
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    localStorage.clear();
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
    origOpen = window.open;
    teardown = null;
  });

  afterEach(() => {
    if (teardown) {
      teardown();
      teardown = null;
    }
    window.open = origOpen;
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function picker(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="edit-mode-picker"]');
  }
  function modeBtn(v: 'inline' | 'window'): HTMLButtonElement {
    const b = root.querySelector<HTMLButtonElement>(`[data-pkc-edit-mode="${v}"]`);
    if (!b) throw new Error(`edit-mode button "${v}" not found`);
    return b;
  }
  function editBtn(): HTMLButtonElement {
    const b = root.querySelector<HTMLButtonElement>(
      '[data-pkc-region="action-bar"] [data-pkc-action="begin-edit"]',
    );
    if (!b) throw new Error('begin-edit button not found');
    return b;
  }
  function isActive(v: 'inline' | 'window'): boolean {
    return modeBtn(v).classList.contains('pkc-edit-mode-active');
  }
  // window.open を null 返しに stub。openEntryWindow は child===null で
  // 早期 return するため、重い child window 構築を回避しつつ「呼ばれた
  // か」「window 名は何か」を assert できる。
  function stubWindowOpen(): ReturnType<
    typeof vi.fn<(url?: string, target?: string, features?: string) => null>
  > {
    const spy = vi.fn(
      (_url?: string, _target?: string, _features?: string) => null,
    );
    window.open = spy as unknown as typeof window.open;
    return spy;
  }

  // ── flag gate + picker rendering ──

  it('flag OFF:picker は出ない(従来 inline 編集のみ)', () => {
    boot();
    expect(picker()).toBeNull();
  });

  it('flag ON:picker に 2 button、default は inline active', () => {
    setContainerFlagSource({ 'shell.edit_mode_enabled': true });
    boot();
    expect(picker()).not.toBeNull();
    expect(picker()!.querySelectorAll('[data-pkc-edit-mode]')).toHaveLength(2);
    expect(isActive('inline')).toBe(true);
    expect(isActive('window')).toBe(false);
  });

  it('flag ON:window button click で SET_EDIT_MODE → window active に遷移', () => {
    setContainerFlagSource({ 'shell.edit_mode_enabled': true });
    const d = boot();
    modeBtn('window').click();
    expect(d.getState().editMode).toBe('window');
    expect(isActive('window')).toBe(true);
    expect(isActive('inline')).toBe(false);
  });

  it('flag ON:window → inline で元に戻せる', () => {
    setContainerFlagSource({ 'shell.edit_mode_enabled': true });
    const d = boot();
    modeBtn('window').click();
    modeBtn('inline').click();
    expect(d.getState().editMode).toBe('inline');
    expect(isActive('inline')).toBe(true);
  });

  it('flag ON:picker click は localStorage に永続化(A2-3)', () => {
    setContainerFlagSource({ 'shell.edit_mode_enabled': true });
    boot();
    modeBtn('window').click();
    expect(loadEditMode()).toBe('window');
    modeBtn('inline').click();
    expect(loadEditMode()).toBe('inline');
  });

  it('flag ON:編集中(phase=editing)は picker を出さない', () => {
    setContainerFlagSource({ 'shell.edit_mode_enabled': true });
    const d = boot();
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    expect(d.getState().phase).toBe('editing');
    expect(picker()).toBeNull();
  });

  // ── window-mode 配線(consumer behavior、Phase 8 順序性)──

  it('flag ON + editMode=inline:✏️ Edit で inline 編集に入る(phase=editing)', () => {
    setContainerFlagSource({ 'shell.edit_mode_enabled': true });
    const openSpy = stubWindowOpen();
    const d = boot();
    editBtn().click();
    expect(d.getState().phase).toBe('editing');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('flag ON + editMode=window:✏️ Edit で entry-window を開き inline 編集に入らない', () => {
    setContainerFlagSource({ 'shell.edit_mode_enabled': true });
    const openSpy = stubWindowOpen();
    const d = boot();
    modeBtn('window').click();
    editBtn().click();
    expect(d.getState().phase).toBe('ready');
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy.mock.calls[0]![1]).toBe('pkc-entry-e1');
  });

  it('flag OFF + editMode=window:flag gate で inline に fallback', () => {
    const openSpy = stubWindowOpen();
    const d = boot();
    d.dispatch({ type: 'SET_EDIT_MODE', mode: 'window' });
    expect(d.getState().editMode).toBe('window');
    editBtn().click();
    expect(d.getState().phase).toBe('editing');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('flag ON + editMode=window:Enter キーでも entry-window に分岐', () => {
    setContainerFlagSource({ 'shell.edit_mode_enabled': true });
    const openSpy = stubWindowOpen();
    const d = boot();
    modeBtn('window').click();
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(d.getState().phase).toBe('ready');
    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});
