/**
 * @vitest-environment happy-dom
 *
 * pgc-183 wave-α' #6(v3 統合 master G2 nav 統一の続編):Quick Open
 * `:` mode を heading jump として本格化(pgc-81 wave-α POC では「entry
 * 検索にフォールバック」 の placeholder だった)。
 *
 * 現 entry(text / textlog)の見出しを抽出 + fuzzy match、Enter で
 * `#<slug>` element に scrollIntoView。selectedLid なし / text/textlog
 * 以外 / heading 0 件は empty state。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openQuickOpen,
  resetQuickOpenOverlay,
  rankHeadings,
} from '@adapter/ui/quick-open';
import { setContainerFlagSource } from '@adapter/flags';
import { createDispatcher } from '@adapter/state/dispatcher';
import { extractHeadingsFromMarkdown } from '@features/markdown/markdown-toc';
import type { Container } from '@core/model/container';

const TS = '2026-05-24T00:00:00Z';

function makeContainer(body: string, archetype: 'text' | 'textlog' = 'text'): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'X', body, archetype, created_at: TS, updated_at: TS },
    ],
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

describe('pgc-183 Quick Open heading mode(`:`)', () => {
  it('case 1: rankHeadings — empty query は全 heading を返す', () => {
    const headings = extractHeadingsFromMarkdown('# A\n## B\n### C\n');
    const ranked = rankHeadings('', headings);
    expect(ranked).toHaveLength(3);
  });

  it('case 2: rankHeadings — fuzzy match で text 検索', () => {
    const headings = extractHeadingsFromMarkdown('# プロジェクト計画\n## 会議メモ\n## 買い物リスト\n');
    const ranked = rankHeadings('プロ', headings);
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    expect(ranked[0]!.heading.text).toBe('プロジェクト計画');
  });

  it('case 3: rankHeadings — fuzzy match で slug 検索(英字 fallback)', () => {
    const headings = extractHeadingsFromMarkdown('# Project Plan\n## Meeting Notes\n');
    const ranked = rankHeadings('plan', headings);
    expect(ranked[0]!.heading.text).toBe('Project Plan');
  });

  it('case 4: rankHeadings — match 無しは空配列', () => {
    const headings = extractHeadingsFromMarkdown('# A\n## B\n');
    const ranked = rankHeadings('XYZ123', headings);
    expect(ranked).toEqual([]);
  });

  it('case 5: openQuickOpen で `:` 入力時 mode hint が "Heading mode" 表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer('# H1\n## H2\n') });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = ':';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const hint = host.querySelector('.pkc-quick-open-mode-hint');
    expect(hint?.textContent).toContain('Heading mode');
  });

  it('case 6: heading mode で list に heading row + data-pkc-heading-slug attr', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer('# Apple\n## Banana\n### Cherry\n') });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = ':';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="heading"]');
    expect(items.length).toBe(3);
    expect(items[0]!.getAttribute('data-pkc-heading-slug')).toBeTruthy();
    // level icon
    expect(items[0]!.querySelector('.pkc-quick-open-item-icon')?.textContent).toBe('📚'); // H1
    expect(items[1]!.querySelector('.pkc-quick-open-item-icon')?.textContent).toBe('📖'); // H2
    expect(items[2]!.querySelector('.pkc-quick-open-item-icon')?.textContent).toBe('📑'); // H3
    // meta = H1/H2/H3
    expect(items[0]!.querySelector('.pkc-quick-open-item-meta')?.textContent).toBe('H1');
  });

  it('case 7: `:apple` で fuzzy match → apple のみ表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer('# Apple\n## Banana\n') });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = ':apple';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="heading"]');
    expect(items.length).toBe(1);
    expect(items[0]!.textContent).toContain('Apple');
  });

  it('case 8: selectedLid なし で `:` mode は empty state', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer('# A\n## B\n') });
    // SELECT_ENTRY しない
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = ':';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const empty = host.querySelector<HTMLElement>('.pkc-quick-open-empty');
    expect(empty?.style.display).not.toBe('none');
  });

  it('case 9: text/textlog 以外の archetype(todo)で `:` mode は empty state', () => {
    const d = createDispatcher();
    const container: Container = {
      meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        { lid: 'e1', title: 'X', body: '{"status":"open","description":"todo"}', archetype: 'todo', created_at: TS, updated_at: TS },
      ],
      relations: [],
      revisions: [],
      assets: {},
    };
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = ':';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const empty = host.querySelector<HTMLElement>('.pkc-quick-open-empty');
    expect(empty?.style.display).not.toBe('none');
  });

  it('case 10: heading 0 件の entry でも `:` mode は empty state(無限ループ回避)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer('plain text no headings here\n') });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = ':';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const empty = host.querySelector<HTMLElement>('.pkc-quick-open-empty');
    expect(empty?.style.display).not.toBe('none');
  });

  it('case 11: Enter で heading scroll target を探す(scroll behavior は smooth)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer('# Apple\n## Banana\n') });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    // mock target element with id matching heading slug
    const center = document.createElement('div');
    center.setAttribute('data-pkc-region', 'center');
    const h = document.createElement('h1');
    h.id = 'apple'; // slug for "Apple"
    h.textContent = 'Apple';
    center.appendChild(h);
    document.body.appendChild(center);
    // capture scrollIntoView call
    let scrollCalled = false;
    let scrollOpts: ScrollIntoViewOptions | undefined;
    h.scrollIntoView = (opts) => {
      scrollCalled = true;
      scrollOpts = typeof opts === 'object' ? opts : undefined;
    };
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = ':apple';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    input.dispatchEvent(enter);
    expect(scrollCalled).toBe(true);
    expect(scrollOpts?.behavior).toBe('smooth');
  });

  it('case 12: click → heading mode の li で scroll 発火', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer('# Apple\n## Banana\n') });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    const center = document.createElement('div');
    center.setAttribute('data-pkc-region', 'center');
    const h = document.createElement('h2');
    h.id = 'banana';
    h.textContent = 'Banana';
    center.appendChild(h);
    document.body.appendChild(center);
    let scrollCalled = false;
    h.scrollIntoView = () => {
      scrollCalled = true;
    };
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = ':banana';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const item = host.querySelector<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="heading"]');
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(scrollCalled).toBe(true);
  });

  it('case 13: textlog でも heading mode 動作する', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer('# Log Header\n## Subsection\n', 'textlog') });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = ':';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="heading"]');
    expect(items.length).toBe(2);
  });

  it('case 14: heading mode から entry mode に戻る(input 変更)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer('# H1\n') });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    // start with heading mode
    input.value = ':';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    let items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="heading"]');
    expect(items.length).toBeGreaterThan(0);
    // switch back to entry mode by removing `:`
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="entry"]');
    expect(items.length).toBeGreaterThan(0);
  });
});
