import type { Entry } from '../../core/model/record';
import type { DetailPresenter } from './detail-presenter';

/**
 * Todo body schema.
 * Stored as JSON string in entry.body.
 *
 * `date` is optional (YYYY-MM-DD). Absent for legacy todos or todos without a due date.
 */
export interface TodoBody {
  status: 'open' | 'done';
  description: string;
  date?: string;
}

export function parseTodoBody(body: string): TodoBody {
  try {
    const parsed = JSON.parse(body) as Partial<TodoBody>;
    return {
      status: parsed.status === 'done' ? 'done' : 'open',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      date: typeof parsed.date === 'string' && parsed.date !== '' ? parsed.date : undefined,
    };
  } catch {
    // Non-JSON body: treat as description with open status
    return { status: 'open', description: body };
  }
}

export function serializeTodoBody(todo: TodoBody): string {
  const out: Record<string, unknown> = { status: todo.status, description: todo.description };
  if (todo.date) {
    out.date = todo.date;
  }
  return JSON.stringify(out);
}

/**
 * Format a YYYY-MM-DD date string for display.
 * Returns localized short date (e.g. "2026/04/08" for ja, "4/8/2026" for en).
 */
export function formatTodoDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date; // fallback: show raw string
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return date;
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' });
}

/**
 * Returns true if a todo is open and its date is before today.
 */
export function isTodoPastDue(todo: TodoBody): boolean {
  if (todo.status === 'done' || !todo.date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = todo.date.split('-').map(Number);
  if (!y || !m || !d) return false;
  const due = new Date(y, m - 1, d);
  return due.getTime() < today.getTime();
}

export const todoPresenter: DetailPresenter = {
  renderBody(entry: Entry): HTMLElement {
    const todo = parseTodoBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-todo-view';

    const statusEl = document.createElement('button');
    statusEl.className = 'pkc-todo-status';
    statusEl.setAttribute('data-pkc-todo-status', todo.status);
    statusEl.setAttribute('data-pkc-action', 'toggle-todo-status');
    statusEl.setAttribute('data-pkc-lid', entry.lid);
    statusEl.textContent = todo.status === 'done' ? '[x]' : '[ ]';
    container.appendChild(statusEl);

    const right = document.createElement('div');
    right.className = 'pkc-todo-right';

    if (todo.date) {
      const dateEl = document.createElement('span');
      dateEl.className = 'pkc-todo-date';
      dateEl.setAttribute('data-pkc-field', 'todo-date-display');
      dateEl.textContent = formatTodoDate(todo.date);
      if (isTodoPastDue(todo)) {
        dateEl.classList.add('pkc-todo-date-overdue');
      }
      right.appendChild(dateEl);
    }

    if (todo.description) {
      const desc = document.createElement('span');
      desc.className = 'pkc-todo-description';
      desc.textContent = todo.description;
      right.appendChild(desc);
    }

    container.appendChild(right);
    return container;
  },

  renderEditorBody(entry: Entry): HTMLElement {
    const todo = parseTodoBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-todo-editor';

    // Status select
    const statusSelect = document.createElement('select');
    statusSelect.setAttribute('data-pkc-field', 'todo-status');
    statusSelect.className = 'pkc-todo-status-select';
    for (const val of ['open', 'done'] as const) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val === 'open' ? 'Open' : 'Done';
      if (val === todo.status) opt.selected = true;
      statusSelect.appendChild(opt);
    }
    container.appendChild(statusSelect);

    // Date input
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.setAttribute('data-pkc-field', 'todo-date');
    dateInput.className = 'pkc-todo-date-input';
    if (todo.date) dateInput.value = todo.date;
    container.appendChild(dateInput);

    // Description textarea
    const descArea = document.createElement('textarea');
    descArea.setAttribute('data-pkc-field', 'todo-description');
    descArea.className = 'pkc-todo-description-input';
    descArea.value = todo.description;
    descArea.rows = 5;
    descArea.placeholder = 'Description (optional)';
    container.appendChild(descArea);

    // Hidden body field — serialized on commit by action-binder
    const bodyField = document.createElement('input');
    bodyField.type = 'hidden';
    bodyField.setAttribute('data-pkc-field', 'body');
    bodyField.value = entry.body;
    container.appendChild(bodyField);

    return container;
  },

  collectBody(root: HTMLElement): string {
    const statusEl = root.querySelector<HTMLSelectElement>('[data-pkc-field="todo-status"]');
    const descEl = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="todo-description"]');
    const dateEl = root.querySelector<HTMLInputElement>('[data-pkc-field="todo-date"]');
    const status = statusEl?.value === 'done' ? 'done' : 'open';
    const description = descEl?.value ?? '';
    const date = dateEl?.value || undefined;
    return serializeTodoBody({ status, description, date });
  },
};
