/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  textlogPresenter,
  setTextlogSearchQuery,
  getTextlogSearchQuery,
  resetTextlogSearchState,
} from '../../src/adapter/ui/textlog-presenter';
import { __resetRegistry, __resetUrlCache } from '../../src/adapter/flags';
import type { Entry } from '../../src/core/model/record';
import type { TextlogBody } from '../../src/features/textlog/textlog-body';

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  url.searchParams.append('pkc-flag', `text.textlog_log_search_enabled=${value ? '1' : '0'}`);
  // 2026-05-28 importance_filter も always-on 化済 ── search bar region は
  // 両 flag の OR で出るので search 単独の OFF を見るには importance も OFF に。
  url.searchParams.append('pkc-flag', 'text.textlog_importance_filter_enabled=0');
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

function makeTextlog(entries: { id: string; text: string; createdAt: string }[]): Entry {
  const body: TextlogBody = {
    entries: entries.map((e) => ({ ...e, flags: [] })),
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

const FIXTURE_ENTRIES = [
  { id: '1', text: 'morning standup meeting', createdAt: '2026-05-24T09:00:00Z' },
  { id: '2', text: 'fix bug in renderer', createdAt: '2026-05-24T10:00:00Z' },
  { id: '3', text: 'review PR for AI tab', createdAt: '2026-05-24T11:00:00Z' },
];

describe('textlog search(pgc-155)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetTextlogSearchState();
  });

  it('case 1: flag OFF で search bar 出ない', () => {
    setFlag(false);
    const el = textlogPresenter.renderBody(makeTextlog(FIXTURE_ENTRIES));
    expect(el.querySelector('[data-pkc-region="textlog-search"]')).toBeNull();
  });

  it('case 2: flag ON で search bar 表示 + total entries count', () => {
    setFlag(true);
    const el = textlogPresenter.renderBody(makeTextlog(FIXTURE_ENTRIES));
    const bar = el.querySelector('[data-pkc-region="textlog-search"]');
    expect(bar).not.toBeNull();
    const count = bar?.querySelector('.pkc-textlog-search-count');
    expect(count?.textContent).toContain('3 entries');
  });

  it('case 3: query set → 該当 log のみ render + hit count', () => {
    setFlag(true);
    const entry = makeTextlog(FIXTURE_ENTRIES);
    setTextlogSearchQuery(entry.lid, 'bug');
    const el = textlogPresenter.renderBody(entry);
    // hit は id=2 のみ ── search count "1 / 3"
    const count = el.querySelector('.pkc-textlog-search-count');
    expect(count?.textContent).toBe('1 / 3');
  });

  it('case 4: query で全 hit なし → empty 表示 + "No matches"', () => {
    setFlag(true);
    const entry = makeTextlog(FIXTURE_ENTRIES);
    setTextlogSearchQuery(entry.lid, 'nonexistent');
    const el = textlogPresenter.renderBody(entry);
    expect(el.querySelector('[data-pkc-region="textlog-empty"]')).not.toBeNull();
    expect(el.querySelector('[data-pkc-region="textlog-empty"]')?.textContent).toContain('No matches for "nonexistent"');
  });

  it('case 5: 元 entries 0 件 → "No log entries yet"(search 関係なし)', () => {
    setFlag(true);
    const el = textlogPresenter.renderBody(makeTextlog([]));
    expect(el.querySelector('[data-pkc-region="textlog-empty"]')?.textContent).toContain('No log entries yet');
  });

  it('case 6: search input に input attr が揃う(action / lid / field / value)', () => {
    setFlag(true);
    const entry = makeTextlog(FIXTURE_ENTRIES);
    setTextlogSearchQuery(entry.lid, 'meeting');
    const el = textlogPresenter.renderBody(entry);
    const input = el.querySelector<HTMLInputElement>('.pkc-textlog-search-input');
    expect(input?.getAttribute('data-pkc-action')).toBe('set-textlog-search');
    expect(input?.getAttribute('data-pkc-lid')).toBe(entry.lid);
    expect(input?.getAttribute('data-pkc-field')).toBe('textlog-search-query');
    expect(input?.value).toBe('meeting');
  });

  it('case 7: getTextlogSearchQuery/setTextlogSearchQuery round-trip', () => {
    setTextlogSearchQuery('lid_a', 'foo');
    expect(getTextlogSearchQuery('lid_a')).toBe('foo');
    setTextlogSearchQuery('lid_a', '');
    expect(getTextlogSearchQuery('lid_a')).toBe('');
  });

  it('case 8: per-lid 分離(他 lid の query は混ざらない)', () => {
    setTextlogSearchQuery('lid_a', 'foo');
    setTextlogSearchQuery('lid_b', 'bar');
    expect(getTextlogSearchQuery('lid_a')).toBe('foo');
    expect(getTextlogSearchQuery('lid_b')).toBe('bar');
  });

  it('case 9: count の data-attr に hits / total', () => {
    setFlag(true);
    const entry = makeTextlog(FIXTURE_ENTRIES);
    setTextlogSearchQuery(entry.lid, 'review');
    const el = textlogPresenter.renderBody(entry);
    const count = el.querySelector('.pkc-textlog-search-count');
    expect(count?.getAttribute('data-pkc-hits')).toBe('1');
    expect(count?.getAttribute('data-pkc-total')).toBe('3');
  });

  it('case 10: 順序性(Phase 8)── query set→clear で render に反映', () => {
    setFlag(true);
    const entry = makeTextlog(FIXTURE_ENTRIES);
    // 1. query なし → 3 entries
    const el1 = textlogPresenter.renderBody(entry);
    expect(el1.querySelector('.pkc-textlog-search-count')?.textContent).toBe('3 entries');
    // 2. query set → 1 / 3
    setTextlogSearchQuery(entry.lid, 'bug');
    const el2 = textlogPresenter.renderBody(entry);
    expect(el2.querySelector('.pkc-textlog-search-count')?.textContent).toBe('1 / 3');
    // 3. clear → 3 entries に戻る
    setTextlogSearchQuery(entry.lid, '');
    const el3 = textlogPresenter.renderBody(entry);
    expect(el3.querySelector('.pkc-textlog-search-count')?.textContent).toBe('3 entries');
  });

  it('case 11: 多 token AND 条件', () => {
    setFlag(true);
    const entry = makeTextlog(FIXTURE_ENTRIES);
    setTextlogSearchQuery(entry.lid, 'review PR');
    const el = textlogPresenter.renderBody(entry);
    expect(el.querySelector('.pkc-textlog-search-count')?.textContent).toBe('1 / 3');
  });

  it('case 12: case-insensitive', () => {
    setFlag(true);
    const entry = makeTextlog(FIXTURE_ENTRIES);
    setTextlogSearchQuery(entry.lid, 'BUG');
    const el = textlogPresenter.renderBody(entry);
    expect(el.querySelector('.pkc-textlog-search-count')?.textContent).toBe('1 / 3');
  });
});
