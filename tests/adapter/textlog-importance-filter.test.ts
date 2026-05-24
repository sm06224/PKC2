/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  textlogPresenter,
  setTextlogImportanceOnly,
  toggleTextlogImportanceOnly,
  isTextlogImportanceOnly,
  setTextlogSearchQuery,
  resetTextlogSearchState,
} from '../../src/adapter/ui/textlog-presenter';
import { __resetRegistry, __resetUrlCache } from '../../src/adapter/flags';
import type { Entry } from '../../src/core/model/record';
import type { TextlogBody, TextlogFlag } from '../../src/features/textlog/textlog-body';

function setFlags(importance: boolean, search: boolean = false): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (importance) url.searchParams.append('pkc-flag', 'text.textlog_importance_filter_enabled=1');
  if (search) url.searchParams.append('pkc-flag', 'text.textlog_log_search_enabled=1');
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

function makeTextlog(entries: { id: string; text: string; flags?: TextlogFlag[] }[]): Entry {
  const body: TextlogBody = {
    entries: entries.map((e, i) => ({
      id: e.id,
      text: e.text,
      createdAt: `2026-05-24T${10 + i}:00:00Z`,
      flags: e.flags ?? [],
    })),
  };
  return {
    lid: 'lid_log',
    title: 'Log',
    body: JSON.stringify(body),
    archetype: 'textlog',
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
  };
}

const FIXTURE = [
  { id: '1', text: 'morning standup' },
  { id: '2', text: 'fix bug', flags: ['important' as TextlogFlag] },
  { id: '3', text: 'review PR' },
  { id: '4', text: 'lunch meeting', flags: ['important' as TextlogFlag] },
];

describe('textlog importance-only filter(pgc-157)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetTextlogSearchState();
  });

  it('case 1: flag OFF で toggle button 出ない', () => {
    setFlags(false);
    const el = textlogPresenter.renderBody(makeTextlog(FIXTURE));
    expect(el.querySelector('.pkc-textlog-importance-toggle')).toBeNull();
  });

  it('case 2: flag ON で toggle button 出る + default は OFF state', () => {
    setFlags(true);
    const el = textlogPresenter.renderBody(makeTextlog(FIXTURE));
    const btn = el.querySelector('.pkc-textlog-importance-toggle');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
    expect(btn?.getAttribute('data-pkc-active')).toBeNull();
    expect(btn?.textContent).toContain('All logs');
  });

  it('case 3: importance only ON → 該当 log だけ表示 + count `M / N`', () => {
    setFlags(true);
    const entry = makeTextlog(FIXTURE);
    setTextlogImportanceOnly(entry.lid, true);
    const el = textlogPresenter.renderBody(entry);
    const count = el.querySelector('.pkc-textlog-search-count');
    expect(count?.textContent).toBe('2 / 4');
    const btn = el.querySelector('.pkc-textlog-importance-toggle');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
    expect(btn?.getAttribute('data-pkc-active')).toBe('true');
    expect(btn?.textContent).toContain('Only important');
  });

  it('case 4: importance only + 全 entry が important でない → empty placeholder', () => {
    setFlags(true);
    const entry = makeTextlog([
      { id: '1', text: 'a' },
      { id: '2', text: 'b' },
    ]);
    setTextlogImportanceOnly(entry.lid, true);
    const el = textlogPresenter.renderBody(entry);
    const empty = el.querySelector('[data-pkc-region="textlog-empty"]');
    expect(empty?.textContent).toContain('No important log entries');
    expect(empty?.textContent).toContain('⭐ filter');
  });

  it('case 5: search + importance AND 条件', () => {
    setFlags(true, true);
    const entry = makeTextlog(FIXTURE);
    setTextlogImportanceOnly(entry.lid, true);
    setTextlogSearchQuery(entry.lid, 'meeting');
    const el = textlogPresenter.renderBody(entry);
    const count = el.querySelector('.pkc-textlog-search-count');
    // important 2 件 のうち "meeting" 含むのは "lunch meeting" 1 件
    expect(count?.textContent).toBe('1 / 4');
  });

  it('case 6: search "x" hit あり + importance ON で 0 件 → empty placeholder', () => {
    setFlags(true, true);
    const entry = makeTextlog(FIXTURE);
    setTextlogImportanceOnly(entry.lid, true);
    setTextlogSearchQuery(entry.lid, 'review'); // hit は id=3 のみ、important なし
    const el = textlogPresenter.renderBody(entry);
    const empty = el.querySelector('[data-pkc-region="textlog-empty"]');
    expect(empty?.textContent).toContain('No important matches for "review"');
  });

  it('case 7: state get/set/toggle round-trip', () => {
    expect(isTextlogImportanceOnly('lid_a')).toBe(false);
    setTextlogImportanceOnly('lid_a', true);
    expect(isTextlogImportanceOnly('lid_a')).toBe(true);
    setTextlogImportanceOnly('lid_a', false);
    expect(isTextlogImportanceOnly('lid_a')).toBe(false);
    expect(toggleTextlogImportanceOnly('lid_a')).toBe(true);
    expect(isTextlogImportanceOnly('lid_a')).toBe(true);
    expect(toggleTextlogImportanceOnly('lid_a')).toBe(false);
  });

  it('case 8: per-lid 分離(他 lid に漏れない)', () => {
    setTextlogImportanceOnly('lid_a', true);
    expect(isTextlogImportanceOnly('lid_a')).toBe(true);
    expect(isTextlogImportanceOnly('lid_b')).toBe(false);
  });

  it('case 9: 順序性(Phase 8)── importance ON/OFF 切替で hit count 観測点が動く', () => {
    setFlags(true);
    const entry = makeTextlog(FIXTURE);
    const el1 = textlogPresenter.renderBody(entry);
    expect(el1.querySelector('.pkc-textlog-search-count')?.textContent).toBe('4 entries');
    setTextlogImportanceOnly(entry.lid, true);
    const el2 = textlogPresenter.renderBody(entry);
    expect(el2.querySelector('.pkc-textlog-search-count')?.textContent).toBe('2 / 4');
  });

  it('case 10: toggle button の attr に lid', () => {
    setFlags(true);
    const entry = makeTextlog(FIXTURE);
    const btn = textlogPresenter.renderBody(entry).querySelector('.pkc-textlog-importance-toggle');
    expect(btn?.getAttribute('data-pkc-lid')).toBe(entry.lid);
    expect(btn?.getAttribute('data-pkc-action')).toBe('toggle-textlog-importance-only');
  });

  it('case 11: 全 entry important + importance ON → 全件表示', () => {
    setFlags(true);
    const entry = makeTextlog([
      { id: '1', text: 'a', flags: ['important'] },
      { id: '2', text: 'b', flags: ['important'] },
    ]);
    setTextlogImportanceOnly(entry.lid, true);
    const el = textlogPresenter.renderBody(entry);
    expect(el.querySelector('.pkc-textlog-search-count')?.textContent).toBe('2 / 2');
  });
});
