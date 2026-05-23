/**
 * @vitest-environment happy-dom
 *
 * Keymap binder adapter test(pgc-82、MASTER.md §4.6)。
 * - registerKeyBinding parse 失敗で false
 * - handleKeymapKeydown が flag ON で発火、OFF で no-op
 * - command 未登録の binding は warning + no-op
 * - chord sequence の leader → completion 経路
 * - textarea / input 編集中はスキップ
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerKeyBinding,
  resetKeymapRegistry,
  handleKeymapKeydown,
  getKeyBindings,
  registerBuiltinKeymaps,
} from '../../src/adapter/ui/keymap-binder';
import {
  registerCommand,
  resetCommandRegistry,
} from '../../src/adapter/ui/command-palette';
import { setContainerFlagSource } from '../../src/adapter/flags';

beforeEach(() => {
  resetKeymapRegistry();
  resetCommandRegistry();
  document.body.innerHTML = '';
  setContainerFlagSource({ 'shell.keymap_registry_enabled': true });
});

function ke(opts: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; target: EventTarget }>, key: string): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key,
    ctrlKey: opts.ctrl ?? false,
    shiftKey: opts.shift ?? false,
    altKey: opts.alt ?? false,
    metaKey: opts.meta ?? false,
    bubbles: true,
    cancelable: true,
  });
  if (opts.target) Object.defineProperty(e, 'target', { value: opts.target, configurable: true });
  return e;
}

describe('registerKeyBinding', () => {
  it('parses valid string and adds', () => {
    expect(registerKeyBinding('Ctrl+P', 'cmd.x')).toBe(true);
    expect(getKeyBindings().length).toBe(1);
  });
  it('invalid string returns false', () => {
    expect(registerKeyBinding('Hyper+X', 'cmd.x')).toBe(false);
    expect(getKeyBindings().length).toBe(0);
  });
});

describe('handleKeymapKeydown', () => {
  it('executes mapped command when flag ON', () => {
    let called = 0;
    registerCommand(
      { id: 'cmd.exec', titleJa: 'X', titleEn: 'X', category: 'Debug' },
      () => { called++; },
    );
    registerKeyBinding('Alt+9', 'cmd.exec');
    const handled = handleKeymapKeydown(ke({ alt: true }, '9'));
    expect(handled).toBe(true);
    expect(called).toBe(1);
  });

  it('no-op when flag OFF', () => {
    setContainerFlagSource({ 'shell.keymap_registry_enabled': false });
    let called = 0;
    registerCommand(
      { id: 'cmd.exec', titleJa: 'X', titleEn: 'X', category: 'Debug' },
      () => { called++; },
    );
    registerKeyBinding('Alt+9', 'cmd.exec');
    const handled = handleKeymapKeydown(ke({ alt: true }, '9'));
    expect(handled).toBe(false);
    expect(called).toBe(0);
  });

  it('unknown command id → no-op but warning', () => {
    registerKeyBinding('Alt+9', 'cmd.unregistered');
    const handled = handleKeymapKeydown(ke({ alt: true }, '9'));
    // Match 経路は走るが executeCommand が false 返し → still "matched" so
    // handled = true
    expect(handled).toBe(true);
  });

  it('chord sequence Ctrl+K Ctrl+S', () => {
    let called = 0;
    registerCommand(
      { id: 'cmd.chord', titleJa: 'C', titleEn: 'C', category: 'Debug' },
      () => { called++; },
    );
    registerKeyBinding('Ctrl+K Ctrl+S', 'cmd.chord');
    // First chord: Ctrl+K → partial
    const r1 = handleKeymapKeydown(ke({ ctrl: true }, 'k'));
    expect(r1).toBe(true);
    expect(called).toBe(0);
    // Second chord: Ctrl+S → matched
    const r2 = handleKeymapKeydown(ke({ ctrl: true }, 's'));
    expect(r2).toBe(true);
    expect(called).toBe(1);
  });

  it('chord buffer resets on no-match', () => {
    let called = 0;
    registerCommand(
      { id: 'cmd.chord', titleJa: 'C', titleEn: 'C', category: 'Debug' },
      () => { called++; },
    );
    registerKeyBinding('Ctrl+K Ctrl+S', 'cmd.chord');
    handleKeymapKeydown(ke({ ctrl: true }, 'k')); // partial
    handleKeymapKeydown(ke({ ctrl: true }, 'z')); // no match → buffer cleared
    // 次の Ctrl+S は単独 → not bound → no-op
    const r3 = handleKeymapKeydown(ke({ ctrl: true }, 's'));
    expect(r3).toBe(false);
    expect(called).toBe(0);
  });

  it('skips when target is textarea (so typing in editor never fires)', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    let called = 0;
    registerCommand(
      { id: 'cmd.exec', titleJa: 'X', titleEn: 'X', category: 'Debug' },
      () => { called++; },
    );
    registerKeyBinding('Alt+9', 'cmd.exec');
    const r = handleKeymapKeydown(ke({ alt: true, target: ta }, '9'));
    expect(r).toBe(false);
    expect(called).toBe(0);
  });

  it('skips when target is input', () => {
    const inp = document.createElement('input');
    document.body.appendChild(inp);
    let called = 0;
    registerCommand(
      { id: 'cmd.exec', titleJa: 'X', titleEn: 'X', category: 'Debug' },
      () => { called++; },
    );
    registerKeyBinding('Alt+9', 'cmd.exec');
    const r = handleKeymapKeydown(ke({ alt: true, target: inp }, '9'));
    expect(r).toBe(false);
    expect(called).toBe(0);
  });

  it('modifier-only press is ignored', () => {
    const r = handleKeymapKeydown(ke({ ctrl: true }, 'Control'));
    expect(r).toBe(false);
  });
});

describe('registerBuiltinKeymaps', () => {
  it('registers Alt+1..6 + F12 + Ctrl+K Ctrl+S + Alt+Shift+F(pgc-120)', () => {
    resetKeymapRegistry();
    registerBuiltinKeymaps();
    const bs = getKeyBindings();
    expect(bs.length).toBe(9); // 6 + 1 + 1 + 1(pgc-120 で format.toggle 追加)
    const ids = bs.map((b) => b.commandId).sort();
    expect(ids).toContain('view.detail');
    expect(ids).toContain('app.flags');
    expect(ids).toContain('app.shortcuts');
    expect(ids).toContain('format.toggle');
  });
});
