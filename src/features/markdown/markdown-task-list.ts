/**
 * Pure helpers for interactive GFM task lists.
 *
 * Features layer — pure functions, no browser APIs.
 * Parses markdown body strings to find task list items and toggles
 * their checked state by rewriting the source line.
 */

// ── Types ────────────────────────────────────────────────

export interface TaskItem {
  /** 0-based line index in the body string */
  line: number;
  /** Whether the item is checked ([x]/[X]) */
  checked: boolean;
  /** The text content after the checkbox marker (trimmed) */
  text: string;
}

// ── Patterns ─────────────────────────────────────────────

/** Matches a GFM task list item: `- [ ] text` or `* [x] text` etc. */
const TASK_RE = /^(\s*(?:[-*+]|\d{1,9}[.)]) +)\[([ xX])\](?: (.*))?$/;

/** Matches a fenced code block opening/closing fence. */
const FENCE_OPEN_RE = /^(\s{0,3})(`{3,}|~{3,})/;

// ── Public API ───────────────────────────────────────────

/**
 * Find all task list items in a markdown body.
 *
 * Returns items in document order. Skips task-like patterns
 * inside fenced code blocks.
 */
export function findTaskItems(body: string): TaskItem[] {
  if (!body) return [];

  const lines = body.split('\n');
  const items: TaskItem[] = [];
  let fenceChar: string | null = null;
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // ── Fenced code block tracking ──
    const fenceMatch = FENCE_OPEN_RE.exec(line);
    if (fenceMatch) {
      const char = fenceMatch[2]![0]!;
      const len = fenceMatch[2]!.length;
      if (fenceChar === null) {
        // Opening fence
        fenceChar = char;
        fenceLen = len;
        continue;
      } else if (char === fenceChar && len >= fenceLen) {
        // Closing fence (same char, >= length)
        fenceChar = null;
        fenceLen = 0;
        continue;
      }
    }
    if (fenceChar !== null) continue;

    // ── Task item detection ──
    const match = TASK_RE.exec(line);
    if (match) {
      items.push({
        line: i,
        checked: match[2]!.toLowerCase() === 'x',
        text: match[3] ?? '',
      });
    }
  }

  return items;
}

/**
 * Toggle the Nth task item (0-based) in a markdown body.
 *
 * - `[ ]` → `[x]`
 * - `[x]` / `[X]` → `[ ]`
 *
 * Returns the updated body string, or `null` if taskIndex is
 * out of range or the body has no matching task item.
 */
export function toggleTaskItem(body: string, taskIndex: number): string | null {
  const items = findTaskItems(body);
  if (taskIndex < 0 || taskIndex >= items.length) return null;

  const item = items[taskIndex]!;
  const lines = body.split('\n');
  const line = lines[item.line]!;

  if (item.checked) {
    // [x] or [X] → [ ]
    lines[item.line] = line.replace(/\[([xX])\]/, '[ ]');
  } else {
    // [ ] → [x]
    lines[item.line] = line.replace(/\[ \]/, '[x]');
  }

  return lines.join('\n');
}
