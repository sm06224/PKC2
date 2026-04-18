/**
 * Todo body schema: pure data contract for Todo entries.
 *
 * This module owns the canonical type, parse/serialize, and pure helpers
 * for the Todo body format. It belongs in the features layer because:
 * - calendar-data and kanban-data (features) need TodoBody + parseTodoBody
 * - adapter/ui/todo-presenter (adapter) also needs them
 * - Placing them here respects the import rule: core <- features <- adapter
 *
 * NO browser APIs. NO DOM. NO presenter logic.
 */

/**
 * Todo body schema.
 * Stored as JSON string in entry.body.
 *
 * `date` is optional (YYYY-MM-DD). Absent for legacy todos or todos without a due date.
 * `archived` is optional (boolean). Absent or false = active. true = archived.
 */
export interface TodoBody {
  status: 'open' | 'done';
  description: string;
  date?: string;
  archived?: boolean;
}

export function parseTodoBody(body: string): TodoBody {
  try {
    const parsed = JSON.parse(body) as Partial<TodoBody>;
    return {
      status: parsed.status === 'done' ? 'done' : 'open',
      description: typeof parsed.description === 'string' ? parsed.description : '',
      date: typeof parsed.date === 'string' && parsed.date !== '' ? parsed.date : undefined,
      archived: parsed.archived === true ? true : undefined,
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
  if (todo.archived) {
    out.archived = true;
  }
  return JSON.stringify(out);
}

/**
 * Format a YYYY-MM-DD date string for display.
 * Returns localized short date (e.g. "2026/04/08" for ja, "4/8/2026" for en).
 */
export function formatTodoDate(date: string, locale?: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date; // fallback: show raw string
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return date;
  return dt.toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric' });
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
