/**
 * @vitest-environment happy-dom
 *
 * Command Palette overlay adapter test(pgc-80)。
 * - registry の基本 CRUD
 * - flag OFF / ON で `openCommandPalette` の挙動
 * - keyboard nav(ArrowDown / ArrowUp / Enter / Escape)
 * - fuzzy filter の反映
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerCommand,
  unregisterCommand,
  resetCommandRegistry,
  resetCommandPaletteOverlay,
  getCommandMetas,
  getCommandCount,
  executeCommand,
  openCommandPalette,
  toggleCommandPalette,
  isCommandPaletteOpen,
} from '../../src/adapter/ui/command-palette';
import { setContainerFlagSource } from '../../src/adapter/flags';
// Tier 0 flag system:`setContainerFlagSource` で container 側 source を
// 与えれば override できる。本 test では `shell.command_palette_enabled` を
// inject して overlay の挙動を ON で確認する。

beforeEach(() => {
  resetCommandRegistry();
  resetCommandPaletteOverlay();
  // ensure no stale DOM
  document.body.innerHTML = '';
  // Tier 0 flag を ON にする最小 path:`__flags__` source override
  setContainerFlagSource({ 'shell.command_palette_enabled': true });
});

describe('command registry', () => {
  it('registerCommand stores meta + handler', () => {
    expect(getCommandCount()).toBe(0);
    const ok = registerCommand(
      { id: 'test.one', titleJa: 'テスト1', titleEn: 'Test 1', category: 'Debug' },
      () => undefined,
    );
    expect(ok).toBe(true);
    expect(getCommandCount()).toBe(1);
    const metas = getCommandMetas();
    expect(metas[0]?.id).toBe('test.one');
  });

  it('duplicate id is rejected(warn + false)', () => {
    registerCommand(
      { id: 'test.one', titleJa: 'a', titleEn: 'A', category: 'Debug' },
      () => undefined,
    );
    const second = registerCommand(
      { id: 'test.one', titleJa: 'b', titleEn: 'B', category: 'Debug' },
      () => undefined,
    );
    expect(second).toBe(false);
    expect(getCommandCount()).toBe(1);
  });

  it('invalid id format rejected', () => {
    const ok = registerCommand(
      { id: 'Test.UpperCase', titleJa: 'x', titleEn: 'X', category: 'Debug' },
      () => undefined,
    );
    expect(ok).toBe(false);
  });

  it('unregisterCommand removes', () => {
    registerCommand(
      { id: 'test.one', titleJa: 'a', titleEn: 'A', category: 'Debug' },
      () => undefined,
    );
    expect(unregisterCommand('test.one')).toBe(true);
    expect(getCommandCount()).toBe(0);
  });

  it('executeCommand calls handler', () => {
    let called = 0;
    registerCommand(
      { id: 'test.exec', titleJa: 'e', titleEn: 'E', category: 'Debug' },
      () => { called++; },
    );
    expect(executeCommand('test.exec')).toBe(true);
    expect(called).toBe(1);
  });

  it('executeCommand returns false for unknown id', () => {
    expect(executeCommand('does.not.exist')).toBe(false);
  });
});

describe('Command Palette overlay (DOM)', () => {
  it('openCommandPalette mounts overlay with input + list', () => {
    registerCommand(
      { id: 'view.detail', titleJa: '詳細', titleEn: 'Detail', category: 'View' },
      () => undefined,
    );
    expect(isCommandPaletteOpen()).toBe(false);
    openCommandPalette(document.body);
    expect(isCommandPaletteOpen()).toBe(true);
    const overlay = document.querySelector('[data-pkc-region="command-palette"]');
    expect(overlay).not.toBeNull();
    const input = overlay?.querySelector('[data-pkc-field="cmd-query"]');
    expect(input).not.toBeNull();
    const items = overlay?.querySelectorAll('[data-pkc-cmd-id]');
    expect(items?.length).toBe(1);
    expect(items?.[0]?.getAttribute('data-pkc-cmd-id')).toBe('view.detail');
  });

  it('typing in input re-ranks list', () => {
    registerCommand(
      { id: 'view.detail', titleJa: '詳細', titleEn: 'Detail', category: 'View' },
      () => undefined,
    );
    registerCommand(
      { id: 'view.calendar', titleJa: 'カレンダー', titleEn: 'Calendar', category: 'View' },
      () => undefined,
    );
    openCommandPalette(document.body);
    const input = document.querySelector<HTMLInputElement>('[data-pkc-field="cmd-query"]');
    expect(input).not.toBeNull();
    if (!input) return;
    input.value = 'cal';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = document.querySelectorAll('[data-pkc-cmd-id]');
    expect(items.length).toBe(1);
    expect(items[0]?.getAttribute('data-pkc-cmd-id')).toBe('view.calendar');
  });

  it('Escape closes the overlay', () => {
    registerCommand(
      { id: 'view.detail', titleJa: '詳細', titleEn: 'Detail', category: 'View' },
      () => undefined,
    );
    openCommandPalette(document.body);
    expect(isCommandPaletteOpen()).toBe(true);
    const input = document.querySelector<HTMLInputElement>('[data-pkc-field="cmd-query"]');
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isCommandPaletteOpen()).toBe(false);
    expect(document.querySelector('[data-pkc-region="command-palette"]')).toBeNull();
  });

  it('Enter executes the active command and closes', () => {
    let called = 0;
    registerCommand(
      { id: 'test.exec', titleJa: 'X', titleEn: 'X', category: 'Debug' },
      () => { called++; },
    );
    openCommandPalette(document.body);
    const input = document.querySelector<HTMLInputElement>('[data-pkc-field="cmd-query"]');
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(called).toBe(1);
    expect(isCommandPaletteOpen()).toBe(false);
  });

  it('ArrowDown / ArrowUp move active item', () => {
    registerCommand(
      { id: 'cmd.a', titleJa: 'A', titleEn: 'AAA', category: 'Debug' },
      () => undefined,
    );
    registerCommand(
      { id: 'cmd.b', titleJa: 'B', titleEn: 'BBB', category: 'Debug' },
      () => undefined,
    );
    openCommandPalette(document.body);
    // 初期 active は最初の item
    let active = document.querySelector('.pkc-command-palette-item-active');
    expect(active?.getAttribute('data-pkc-cmd-id')).toBe('cmd.a');
    // ArrowDown → cmd.b
    const input = document.querySelector<HTMLInputElement>('[data-pkc-field="cmd-query"]');
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    active = document.querySelector('.pkc-command-palette-item-active');
    expect(active?.getAttribute('data-pkc-cmd-id')).toBe('cmd.b');
    // ArrowDown again wraps to cmd.a
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    active = document.querySelector('.pkc-command-palette-item-active');
    expect(active?.getAttribute('data-pkc-cmd-id')).toBe('cmd.a');
    // ArrowUp → wraps back to cmd.b
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    active = document.querySelector('.pkc-command-palette-item-active');
    expect(active?.getAttribute('data-pkc-cmd-id')).toBe('cmd.b');
  });

  it('click item executes + closes', () => {
    let called = 0;
    registerCommand(
      { id: 'view.detail', titleJa: '詳細', titleEn: 'Detail', category: 'View' },
      () => { called++; },
    );
    openCommandPalette(document.body);
    const item = document.querySelector<HTMLElement>('[data-pkc-cmd-id="view.detail"]');
    item?.click();
    expect(called).toBe(1);
    expect(isCommandPaletteOpen()).toBe(false);
  });

  it('empty result shows empty placeholder', () => {
    registerCommand(
      { id: 'view.detail', titleJa: '詳細', titleEn: 'Detail', category: 'View' },
      () => undefined,
    );
    openCommandPalette(document.body);
    const input = document.querySelector<HTMLInputElement>('[data-pkc-field="cmd-query"]');
    if (!input) return;
    input.value = 'zzz-no-match';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const empty = document.querySelector('.pkc-command-palette-empty') as HTMLElement;
    expect(empty?.style.display).not.toBe('none');
  });

  it('toggleCommandPalette opens then closes', () => {
    registerCommand(
      { id: 'view.detail', titleJa: '詳細', titleEn: 'Detail', category: 'View' },
      () => undefined,
    );
    expect(isCommandPaletteOpen()).toBe(false);
    toggleCommandPalette(document.body);
    expect(isCommandPaletteOpen()).toBe(true);
    toggleCommandPalette(document.body);
    expect(isCommandPaletteOpen()).toBe(false);
  });
});

describe('flag gate', () => {
  it('openCommandPalette is no-op when flag OFF', () => {
    setContainerFlagSource({ 'shell.command_palette_enabled': false });
    registerCommand(
      { id: 'view.detail', titleJa: '詳細', titleEn: 'Detail', category: 'View' },
      () => undefined,
    );
    openCommandPalette(document.body);
    expect(isCommandPaletteOpen()).toBe(false);
    expect(document.querySelector('[data-pkc-region="command-palette"]')).toBeNull();
  });
});
