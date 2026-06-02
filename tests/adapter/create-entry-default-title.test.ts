/**
 * @vitest-environment happy-dom
 *
 * 領域 10-4 spreadsheet Phase 4(user direction 2026-06-02、9 項目一括 #4):
 * 「新規作成したエントリ名おかしくない?」を受けて、CREATE_ENTRY で title='' の場合
 * archetype 別の default title("新規シート N" 等)を自動採番する確認。
 */

import { describe, it, expect } from 'vitest';
import { reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

const TS = '2026-06-02T00:00:00Z';

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

describe('CREATE_ENTRY default title assignment(Phase 4)', () => {
  it('case 1: spreadsheet で title="" → "新規シート 1"', () => {
    const s = emptyState();
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '' });
    expect(r.state.container?.entries[0]?.title).toBe('新規シート 1');
  });

  it('case 2: 既存 "新規シート 1" がある container で create → "新規シート 2"', () => {
    const s = emptyState();
    s.container = {
      ...s.container!,
      entries: [{
        lid: 'pre1', title: '新規シート 1', body: '{}', archetype: 'spreadsheet',
        created_at: TS, updated_at: TS,
      }],
    };
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '' });
    const titles = r.state.container?.entries.map((e) => e.title);
    expect(titles).toContain('新規シート 2');
  });

  it('case 3: text で title="" → "Untitled 1"', () => {
    const s = emptyState();
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'text', title: '' });
    expect(r.state.container?.entries[0]?.title).toBe('新規メモ 1');
  });

  it('case 4: todo で title="" → "新規TODO 1"', () => {
    const s = emptyState();
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'todo', title: '' });
    expect(r.state.container?.entries[0]?.title).toBe('新規TODO 1');
  });

  it('case 5: folder で title="" → "新規フォルダ 1"', () => {
    const s = emptyState();
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'folder', title: '' });
    expect(r.state.container?.entries[0]?.title).toBe('新規フォルダ 1');
  });

  it('case 6: title 指定あり(非 empty)は上書きしない', () => {
    const s = emptyState();
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '売上集計' });
    expect(r.state.container?.entries[0]?.title).toBe('売上集計');
  });

  it('case 7: spreadsheet 新規 → 空 body ではなく 20 行 × 12 列 default grid を seed(noHeader=true)', () => {
    const s = emptyState();
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '' });
    const entry = r.state.container?.entries[0];
    expect(entry?.body).toBeTruthy();
    const parsed = JSON.parse(entry!.body);
    expect(parsed.rows.length).toBe(20);
    expect(parsed.rows[0].length).toBe(12);
    expect(parsed.noHeader).toBe(true);
  });

  it('case 8: action.body 明示指定があれば spreadsheet default seed を上書きしない', () => {
    const s = emptyState();
    const r = reduce(s, {
      type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '',
      body: '{"rows":[["x"]]}',
    });
    const entry = r.state.container?.entries[0];
    const parsed = JSON.parse(entry!.body);
    expect(parsed.rows).toEqual([['x']]);
  });

  it('case 9: 異 archetype 同時存在で suffix が独立にカウントされる(pre-seeded)', () => {
    const s = emptyState();
    s.container = {
      ...s.container!,
      entries: [
        { lid: 'p1', title: '新規シート 1', body: '{}', archetype: 'spreadsheet', created_at: TS, updated_at: TS },
        { lid: 'p2', title: '新規メモ 1', body: '', archetype: 'text', created_at: TS, updated_at: TS },
      ],
    };
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'spreadsheet', title: '' });
    const titles = r.state.container?.entries.map((e) => e.title) ?? [];
    expect(titles).toContain('新規シート 1');
    expect(titles).toContain('新規シート 2');
    expect(titles).toContain('新規メモ 1');
  });

  it('case 10: attachment で title="" → "新規添付 1"', () => {
    const s = emptyState();
    const r = reduce(s, { type: 'CREATE_ENTRY', archetype: 'attachment', title: '' });
    expect(r.state.container?.entries[0]?.title).toBe('新規添付 1');
  });
});
