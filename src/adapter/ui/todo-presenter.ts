import type { Entry } from '../../core/model/record';
import type { DetailPresenter } from './detail-presenter';

/**
 * Todo body schema (minimal).
 * Stored as JSON string in entry.body.
 */
export interface TodoBody {
  status: 'open' | 'done';
  description: string;
}

export function parseTodoBody(body: string): TodoBody {
  try {
    const parsed = JSON.parse(body) as Partial<TodoBody>;
    return {
      status: parsed.status === 'done' ? 'done' : 'open',
      description: typeof parsed.description === 'string' ? parsed.description : '',
    };
  } catch {
    // Non-JSON body: treat as description with open status
    return { status: 'open', description: body };
  }
}

export function serializeTodoBody(todo: TodoBody): string {
  return JSON.stringify({ status: todo.status, description: todo.description });
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

    if (todo.description) {
      const desc = document.createElement('span');
      desc.className = 'pkc-todo-description';
      desc.textContent = todo.description;
      container.appendChild(desc);
    }

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
    const status = statusEl?.value === 'done' ? 'done' : 'open';
    const description = descEl?.value ?? '';
    return serializeTodoBody({ status, description });
  },
};
