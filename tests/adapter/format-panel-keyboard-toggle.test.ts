/**
 * @vitest-environment happy-dom
 *
 * pgc-120 wave-γ #20(MASTER.md §6.4 step 2):Format panel keyboard
 * shortcut(Alt+Shift+F)を keymap registry 経由で着地。
 *
 * 既存 `format.toggle` command の id を keybind して、`shell.keymap_
 * registry_enabled` flag ON + `shell.format_panel_default_hidden_enabled`
 * flag ON の双方が必要(panel が visible なら toggle = hide、hidden なら
 * = show)。
 *
 * command palette からも `format.toggle` で同 command が呼べる(本 PR で
 * 新規追加、既存 split-view.toggle 直後)。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  resetFormatPanelVisibility,
  isFormatPanelVisible,
} from '@adapter/ui/format-panel-visibility';
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

function setFlags(values: { keymap?: boolean; formatHidden?: boolean }): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  const flags: string[] = [];
  if (values.keymap) flags.push('shell.keymap_registry_enabled=1');
  if (values.formatHidden) flags.push('shell.format_panel_default_hidden_enabled=1');
  for (const f of flags) url.searchParams.append('pkc-flag', f);
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-120 Format panel keyboard toggle(Alt+Shift+F)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetFormatPanelVisibility();
    resetKeymapRegistry();
    resetCommandRegistry();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    setFlags({});
    resetFormatPanelVisibility();
    resetKeymapRegistry();
    resetCommandRegistry();
  });

  function bootCommands(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    registerBuiltinCommands(dispatcher);
    return dispatcher;
  }

  it('command palette に `format.toggle` command が登録される(Alt+Shift+F keybind 含む)', () => {
    bootCommands();
    const metas = getCommandMetas();
    const ft = metas.find((m) => m.id === 'format.toggle');
    expect(ft).not.toBeUndefined();
    expect(ft?.titleEn).toContain('Format');
    expect(ft?.category).toBe('View');
    expect(ft?.keybind).toBe('Alt+Shift+F');
  });

  it('command palette から `format.toggle` 実行で format panel state が flip', () => {
    bootCommands();
    expect(isFormatPanelVisible()).toBe(false);
    const ok = executeCommand('format.toggle');
    expect(ok).toBe(true);
    expect(isFormatPanelVisible()).toBe(true);
    executeCommand('format.toggle');
    expect(isFormatPanelVisible()).toBe(false);
  });

  it('keymap registry に `Alt+Shift+F → format.toggle` が登録される', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    expect(isFormatPanelVisible()).toBe(false);
    const e = new KeyboardEvent('keydown', {
      key: 'F',
      altKey: true,
      shiftKey: true,
    });
    const handled = handleKeymapKeydown(e);
    expect(handled).toBe(true);
    expect(isFormatPanelVisible()).toBe(true);
  });

  it('keymap flag OFF だと Alt+Shift+F は no-op', () => {
    setFlags({ keymap: false });
    bootCommands();
    registerBuiltinKeymaps();
    expect(isFormatPanelVisible()).toBe(false);
    const e = new KeyboardEvent('keydown', {
      key: 'F',
      altKey: true,
      shiftKey: true,
    });
    handleKeymapKeydown(e);
    // flag OFF なら handleKeymapKeydown が early return、state 不変
    expect(isFormatPanelVisible()).toBe(false);
  });

  it('textarea focus 中の Alt+Shift+F は keymap skip(誤発火回避)', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    expect(isFormatPanelVisible()).toBe(false);
    const e = new KeyboardEvent('keydown', {
      key: 'F',
      altKey: true,
      shiftKey: true,
    });
    Object.defineProperty(e, 'target', { value: ta });
    handleKeymapKeydown(e);
    // textarea 中は skip、state 不変
    expect(isFormatPanelVisible()).toBe(false);
  });

  it('Alt+Shift+F 2 回押し → toggle(visible 2 回 flip = hidden に戻る)', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    const e = new KeyboardEvent('keydown', {
      key: 'F',
      altKey: true,
      shiftKey: true,
    });
    handleKeymapKeydown(e);
    expect(isFormatPanelVisible()).toBe(true);
    handleKeymapKeydown(e);
    expect(isFormatPanelVisible()).toBe(false);
  });
});
