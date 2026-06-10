/**
 * @vitest-environment happy-dom
 *
 * pgc-182 wave-α' #5(v3 統合 master G2 nav 統一の延長):tab 切替 +
 * 閉じる / 復元の 4 chord。`Ctrl+PageDown/PageUp` で next/prev、
 * `Alt+W` で close-active、`Ctrl+Shift+T` で reopen-last-closed。
 * VSCode 流の動線。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  resetKeymapRegistry,
  registerBuiltinKeymaps,
  handleKeymapKeydown,
  getKeyBindings,
} from '@adapter/ui/keymap-binder';
import {
  resetCommandRegistry,
  executeCommand,
  getCommandMetas,
} from '@adapter/ui/command-palette';
import { registerBuiltinCommands } from '@adapter/ui/command-palette-builtins';
import {
  resetTabState,
  recordTabOpen,
  openViewTab,
  getActiveTabLid,
  getOpenTabs,
  getNextOpenTabLid,
  getPreviousOpenTabLid,
  togglePinTab,
  wireTabStrip,
} from '@adapter/ui/tab-strip';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-05-24T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'X', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e2', title: 'Y', body: 'y', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'e3', title: 'Z', body: 'z', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function setFlag(keymap: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (keymap) {
    url.searchParams.set('pkc-flag', 'shell.keymap_registry_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-182 tab navigation keyboard(Ctrl+PageDown/Up / Alt+W / Ctrl+Shift+T)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetKeymapRegistry();
    resetCommandRegistry();
    resetTabState();
  });

  afterEach(() => {
    setFlag(false);
    resetKeymapRegistry();
    resetCommandRegistry();
    resetTabState();
  });

  let wireTeardown: (() => void) | null = null;
  function bootCommands(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    registerBuiltinCommands(dispatcher);
    // tab-strip wireup ── reopen / select で recordTabOpen を呼ぶため
    wireTeardown = wireTabStrip(dispatcher);
    return dispatcher;
  }

  afterEach(() => {
    if (wireTeardown) { wireTeardown(); wireTeardown = null; }
  });

  it('case 1: tab.next / tab.previous / tab.close-active / tab.reopen-last-closed 4 command が登録 + keybind', () => {
    bootCommands();
    const metas = getCommandMetas();
    const next = metas.find((m) => m.id === 'tab.next');
    const prev = metas.find((m) => m.id === 'tab.previous');
    const close = metas.find((m) => m.id === 'tab.close-active');
    const reopen = metas.find((m) => m.id === 'tab.reopen-last-closed');
    expect(next?.keybind).toBe('Ctrl+PageDown');
    expect(prev?.keybind).toBe('Ctrl+PageUp');
    expect(close?.keybind).toBe('Alt+W');
    expect(reopen?.keybind).toBe('Ctrl+Shift+T');
    expect(next?.category).toBe('View');
  });

  it('case 2: getNextOpenTabLid / getPreviousOpenTabLid:0 件 / 1 件で null(no-op)', () => {
    expect(getNextOpenTabLid()).toBeNull();
    expect(getPreviousOpenTabLid()).toBeNull();
    recordTabOpen('e1', makeContainer());
    expect(getNextOpenTabLid()).toBeNull(); // 1 件のみで wrap 不要
    expect(getPreviousOpenTabLid()).toBeNull();
  });

  it('case 3: 複数 tab で cyclic next / previous', () => {
    const container = makeContainer();
    recordTabOpen('e1', container);
    recordTabOpen('e2', container);
    recordTabOpen('e3', container);
    // active が e3(直近 open)
    expect(getActiveTabLid()).toBe('e3');
    expect(getNextOpenTabLid()).toBe('e1'); // wrap-around
    expect(getPreviousOpenTabLid()).toBe('e2');
  });

  it('case 4: executeCommand("tab.next") で active が次の lid に SELECT_ENTRY dispatch', () => {
    const dispatcher = bootCommands();
    const container = makeContainer();
    recordTabOpen('e1', container);
    recordTabOpen('e2', container); // active = e2
    executeCommand('tab.next');
    expect(dispatcher.getState().selectedLid).toBe('e1'); // wrap to first
  });

  it('case 5: executeCommand("tab.previous") で active が前の lid に SELECT_ENTRY dispatch', () => {
    const dispatcher = bootCommands();
    const container = makeContainer();
    recordTabOpen('e1', container);
    recordTabOpen('e2', container); // active = e2
    executeCommand('tab.previous');
    expect(dispatcher.getState().selectedLid).toBe('e1');
  });

  it('case 6: view tab は SET_VIEW_MODE で切替(__view: prefix 検出)', () => {
    const dispatcher = bootCommands();
    openViewTab('calendar'); // active = __view:calendar
    const container = makeContainer();
    recordTabOpen('e1', container); // active = e1
    executeCommand('tab.next'); // active back to __view:calendar
    expect(dispatcher.getState().viewMode).toBe('calendar');
  });

  it('case 7: executeCommand("tab.close-active") でアクティブ tab を閉じる', () => {
    const dispatcher = bootCommands();
    const container = makeContainer();
    recordTabOpen('e1', container);
    recordTabOpen('e2', container); // active = e2
    expect(getOpenTabs().length).toBe(2);
    executeCommand('tab.close-active');
    expect(getOpenTabs().length).toBe(1);
    expect(getOpenTabs()[0]!.lid).toBe('e1');
    expect(dispatcher.getState().selectedLid).toBe('e1'); // closeActiveTab returns next lid
  });

  it('case 8: executeCommand("tab.reopen-last-closed") で直前閉じた tab を復元', () => {
    bootCommands();
    const container = makeContainer();
    recordTabOpen('e1', container);
    recordTabOpen('e2', container);
    executeCommand('tab.close-active');
    expect(getOpenTabs().length).toBe(1);
    executeCommand('tab.reopen-last-closed');
    expect(getOpenTabs().length).toBe(2);
    expect(getOpenTabs().some((t) => t.lid === 'e2')).toBe(true);
  });

  it('case 9: keymap registry ON + Ctrl+PageDown で tab.next 発火', () => {
    setFlag(true);
    const dispatcher = bootCommands();
    registerBuiltinKeymaps();
    const container = makeContainer();
    recordTabOpen('e1', container);
    recordTabOpen('e2', container);
    const e = new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true });
    expect(handleKeymapKeydown(e)).toBe(true);
    expect(dispatcher.getState().selectedLid).toBe('e1');
  });

  it('case 10: keymap registry ON + Ctrl+PageUp で tab.previous 発火', () => {
    setFlag(true);
    const dispatcher = bootCommands();
    registerBuiltinKeymaps();
    const container = makeContainer();
    recordTabOpen('e1', container);
    recordTabOpen('e2', container);
    const e = new KeyboardEvent('keydown', { key: 'PageUp', ctrlKey: true });
    expect(handleKeymapKeydown(e)).toBe(true);
    expect(dispatcher.getState().selectedLid).toBe('e1');
  });

  it('case 11: keymap registry ON + Alt+W で tab.close-active 発火', () => {
    setFlag(true);
    bootCommands();
    registerBuiltinKeymaps();
    const container = makeContainer();
    recordTabOpen('e1', container);
    recordTabOpen('e2', container);
    const e = new KeyboardEvent('keydown', { key: 'w', altKey: true });
    expect(handleKeymapKeydown(e)).toBe(true);
    expect(getOpenTabs().length).toBe(1);
  });

  it('case 12: keymap registry ON + Ctrl+Shift+T で tab.reopen-last-closed 発火', () => {
    setFlag(true);
    bootCommands();
    registerBuiltinKeymaps();
    const container = makeContainer();
    recordTabOpen('e1', container);
    recordTabOpen('e2', container);
    executeCommand('tab.close-active');
    const e = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, shiftKey: true });
    expect(handleKeymapKeydown(e)).toBe(true);
    expect(getOpenTabs().length).toBe(2);
  });

  it('case 13: textarea 編集中の Ctrl+PageDown は skip(編集中の cursor 移動を妨げない)', () => {
    setFlag(true);
    const dispatcher = bootCommands();
    registerBuiltinKeymaps();
    const container = makeContainer();
    recordTabOpen('e1', container);
    recordTabOpen('e2', container);
    // SELECT_ENTRY を明示で dispatch して initial state を確定
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    expect(dispatcher.getState().selectedLid).toBe('e2');
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    const e = new KeyboardEvent('keydown', { key: 'PageDown', ctrlKey: true });
    Object.defineProperty(e, 'target', { value: ta, configurable: true });
    expect(handleKeymapKeydown(e)).toBe(false);
    expect(dispatcher.getState().selectedLid).toBe('e2'); // 変化なし、tab 切替起きず
    document.body.removeChild(ta);
  });

  it('case 14: registerBuiltinKeymaps の合計件数が 27(23 + 4 new)', () => {
    resetKeymapRegistry();
    registerBuiltinKeymaps();
    const bs = getKeyBindings();
    expect(bs.length).toBe(22); // inspector chord 4 件撤去(#790)
    const ids = bs.map((b) => b.commandId);
    expect(ids).toContain('tab.next');
    expect(ids).toContain('tab.previous');
    expect(ids).toContain('tab.close-active');
    expect(ids).toContain('tab.reopen-last-closed');
  });

  it('case 15: pinned tab は close 拒否(closeActiveTab が return null し dispatch も無し)', () => {
    bootCommands();
    const container = makeContainer();
    recordTabOpen('e1', container);
    recordTabOpen('e2', container);
    // e2 を pin、active = e2
    togglePinTab('e2');
    const initialCount = getOpenTabs().length;
    executeCommand('tab.close-active');
    expect(getOpenTabs().length).toBe(initialCount); // pinned で close 拒否
  });
});
