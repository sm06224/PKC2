/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach } from 'vitest';
import { todoPresenter } from '../../src/adapter/ui/todo-presenter';
import { __resetRegistry, __resetUrlCache } from '../../src/adapter/flags';
import type { Entry } from '../../src/core/model/record';

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'text.todo_subtask_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

function makeTodo(description: string, lid: string = 'lid_todo'): Entry {
  return {
    lid,
    title: 'T',
    body: JSON.stringify({ status: 'open', description }),
    archetype: 'todo',
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
  };
}

describe('todo description subtask interactive(pgc-150)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
  });

  it('case 1: flag OFF で checkbox は data-pkc-action 持たない', () => {
    setFlag(false);
    const entry = makeTodo('- [ ] sub1\n- [x] sub2');
    const root = todoPresenter.renderBody(entry);
    const checkboxes = root.querySelectorAll('input.pkc-task-checkbox');
    expect(checkboxes.length).toBe(2);
    for (const cb of Array.from(checkboxes)) {
      expect(cb.getAttribute('data-pkc-action')).toBeNull();
    }
  });

  it('case 2: flag ON で checkbox に toggle-todo-subtask action + lid + data-pkc-task-index 揃う', () => {
    setFlag(true);
    const entry = makeTodo('- [ ] sub1\n- [x] sub2');
    const root = todoPresenter.renderBody(entry);
    const checkboxes = Array.from(root.querySelectorAll<HTMLInputElement>('input.pkc-task-checkbox'));
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0]?.getAttribute('data-pkc-action')).toBe('toggle-todo-subtask');
    expect(checkboxes[0]?.getAttribute('data-pkc-lid')).toBe('lid_todo');
    expect(checkboxes[0]?.getAttribute('data-pkc-task-index')).toBe('0');
    expect(checkboxes[1]?.getAttribute('data-pkc-task-index')).toBe('1');
  });

  it('case 3: flag ON で interactive class が付く', () => {
    setFlag(true);
    const entry = makeTodo('- [ ] sub');
    const root = todoPresenter.renderBody(entry);
    const cb = root.querySelector('input.pkc-task-checkbox');
    expect(cb?.classList.contains('pkc-todo-subtask-interactive')).toBe(true);
  });

  it('case 4: flag ON で disabled が解除される(default checkbox は markdown-it 既定で enable のはずだが、念のため)', () => {
    setFlag(true);
    const entry = makeTodo('- [x] done\n- [ ] open');
    const root = todoPresenter.renderBody(entry);
    const checkboxes = Array.from(root.querySelectorAll<HTMLInputElement>('input.pkc-task-checkbox'));
    for (const cb of checkboxes) {
      expect(cb.disabled).toBe(false);
    }
  });

  it('case 5: subtask 0 件の description は checkbox 0 件、no inject', () => {
    setFlag(true);
    const entry = makeTodo('just plain text');
    const root = todoPresenter.renderBody(entry);
    expect(root.querySelectorAll('input.pkc-task-checkbox').length).toBe(0);
  });

  it('case 6: checked / unchecked 状態は markdown source に従う', () => {
    setFlag(true);
    const entry = makeTodo('- [ ] open\n- [x] done');
    const root = todoPresenter.renderBody(entry);
    const checkboxes = Array.from(root.querySelectorAll<HTMLInputElement>('input.pkc-task-checkbox'));
    expect(checkboxes[0]?.checked).toBe(false);
    expect(checkboxes[1]?.checked).toBe(true);
  });

  it('case 7: 順序性 ── action attr + index で action-binder が dispatch 可能な情報を揃える', () => {
    setFlag(true);
    const entry = makeTodo('- [ ] first\n- [ ] second', 'lid_xyz');
    const root = todoPresenter.renderBody(entry);
    const second = root.querySelectorAll<HTMLInputElement>('input.pkc-task-checkbox')[1];
    // dispatch に必要な 3 attr が同じ checkbox に揃う
    expect(second?.getAttribute('data-pkc-action')).toBe('toggle-todo-subtask');
    expect(second?.getAttribute('data-pkc-lid')).toBe('lid_xyz');
    expect(second?.getAttribute('data-pkc-task-index')).toBe('1');
  });
});
