/**
 * @vitest-environment happy-dom
 *
 * pgc-184 wave-α' #7(v3 統合 master G2 nav 統一、Quick Open `#` mode):
 * pgc-81 wave-α POC で「POC 範囲外、entry 検索にフォールバック」 と既知
 * だった Quick Open `#` mode を tag filter として本格化。container 全
 * entry から tag を集計、count desc + fuzzy match、Enter で
 * TOGGLE_TAG_FILTER を dispatch。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openQuickOpen,
  resetQuickOpenOverlay,
  rankTags,
  collectTagCounts,
} from '@adapter/ui/quick-open';
import { setContainerFlagSource } from '@adapter/flags';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const TS = '2026-05-24T00:00:00Z';

function mkEntry(lid: string, title: string, tags?: string[]): Entry {
  return {
    lid,
    title,
    body: 'x',
    archetype: 'text',
    created_at: TS,
    updated_at: TS,
    ...(tags ? { tags } : {}),
  };
}

function mkContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

let host: HTMLElement;

beforeEach(() => {
  resetQuickOpenOverlay();
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  setContainerFlagSource({
    'shell.quick_open_enabled': true,
  });
});

afterEach(() => {
  resetQuickOpenOverlay();
  document.body.innerHTML = '';
});

describe('pgc-184 Quick Open tag mode(`#`)', () => {
  it('case 1: collectTagCounts — 0 tag 0 件', () => {
    const out = collectTagCounts([mkEntry('e1', 'X')]);
    expect(out).toEqual([]);
  });

  it('case 2: collectTagCounts — count desc + alpha tie-break', () => {
    const entries = [
      mkEntry('e1', 'X', ['rust', 'oss']),
      mkEntry('e2', 'Y', ['rust']),
      mkEntry('e3', 'Z', ['oss', 'docs']),
      mkEntry('e4', 'W', ['rust', 'oss', 'docs']),
    ];
    const out = collectTagCounts(entries);
    // rust 3, oss 3, docs 2 — count desc + alpha tie-break(oss < rust)
    expect(out[0]!.tag).toBe('oss');
    expect(out[0]!.count).toBe(3);
    expect(out[1]!.tag).toBe('rust');
    expect(out[1]!.count).toBe(3);
    expect(out[2]!.tag).toBe('docs');
    expect(out[2]!.count).toBe(2);
  });

  it('case 3: collectTagCounts — 空文字 / undefined tag は skip', () => {
    const entries: Entry[] = [
      { ...mkEntry('e1', 'X'), tags: ['valid', ''] },
      { ...mkEntry('e2', 'Y'), tags: undefined },
    ];
    const out = collectTagCounts(entries);
    expect(out).toEqual([{ tag: 'valid', count: 1 }]);
  });

  it('case 4: rankTags — empty query は全 tag を count desc', () => {
    const tagCounts = collectTagCounts([
      mkEntry('e1', 'X', ['rust']),
      mkEntry('e2', 'Y', ['oss']),
    ]);
    const ranked = rankTags('', tagCounts);
    expect(ranked).toHaveLength(2);
  });

  it('case 5: rankTags — fuzzy match', () => {
    const tagCounts = collectTagCounts([
      mkEntry('e1', 'X', ['rust']),
      mkEntry('e2', 'Y', ['oss']),
      mkEntry('e3', 'Z', ['programming']),
    ]);
    const ranked = rankTags('prog', tagCounts);
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    expect(ranked[0]!.tag).toBe('programming');
  });

  it('case 6: rankTags — match 無しは空配列', () => {
    const tagCounts = collectTagCounts([mkEntry('e1', 'X', ['rust'])]);
    const ranked = rankTags('XYZ123', tagCounts);
    expect(ranked).toEqual([]);
  });

  it('case 7: openQuickOpen で `#` 入力時 mode hint が "Tag mode" 表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([mkEntry('e1', 'X', ['tag1'])]) });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '#';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const hint = host.querySelector('.pkc-quick-open-mode-hint');
    expect(hint?.textContent).toContain('Tag mode');
  });

  it('case 8: tag mode で list に tag row + data-pkc-quick-tag attr + count meta', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry('e1', 'X', ['rust', 'oss']),
      mkEntry('e2', 'Y', ['rust']),
    ]) });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '#';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="tag"]');
    expect(items.length).toBe(2);
    expect(items[0]!.getAttribute('data-pkc-quick-tag')).toBe('rust');
    expect(items[0]!.querySelector('.pkc-quick-open-item-icon')?.textContent).toBe('🏷');
    expect(items[0]!.querySelector('.pkc-quick-open-item-meta')?.textContent).toBe('2 entry');
    expect(items[1]!.querySelector('.pkc-quick-open-item-meta')?.textContent).toBe('1 entry');
  });

  it('case 9: `#prog` で fuzzy match → programming のみ表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry('e1', 'X', ['rust']),
      mkEntry('e2', 'Y', ['programming']),
    ]) });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '#prog';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="tag"]');
    expect(items.length).toBe(1);
    expect(items[0]!.textContent).toContain('programming');
  });

  it('case 10: tag 0 件 container で `#` mode は empty state', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([mkEntry('e1', 'X')]) });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '#';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const empty = host.querySelector<HTMLElement>('.pkc-quick-open-empty');
    expect(empty?.style.display).not.toBe('none');
  });

  it('case 11: Enter で TOGGLE_TAG_FILTER dispatch + tagFilter に追加', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([mkEntry('e1', 'X', ['rust'])]) });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '#';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    input.dispatchEvent(enter);
    const st = d.getState();
    expect(st.tagFilter?.has('rust')).toBe(true);
  });

  it('case 12: click で TOGGLE_TAG_FILTER dispatch', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry('e1', 'X', ['rust']),
      mkEntry('e2', 'Y', ['oss']),
    ]) });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '#oss';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const item = host.querySelector<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="tag"]');
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const st = d.getState();
    expect(st.tagFilter?.has('oss')).toBe(true);
  });

  it('case 13: mode 切替(tag ↔ entry)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([mkEntry('e1', 'X', ['tag1'])]) });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    // tag mode
    input.value = '#';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    let tagItems = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="tag"]');
    expect(tagItems.length).toBeGreaterThan(0);
    // entry mode
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const entryItems = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="entry"]');
    expect(entryItems.length).toBeGreaterThan(0);
  });

  it('case 14: 4 mode(entry / command / heading / tag)が排他で動作する', () => {
    // 命名規約検証 ── prefix 列挙
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([mkEntry('e1', 'X', ['t1'])]) });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    const hint = host.querySelector('.pkc-quick-open-mode-hint');
    input.value = '>';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(hint?.textContent).toContain('Command');
    input.value = ':';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(hint?.textContent).toContain('Heading');
    input.value = '#';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(hint?.textContent).toContain('Tag');
  });
});
