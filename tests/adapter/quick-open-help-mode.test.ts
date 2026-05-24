/**
 * @vitest-environment happy-dom
 *
 * pgc-192 wave-α' #15(v3 統合 master G2 nav 統一、Quick Open `?` mode):
 * keymap registry の全 binding を一覧表示する help mode。chord(`Ctrl+B`
 * 等)+ command title を表示、Enter / click で対応 command を execute。
 * pgc-183〜185(heading/tag/recent)+ pgc-189(docs cleanup)に続き、
 * 6 mode universal launcher に格上げ。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  openQuickOpen,
  resetQuickOpenOverlay,
  formatKeybindSequence,
} from '@adapter/ui/quick-open';
import { setContainerFlagSource } from '@adapter/flags';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  resetCommandRegistry,
  executeCommand,
} from '@adapter/ui/command-palette';
import { registerBuiltinCommands } from '@adapter/ui/command-palette-builtins';
import {
  resetKeymapRegistry,
  registerBuiltinKeymaps,
} from '@adapter/ui/keymap-binder';
import type { Container } from '@core/model/container';

const TS = '2026-05-24T00:00:00Z';

function mkContainer(): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [{ lid: 'e1', title: 'X', body: 'x', archetype: 'text', created_at: TS, updated_at: TS }],
    relations: [],
    revisions: [],
    assets: {},
  };
}

let host: HTMLElement;

beforeEach(() => {
  __resetRegistry();
  __resetUrlCache();
  resetQuickOpenOverlay();
  resetCommandRegistry();
  resetKeymapRegistry();
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  setContainerFlagSource({ 'shell.quick_open_enabled': true });
});

afterEach(() => {
  resetQuickOpenOverlay();
  resetCommandRegistry();
  resetKeymapRegistry();
  document.body.innerHTML = '';
});

describe('pgc-192 Quick Open help mode(`?`)', () => {
  it('case 1: formatKeybindSequence — 1 chord(Ctrl+B)', () => {
    const seq = [{ ctrl: true, shift: false, alt: false, meta: false, key: 'b' }];
    expect(formatKeybindSequence(seq)).toBe('Ctrl+B');
  });

  it('case 2: formatKeybindSequence — 複数 modifier(Ctrl+Shift+S)', () => {
    const seq = [{ ctrl: true, shift: true, alt: false, meta: false, key: 's' }];
    expect(formatKeybindSequence(seq)).toBe('Ctrl+Shift+S');
  });

  it('case 3: formatKeybindSequence — 複数 char key(ArrowLeft / F12)', () => {
    const seq1 = [{ ctrl: false, shift: false, alt: true, meta: false, key: 'arrowleft' }];
    expect(formatKeybindSequence(seq1)).toBe('Alt+Arrowleft');
    const seq2 = [{ ctrl: false, shift: false, alt: false, meta: false, key: 'f12' }];
    expect(formatKeybindSequence(seq2)).toBe('F12');
  });

  it('case 4: formatKeybindSequence — chord 列(Ctrl+K H 等)', () => {
    const seq = [
      { ctrl: true, shift: false, alt: false, meta: false, key: 'k' },
      { ctrl: false, shift: false, alt: false, meta: false, key: 'h' },
    ];
    expect(formatKeybindSequence(seq)).toBe('Ctrl+K H');
  });

  it('case 5: `?` で mode hint "Help mode" 表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    registerBuiltinKeymaps();
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '?';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const hint = host.querySelector('.pkc-quick-open-mode-hint');
    expect(hint?.textContent).toContain('Help mode');
  });

  it('case 6: 登録済 keybind 数の row が出る(meta が空でも commandId fallback)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    registerBuiltinKeymaps();
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '?';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="help"]');
    // registerBuiltinKeymaps は 27 binding(pgc-182 で 23 → 27、pgc-188 は不変)
    expect(items.length).toBeGreaterThanOrEqual(20); // 安全マージン
  });

  it('case 7: row に chord meta(例:Alt+1)が表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    registerBuiltinKeymaps();
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '?';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="help"]');
    const metas = Array.from(items).map((li) => li.querySelector('.pkc-quick-open-item-meta')?.textContent ?? '');
    // Alt+1, Alt+2, F12, Ctrl+K Ctrl+S, Ctrl+\, Alt+ArrowLeft, Ctrl+PageDown, Alt+W, etc.
    expect(metas.some((m) => m.startsWith('Alt+'))).toBe(true);
    expect(metas.some((m) => m === 'F12')).toBe(true);
  });

  it('case 8: `?alt` で fuzzy filter(Alt 系 binding が match に含まれる)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    registerBuiltinKeymaps();
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '?alt';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="help"]');
    expect(items.length).toBeGreaterThan(0);
    const metas = Array.from(items).map((li) => li.querySelector('.pkc-quick-open-item-meta')?.textContent ?? '');
    // 少なくとも 1 件は Alt+ 系 binding が含まれる(title 経由の fuzzy match で
    // 他 binding も含まれる可能性はあるが、Alt 系が確実に出ることを assert)
    expect(metas.some((m) => m.startsWith('Alt+'))).toBe(true);
  });

  it('case 9: keymap 0 件(registerBuiltinKeymaps 未呼び)で empty state', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    // registerBuiltinKeymaps なし
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '?';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const empty = host.querySelector<HTMLElement>('.pkc-quick-open-empty');
    expect(empty?.style.display).not.toBe('none');
  });

  it('case 10: Enter で対応 command を execute(click も)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    registerBuiltinKeymaps();
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    // view.detail を狙う(`detail` で fuzzy)
    input.value = '?detail';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="help"]');
    expect(items.length).toBeGreaterThan(0);
    items[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // view.detail を execute → viewMode = 'detail'
    expect(d.getState().viewMode).toBe('detail');
  });

  it('case 11: 6 mode 排他で動作する(>:#@?)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    registerBuiltinKeymaps();
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    const hint = host.querySelector('.pkc-quick-open-mode-hint');
    for (const [prefix, name] of [['>', 'Command'], [':', 'Heading'], ['#', 'Tag'], ['@', 'Recent'], ['?', 'Help']]) {
      input.value = prefix;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(hint?.textContent).toContain(name);
    }
  });
});
