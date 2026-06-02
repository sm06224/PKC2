/**
 * @vitest-environment happy-dom
 *
 * pgc-144 wave-δ #18(user bug report 2026-05-24):
 * 「センターペインに編集結果を Split View のように反映する動線とか
 *  あってもいいかもしれない」
 *
 * 既存 Split View(pgc-89、右に read-only viewer)を、編集中に 1 step
 * で開ける keyboard shortcut を追加 ── VSCode 流の `Ctrl+\\`(Split
 * editor)と一致。Split View 自体は flag opt-in(pgc-89 既存)、本 PR
 * は **動線追加** のみ。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
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
import { isSplitViewOpen, resetSplitViewState } from '@adapter/ui/split-view';
import { createDispatcher } from '@adapter/state/dispatcher';

function setFlags(values: { keymap?: boolean; splitView?: boolean }): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  const flags: string[] = [];
  if (values.keymap) flags.push('shell.keymap_registry_enabled=1');
  if (values.splitView) flags.push('shell.split_view_enabled=1');
  for (const f of flags) url.searchParams.append('pkc-flag', f);
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-144 Split View keyboard shortcut(Ctrl+\\)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetKeymapRegistry();
    resetCommandRegistry();
    resetSplitViewState();
  });

  afterEach(() => {
    setFlags({});
    resetKeymapRegistry();
    resetCommandRegistry();
    resetSplitViewState();
  });

  function bootCommands(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    registerBuiltinCommands(dispatcher);
    return dispatcher;
  }

  it('command palette `split-view.toggle` の keybind が "Ctrl+\\\\"', () => {
    bootCommands();
    const meta = getCommandMetas().find((m) => m.id === 'split-view.toggle');
    expect(meta).not.toBeUndefined();
    expect(meta?.keybind).toBe('Ctrl+\\');
  });

  it('command palette から split-view.toggle 実行で Split View が open(split flag ON 必要)', () => {
    setFlags({ splitView: true });
    bootCommands();
    expect(isSplitViewOpen()).toBe(false);
    executeCommand('split-view.toggle');
    expect(isSplitViewOpen()).toBe(true);
  });

  it('keymap registry:Ctrl+\\\\ で Split View が toggle(split flag + keymap flag 両方 ON)', () => {
    setFlags({ keymap: true, splitView: true });
    bootCommands();
    registerBuiltinKeymaps();
    expect(isSplitViewOpen()).toBe(false);
    const e = new KeyboardEvent('keydown', { key: '\\', ctrlKey: true });
    const handled = handleKeymapKeydown(e);
    expect(handled).toBe(true);
    expect(isSplitViewOpen()).toBe(true);
  });

  it('keymap registry:2 回押しで toggle(open → close)', () => {
    setFlags({ keymap: true, splitView: true });
    bootCommands();
    registerBuiltinKeymaps();
    const e = new KeyboardEvent('keydown', { key: '\\', ctrlKey: true });
    handleKeymapKeydown(e);
    expect(isSplitViewOpen()).toBe(true);
    handleKeymapKeydown(e);
    expect(isSplitViewOpen()).toBe(false);
  });

  it('keymap flag OFF だと Ctrl+\\\\ は no-op', () => {
    setFlags({ keymap: false });
    bootCommands();
    registerBuiltinKeymaps();
    const e = new KeyboardEvent('keydown', { key: '\\', ctrlKey: true });
    handleKeymapKeydown(e);
    expect(isSplitViewOpen()).toBe(false);
  });
});
