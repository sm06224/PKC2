/**
 * @vitest-environment happy-dom
 *
 * 領域 10-4 spreadsheet Phase 4(user direction 2026-06-03):
 * 「i18n で対応した?日本語勝手 hardcode は違反」 + 「あたまに yy/MM/dd ddd
 *  (ロケール曜日)、つけた名前にしてよ」 を gate。
 *
 * default title format = `{yy/MM/dd ddd} {English neutral archetype label} N`
 * user 指定 title = `{yy/MM/dd ddd} {userTitle}`(date prefix 自動付与)。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

const TS = '2026-06-03T00:00:00Z';

function emptyContainer(): Container {
  return {
    meta: {
      container_id: 'c1', title: 'C', created_at: TS, updated_at: TS,
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function emptyState(): AppState {
  return {
    container: emptyContainer(),
    phase: 'ready',
    settings: null,
  } as unknown as AppState;
}

describe('CREATE_ENTRY default title(reform 2026-06-03 i18n + date prefix)', () => {
  beforeEach(() => {
    // 固定日付 2026-06-03(水曜)で deterministic に gate。
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T12:00:00Z'));
  });

  it('case 1: spreadsheet で title="" → "26/06/03 {locale 曜日} Sheet 1"(English neutral label)', () => {
    const s = emptyState();
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '' });
    const title = r.state.container?.entries[0]?.title ?? '';
    // 形式:`yy/MM/dd {weekday short} Sheet 1`
    expect(title).toMatch(/^26\/06\/03\s+\S+\s+Sheet 1$/);
  });

  it('case 2: text → "Note"、textlog → "Log"、todo → "Todo"、folder → "Folder"、attachment → "File"', () => {
    const cases: [string, string][] = [
      ['text', 'Note'],
      ['textlog', 'Log'],
      ['todo', 'Todo'],
      ['folder', 'Folder'],
      ['attachment', 'File'],
      ['form', 'Form'],
    ];
    for (const [arch, label] of cases) {
      const s = emptyState();
      const r = reduce(s, { type: 'CREATE_ENTRY', archetype: arch as 'text', title: '' });
      const title = r.state.container?.entries[0]?.title ?? '';
      expect(title).toMatch(new RegExp(`^26\\/06\\/03\\s+\\S+\\s+${label} 1$`));
    }
  });

  it('case 3: 既存 "{anyDate} Sheet 1" があると 2 個目は "Sheet 2" 採番', () => {
    const s = emptyState();
    s.container = {
      ...s.container!,
      entries: [{
        lid: 'pre1', title: '24/12/31 Tue Sheet 1', body: '{}', archetype: 'spreadsheet',
        created_at: TS, updated_at: TS,
      }],
    };
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '' });
    const titles = r.state.container?.entries.map((e) => e.title) ?? [];
    expect(titles.some((t) => /Sheet 2$/.test(t))).toBe(true);
  });

  it('case 4: title 指定あり(非 empty)は呼出側 title をそのまま保持(programmatic 経路 = duplicate / 変換 等を破壊しない)', () => {
    const s = emptyState();
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '売上集計' });
    expect(r.state.container?.entries[0]?.title).toBe('売上集計');
  });

  it('case 5: title 指定 = "Copy of …" 等の構造化 title をそのまま保持(duplicate / attachment 変換等の動作確保)', () => {
    const s = emptyState();
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'text', title: 'Copy of foo' });
    expect(r.state.container?.entries[0]?.title).toBe('Copy of foo');
  });

  it('case 6: spreadsheet 新規 → 20 行 × 12 列 default grid を seed(変動なし)', () => {
    const s = emptyState();
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '' });
    const parsed = JSON.parse(r.state.container!.entries[0]!.body);
    expect(parsed.rows.length).toBe(20);
    expect(parsed.rows[0].length).toBe(12);
    expect(parsed.noHeader).toBe(true);
  });

  it('case 7: action.body 明示指定で spreadsheet default seed を上書きしない(変動なし)', () => {
    const s = emptyState();
    const r = reduce(s, {
      type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '',
      body: '{"rows":[["x"]]}',
    });
    const parsed = JSON.parse(r.state.container!.entries[0]!.body);
    expect(parsed.rows).toEqual([['x']]);
  });

  it('case 8: 異 archetype 同時で suffix は独立、label は English neutral', () => {
    const s = emptyState();
    s.container = {
      ...s.container!,
      entries: [
        { lid: 'p1', title: '24/01/01 Mon Sheet 1', body: '{}', archetype: 'spreadsheet', created_at: TS, updated_at: TS },
        { lid: 'p2', title: '24/01/02 Tue Note 1', body: '', archetype: 'text', created_at: TS, updated_at: TS },
      ],
    };
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '' });
    const titles = r.state.container?.entries.map((e) => e.title) ?? [];
    expect(titles.some((t) => /Sheet 2$/.test(t))).toBe(true);
  });

  it('case 9: i18n 違反 check ── 日本語 hardcode が default 経路に残っていない', () => {
    const titles: string[] = [];
    for (const arch of ['text', 'textlog', 'todo', 'spreadsheet', 'attachment', 'folder', 'form'] as const) {
      const r = reduce(emptyState(), { type: 'CREATE_ENTRY', archetype: arch, title: '' });
      titles.push(r.state.container?.entries[0]?.title ?? '');
    }
    // 日本語 archetype label(新規シート / 新規メモ 等)が含まれていてはならない
    for (const t of titles) {
      expect(t).not.toMatch(/新規/);
    }
  });
});
