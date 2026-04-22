import type { Entry } from '../../core/model/record';
import { parseTodoBody } from '../todo/todo-body';
import type { TodoBody } from '../todo/todo-body';
import { pad2 } from '../datetime/datetime-format';

export interface CalendarTodo {
  entry: Entry;
  todo: TodoBody;
}

/**
 * Group todo entries by their date (YYYY-MM-DD).
 * Only includes todos with a date field set.
 * Optionally filters out archived todos.
 */
export function groupTodosByDate(
  entries: readonly Entry[],
  showArchived: boolean,
): Record<string, CalendarTodo[]> {
  const result: Record<string, CalendarTodo[]> = {};

  for (const entry of entries) {
    if (entry.archetype !== 'todo') continue;
    const todo = parseTodoBody(entry.body);
    if (!todo.date) continue;
    if (!showArchived && todo.archived) continue;

    if (!result[todo.date]) {
      result[todo.date] = [];
    }
    result[todo.date]!.push({ entry, todo });
  }

  return result;
}

/**
 * Get the days-of-month grid for a given year/month.
 * Returns 5-6 weeks of date cells, where null = outside the month.
 * month is 1-based (1 = January).
 */
export function getMonthGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();

  const weeks: (number | null)[][] = [];
  let day = 1;

  for (let w = 0; w < 6; w++) {
    const week: (number | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if (w === 0 && d < firstDay) {
        week.push(null);
      } else if (day > daysInMonth) {
        week.push(null);
      } else {
        week.push(day);
        day++;
      }
    }
    weeks.push(week);
    if (day > daysInMonth) break;
  }

  return weeks;
}

/**
 * Format a date key string (YYYY-MM-DD) from year, month, day.
 */
export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Month names for display.
 */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}
