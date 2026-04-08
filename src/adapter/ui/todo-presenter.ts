import type { Entry } from '../../core/model/record';
import type { DetailPresenter } from './detail-presenter';
import {
  parseTodoBody,
  serializeTodoBody,
  formatTodoDate,
  isTodoPastDue,
} from '../../features/todo/todo-body';
import type { TodoBody } from '../../features/todo/todo-body';

// Re-export from features layer so existing adapter-internal consumers keep working.
export { parseTodoBody, serializeTodoBody, formatTodoDate, isTodoPastDue };
export type { TodoBody };

export const todoPresenter: DetailPresenter = {
  renderBody(entry: Entry): HTMLElement {
    const todo = parseTodoBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-todo-view';
    if (todo.archived) {
      container.setAttribute('data-pkc-todo-archived', 'true');
    }

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

    if (todo.archived) {
      const archivedEl = document.createElement('span');
      archivedEl.className = 'pkc-todo-archived-badge';
      archivedEl.setAttribute('data-pkc-field', 'todo-archived-display');
      archivedEl.textContent = 'Archived';
      right.appendChild(archivedEl);
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

    // Archived checkbox
    const archivedRow = document.createElement('label');
    archivedRow.className = 'pkc-todo-archived-label';
    const archivedCheck = document.createElement('input');
    archivedCheck.type = 'checkbox';
    archivedCheck.setAttribute('data-pkc-field', 'todo-archived');
    archivedCheck.className = 'pkc-todo-archived-check';
    if (todo.archived) archivedCheck.checked = true;
    archivedRow.appendChild(archivedCheck);
    const archivedText = document.createElement('span');
    archivedText.textContent = 'Archived';
    archivedRow.appendChild(archivedText);
    container.appendChild(archivedRow);

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
    const archivedEl = root.querySelector<HTMLInputElement>('[data-pkc-field="todo-archived"]');
    const status = statusEl?.value === 'done' ? 'done' : 'open';
    const description = descEl?.value ?? '';
    const date = dateEl?.value || undefined;
    const archived = archivedEl?.checked ? true : undefined;
    return serializeTodoBody({ status, description, date, archived });
  },
};
