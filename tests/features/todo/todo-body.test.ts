import { describe, it, expect } from 'vitest';
import {
  parseTodoBody,
  serializeTodoBody,
  formatTodoDate,
  isTodoPastDue,
} from '@features/todo/todo-body';
import type { TodoBody } from '@features/todo/todo-body';

// ── parseTodoBody ──

describe('parseTodoBody', () => {
  it('parses valid JSON body', () => {
    const todo = parseTodoBody('{"status":"done","description":"Completed task"}');
    expect(todo.status).toBe('done');
    expect(todo.description).toBe('Completed task');
  });

  it('defaults to open for invalid status', () => {
    const todo = parseTodoBody('{"status":"invalid"}');
    expect(todo.status).toBe('open');
  });

  it('handles non-JSON body as description', () => {
    const todo = parseTodoBody('plain text note');
    expect(todo.status).toBe('open');
    expect(todo.description).toBe('plain text note');
  });

  it('handles empty body', () => {
    const todo = parseTodoBody('');
    expect(todo.status).toBe('open');
    expect(todo.description).toBe('');
  });

  it('defaults missing description to empty string', () => {
    const todo = parseTodoBody('{"status":"open"}');
    expect(todo.description).toBe('');
  });

  it('parses date field when present', () => {
    const todo = parseTodoBody('{"status":"open","description":"task","date":"2026-04-10"}');
    expect(todo.date).toBe('2026-04-10');
  });

  it('returns undefined date for legacy body without date', () => {
    const todo = parseTodoBody('{"status":"open","description":"old task"}');
    expect(todo.date).toBeUndefined();
  });

  it('returns undefined date for empty string date', () => {
    const todo = parseTodoBody('{"status":"open","description":"","date":""}');
    expect(todo.date).toBeUndefined();
  });

  it('parses archived field when true', () => {
    const todo = parseTodoBody('{"status":"done","description":"old","archived":true}');
    expect(todo.archived).toBe(true);
  });

  it('returns undefined archived for legacy body', () => {
    const todo = parseTodoBody('{"status":"open","description":"task"}');
    expect(todo.archived).toBeUndefined();
  });

  it('returns undefined archived when false', () => {
    const todo = parseTodoBody('{"status":"open","description":"task","archived":false}');
    expect(todo.archived).toBeUndefined();
  });
});

// ── serializeTodoBody ──

describe('serializeTodoBody', () => {
  it('serializes to JSON', () => {
    const json = serializeTodoBody({ status: 'done', description: 'Task' });
    const parsed = JSON.parse(json);
    expect(parsed.status).toBe('done');
    expect(parsed.description).toBe('Task');
  });

  it('round-trips through parse', () => {
    const original: TodoBody = { status: 'open', description: 'Test' };
    const result = parseTodoBody(serializeTodoBody(original));
    expect(result).toEqual(original);
  });

  it('includes date when present', () => {
    const json = serializeTodoBody({ status: 'open', description: 'Task', date: '2026-05-01' });
    const parsed = JSON.parse(json);
    expect(parsed.date).toBe('2026-05-01');
  });

  it('omits date when undefined', () => {
    const json = serializeTodoBody({ status: 'open', description: 'Task' });
    const parsed = JSON.parse(json);
    expect(parsed.date).toBeUndefined();
  });

  it('round-trips with date', () => {
    const original: TodoBody = { status: 'done', description: 'Done task', date: '2026-12-25' };
    const result = parseTodoBody(serializeTodoBody(original));
    expect(result).toEqual(original);
  });

  it('includes archived when true', () => {
    const json = serializeTodoBody({ status: 'done', description: 'Old', archived: true });
    const parsed = JSON.parse(json);
    expect(parsed.archived).toBe(true);
  });

  it('omits archived when undefined', () => {
    const json = serializeTodoBody({ status: 'open', description: 'Active' });
    const parsed = JSON.parse(json);
    expect(parsed.archived).toBeUndefined();
  });

  it('round-trips with all fields', () => {
    const original: TodoBody = { status: 'done', description: 'Archived task', date: '2026-01-01', archived: true };
    const result = parseTodoBody(serializeTodoBody(original));
    expect(result).toEqual(original);
  });
});

// ── formatTodoDate ──

describe('formatTodoDate', () => {
  it('formats a valid YYYY-MM-DD date', () => {
    const formatted = formatTodoDate('2026-04-08');
    expect(formatted).toContain('2026');
    expect(formatted).toMatch(/4|04/);
    expect(formatted).toMatch(/8|08/);
  });

  it('returns raw string for invalid date', () => {
    expect(formatTodoDate('not-a-date')).toBe('not-a-date');
  });
});

// ── isTodoPastDue ──

describe('isTodoPastDue', () => {
  it('returns false for done todos', () => {
    expect(isTodoPastDue({ status: 'done', description: '', date: '2020-01-01' })).toBe(false);
  });

  it('returns false for todos without date', () => {
    expect(isTodoPastDue({ status: 'open', description: '' })).toBe(false);
  });

  it('returns true for open todos with past date', () => {
    expect(isTodoPastDue({ status: 'open', description: '', date: '2020-01-01' })).toBe(true);
  });

  it('returns false for open todos with future date', () => {
    expect(isTodoPastDue({ status: 'open', description: '', date: '2099-12-31' })).toBe(false);
  });
});

// ── No browser API dependency ──

describe('purity guarantee', () => {
  it('module exports are plain functions (no DOM dependency)', () => {
    expect(typeof parseTodoBody).toBe('function');
    expect(typeof serializeTodoBody).toBe('function');
    expect(typeof formatTodoDate).toBe('function');
    expect(typeof isTodoPastDue).toBe('function');
  });
});
