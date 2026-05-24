/**
 * @vitest-environment happy-dom
 *
 * pgc-194 wave-α' #17(v3 統合 master G2 nav 統一、Quick Open `!` mode):
 * pgc-81 wave-α POC で「(後続)」 と既知だった Quick Open `!` mode を
 * Flags Inspector launcher として本格化。pgc-192(`?` help)に続き、
 * 7 mode universal launcher 完成。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  openQuickOpen,
  resetQuickOpenOverlay,
} from '@adapter/ui/quick-open';
import { setContainerFlagSource } from '@adapter/flags';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  resetCommandRegistry,
} from '@adapter/ui/command-palette';
import { registerBuiltinCommands } from '@adapter/ui/command-palette-builtins';
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
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  setContainerFlagSource({ 'shell.quick_open_enabled': true });
});

afterEach(() => {
  resetQuickOpenOverlay();
  resetCommandRegistry();
  document.body.innerHTML = '';
});

describe('pgc-194 Quick Open debug mode(`!`)', () => {
  it('case 1: `!` で mode hint "Debug mode" 表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '!';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const hint = host.querySelector('.pkc-quick-open-mode-hint');
    expect(hint?.textContent).toContain('Debug mode');
  });

  it('case 2: debug mode で list に「Flags Inspector」 row 1 件 + 🔧 icon + F12 meta', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '!';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="debug"]');
    expect(items.length).toBe(1);
    expect(items[0]!.querySelector('.pkc-quick-open-item-icon')?.textContent).toBe('🔧');
    expect(items[0]!.querySelector('.pkc-quick-open-item-title')?.textContent).toContain('Flags Inspector');
    expect(items[0]!.querySelector('.pkc-quick-open-item-meta')?.textContent).toBe('F12');
    expect(items[0]!.getAttribute('data-pkc-cmd-id')).toBe('app.flags');
  });

  it('case 3: Enter で OPEN_FLAGS_INSPECTOR(state.flagsInspectorOpen=true)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    expect(d.getState().flagsInspectorOpen).not.toBe(true);
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '!';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(d.getState().flagsInspectorOpen).toBe(true);
  });

  it('case 4: click で同(state.flagsInspectorOpen=true)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    expect(d.getState().flagsInspectorOpen).not.toBe(true);
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '!';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const item = host.querySelector<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="debug"]');
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(d.getState().flagsInspectorOpen).toBe(true);
  });

  it('case 5: 7 mode 排他で動作(>:#@?!)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    const hint = host.querySelector('.pkc-quick-open-mode-hint');
    for (const [prefix, name] of [['>', 'Command'], [':', 'Heading'], ['#', 'Tag'], ['@', 'Recent'], ['?', 'Help'], ['!', 'Debug']]) {
      input.value = prefix;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(hint?.textContent).toContain(name);
    }
  });

  it('case 6: `!xyz`(effective query があっても)依然 1 row 表示(常に Flags Inspector)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerBuiltinCommands(d);
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '!xyz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="debug"]');
    expect(items.length).toBe(1);
  });
});
