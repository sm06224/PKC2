/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseTodoBody,
  serializeTodoBody,
  formatTodoDate,
  isTodoPastDue,
  todoPresenter,
} from '@adapter/ui/todo-presenter';
import type { Entry } from '@core/model/record';
import { registerPresenter, getPresenter } from '@adapter/ui/detail-presenter';

function makeTodoEntry(body: string = '{"status":"open","description":"Buy milk"}'): Entry {
  return {
    lid: 'todo1', title: 'Shopping', body,
    archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
}

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
});

describe('serializeTodoBody', () => {
  it('serializes to JSON', () => {
    const json = serializeTodoBody({ status: 'done', description: 'Task' });
    const parsed = JSON.parse(json);
    expect(parsed.status).toBe('done');
    expect(parsed.description).toBe('Task');
  });

  it('round-trips through parse', () => {
    const original = { status: 'open' as const, description: 'Test' };
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
    const original = { status: 'done' as const, description: 'Done task', date: '2026-12-25' };
    const result = parseTodoBody(serializeTodoBody(original));
    expect(result).toEqual(original);
  });
});

describe('formatTodoDate', () => {
  it('formats a valid YYYY-MM-DD date', () => {
    const formatted = formatTodoDate('2026-04-08');
    // Should contain year, month, day in some locale format
    expect(formatted).toContain('2026');
    expect(formatted).toMatch(/4|04/);
    expect(formatted).toMatch(/8|08/);
  });

  it('returns raw string for invalid date', () => {
    expect(formatTodoDate('not-a-date')).toBe('not-a-date');
  });
});

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

