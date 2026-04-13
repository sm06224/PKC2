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

  it('round-trips with archived', () => {
    const original = { status: 'done' as const, description: 'Archived task', date: '2026-01-01', archived: true as const };
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

  it('renderBody shows archived badge when archived', () => {
    const el = todoPresenter.renderBody(makeTodoEntry('{"status":"done","description":"old","archived":true}'));
    const badge = el.querySelector('.pkc-todo-archived-badge');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('Archived');
    expect(el.getAttribute('data-pkc-todo-archived')).toBe('true');
  });

  it('renderBody omits archived badge when not archived', () => {
    const el = todoPresenter.renderBody(makeTodoEntry('{"status":"open","description":"active"}'));
    const badge = el.querySelector('.pkc-todo-archived-badge');
    expect(badge).toBeNull();
    expect(el.getAttribute('data-pkc-todo-archived')).toBeNull();
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

  it('renderEditorBody has archived checkbox', () => {
    const el = todoPresenter.renderEditorBody(makeTodoEntry('{"status":"done","description":"old","archived":true}'));
    const check = el.querySelector('[data-pkc-field="todo-archived"]') as HTMLInputElement;
    expect(check).not.toBeNull();
    expect(check.type).toBe('checkbox');
    expect(check.checked).toBe(true);
  });

  it('renderEditorBody archived checkbox unchecked when not archived', () => {
    const el = todoPresenter.renderEditorBody(makeTodoEntry('{"status":"open","description":"active"}'));
    const check = el.querySelector('[data-pkc-field="todo-archived"]') as HTMLInputElement;
    expect(check).not.toBeNull();
    expect(check.checked).toBe(false);
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

  it('collectBody includes archived when checked', () => {
    const container = document.createElement('div');
    const archivedCheck = document.createElement('input');
    archivedCheck.type = 'checkbox';
    archivedCheck.setAttribute('data-pkc-field', 'todo-archived');
    archivedCheck.checked = true;
    container.appendChild(archivedCheck);

    const body = todoPresenter.collectBody(container);
    const parsed = JSON.parse(body);
    expect(parsed.archived).toBe(true);
  });

  it('collectBody omits archived when unchecked', () => {
    const container = document.createElement('div');
    const archivedCheck = document.createElement('input');
    archivedCheck.type = 'checkbox';
    archivedCheck.setAttribute('data-pkc-field', 'todo-archived');
    archivedCheck.checked = false;
    container.appendChild(archivedCheck);

    const body = todoPresenter.collectBody(container);
    const parsed = JSON.parse(body);
    expect(parsed.archived).toBeUndefined();
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

// ─────────────────────────────────────────────────────
// Slice 3: description markdown rendering
// ─────────────────────────────────────────────────────

describe('todoPresenter — description markdown (Slice 3)', () => {
  function makeTodoWith(description: string, lid = 'todo1'): Entry {
    return {
      lid,
      title: 'T',
      body: JSON.stringify({ status: 'open', description }),
      archetype: 'todo',
      created_at: '',
      updated_at: '',
    };
  }

  it('plain-text description stays on the <span> path', () => {
    // Plain "Buy milk" has no markdown syntax → legacy span render.
    const el = todoPresenter.renderBody(makeTodoWith('Buy milk'));
    const desc = el.querySelector('.pkc-todo-description');
    expect(desc!.tagName).toBe('SPAN');
    expect(desc!.classList.contains('pkc-md-rendered')).toBe(false);
    expect(desc!.textContent).toBe('Buy milk');
  });

  it('markdown description renders on a <div> with pkc-md-rendered', () => {
    const el = todoPresenter.renderBody(
      makeTodoWith('# heading\n\n- item 1\n- item 2'),
      undefined,
      undefined,
      undefined,
      [],
    );
    const desc = el.querySelector('.pkc-todo-description');
    expect(desc!.tagName).toBe('DIV');
    expect(desc!.classList.contains('pkc-md-rendered')).toBe(true);
    expect(desc!.querySelector('h1')).not.toBeNull();
    expect(desc!.querySelectorAll('li').length).toBe(2);
  });

  it('entry: link in description resolves via navigate-entry-ref', () => {
    const entries: Entry[] = [
      makeTodoWith('see [ref](entry:other)', 'todo1'),
      { lid: 'other', title: 'Other', body: '', archetype: 'text', created_at: '', updated_at: '' },
    ];
    const el = todoPresenter.renderBody(entries[0]!, {}, {}, {}, entries);
    const link = el.querySelector('a[href="entry:other"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('data-pkc-action')).toBe('navigate-entry-ref');
  });

  it('entry: image in description expands to an embedded section', () => {
    const entries: Entry[] = [
      makeTodoWith('# todo\n\n![x](entry:target)', 'todo1'),
      {
        lid: 'target',
        title: 'Target',
        body: '# T\n\nbody',
        archetype: 'text',
        created_at: '',
        updated_at: '',
      },
    ];
    const el = todoPresenter.renderBody(entries[0]!, {}, {}, {}, entries);
    const section = el.querySelector('section.pkc-transclusion');
    expect(section).not.toBeNull();
    expect(section!.getAttribute('data-pkc-embed-source')).toBe('entry:target');
  });

  it('asset: image in description resolves to a data URL', () => {
    // asset-resolver rewrites `asset:k` to `data:<mime>;base64,<body>`.
    const assets = { 'ast-1': 'AAAA' };
    const mimeByKey = { 'ast-1': 'image/png' };
    const el = todoPresenter.renderBody(
      makeTodoWith('see ![pic](asset:ast-1)'),
      assets,
      mimeByKey,
      {},
      [],
    );
    const img = el.querySelector('.pkc-todo-description img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
  });

  it('self-embed inside the description renders a blocked placeholder', () => {
    // Same cycle guard as Slice 2 — self-ref must block, not loop.
    const entries: Entry[] = [
      makeTodoWith('# me\n\n![x](entry:todo1)', 'todo1'),
    ];
    const el = todoPresenter.renderBody(entries[0]!, {}, {}, {}, entries);
    const blocked = el.querySelector('.pkc-embed-blocked');
    expect(blocked).not.toBeNull();
    expect(blocked!.getAttribute('data-pkc-embed-blocked-reason')).toBe('self');
  });

  it('task checkbox inside description is NOT disabled on the live view path', () => {
    // The disable-when-embedded rule only applies inside a transclusion.
    // The live TODO view keeps task lists interactive (though PKC2
    // currently doesn't wire a handler for description-level task
    // lists — the checkbox remains a regular input).
    const el = todoPresenter.renderBody(
      makeTodoWith('- [ ] subtask\n- [x] done subtask'),
      undefined,
      undefined,
      undefined,
      [],
    );
    const inputs = el.querySelectorAll<HTMLInputElement>('.pkc-todo-description input');
    expect(inputs.length).toBe(2);
    for (const cb of Array.from(inputs)) {
      expect(cb.hasAttribute('disabled')).toBe(false);
    }
  });
});
