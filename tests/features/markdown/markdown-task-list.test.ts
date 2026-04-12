import { describe, it, expect } from 'vitest';
import { findTaskItems, toggleTaskItem, countTaskProgress } from '../../../src/features/markdown/markdown-task-list';

describe('findTaskItems', () => {
  it('returns empty array for empty body', () => {
    expect(findTaskItems('')).toEqual([]);
  });

  it('returns empty array for body with no tasks', () => {
    expect(findTaskItems('Hello world\n\nSome text')).toEqual([]);
  });

  it('finds a single unchecked task', () => {
    const items = findTaskItems('- [ ] Buy milk');
    expect(items).toEqual([
      { line: 0, checked: false, text: 'Buy milk' },
    ]);
  });

  it('finds a single checked task', () => {
    const items = findTaskItems('- [x] Buy milk');
    expect(items).toEqual([
      { line: 0, checked: true, text: 'Buy milk' },
    ]);
  });

  it('supports uppercase X', () => {
    const items = findTaskItems('- [X] Done');
    expect(items).toEqual([
      { line: 0, checked: true, text: 'Done' },
    ]);
  });

  it('finds multiple tasks with correct indices', () => {
    const body = '- [ ] Task A\n- [x] Task B\n- [ ] Task C';
    const items = findTaskItems(body);
    expect(items).toEqual([
      { line: 0, checked: false, text: 'Task A' },
      { line: 1, checked: true, text: 'Task B' },
      { line: 2, checked: false, text: 'Task C' },
    ]);
  });

  it('supports different list markers: -, *, +', () => {
    const body = '- [ ] dash\n* [ ] star\n+ [ ] plus';
    const items = findTaskItems(body);
    expect(items).toHaveLength(3);
    expect(items[0]!.text).toBe('dash');
    expect(items[1]!.text).toBe('star');
    expect(items[2]!.text).toBe('plus');
  });

  it('finds nested (indented) tasks', () => {
    const body = '- [ ] Parent\n  - [ ] Child\n    - [x] Grandchild';
    const items = findTaskItems(body);
    expect(items).toHaveLength(3);
    expect(items[0]!.line).toBe(0);
    expect(items[1]!.line).toBe(1);
    expect(items[2]!.line).toBe(2);
    expect(items[2]!.checked).toBe(true);
  });

  it('skips task-like lines inside fenced code blocks (backtick)', () => {
    const body = '- [ ] Real task\n```\n- [ ] Not a task\n```\n- [x] Another real task';
    const items = findTaskItems(body);
    expect(items).toHaveLength(2);
    expect(items[0]!.text).toBe('Real task');
    expect(items[1]!.text).toBe('Another real task');
  });

  it('skips task-like lines inside fenced code blocks (tilde)', () => {
    const body = '- [ ] Real task\n~~~\n- [ ] Not a task\n~~~\n- [x] Another';
    const items = findTaskItems(body);
    expect(items).toHaveLength(2);
  });

  it('handles longer fence delimiters', () => {
    const body = '````\n- [ ] Not a task\n````\n- [ ] Real task';
    const items = findTaskItems(body);
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toBe('Real task');
  });

  it('ignores non-task list items', () => {
    const body = '- Regular item\n- [ ] Task item\n- Another regular';
    const items = findTaskItems(body);
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toBe('Task item');
  });

  it('supports ordered list task items', () => {
    const body = '1. [ ] First\n2. [x] Second';
    const items = findTaskItems(body);
    expect(items).toHaveLength(2);
    expect(items[0]!.checked).toBe(false);
    expect(items[1]!.checked).toBe(true);
  });

  it('handles tasks mixed with other content', () => {
    const body = '# Title\n\nSome text\n\n- [ ] Task\n\n> blockquote';
    const items = findTaskItems(body);
    expect(items).toHaveLength(1);
    expect(items[0]!.line).toBe(4);
  });

  it('handles task with empty text', () => {
    const items = findTaskItems('- [ ]');
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toBe('');
  });
});

