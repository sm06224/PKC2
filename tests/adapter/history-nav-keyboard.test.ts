/**
 * @vitest-environment happy-dom
 *
 * pgc-179 wave-α' G2(v3 統合 master、roadmap 領域 1):履歴ナビ
 * Alt+←/→。browser history を keymap registry 経由で操作。
 *
 * 既存 `data-pkc-action="go-back"/"go-forward"` button(pgc-55、header
 * nav + breadcrumb)と同経路 ── `window.history.back/forward()` →
 * popstate → nav-history bridge が `GO_BACK` / `GO_FORWARD` dispatch。
 * textarea / input 編集中は handleKeymapKeydown が skip(cursor 単語移動
 * と非衝突)。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { createDispatcher } from '@adapter/state/dispatcher';

function setFlags(values: { keymap?: boolean }): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  const flags: string[] = [];
  if (values.keymap) flags.push('shell.keymap_registry_enabled=1');
  for (const f of flags) url.searchParams.append('pkc-flag', f);
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-179 history nav keyboard(Alt+←/→)', () => {
  let backSpy: ReturnType<typeof vi.spyOn>;
  let fwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetKeymapRegistry();
    resetCommandRegistry();
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    fwdSpy = vi.spyOn(window.history, 'forward').mockImplementation(() => {});
  });

  afterEach(() => {
    setFlags({});
    resetKeymapRegistry();
    resetCommandRegistry();
    backSpy.mockRestore();
    fwdSpy.mockRestore();
  });

  function bootCommands(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    registerBuiltinCommands(dispatcher);
    return dispatcher;
  }

  it('case 1: command palette に history.back / history.forward が登録され、keybind が Alt+ArrowLeft/Right', () => {
    bootCommands();
    const metas = getCommandMetas();
    const back = metas.find((m) => m.id === 'history.back');
    const fwd = metas.find((m) => m.id === 'history.forward');
    expect(back).not.toBeUndefined();
    expect(back?.category).toBe('Navigation');
    expect(back?.keybind).toBe('Alt+ArrowLeft');
    expect(fwd).not.toBeUndefined();
    expect(fwd?.category).toBe('Navigation');
    expect(fwd?.keybind).toBe('Alt+ArrowRight');
  });

  it('case 2: executeCommand("history.back") で window.history.back() が呼ばれる', () => {
    bootCommands();
    executeCommand('history.back');
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(fwdSpy).not.toHaveBeenCalled();
  });

  it('case 3: executeCommand("history.forward") で window.history.forward() が呼ばれる', () => {
    bootCommands();
    executeCommand('history.forward');
    expect(fwdSpy).toHaveBeenCalledTimes(1);
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('case 4: keymap registry ON で Alt+ArrowLeft が history.back を発火', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true });
    expect(handleKeymapKeydown(e)).toBe(true);
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('case 5: keymap registry ON で Alt+ArrowRight が history.forward を発火', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true });
    expect(handleKeymapKeydown(e)).toBe(true);
    expect(fwdSpy).toHaveBeenCalledTimes(1);
  });

  it('case 6: keymap flag OFF だと Alt+ArrowLeft は no-op(window.history は呼ばれない)', () => {
    setFlags({ keymap: false });
    bootCommands();
    registerBuiltinKeymaps();
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true });
    expect(handleKeymapKeydown(e)).toBe(false);
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('case 7: textarea 編集中の Alt+ArrowLeft は skip(cursor 単語移動を妨げない)', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    // dispatch from textarea target
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true });
    Object.defineProperty(e, 'target', { value: ta, configurable: true });
    expect(handleKeymapKeydown(e)).toBe(false);
    expect(backSpy).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it('case 8: input 編集中の Alt+ArrowRight も skip', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    const inp = document.createElement('input');
    document.body.appendChild(inp);
    inp.focus();
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true });
    Object.defineProperty(e, 'target', { value: inp, configurable: true });
    expect(handleKeymapKeydown(e)).toBe(false);
    expect(fwdSpy).not.toHaveBeenCalled();
    document.body.removeChild(inp);
  });

  it('case 9: Alt 無しの ArrowLeft / ArrowRight は無視(他の chord と非衝突)', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    const left = new KeyboardEvent('keydown', { key: 'ArrowLeft' }); // alt = false
    const right = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    expect(handleKeymapKeydown(left)).toBe(false);
    expect(handleKeymapKeydown(right)).toBe(false);
    expect(backSpy).not.toHaveBeenCalled();
    expect(fwdSpy).not.toHaveBeenCalled();
  });

  it('case 10: Alt+Shift+ArrowLeft も無視(別 chord、誤発火しない)', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, shiftKey: true });
    expect(handleKeymapKeydown(e)).toBe(false);
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('case 11: 連続 Alt+ArrowLeft / Alt+ArrowRight で back/forward を順次発火', () => {
    setFlags({ keymap: true });
    bootCommands();
    registerBuiltinKeymaps();
    handleKeymapKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }));
    handleKeymapKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }));
    handleKeymapKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }));
    expect(backSpy).toHaveBeenCalledTimes(2);
    expect(fwdSpy).toHaveBeenCalledTimes(1);
  });

  it('case 12: history.back / history.forward と既存 view.detail 等は独立した command(干渉なし)', () => {
    bootCommands();
    // history.back を実行しても view 切替 command(view.detail)は影響しない
    executeCommand('history.back');
    const metas = getCommandMetas();
    const detail = metas.find((m) => m.id === 'view.detail');
    expect(detail).not.toBeUndefined();
    expect(backSpy).toHaveBeenCalledTimes(1);
  });
});
