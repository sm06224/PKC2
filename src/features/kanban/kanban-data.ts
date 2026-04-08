import type { Entry } from '../../core/model/record';
import { parseTodoBody } from '../../adapter/ui/todo-presenter';
import type { TodoBody } from '../../adapter/ui/todo-presenter';

export type KanbanStatus = 'open' | 'done';

export interface KanbanItem {
  entry: Entry;
  todo: TodoBody;
}

/** Ordered columns for the kanban board. */
export const KANBAN_COLUMNS: readonly { status: KanbanStatus; label: string }[] = [
  { status: 'open', label: 'Todo' },
  { status: 'done', label: 'Done' },
] as const;

/**
 * Group todo entries by their status for kanban display.
 * Optionally filters out archived todos.
 */
export function groupTodosByStatus(
  entries: readonly Entry[],
  showArchived: boolean,
): Record<KanbanStatus, KanbanItem[]> {
  const result: Record<KanbanStatus, KanbanItem[]> = {
    open: [],
    done: [],
  };

  for (const entry of entries) {
    if (entry.archetype !== 'todo') continue;
    const todo = parseTodoBody(entry.body);
    if (!showArchived && todo.archived) continue;

    result[todo.status].push({ entry, todo });
  }

  return result;
}
