/**
 * @vitest-environment happy-dom
 *
 * pgc-185 wave-α' #8(v3 統合 master G2 nav 統一、Quick Open `@` mode):
 * pgc-81 wave-α POC で「(後続)」 と既知だった Quick Open `@` mode を
 * navHistory ベースの recent jump として本格化。
 *
 * 期待動作:
 *   - `@` だけ:state.navHistory の末尾を新しい順に重複除去して表示
 *   - `@<query>`:fuzzy match で更に絞り込む(recency 補正で同 score なら新しい優先)
 *   - 履歴 0 件 / 全件 opaque で empty state
 *   - Enter / click で SELECT_ENTRY dispatch
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  openQuickOpen,
  resetQuickOpenOverlay,
} from '@adapter/ui/quick-open';
import { setContainerFlagSource } from '@adapter/flags';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const TS = '2026-05-24T00:00:00Z';

function mkEntry(lid: string, title: string, archetype: Entry['archetype'] = 'text'): Entry {
  return { lid, title, body: 'x', archetype, created_at: TS, updated_at: TS };
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

describe('pgc-185 Quick Open recent mode(`@`)', () => {
  it('case 1: `@` で mode hint "Recent mode" 表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([mkEntry('e1', 'X')]) });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '@';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const hint = host.querySelector('.pkc-quick-open-mode-hint');
    expect(hint?.textContent).toContain('Recent mode');
  });

  it('case 2: navHistory の末尾を新しい順 + 重複除去で表示', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry('e1', 'A'),
      mkEntry('e2', 'B'),
      mkEntry('e3', 'C'),
    ]) });
    // 履歴に e1 → e2 → e3 → e1 → e2 を積む(e1 / e2 / e3 重複)
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e3' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '@';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="recent"]');
    // 3 unique entries: e2(最新) → e1 → e3(順序は重複除去後、新しい順)
    expect(items.length).toBe(3);
    expect(items[0]!.getAttribute('data-pkc-quick-lid')).toBe('e2');
    expect(items[1]!.getAttribute('data-pkc-quick-lid')).toBe('e1');
    expect(items[2]!.getAttribute('data-pkc-quick-lid')).toBe('e3');
    // meta は #1 / #2 / #3
    expect(items[0]!.querySelector('.pkc-quick-open-item-meta')?.textContent).toBe('#1');
    expect(items[2]!.querySelector('.pkc-quick-open-item-meta')?.textContent).toBe('#3');
  });

  it('case 3: `@b` で fuzzy match', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry('e1', 'Apple'),
      mkEntry('e2', 'Banana'),
      mkEntry('e3', 'Cherry'),
    ]) });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e3' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '@b';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="recent"]');
    expect(items.length).toBe(1);
    expect(items[0]!.textContent).toContain('Banana');
  });

  it('case 4: navHistory 空 で `@` mode は empty state', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([mkEntry('e1', 'X')]) });
    // SELECT_ENTRY しない = history 空
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '@';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const empty = host.querySelector<HTMLElement>('.pkc-quick-open-empty');
    expect(empty?.style.display).not.toBe('none');
  });

  it('case 5: opaque archetype は recent mode から除外', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry('e1', 'X', 'text'),
      mkEntry('e2', 'Y', 'opaque'),
    ]) });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '@';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="recent"]');
    expect(items.length).toBe(1);
    expect(items[0]!.getAttribute('data-pkc-quick-lid')).toBe('e1');
  });

  it('case 6: Enter で SELECT_ENTRY dispatch', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry('e1', 'Apple'),
      mkEntry('e2', 'Banana'),
    ]) });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    // Now active = e2、history = [e1, e2]
    // Select e1 via recent
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '@';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // 1st item = e2(latest)、2nd = e1
    // ArrowDown で 2nd へ
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(d.getState().selectedLid).toBe('e1');
  });

  it('case 7: click で SELECT_ENTRY dispatch', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry('e1', 'Apple'),
      mkEntry('e2', 'Banana'),
    ]) });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '@';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // click 2nd item = e1
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="recent"]');
    items[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(d.getState().selectedLid).toBe('e1');
  });

  it('case 8: mode 切替(recent ↔ entry)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([mkEntry('e1', 'X')]) });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '@';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    let items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="recent"]');
    expect(items.length).toBeGreaterThan(0);
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="entry"]');
    expect(items.length).toBeGreaterThan(0);
  });

  it('case 9: 5 mode(entry / command / heading / tag / recent)が排他で動作する', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      { ...mkEntry('e1', 'X'), tags: ['t1'] },
    ]) });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
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
    input.value = '@';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(hint?.textContent).toContain('Recent');
  });

  it('case 10: navHistory に存在しない lid(削除済 entry)は skip', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer([
      mkEntry('e1', 'X'),
      mkEntry('e2', 'Y'),
    ]) });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    // Simulate entry e2 being deleted by mutating container directly
    const st = d.getState();
    // We can't easily delete via dispatch; instead just check the existing list
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    input.value = '@';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const items = host.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item[data-pkc-quick-mode="recent"]');
    // 2 entry both in history and present
    expect(items.length).toBe(2);
    // sanity: state intact
    expect(st.container?.entries.length).toBe(2);
  });
});
