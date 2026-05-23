/**
 * @vitest-environment happy-dom
 *
 * Quick Open overlay adapter test(pgc-81、wave-α MASTER.md §4.2)。
 * - rankEntries:fuzzy + recency tie-break
 * - openQuickOpen の DOM mount(flag ON のみ)
 * - keyboard nav(↑↓ / Enter / Escape)
 * - mode prefix(`>` → command mode)
 * - click 経路
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  rankEntries,
  openQuickOpen,
  toggleQuickOpen,
  isQuickOpenOpen,
  resetQuickOpenOverlay,
} from '../../src/adapter/ui/quick-open';
import {
  registerCommand,
  resetCommandRegistry,
  resetCommandPaletteOverlay,
} from '../../src/adapter/ui/command-palette';
import { setContainerFlagSource } from '../../src/adapter/flags';
import { createDispatcher } from '../../src/adapter/state/dispatcher';
import type { Entry } from '../../src/core/model/record';
import type { Container } from '../../src/core/model/container';

function mkEntry(lid: string, title: string, archetype: Entry['archetype'] = 'text'): Entry {
  return {
    lid,
    title,
    body: '',
    archetype,
    created_at: '2026-05-23T00:00:00Z',
    updated_at: '2026-05-23T00:00:00Z',
  };
}

function mkContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: 'test-container',
      title: 'test',
      created_at: '2026-05-23T00:00:00Z',
      updated_at: '2026-05-23T00:00:00Z',
      schema_version: 1,
      generator: 'test',
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  } as Container;
}

beforeEach(() => {
  resetCommandRegistry();
  resetCommandPaletteOverlay();
  resetQuickOpenOverlay();
  document.body.innerHTML = '';
  setContainerFlagSource({
    'shell.quick_open_enabled': true,
    'shell.command_palette_enabled': true,
  });
});

describe('rankEntries', () => {
  const entries: Entry[] = [
    mkEntry('lid-a', 'プロジェクト計画', 'text'),
    mkEntry('lid-b', '会議メモ', 'textlog'),
    mkEntry('lid-c', '買い物リスト', 'todo'),
    mkEntry('lid-d', 'photo.png', 'attachment'),
    mkEntry('lid-e', 'archive', 'opaque'),
  ];

  it('empty query returns all non-opaque entries with recency sort', () => {
    const recent = ['lid-c', 'lid-a'];
    const out = rankEntries('', entries, recent);
    // 4 entry(opaque 除外)
    expect(out.length).toBe(4);
    // recency 上位:lid-a (last in recent = index 1) > lid-c (index 0) > 残り
    expect(out[0]!.entry.lid).toBe('lid-a');
    expect(out[1]!.entry.lid).toBe('lid-c');
  });

  it('opaque entry is excluded', () => {
    const out = rankEntries('', entries, []);
    expect(out.find((r) => r.entry.archetype === 'opaque')).toBeUndefined();
  });

  it('Japanese fuzzy matches title', () => {
    const out = rankEntries('プロ', entries, []);
    expect(out[0]!.entry.lid).toBe('lid-a');
  });

  it('English fuzzy matches title', () => {
    const out = rankEntries('photo', entries, []);
    expect(out[0]!.entry.lid).toBe('lid-d');
  });

  it('returns empty when nothing matches', () => {
    const out = rankEntries('zzzqqq', entries, []);
    expect(out).toEqual([]);
  });

  it('recency tie-break: when scores are close', () => {
    // 同 title の 2 entry を作って recency で並び替え
    const e2: Entry[] = [
      mkEntry('lid-x', '同名タイトル'),
      mkEntry('lid-y', '同名タイトル'),
    ];
    const out = rankEntries('同名', e2, ['lid-y']);
    // y は recency +0.1
    expect(out[0]!.entry.lid).toBe('lid-y');
  });
});

describe('openQuickOpen overlay', () => {
  function makeDispatcher(entries: Entry[]) {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer(entries) });
    return d;
  }

  it('mounts overlay with input + entry list', () => {
    const d = makeDispatcher([
      mkEntry('a', 'Alice'),
      mkEntry('b', 'Bob'),
    ]);
    openQuickOpen(document.body, d);
    expect(isQuickOpenOpen()).toBe(true);
    const overlay = document.querySelector('[data-pkc-region="quick-open"]');
    expect(overlay).not.toBeNull();
    const items = overlay?.querySelectorAll('[data-pkc-quick-lid]');
    expect(items?.length).toBe(2);
  });

  it('typing filters entries', () => {
    const d = makeDispatcher([
      mkEntry('a', 'Apple notes'),
      mkEntry('b', 'Banana log'),
    ]);
    openQuickOpen(document.body, d);
    const input = document.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]');
    if (!input) throw new Error('no input');
    input.value = 'apple';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = document.querySelectorAll('[data-pkc-quick-lid]');
    expect(items.length).toBe(1);
    expect(items[0]?.getAttribute('data-pkc-quick-lid')).toBe('a');
  });

  it('Escape closes overlay', () => {
    const d = makeDispatcher([mkEntry('a', 'x')]);
    openQuickOpen(document.body, d);
    const input = document.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]');
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isQuickOpenOpen()).toBe(false);
  });

  it('Enter dispatches SELECT_ENTRY for active entry', () => {
    const d = makeDispatcher([
      mkEntry('a', 'Alice'),
      mkEntry('b', 'Bob'),
    ]);
    const selected: string[] = [];
    d.onEvent((ev) => {
      if (ev.type === 'ENTRY_SELECTED') selected.push(ev.lid);
    });
    openQuickOpen(document.body, d);
    const input = document.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]');
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    // first item is 'a' (alphabetical / recency empty → ordered)
    expect(selected.length).toBe(1);
    expect(isQuickOpenOpen()).toBe(false);
  });

  it('ArrowDown moves active item', () => {
    const d = makeDispatcher([
      mkEntry('a', 'Alice'),
      mkEntry('b', 'Bob'),
    ]);
    openQuickOpen(document.body, d);
    let active = document.querySelector('.pkc-quick-open-item-active');
    const firstId = active?.getAttribute('data-pkc-quick-lid');
    const input = document.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]');
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    active = document.querySelector('.pkc-quick-open-item-active');
    const secondId = active?.getAttribute('data-pkc-quick-lid');
    expect(secondId).not.toBe(firstId);
  });

  it('> prefix switches to command mode and lists commands', () => {
    registerCommand(
      { id: 'view.detail', titleJa: '詳細ビュー', titleEn: 'View: Detail', category: 'View' },
      () => undefined,
    );
    const d = makeDispatcher([mkEntry('a', 'x')]);
    openQuickOpen(document.body, d);
    const input = document.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]');
    if (!input) throw new Error('no input');
    input.value = '> detail';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const cmdItems = document.querySelectorAll('[data-pkc-cmd-id]');
    expect(cmdItems.length).toBe(1);
    expect(cmdItems[0]?.getAttribute('data-pkc-cmd-id')).toBe('view.detail');
  });

  it('> prefix Enter executes command', () => {
    let called = 0;
    registerCommand(
      { id: 'test.cmd', titleJa: 'テスト', titleEn: 'Test', category: 'Debug' },
      () => { called++; },
    );
    const d = makeDispatcher([mkEntry('a', 'x')]);
    openQuickOpen(document.body, d);
    const input = document.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]');
    if (!input) throw new Error('no input');
    input.value = '>';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(called).toBe(1);
    expect(isQuickOpenOpen()).toBe(false);
  });

  it('click entry dispatches SELECT_ENTRY + closes', () => {
    const d = makeDispatcher([mkEntry('a', 'Alice')]);
    let selected = '';
    d.onEvent((ev) => {
      if (ev.type === 'ENTRY_SELECTED') selected = ev.lid;
    });
    openQuickOpen(document.body, d);
    const li = document.querySelector<HTMLElement>('[data-pkc-quick-lid="a"]');
    li?.click();
    expect(selected).toBe('a');
    expect(isQuickOpenOpen()).toBe(false);
  });

  it('toggleQuickOpen opens then closes', () => {
    const d = makeDispatcher([mkEntry('a', 'x')]);
    expect(isQuickOpenOpen()).toBe(false);
    toggleQuickOpen(document.body, d);
    expect(isQuickOpenOpen()).toBe(true);
    toggleQuickOpen(document.body, d);
    expect(isQuickOpenOpen()).toBe(false);
  });

  it('flag OFF: openQuickOpen is no-op', () => {
    setContainerFlagSource({ 'shell.quick_open_enabled': false });
    const d = makeDispatcher([mkEntry('a', 'x')]);
    openQuickOpen(document.body, d);
    expect(isQuickOpenOpen()).toBe(false);
  });
});
