/**
 * @vitest-environment happy-dom
 *
 * pgc-123 wave-γ #22(MASTER.md §6.3 後続):Inspector tab chord
 * shortcut(`Ctrl+K P/R/H/Y/I`)。
 *
 * VSCode の Ctrl+Shift+I(DevTools)と衝突するため、PKC2 は VSCode 流
 * `Ctrl+K Ctrl+S` keybinding system の 2-chord 流儀で発火。Activity Bar
 * の `Alt+Shift+N`(pgc-121)とも別系列で衝突なし。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  resetMetaPaneInspectorState,
  getMetaPaneInspectorActiveTab,
} from '@adapter/ui/meta-pane-inspector';
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

function setFlags(values: { keymap?: boolean; inspector?: boolean }): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  const flags: string[] = [];
  if (values.keymap) flags.push('shell.keymap_registry_enabled=1');
  if (values.inspector) flags.push('shell.meta_pane_inspector_enabled=1');
  for (const f of flags) url.searchParams.append('pkc-flag', f);
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-123 Inspector tab chord shortcut(Ctrl+K P/R/H/Y/I)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetMetaPaneInspectorState();
    resetKeymapRegistry();
    resetCommandRegistry();
  });

  afterEach(() => {
    setFlags({});
    resetMetaPaneInspectorState();
    resetKeymapRegistry();
    resetCommandRegistry();
  });

  function bootCommands(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    registerBuiltinCommands(dispatcher);
    return dispatcher;
  }

  it('command palette に inspector.* 5 件 + keybind Ctrl+K * が登録される', () => {
    bootCommands();
    const metas = getCommandMetas();
    const expected: { id: string; key: string }[] = [
      { id: 'inspector.properties', key: 'Ctrl+K P' },
      { id: 'inspector.references', key: 'Ctrl+K R' },
      { id: 'inspector.history',    key: 'Ctrl+K H' },
      { id: 'inspector.style',      key: 'Ctrl+K Y' },
      { id: 'inspector.ai',         key: 'Ctrl+K I' },
    ];
    for (const exp of expected) {
      const m = metas.find((mm) => mm.id === exp.id);
      expect(m).not.toBeUndefined();
      expect(m?.category).toBe('View');
      expect(m?.keybind).toBe(exp.key);
    }
  });

  it('command palette から inspector.history 実行で active tab が history に', () => {
    bootCommands();
    expect(getMetaPaneInspectorActiveTab()).toBe('properties'); // default
    executeCommand('inspector.history');
    expect(getMetaPaneInspectorActiveTab()).toBe('history');
  });

  it('keymap registry:Ctrl+K H chord で history tab に switch', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    expect(getMetaPaneInspectorActiveTab()).toBe('properties');
    // 1st chord:Ctrl+K → leader, buffer に積む(returns true で preventDefault)
    const e1 = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
    expect(handleKeymapKeydown(e1)).toBe(true);
    // tab はまだ変わらない
    expect(getMetaPaneInspectorActiveTab()).toBe('properties');
    // 2nd chord:H
    const e2 = new KeyboardEvent('keydown', { key: 'h' });
    expect(handleKeymapKeydown(e2)).toBe(true);
    expect(getMetaPaneInspectorActiveTab()).toBe('history');
  });

  it('keymap registry:Ctrl+K Y chord で style tab に switch', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    handleKeymapKeydown(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    handleKeymapKeydown(new KeyboardEvent('keydown', { key: 'y' }));
    expect(getMetaPaneInspectorActiveTab()).toBe('style');
  });

  it('keymap flag OFF だと Ctrl+K H は no-op', () => {
    setFlags({ keymap: false });
    bootCommands();
    registerBuiltinKeymaps();
    handleKeymapKeydown(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    handleKeymapKeydown(new KeyboardEvent('keydown', { key: 'h' }));
    expect(getMetaPaneInspectorActiveTab()).toBe('properties');
  });

  it('Ctrl+K の後に未登録 key を押すと chord cancel(別 tab に switch しない)', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    handleKeymapKeydown(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    // 未 binding key
    handleKeymapKeydown(new KeyboardEvent('keydown', { key: 'z' }));
    // tab は変わらない
    expect(getMetaPaneInspectorActiveTab()).toBe('properties');
  });

  it('連続 chord switch:properties → references → ai → properties', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    const chord = (k: string) => {
      handleKeymapKeydown(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      handleKeymapKeydown(new KeyboardEvent('keydown', { key: k }));
    };
    chord('r');
    expect(getMetaPaneInspectorActiveTab()).toBe('references');
    chord('i');
    expect(getMetaPaneInspectorActiveTab()).toBe('ai');
    chord('p');
    expect(getMetaPaneInspectorActiveTab()).toBe('properties');
  });

  it('inspector.* と activity.* は別 module-local state(干渉なし)', () => {
    bootCommands();
    // Activity Bar tab を search に変えても Inspector tab は properties のまま
    executeCommand('activity.search');
    expect(getMetaPaneInspectorActiveTab()).toBe('properties');
    // 逆も同じ
    executeCommand('inspector.history');
    // Activity Bar 側は search のまま(本 test の scope 外で確認)
    expect(getMetaPaneInspectorActiveTab()).toBe('history');
  });
});