describe('todoPresenter', () => {
  it('renderBody shows open status', () => {
    const el = todoPresenter.renderBody(makeTodoEntry());
    const status = el.querySelector('.pkc-todo-status');
    expect(status).not.toBeNull();
    expect(status!.getAttribute('data-pkc-todo-status')).toBe('open');
    expect(status!.textContent).toBe('[ ]');
    expect(status!.tagName).toBe('BUTTON');
  });

  it('renderBody shows done status', () => {
    const el = todoPresenter.renderBody(makeTodoEntry('{"status":"done","description":""}'));
    const status = el.querySelector('.pkc-todo-status');
    expect(status!.getAttribute('data-pkc-todo-status')).toBe('done');
    expect(status!.textContent).toBe('[x]');
  });

  it('renderBody toggle button has data-pkc-action', () => {
    const el = todoPresenter.renderBody(makeTodoEntry());
    const status = el.querySelector('.pkc-todo-status');
    expect(status!.getAttribute('data-pkc-action')).toBe('toggle-todo-status');
    expect(status!.getAttribute('data-pkc-lid')).toBe('todo1');
  });

  it('renderBody shows description', () => {
    const el = todoPresenter.renderBody(makeTodoEntry());
    const desc = el.querySelector('.pkc-todo-description');
    expect(desc).not.toBeNull();
    expect(desc!.textContent).toBe('Buy milk');
  });

  it('renderBody shows date when present', () => {
    const el = todoPresenter.renderBody(makeTodoEntry('{"status":"open","description":"task","date":"2099-12-31"}'));
    const dateEl = el.querySelector('.pkc-todo-date');
    expect(dateEl).not.toBeNull();
    expect(dateEl!.textContent).toContain('2099');
  });

  it('renderBody omits date element when no date', () => {
    const el = todoPresenter.renderBody(makeTodoEntry('{"status":"open","description":"task"}'));
    const dateEl = el.querySelector('.pkc-todo-date');
    expect(dateEl).toBeNull();
  });

  it('renderBody adds overdue class for past-due open todo', () => {
    const el = todoPresenter.renderBody(makeTodoEntry('{"status":"open","description":"late","date":"2020-01-01"}'));
    const dateEl = el.querySelector('.pkc-todo-date');
    expect(dateEl).not.toBeNull();
    expect(dateEl!.classList.contains('pkc-todo-date-overdue')).toBe(true);
  });

  it('renderBody does not add overdue class for done todo with past date', () => {
    const el = todoPresenter.renderBody(makeTodoEntry('{"status":"done","description":"done","date":"2020-01-01"}'));
    const dateEl = el.querySelector('.pkc-todo-date');
    expect(dateEl).not.toBeNull();
    expect(dateEl!.classList.contains('pkc-todo-date-overdue')).toBe(false);
  });

  it('renderEditorBody has status select', () => {
    const el = todoPresenter.renderEditorBody(makeTodoEntry());
    const select = el.querySelector('[data-pkc-field="todo-status"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options).toHaveLength(2);
  });

  it('renderEditorBody has description textarea', () => {
    const el = todoPresenter.renderEditorBody(makeTodoEntry());
    const area = el.querySelector('[data-pkc-field="todo-description"]') as HTMLTextAreaElement;
    expect(area).not.toBeNull();
    expect(area.value).toBe('Buy milk');
  });

  it('renderEditorBody has date input', () => {
    const el = todoPresenter.renderEditorBody(makeTodoEntry('{"status":"open","description":"","date":"2026-05-01"}'));
    const dateInput = el.querySelector('[data-pkc-field="todo-date"]') as HTMLInputElement;
    expect(dateInput).not.toBeNull();
    expect(dateInput.type).toBe('date');
    expect(dateInput.value).toBe('2026-05-01');
  });

  it('renderEditorBody date input is empty when no date', () => {
    const el = todoPresenter.renderEditorBody(makeTodoEntry('{"status":"open","description":""}'));
    const dateInput = el.querySelector('[data-pkc-field="todo-date"]') as HTMLInputElement;
    expect(dateInput).not.toBeNull();
    expect(dateInput.value).toBe('');
  });

  it('renderEditorBody has hidden body field', () => {
    const el = todoPresenter.renderEditorBody(makeTodoEntry());
    const hidden = el.querySelector('[data-pkc-field="body"]') as HTMLInputElement;
    expect(hidden).not.toBeNull();
    expect(hidden.type).toBe('hidden');
  });

  // ── collectBody ──

  it('collectBody serializes status and description from DOM', () => {
    const container = document.createElement('div');
    const statusSelect = document.createElement('select');
    statusSelect.setAttribute('data-pkc-field', 'todo-status');
    const openOpt = document.createElement('option');
    openOpt.value = 'open';
    const doneOpt = document.createElement('option');
    doneOpt.value = 'done';
    doneOpt.selected = true;
    statusSelect.appendChild(openOpt);
    statusSelect.appendChild(doneOpt);
    container.appendChild(statusSelect);

    const descArea = document.createElement('textarea');
    descArea.setAttribute('data-pkc-field', 'todo-description');
    descArea.value = 'Completed task';
    container.appendChild(descArea);

    const body = todoPresenter.collectBody(container);
    const parsed = JSON.parse(body);
    expect(parsed.status).toBe('done');
    expect(parsed.description).toBe('Completed task');
  });

  it('collectBody includes date when set', () => {
    const container = document.createElement('div');
    const statusSelect = document.createElement('select');
    statusSelect.setAttribute('data-pkc-field', 'todo-status');
    const openOpt = document.createElement('option');
    openOpt.value = 'open';
    openOpt.selected = true;
    statusSelect.appendChild(openOpt);
    container.appendChild(statusSelect);

    const descArea = document.createElement('textarea');
    descArea.setAttribute('data-pkc-field', 'todo-description');
    descArea.value = 'With date';
    container.appendChild(descArea);

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.setAttribute('data-pkc-field', 'todo-date');
    dateInput.value = '2026-06-15';
    container.appendChild(dateInput);

    const body = todoPresenter.collectBody(container);
    const parsed = JSON.parse(body);
    expect(parsed.date).toBe('2026-06-15');
    expect(parsed.description).toBe('With date');
  });

  it('collectBody omits date when empty', () => {
    const container = document.createElement('div');
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.setAttribute('data-pkc-field', 'todo-date');
    dateInput.value = '';
    container.appendChild(dateInput);

    const body = todoPresenter.collectBody(container);
    const parsed = JSON.parse(body);
    expect(parsed.date).toBeUndefined();
  });

  it('collectBody defaults to open when no status field', () => {
    const container = document.createElement('div');
    const body = todoPresenter.collectBody(container);
    const parsed = JSON.parse(body);
    expect(parsed.status).toBe('open');
    expect(parsed.description).toBe('');
  });
});

describe('presenter registry integration', () => {
  beforeEach(() => {
    registerPresenter('todo', todoPresenter);
  });

  it('getPresenter returns todoPresenter for todo archetype', () => {
    expect(getPresenter('todo')).toBe(todoPresenter);
  });

  it('getPresenter still returns default for text archetype', () => {
    const p = getPresenter('text');
    expect(p).not.toBe(todoPresenter);
  });
});
