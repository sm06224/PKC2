/**
 * @vitest-environment happy-dom
 *
 * pgc-121 wave-γ #21(MASTER.md §6.2 後続):Activity Bar tab keyboard
 * shortcut(`Alt+Shift+1`〜`Alt+Shift+6`)。
 *
 * VSCode の Ctrl+Shift+E(Explorer)/ F(Search) と衝突するため、PKC2 は
 * `Alt+Shift+N` 系列を使う。`Alt+N`(view モード切替、pgc-101 で登録)と
 * 衝突回避のため Shift 修飾子付き別系列。
 *
 * 必要 flag:`shell.activity_bar_enabled` + `shell.keymap_registry_enabled`。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  resetActivityBarState,
  getActivityBarActiveTab,
} from '@adapter/ui/activity-bar';
import {
  resetKeymapRegistry,
  registerBuiltinKeymaps,
  handleKeymapKeydown,
} from '@adapter/ui/keymap-binder';
import {
  resetCommandRegistry,
  executeCommand,
  getCommandMetas,
} from '@adapter/ui/command-palette';
import { registerBuiltinCommands } from '@adapter/ui/command-palette-builtins';
import { createDispatcher } from '@adapter/state/dispatcher';

function setFlags(values: { keymap?: boolean; activityBar?: boolean }): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  const flags: string[] = [];
  if (values.keymap) flags.push('shell.keymap_registry_enabled=1');
  if (values.activityBar) flags.push('shell.activity_bar_enabled=1');
  for (const f of flags) url.searchParams.append('pkc-flag', f);
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-121 Activity Bar tab keyboard shortcut(Alt+Shift+1..6)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetActivityBarState();
    resetKeymapRegistry();
    resetCommandRegistry();
  });

  afterEach(() => {
    setFlags({});
    resetActivityBarState();
    resetKeymapRegistry();
    resetCommandRegistry();
  });

  function bootCommands(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    registerBuiltinCommands(dispatcher);
    return dispatcher;
  }

  it('command palette に activity.* 6 件 + keybind Alt+Shift+N が登録される', () => {
    bootCommands();
    const metas = getCommandMetas();
    const ids = ['explorer', 'search', 'outline', 'relations', 'recent', 'pinned'];
    for (let i = 0; i < ids.length; i++) {
      const m = metas.find((mm) => mm.id === `activity.${ids[i]}`);
      expect(m).not.toBeUndefined();
      expect(m?.category).toBe('View');
      expect(m?.keybind).toBe(`Alt+Shift+${i + 1}`);
    }
  });

  it('command palette から activity.search 実行で active tab が search に', () => {
    bootCommands();
    expect(getActivityBarActiveTab()).toBe('explorer');
    executeCommand('activity.search');
    expect(getActivityBarActiveTab()).toBe('search');
  });

  it('keymap registry:Alt+Shift+3 で outline tab に switch', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    expect(getActivityBarActiveTab()).toBe('explorer');
    const e = new KeyboardEvent('keydown', { key: '3', altKey: true, shiftKey: true });
    const handled = handleKeymapKeydown(e);
    expect(handled).toBe(true);
    expect(getActivityBarActiveTab()).toBe('outline');
  });

  it('keymap registry:Alt+Shift+6 で pinned tab に switch', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    const e = new KeyboardEvent('keydown', { key: '6', altKey: true, shiftKey: true });
    handleKeymapKeydown(e);
    expect(getActivityBarActiveTab()).toBe('pinned');
  });

  it('Alt+1(view mode、Shift なし)は activity tab を変えない(別系列)', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    expect(getActivityBarActiveTab()).toBe('explorer');
    const e = new KeyboardEvent('keydown', { key: '1', altKey: true, shiftKey: false });
    handleKeymapKeydown(e);
    // view.detail が発火するが、activity tab は不変
    expect(getActivityBarActiveTab()).toBe('explorer');
  });

  it('keymap flag OFF だと Alt+Shift+2 は no-op', () => {
    setFlags({ keymap: false });
    bootCommands();
    registerBuiltinKeymaps();
    const e = new KeyboardEvent('keydown', { key: '2', altKey: true, shiftKey: true });
    handleKeymapKeydown(e);
    expect(getActivityBarActiveTab()).toBe('explorer'); // 不変
  });

  it('連続 keyboard switch:explorer → search → recent → explorer', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    const k = (n: number) => new KeyboardEvent('keydown', { key: String(n), altKey: true, shiftKey: true });
    handleKeymapKeydown(k(2));
    expect(getActivityBarActiveTab()).toBe('search');
    handleKeymapKeydown(k(5));
    expect(getActivityBarActiveTab()).toBe('recent');
    handleKeymapKeydown(k(1));
    expect(getActivityBarActiveTab()).toBe('explorer');
  });
});
