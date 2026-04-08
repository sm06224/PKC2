import { describe, it, expect } from 'vitest';
import {
  groupTodosByDate,
  getMonthGrid,
  dateKey,
  monthName,
} from '@features/calendar/calendar-data';
import type { Entry } from '@core/model/record';

function makeEntry(lid: string, body: string): Entry {
  return {
    lid, title: `Todo ${lid}`, body,
    archetype: 'todo',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function makeText(lid: string): Entry {
  return {
    lid, title: `Note ${lid}`, body: 'text content',
    archetype: 'text',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('groupTodosByDate', () => {
  it('groups todos by date', () => {
    const entries = [
      makeEntry('t1', '{"status":"open","description":"A","date":"2026-04-10"}'),
      makeEntry('t2', '{"status":"open","description":"B","date":"2026-04-10"}'),
      makeEntry('t3', '{"status":"done","description":"C","date":"2026-04-11"}'),
    ];
    const result = groupTodosByDate(entries, false);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['2026-04-10']).toHaveLength(2);
    expect(result['2026-04-11']).toHaveLength(1);
  });

  it('excludes todos without date', () => {
    const entries = [
      makeEntry('t1', '{"status":"open","description":"no date"}'),
      makeEntry('t2', '{"status":"open","description":"has date","date":"2026-05-01"}'),
    ];
    const result = groupTodosByDate(entries, false);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['2026-05-01']).toHaveLength(1);
  });

  it('excludes non-todo entries', () => {
    const entries = [
      makeText('n1'),
      makeEntry('t1', '{"status":"open","description":"A","date":"2026-04-10"}'),
    ];
    const result = groupTodosByDate(entries, false);
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('excludes archived todos when showArchived is false', () => {
    const entries = [
      makeEntry('t1', '{"status":"done","description":"archived","date":"2026-04-10","archived":true}'),
      makeEntry('t2', '{"status":"open","description":"active","date":"2026-04-10"}'),
    ];
    const result = groupTodosByDate(entries, false);
    expect(result['2026-04-10']).toHaveLength(1);
    expect(result['2026-04-10']![0]!.entry.lid).toBe('t2');
  });

  it('includes archived todos when showArchived is true', () => {
    const entries = [
      makeEntry('t1', '{"status":"done","description":"archived","date":"2026-04-10","archived":true}'),
      makeEntry('t2', '{"status":"open","description":"active","date":"2026-04-10"}'),
    ];
    const result = groupTodosByDate(entries, true);
    expect(result['2026-04-10']).toHaveLength(2);
  });

  it('returns empty object for no matching entries', () => {
    const result = groupTodosByDate([], false);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('getMonthGrid', () => {
  it('generates correct grid for April 2026 (starts on Wednesday)', () => {
    const grid = getMonthGrid(2026, 4);
    // April 2026: April 1 is Wed (day 3)
    expect(grid[0]![0]).toBeNull(); // Sun
    expect(grid[0]![1]).toBeNull(); // Mon
    expect(grid[0]![2]).toBeNull(); // Tue
    expect(grid[0]![3]).toBe(1);    // Wed = April 1
    expect(grid[0]![6]).toBe(4);    // Sat = April 4
  });

  it('has 30 days for April', () => {
    const grid = getMonthGrid(2026, 4);
    const allDays = grid.flat().filter((d) => d !== null);
    expect(allDays).toHaveLength(30);
    expect(allDays[allDays.length - 1]).toBe(30);
  });

  it('has 5 or 6 weeks', () => {
    const grid = getMonthGrid(2026, 4);
    expect(grid.length).toBeGreaterThanOrEqual(5);
    expect(grid.length).toBeLessThanOrEqual(6);
  });

  it('generates correct grid for February non-leap year', () => {
    const grid = getMonthGrid(2026, 2);
    const allDays = grid.flat().filter((d) => d !== null);
    expect(allDays).toHaveLength(28);
  });
});

describe('dateKey', () => {
  it('formats date as YYYY-MM-DD with zero-padding', () => {
    expect(dateKey(2026, 4, 8)).toBe('2026-04-08');
    expect(dateKey(2026, 12, 25)).toBe('2026-12-25');
    expect(dateKey(2026, 1, 1)).toBe('2026-01-01');
  });
});

describe('monthName', () => {
  it('returns correct month names', () => {
    expect(monthName(1)).toBe('January');
    expect(monthName(4)).toBe('April');
    expect(monthName(12)).toBe('December');
  });

  it('returns empty for out-of-range', () => {
    expect(monthName(0)).toBe('');
    expect(monthName(13)).toBe('');
  });
});