describe('toggleTaskItem', () => {
  it('toggles unchecked → checked', () => {
    const result = toggleTaskItem('- [ ] Task', 0);
    expect(result).toBe('- [x] Task');
  });

  it('toggles checked → unchecked', () => {
    const result = toggleTaskItem('- [x] Task', 0);
    expect(result).toBe('- [ ] Task');
  });

  it('toggles uppercase X → unchecked', () => {
    const result = toggleTaskItem('- [X] Task', 0);
    expect(result).toBe('- [ ] Task');
  });

  it('toggles specific index in multiple tasks', () => {
    const body = '- [ ] A\n- [ ] B\n- [ ] C';
    const result = toggleTaskItem(body, 1);
    expect(result).toBe('- [ ] A\n- [x] B\n- [ ] C');
  });

  it('preserves other lines', () => {
    const body = '# Title\n\n- [ ] Task\n\nSome text';
    const result = toggleTaskItem(body, 0);
    expect(result).toBe('# Title\n\n- [x] Task\n\nSome text');
  });

  it('preserves indentation', () => {
    const body = '- [ ] Parent\n  - [ ] Child';
    const result = toggleTaskItem(body, 1);
    expect(result).toBe('- [ ] Parent\n  - [x] Child');
  });

  it('returns null for out-of-range index (positive)', () => {
    expect(toggleTaskItem('- [ ] Task', 1)).toBeNull();
  });

  it('returns null for out-of-range index (negative)', () => {
    expect(toggleTaskItem('- [ ] Task', -1)).toBeNull();
  });

  it('returns null for body with no tasks', () => {
    expect(toggleTaskItem('Hello world', 0)).toBeNull();
  });

  it('returns null for empty body', () => {
    expect(toggleTaskItem('', 0)).toBeNull();
  });

  it('does not toggle task inside fenced code block', () => {
    const body = '```\n- [ ] Not real\n```\n- [ ] Real';
    // Only one real task (index 0)
    const result = toggleTaskItem(body, 0);
    expect(result).toBe('```\n- [ ] Not real\n```\n- [x] Real');
  });

  it('handles multiple toggles on different indices', () => {
    let body = '- [ ] A\n- [ ] B\n- [ ] C';
    body = toggleTaskItem(body, 0)!;
    body = toggleTaskItem(body, 2)!;
    expect(body).toBe('- [x] A\n- [ ] B\n- [x] C');
  });

  it('roundtrips: check then uncheck', () => {
    const original = '- [ ] Task';
    const checked = toggleTaskItem(original, 0);
    expect(checked).toBe('- [x] Task');
    const unchecked = toggleTaskItem(checked!, 0);
    expect(unchecked).toBe('- [ ] Task');
  });
});

describe('countTaskProgress', () => {
  it('TEXT: returns null for empty body', () => {
    expect(countTaskProgress({ archetype: 'text', body: '' })).toBeNull();
  });

  it('TEXT: returns null for body with no tasks', () => {
    expect(countTaskProgress({ archetype: 'text', body: '# Title\nSome text' })).toBeNull();
  });

  it('TEXT: counts partial completion', () => {
    expect(countTaskProgress({
      archetype: 'text',
      body: '- [ ] Buy milk\n- [x] Write code\n- [ ] Deploy',
    })).toEqual({ done: 1, total: 3 });
  });

  it('TEXT: counts all complete', () => {
    expect(countTaskProgress({
      archetype: 'text',
      body: '- [x] A\n- [x] B',
    })).toEqual({ done: 2, total: 2 });
  });

  it('TEXT: counts all incomplete', () => {
    expect(countTaskProgress({
      archetype: 'text',
      body: '- [ ] A\n- [ ] B\n- [ ] C',
    })).toEqual({ done: 0, total: 3 });
  });

  it('TEXT: excludes tasks in fenced code blocks', () => {
    expect(countTaskProgress({
      archetype: 'text',
      body: '- [ ] Real\n```\n- [ ] Fake\n```\n- [x] Also real',
    })).toEqual({ done: 1, total: 2 });
  });

  it('TEXTLOG: aggregates across all log entries', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'a', text: '- [ ] Task 1\n- [x] Task 2', createdAt: '2026-01-01T00:00:00Z', flags: [] },
        { id: 'b', text: '- [x] Task 3', createdAt: '2026-01-02T00:00:00Z', flags: [] },
      ],
    });
    expect(countTaskProgress({ archetype: 'textlog', body })).toEqual({ done: 2, total: 3 });
  });

  it('TEXTLOG: returns null when no log entries have tasks', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'a', text: 'Just text', createdAt: '2026-01-01T00:00:00Z', flags: [] },
      ],
    });
    expect(countTaskProgress({ archetype: 'textlog', body })).toBeNull();
  });

  it('TEXTLOG: returns null for empty entries', () => {
    const body = JSON.stringify({ entries: [] });
    expect(countTaskProgress({ archetype: 'textlog', body })).toBeNull();
  });

  it('TEXTLOG: handles invalid JSON gracefully', () => {
    expect(countTaskProgress({ archetype: 'textlog', body: 'not json' })).toBeNull();
  });

  it('todo archetype returns null', () => {
    expect(countTaskProgress({
      archetype: 'todo',
      body: JSON.stringify({ status: 'open', description: '- [ ] task' }),
    })).toBeNull();
  });

  it('form archetype returns null', () => {
    expect(countTaskProgress({
      archetype: 'form',
      body: JSON.stringify({ name: 'test' }),
    })).toBeNull();
  });

  it('attachment archetype returns null', () => {
    expect(countTaskProgress({
      archetype: 'attachment',
      body: JSON.stringify({ name: 'a.txt' }),
    })).toBeNull();
  });

  it('generic archetype is treated like text', () => {
    expect(countTaskProgress({
      archetype: 'generic',
      body: '- [x] Done\n- [ ] Pending',
    })).toEqual({ done: 1, total: 2 });
  });

  it('folder archetype is treated like text', () => {
    expect(countTaskProgress({
      archetype: 'folder',
      body: '- [x] A',
    })).toEqual({ done: 1, total: 1 });
  });
});
