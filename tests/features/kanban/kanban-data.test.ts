import { describe, it, expect } from 'vitest';
import {
  groupTodosByStatus,
  KANBAN_COLUMNS,
} from '@features/kanban/kanban-data';
import type { Entry } from '@core/model/record';

function makeTodo(lid: string, body: string): Entry {
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

describe('KANBAN_COLUMNS', () => {
  it('has open and done columns in order', () => {
    expect(KANBAN_COLUMNS).toHaveLength(2);
    expect(KANBAN_COLUMNS[0]!.status).toBe('open');
    expect(KANBAN_COLUMNS[1]!.status).toBe('done');
  });
});

describe('groupTodosByStatus', () => {
  it('groups open and done todos into separate columns', () => {
    const entries = [
      makeTodo('t1', '{"status":"open","description":"A"}'),
      makeTodo('t2', '{"status":"done","description":"B"}'),
      makeTodo('t3', '{"status":"open","description":"C"}'),
    ];
    const result = groupTodosByStatus(entries);
    expect(result.open).toHaveLength(2);
    expect(result.done).toHaveLength(1);
    expect(result.open[0]!.entry.lid).toBe('t1');
    expect(result.open[1]!.entry.lid).toBe('t3');
    expect(result.done[0]!.entry.lid).toBe('t2');
  });

  it('excludes non-todo entries', () => {
    const entries = [
      makeTodo('t1', '{"status":"open","description":"A"}'),
      makeText('n1'),
    ];
    const result = groupTodosByStatus(entries);
    expect(result.open).toHaveLength(1);
    expect(result.done).toHaveLength(0);
  });

  it('always excludes archived todos', () => {
    const entries = [
      makeTodo('t1', '{"status":"open","description":"A"}'),
      makeTodo('t2', '{"status":"open","description":"B","archived":true}'),
      makeTodo('t3', '{"status":"done","description":"C","archived":true}'),
      makeTodo('t4', '{"status":"done","description":"D"}'),
    ];
    const result = groupTodosByStatus(entries);
    expect(result.open).toHaveLength(1);
    expect(result.open[0]!.entry.lid).toBe('t1');
    expect(result.done).toHaveLength(1);
    expect(result.done[0]!.entry.lid).toBe('t4');
  });

  it('returns empty arrays when no todos exist', () => {
    const result = groupTodosByStatus([]);
    expect(result.open).toHaveLength(0);
    expect(result.done).toHaveLength(0);
  });

  it('returns empty arrays when all todos are archived', () => {
    const entries = [
      makeTodo('t1', '{"status":"open","description":"A","archived":true}'),
      makeTodo('t2', '{"status":"done","description":"B","archived":true}'),
    ];
    const result = groupTodosByStatus(entries);
    expect(result.open).toHaveLength(0);
    expect(result.done).toHaveLength(0);
  });

  it('parses todo body and exposes date field', () => {
    const entries = [
      makeTodo('t1', '{"status":"open","description":"A","date":"2026-04-10"}'),
    ];
    const result = groupTodosByStatus(entries);
    expect(result.open[0]!.todo.date).toBe('2026-04-10');
  });
});
