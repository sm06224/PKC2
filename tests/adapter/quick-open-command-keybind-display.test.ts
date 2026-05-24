/**
 * @vitest-environment happy-dom
 *
 * pgc-195 wave-α' #18(v3 統合 master G2 nav 統一、Quick Open command mode
 * の keybind 可視化):command mode の row meta に keybind があれば
 * category の代わりに表示。実行 keybind が user 体感優先(command palette
 * 同方針)。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { openQuickOpen, resetQuickOpenOverlay } from '@adapter/ui/quick-open';
import { setContainerFlagSource } from '@adapter/flags';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  resetCommandRegistry,
  registerCommand,
} from '@adapter/ui/command-palette';
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

describe('pgc-195 Quick Open command mode keybind display', () => {
  it('case 1: keybind あり command の meta が keybind を表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerCommand(
      { id: 'test.with-keybind', titleJa: 'A', titleEn: 'A', category: 'Test', keybind: 'Ctrl+T' },
      () => undefined,
    );
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '>';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="command"]');
    expect(items.length).toBe(1);
    expect(items[0]!.querySelector('.pkc-quick-open-item-meta')?.textContent).toBe('Ctrl+T');
  });

  it('case 2: keybind 無し command の meta が category を表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerCommand(
      { id: 'test.no-keybind', titleJa: 'B', titleEn: 'B', category: 'TestCat' },
      () => undefined,
    );
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '>';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="command"]');
    expect(items.length).toBe(1);
    expect(items[0]!.querySelector('.pkc-quick-open-item-meta')?.textContent).toBe('TestCat');
  });

  it('case 3: 混在 command list で keybind あり / 無しが別表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    registerCommand(
      { id: 'test.foo', titleJa: 'Foo', titleEn: 'Foo', category: 'A', keybind: 'Ctrl+F' },
      () => undefined,
    );
    registerCommand(
      { id: 'test.bar', titleJa: 'Bar', titleEn: 'Bar', category: 'B' },
      () => undefined,
    );
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '>';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="command"]');
    expect(items.length).toBe(2);
    const metas = Array.from(items).map((li) => li.querySelector('.pkc-quick-open-item-meta')?.textContent ?? '');
    expect(metas).toContain('Ctrl+F'); // keybind
    expect(metas).toContain('B'); // category(keybind なし)
  });
});
