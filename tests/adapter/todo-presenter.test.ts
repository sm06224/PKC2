/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseTodoBody,
  serializeTodoBody,
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
