/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, __resetEntryRowMemoForTest } from '@adapter/ui/renderer';
import { computeRenderScope } from '@adapter/ui/render-scope';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import { serializeTodoBody } from '@features/todo/todo-body';

/**
 * L1 #693 PR-2 integration contract for the `'entry-body'` render scope.
 *
 * A QUICK_UPDATE_ENTRY todo status toggle changes one row's body but
 * provably nothing else (link index / membership / sort position). The
 * scope swaps just that row + center + meta, leaving the other N-1 sidebar
 * rows untouched.
 *
 * Pinned invariants:
 *   - a plain status toggle in the default (detail / title-sort / no-filter)
 *     config classifies as `'entry-body'`;
 *   - conditions that could ripple beyond the row fall back to `'full'`;
 *   - the resulting DOM equals a full render of the same state;
 *   - the changed row is replaced but sibling rows keep node identity.
 */

const T = '2026-04-27T00:00:00.000Z';

function todoBody(status: 'open' | 'done', extra: Partial<{ description: string; archived: boolean }> = {}): string {
  return serializeTodoBody({ status, description: extra.description ?? 'do the thing', archived: extra.archived });
}

function fixture(): Container {
  return {
    meta: { container_id: 'cid', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'a1', title: 'Alpha todo', archetype: 'todo', body: todoBody('open'), created_at: T, updated_at: T },
      { lid: 'a2', title: 'Beta note', archetype: 'text', body: 'second', created_at: T, updated_at: T },
      { lid: 'a3', title: 'Gamma todo', archetype: 'todo', body: todoBody('open'), created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyState(container: Container): AppState {
  const initial = createInitialState();
  const { state } = reduce(initial, { type: 'SYS_INIT_COMPLETE', container });
  // Select the todo so the center + meta panes are populated.
  return reduce(state, { type: 'SELECT_ENTRY', lid: 'a1' }).state;
}

function toggle(state: AppState, lid: string, body: string): AppState {
  return reduce(state, { type: 'QUICK_UPDATE_ENTRY', lid, body }).state;
}

let root: HTMLElement;

beforeEach(() => {
  __resetEntryRowMemoForTest();
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    root.remove();
    __resetEntryRowMemoForTest();
  };
});

function normalize(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const attrs = [...el.attributes].map((a) => `${a.name}=${JSON.stringify(a.value)}`).sort().join(' ');
  const kids = [...el.childNodes]
    .map((n) => (n.nodeType === 1 ? normalize(n as Element) : n.nodeType === 3 ? JSON.stringify(n.textContent) : ''))
    .join('');
  return `<${tag} ${attrs}>${kids}</${tag}>`;
}

describe('render scope=entry-body — detection', () => {
  it('classifies a plain todo status toggle as "entry-body"', () => {
    const prev = readyState(fixture());
    const next = toggle(prev, 'a1', todoBody('done'));
    expect(computeRenderScope(next, prev)).toBe('entry-body');
  });

  it('falls back to "full" when sorted by updated_at (the toggle reorders the row)', () => {
    const prev = { ...readyState(fixture()), sortKey: 'updated_at' as const };
    const next = toggle(prev, 'a1', todoBody('done'));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('falls back to "full" when a search filter is active (flat-list mode)', () => {
    const prev = { ...readyState(fixture()), searchQuery: 'alpha' };
    const next = toggle(prev, 'a1', todoBody('done'));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('falls back to "full" when the todo description changes (link index could move)', () => {
    const prev = readyState(fixture());
    const next = toggle(prev, 'a1', todoBody('done', { description: 'see entry:a2' }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('falls back to "full" when the archived flag changes (tree membership could move)', () => {
    const prev = readyState(fixture());
    const next = toggle(prev, 'a1', todoBody('open', { archived: true }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('falls back to "full" when not in detail view', () => {
    const prev = { ...readyState(fixture()), viewMode: 'kanban' as const };
    const next = toggle(prev, 'a1', todoBody('done'));
    expect(computeRenderScope(next, prev)).toBe('full');
  });
});

describe('render scope=entry-body — full-render parity', () => {
  it('produces DOM equal to a full render of the same state', () => {
    const prev = readyState(fixture());
    const next = toggle(prev, 'a1', todoBody('done'));
    expect(computeRenderScope(next, prev)).toBe('entry-body');

    const refRoot = document.createElement('div');
    refRoot.id = root.id;
    document.body.appendChild(refRoot);
    __resetEntryRowMemoForTest();
    render(next, refRoot); // full

    __resetEntryRowMemoForTest();
    render(prev, root); // full
    render(next, root, prev); // 'entry-body'

    expect(normalize(root)).toBe(normalize(refRoot));
    refRoot.remove();
  });
});

describe('render scope=entry-body — region preservation', () => {
  it('replaces only the changed row; sibling rows + sidebar keep identity', () => {
    const prev = readyState(fixture());
    const next = toggle(prev, 'a1', todoBody('done'));

    render(prev, root);
    const sidebarBefore = root.querySelector('[data-pkc-region="sidebar"]');
    const changedBefore = root.querySelector('[data-pkc-region="entry-list"] li[data-pkc-lid="a1"]');
    const siblingBefore = root.querySelector('[data-pkc-region="entry-list"] li[data-pkc-lid="a3"]');
    const centerBefore = root.querySelector('[data-pkc-region="center"]');

    render(next, root, prev);
    const sidebarAfter = root.querySelector('[data-pkc-region="sidebar"]');
    const changedAfter = root.querySelector('[data-pkc-region="entry-list"] li[data-pkc-lid="a1"]');
    const siblingAfter = root.querySelector('[data-pkc-region="entry-list"] li[data-pkc-lid="a3"]');
    const centerAfter = root.querySelector('[data-pkc-region="center"]');

    expect(sidebarAfter).toBe(sidebarBefore);     // ← sidebar NOT rebuilt
    expect(siblingAfter).toBe(siblingBefore);     // ← untouched sibling reused
    expect(changedAfter).not.toBe(changedBefore); // ← only the changed row swapped
    expect(centerAfter).not.toBe(centerBefore);   // ← center rebuilt
  });
});
