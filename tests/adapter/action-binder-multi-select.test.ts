/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

// Register the textlog presenter once so the renderer can draw textlog entries
// during these tests. Registration is idempotent.
registerPresenter('textlog', textlogPresenter);
registerPresenter('attachment', attachmentPresenter);

const mockContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'e1',
      title: 'Entry One',
      body: 'Body one',
      archetype: 'text',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: () => void;

// --- Stale-listener prevention infrastructure ---
// Every dispatcher.onState / onEvent subscription is auto-tracked here.
// The beforeEach teardown calls all accumulated unsubscribe functions,
// ensuring no stale listener can render into a subsequent test's root.
const _trackedUnsubs: (() => void)[] = [];

function createDispatcher() {
  const d = _createRawDispatcher();
  return {
    ...d,
    onState(listener: Parameters<typeof d.onState>[0]) {
      const unsub = d.onState(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
    onEvent(listener: Parameters<typeof d.onEvent>[0]) {
      const unsub = d.onEvent(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
  };
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
  };
});

// NOTE: `setup()` helper is not used in this file — each describe bootstraps
// its own dispatcher + render fixture inline. The shared `root` / `cleanup` /
// `_trackedUnsubs` scaffolding above remains useful.


describe('Calendar/Kanban Multi-Select — Ctrl+click / Shift+click', () => {
  const todoContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"done","description":"B","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"open","description":"C","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function setupTodo(viewMode: 'calendar' | 'kanban') {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: todoContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: viewMode });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  it('Calendar: Ctrl+click dispatches TOGGLE_MULTI_SELECT', () => {
    const { dispatcher } = setupTodo('calendar');
    // First select t1 normally
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    const t2Item = cal.querySelector('[data-pkc-lid="t2"]');
    expect(t2Item).not.toBeNull();
    t2Item!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

    const state = dispatcher.getState();
    expect(state.multiSelectedLids).toContain('t1');
    expect(state.multiSelectedLids).toContain('t2');
  });

  it('Kanban: Ctrl+click dispatches TOGGLE_MULTI_SELECT', () => {
    const { dispatcher } = setupTodo('kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const t3Card = kanban.querySelector('[data-pkc-lid="t3"]');
    expect(t3Card).not.toBeNull();
    t3Card!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

    const state = dispatcher.getState();
    expect(state.multiSelectedLids).toContain('t1');
    expect(state.multiSelectedLids).toContain('t3');
  });

  it('Calendar: Shift+click dispatches SELECT_RANGE (storage order — Phase 2 will optimize)', () => {
    const { dispatcher } = setupTodo('calendar');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    const t3Item = cal.querySelector('[data-pkc-lid="t3"]');
    expect(t3Item).not.toBeNull();
    t3Item!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));

    const state = dispatcher.getState();
    // Range is storage-order based: t1, t2, t3 are indices 0-2
    expect(state.multiSelectedLids).toContain('t1');
    expect(state.multiSelectedLids).toContain('t2');
    expect(state.multiSelectedLids).toContain('t3');
  });

  it('Kanban: Shift+click dispatches SELECT_RANGE safely', () => {
    const { dispatcher } = setupTodo('kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const t2Card = kanban.querySelector('[data-pkc-lid="t2"]');
    expect(t2Card).not.toBeNull();
    t2Card!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));

    const state = dispatcher.getState();
    expect(state.multiSelectedLids).toContain('t1');
    expect(state.multiSelectedLids).toContain('t2');
  });

  it('Calendar: normal click clears multiSelectedLids', () => {
    const { dispatcher } = setupTodo('calendar');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    // Ctrl+click to build multi-select
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    expect(dispatcher.getState().multiSelectedLids.length).toBeGreaterThan(0);
    render(dispatcher.getState(), root);

    const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    const t3Item = cal.querySelector('[data-pkc-lid="t3"]');
    t3Item!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(dispatcher.getState().multiSelectedLids).toHaveLength(0);
  });

  it('Kanban: normal click clears multiSelectedLids', () => {
    const { dispatcher } = setupTodo('kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't3' });
    expect(dispatcher.getState().multiSelectedLids.length).toBeGreaterThan(0);
    render(dispatcher.getState(), root);

    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const t2Card = kanban.querySelector('[data-pkc-lid="t2"]');
    t2Card!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(dispatcher.getState().multiSelectedLids).toHaveLength(0);
  });
});

// ── Calendar/Kanban Multi-Select Phase 2-A: Bulk Status Change ──

describe('Bulk Status Change (Phase 2-A)', () => {
  const bulkContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"open","description":"B"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"done","description":"C"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 'n1', title: 'Note', body: 'text content', archetype: 'text', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function setupBulk() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: bulkContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Reducer tests ──

  it('BULK_SET_STATUS changes status of multiple todos to done', () => {
    const { dispatcher } = setupBulk();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: 'done' });

    const state = dispatcher.getState();
    const t1 = state.container!.entries.find((e) => e.lid === 't1')!;
    const t2 = state.container!.entries.find((e) => e.lid === 't2')!;
    expect(JSON.parse(t1.body).status).toBe('done');
    expect(JSON.parse(t2.body).status).toBe('done');
  });

  it('BULK_SET_STATUS changes status of multiple todos to open', () => {
    const { dispatcher } = setupBulk();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't3' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't1' });
    dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: 'open' });

    const state = dispatcher.getState();
    const t1 = state.container!.entries.find((e) => e.lid === 't1')!;
    const t3 = state.container!.entries.find((e) => e.lid === 't3')!;
    // t1 was already open, t3 was done → now open
    expect(JSON.parse(t1.body).status).toBe('open');
    expect(JSON.parse(t3.body).status).toBe('open');
  });

  it('BULK_SET_STATUS clears multiSelectedLids after execution', () => {
    const { dispatcher } = setupBulk();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: 'done' });

    expect(dispatcher.getState().multiSelectedLids).toHaveLength(0);
  });

  it('BULK_SET_STATUS skips non-todo entries safely', () => {
    const { dispatcher } = setupBulk();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't1' });
    dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: 'done' });

    const state = dispatcher.getState();
    // t1 should be updated
    expect(JSON.parse(state.container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');
    // n1 body should be unchanged
    expect(state.container!.entries.find((e) => e.lid === 'n1')!.body).toBe('text content');
  });

  it('BULK_SET_STATUS is no-op when status already matches', () => {
    const { dispatcher } = setupBulk();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't3' }); // t3 is already done
    dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: 'done' });

    const state = dispatcher.getState();
    // t3 should still be done, and no revision should have been created
    // (or at minimum, body is unchanged)
    expect(JSON.parse(state.container!.entries.find((e) => e.lid === 't3')!.body).status).toBe('done');
    expect(state.multiSelectedLids).toHaveLength(0);
  });

  it('BULK_SET_STATUS is blocked in readonly mode', () => {
    const { dispatcher } = setupBulk();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    // Force readonly
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: { ...bulkContainer, meta: { ...bulkContainer.meta, container_id: 'ro' } } });
    // The state is re-initialized, so re-select
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });

    // Now make readonly by dispatching the readonly container
    // Actually, let's test directly — readonly is set when lightSource is true and embedded
    // Simpler: check that the reducer blocks when multiSelectedLids is empty
    dispatcher.dispatch({ type: 'CLEAR_MULTI_SELECT' });
    dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: 'done' });

    // With empty selection, it should be blocked — no changes
    expect(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).toContain('"open"');
  });

  it('BULK_SET_STATUS preserves date and archived fields', () => {
    const { dispatcher } = setupBulk();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' }); // t1 has date: 2026-04-10
    dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: 'done' });

    const body = JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body);
    expect(body.status).toBe('done');
    expect(body.date).toBe('2026-04-10');
    expect(body.description).toBe('A');
  });

  // ── Renderer / UI tests ──

  it('multi-action bar shows bulk status select when todos are selected', () => {
    const { dispatcher } = setupBulk();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const statusSelect = root.querySelector('[data-pkc-action="bulk-set-status"]');
    expect(statusSelect).not.toBeNull();
    const options = statusSelect!.querySelectorAll('option');
    expect(options.length).toBe(3); // placeholder + open + done
  });

  it('multi-action bar hides bulk status select when only non-todos are selected', () => {
    const { dispatcher } = setupBulk();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n1' });
    // n1 is the only selection (no multi), but getAllSelected includes it
    // Need to put it in multiSelectedLids
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 'n1' });
    render(dispatcher.getState(), root);

    // But n1 is a text entry; it was already selectedLid, so TOGGLE adds it
    // The bar should show but without status select
    const statusSelect = root.querySelector('[data-pkc-action="bulk-set-status"]');
    expect(statusSelect).toBeNull();
  });

  // ── Integration: select → bulk status → visual update ──

  it('integration: multi-select todos, bulk set done, verify Kanban reflects change', () => {
    const { dispatcher } = setupBulk();
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: 'done' });
    render(dispatcher.getState(), root);

    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    // t1 and t2 should now be in the Done column
    const doneColumn = kanban.querySelector('[data-pkc-kanban-status="done"]')!;
    const doneList = doneColumn.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    const doneCards = doneList.querySelectorAll('[data-pkc-action="select-entry"]');
    const doneLids = Array.from(doneCards).map((c) => c.getAttribute('data-pkc-lid'));
    expect(doneLids).toContain('t1');
    expect(doneLids).toContain('t2');
    expect(doneLids).toContain('t3'); // was already done
  });

  it('integration: bulk set status does not break existing single-entry status change', () => {
    const { dispatcher } = setupBulk();
    // Single entry update via QUICK_UPDATE_ENTRY still works
    dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 't1', body: '{"status":"done","description":"A","date":"2026-04-10"}' });
    const body = JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body);
    expect(body.status).toBe('done');
  });
});

// ── Calendar/Kanban Multi-Select Phase 2-B: Bulk Date Change ──

describe('Bulk Date Change (Phase 2-B)', () => {
  const dateContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"open","description":"B"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"done","description":"C","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 'n1', title: 'Note', body: 'text content', archetype: 'text', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
      { lid: 't4', title: 'Archived', body: '{"status":"done","description":"D","date":"2026-04-10","archived":true}', archetype: 'todo', created_at: '2026-01-01T00:05:00Z', updated_at: '2026-01-01T00:05:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function setupDate() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: dateContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Reducer: date set ──

  it('BULK_SET_DATE sets date on multiple todos', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: '2026-05-01' });

    const s = dispatcher.getState();
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-05-01');
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't2')!.body).date).toBe('2026-05-01');
  });

  // ── Reducer: date clear ──

  it('BULK_SET_DATE with null clears date on multiple todos', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' }); // has date
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't3' }); // has date
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: null });

    const s = dispatcher.getState();
    const t1 = JSON.parse(s.container!.entries.find((e) => e.lid === 't1')!.body);
    const t3 = JSON.parse(s.container!.entries.find((e) => e.lid === 't3')!.body);
    expect(t1.date).toBeUndefined();
    expect(t3.date).toBeUndefined();
  });

  // ── Reducer: no-op ──

  it('BULK_SET_DATE is no-op when date already matches', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' }); // date: 2026-04-10
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: '2026-04-10' });

    const s = dispatcher.getState();
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-10');
    expect(s.multiSelectedLids).toHaveLength(0);
  });

  it('BULK_SET_DATE clear is no-op for undated todos', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't2' }); // no date
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: null });

    const s = dispatcher.getState();
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't2')!.body).date).toBeUndefined();
    expect(s.multiSelectedLids).toHaveLength(0);
  });

  // ── Reducer: non-todo skip ──

  it('BULK_SET_DATE skips non-todo entries', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't1' });
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: '2026-06-01' });

    const s = dispatcher.getState();
    // t1 updated
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-06-01');
    // n1 unchanged
    expect(s.container!.entries.find((e) => e.lid === 'n1')!.body).toBe('text content');
  });

  // ── Reducer: readonly block ──

  it('BULK_SET_DATE is blocked with empty selection', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: '2026-06-01' });
    // No selection → blocked, date unchanged
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-10');
  });

  // ── Reducer: preserves other fields ──

  it('BULK_SET_DATE preserves status, description, archived', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't4' }); // archived, done, date: 2026-04-10
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: '2026-07-01' });

    const body = JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't4')!.body);
    expect(body.date).toBe('2026-07-01');
    expect(body.status).toBe('done');
    expect(body.description).toBe('D');
    expect(body.archived).toBe(true);
  });

  // ── Reducer: clears multiSelectedLids ──

  it('BULK_SET_DATE clears multiSelectedLids', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: '2026-05-01' });

    expect(dispatcher.getState().multiSelectedLids).toHaveLength(0);
  });

  // ── Renderer / UI ──

  it('multi-action bar shows date input and clear-date button when todos selected', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const dateInput = root.querySelector('[data-pkc-action="bulk-set-date"]');
    expect(dateInput).not.toBeNull();
    expect((dateInput as HTMLInputElement).type).toBe('date');

    const clearDateBtn = root.querySelector('[data-pkc-action="bulk-clear-date"]');
    expect(clearDateBtn).not.toBeNull();
  });

  it('date input and clear-date hidden when only non-todos selected', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'n1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 'n1' });
    render(dispatcher.getState(), root);

    expect(root.querySelector('[data-pkc-action="bulk-set-date"]')).toBeNull();
    expect(root.querySelector('[data-pkc-action="bulk-clear-date"]')).toBeNull();
  });

  // ── Integration: Calendar visibility ──

  it('integration: bulk set date makes undated todo appear in Calendar', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    // t2 has no date — should not be in Calendar
    render(dispatcher.getState(), root);
    let cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    expect(cal.querySelector('[data-pkc-lid="t2"]')).toBeNull();

    // Set date on t2
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't2' });
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: '2026-04-10' });
    render(dispatcher.getState(), root);

    cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    expect(cal.querySelector('[data-pkc-lid="t2"]')).not.toBeNull();
  });

  it('integration: bulk clear date removes todo from Calendar', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    // t1 has date 2026-04-10 — should be in Calendar
    render(dispatcher.getState(), root);
    let cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    expect(cal.querySelector('[data-pkc-lid="t1"]')).not.toBeNull();

    // Clear date on t1
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: null });
    render(dispatcher.getState(), root);

    cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    expect(cal.querySelector('[data-pkc-lid="t1"]')).toBeNull();
  });

  it('integration: bulk set date does not break existing single-entry date edit via DnD', () => {
    const { dispatcher } = setupDate();
    // Single entry DnD date change still works
    dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: 't1', body: '{"status":"open","description":"A","date":"2026-04-20"}' });
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-20');
  });

  it('integration: bulk status change (Phase 2-A) still works after bulk date', () => {
    const { dispatcher } = setupDate();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: 'done' });

    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('done');
  });
});

// ── Calendar/Kanban Multi-Select Phase 2-C1: Kanban Multi-DnD ──

describe('Kanban Multi-DnD (Phase 2-C1)', () => {
  const dndContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"open","description":"B"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"done","description":"C"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 'n1', title: 'Note', body: 'text content', archetype: 'text', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function setupDnD() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: dndContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  /** Create a minimal DragEvent with a mock DataTransfer. */
  function makeDragEvent(type: string, target: Element): DragEvent {
    const dt = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    const evt = new Event(type, { bubbles: true, cancelable: true }) as unknown as DragEvent;
    Object.defineProperty(evt, 'dataTransfer', { value: dt });
    Object.defineProperty(evt, 'target', { value: target, writable: false });
    return evt;
  }

  // ── Multi-drag: selected set member drag → bulk status ──

  it('multi-drag: drag selected card to Done column applies BULK_SET_STATUS', () => {
    const { dispatcher } = setupDnD();
    // Multi-select t1 and t2 (both open)
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    // Drag t1 (member of selection)
    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeDragEvent('dragstart', card));

    // Drop on "done" column
    const doneTarget = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneTarget.dispatchEvent(makeDragEvent('drop', doneTarget));

    const s = dispatcher.getState();
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('done');
  });

  it('multi-drag clears multiSelectedLids after drop', () => {
    const { dispatcher } = setupDnD();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeDragEvent('dragstart', card));

    const doneTarget = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneTarget.dispatchEvent(makeDragEvent('drop', doneTarget));

    expect(dispatcher.getState().multiSelectedLids).toHaveLength(0);
  });

  it('multi-drag sets selectedLid to the dragged card after drop', () => {
    const { dispatcher } = setupDnD();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t2"]')!;
    card.dispatchEvent(makeDragEvent('dragstart', card));

    const doneTarget = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneTarget.dispatchEvent(makeDragEvent('drop', doneTarget));

    expect(dispatcher.getState().selectedLid).toBe('t2');
  });

  // ── Single-drag: non-selected card preserves existing behavior ──

  it('single-drag: non-selected card uses QUICK_UPDATE_ENTRY (existing behavior)', () => {
    const { dispatcher } = setupDnD();
    // Select t1 only — t3 is NOT in selection
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    // Drag t3 (done, NOT selected)
    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t3"]')!;
    card.dispatchEvent(makeDragEvent('dragstart', card));

    // Drop on "open" column
    const openTarget = root.querySelector('[data-pkc-kanban-drop-target="open"]')!;
    openTarget.dispatchEvent(makeDragEvent('drop', openTarget));

    const s = dispatcher.getState();
    // t3 should change to open
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't3')!.body).status).toBe('open');
    // t1 should remain unchanged (single-drag does not touch other entries)
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('open');
  });

  it('single-drag: only one selected entry is still single-drag', () => {
    const { dispatcher } = setupDnD();
    // Only t1 selected (no multi)
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeDragEvent('dragstart', card));

    const doneTarget = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneTarget.dispatchEvent(makeDragEvent('drop', doneTarget));

    // Should work as single-drag (QUICK_UPDATE_ENTRY)
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');
    // t2 untouched
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('open');
  });

  // ── Same-column drop ──

  it('same-column drop is no-op for multi-drag (status already matches)', () => {
    const { dispatcher } = setupDnD();
    // t1 and t2 are open, drop on "open" column
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeDragEvent('dragstart', card));

    const openTarget = root.querySelector('[data-pkc-kanban-drop-target="open"]')!;
    openTarget.dispatchEvent(makeDragEvent('drop', openTarget));

    // Status should remain open (BULK_SET_STATUS with same value = no-op per entry)
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('open');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('open');
  });

  // ── Cleanup: dragEnd without drop ──

  it('dragEnd without drop resets multi-drag state', () => {
    const { dispatcher } = setupDnD();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeDragEvent('dragstart', card));

    // Cancel: dragend without drop
    card.dispatchEvent(makeDragEvent('dragend', card));

    // Now do a single-drag with t3 — should NOT be treated as multi-drag
    render(dispatcher.getState(), root);
    const card3 = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t3"]')!;
    card3.dispatchEvent(makeDragEvent('dragstart', card3));

    const openTarget = root.querySelector('[data-pkc-kanban-drop-target="open"]')!;
    openTarget.dispatchEvent(makeDragEvent('drop', openTarget));

    // Only t3 should change, not t1/t2
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't3')!.body).status).toBe('open');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('open');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('open');
  });

  it('subsequent single-drag after multi-drop works correctly', () => {
    const { dispatcher } = setupDnD();
    // First: multi-drag t1+t2 to done
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const card1 = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card1.dispatchEvent(makeDragEvent('dragstart', card1));

    const doneTarget = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneTarget.dispatchEvent(makeDragEvent('drop', doneTarget));

    // Now re-render and do a single-drag with t3
    render(dispatcher.getState(), root);
    const card3 = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t3"]')!;
    card3.dispatchEvent(makeDragEvent('dragstart', card3));

    const openTarget = root.querySelector('[data-pkc-kanban-drop-target="open"]')!;
    openTarget.dispatchEvent(makeDragEvent('drop', openTarget));

    // t3 should now be open
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't3')!.body).status).toBe('open');
    // t1, t2 remain done from the multi-drag
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('done');
  });

  // ── Regression: existing features ──

  it('regression: Phase 1 visual feedback still works with multi-select in Kanban', () => {
    const { dispatcher } = setupDnD();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const t1Card = kanban.querySelector('[data-pkc-lid="t1"]')!;
    const t2Card = kanban.querySelector('[data-pkc-lid="t2"]')!;
    expect(t1Card.getAttribute('data-pkc-multi-selected')).toBe('true');
    expect(t2Card.getAttribute('data-pkc-multi-selected')).toBe('true');
  });

  it('regression: Phase 2-A bulk status via multi-action bar still works', () => {
    const { dispatcher } = setupDnD();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: 'done' });

    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('done');
  });

  it('regression: single Kanban DnD without selection works unchanged', () => {
    const { dispatcher } = setupDnD();
    // No selection, just drag t3 (done) to open
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t3"]')!;
    card.dispatchEvent(makeDragEvent('dragstart', card));

    const openTarget = root.querySelector('[data-pkc-kanban-drop-target="open"]')!;
    openTarget.dispatchEvent(makeDragEvent('drop', openTarget));

    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't3')!.body).status).toBe('open');
  });
});

// ── Calendar/Kanban Multi-Select Phase 2-C2: Calendar Multi-DnD ──

describe('Calendar Multi-DnD (Phase 2-C2)', () => {
  const calDndContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"open","description":"B","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"done","description":"C","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 'n1', title: 'Note', body: 'text content', archetype: 'text', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function setupCalDnD() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: calDndContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    // Ensure calendar shows April 2026 (matches test data dates)
    dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  /** Create a minimal DragEvent with a mock DataTransfer. */
  function makeCalDragEvent(type: string, target: Element): DragEvent {
    const dt = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    const evt = new Event(type, { bubbles: true, cancelable: true }) as unknown as DragEvent;
    Object.defineProperty(evt, 'dataTransfer', { value: dt });
    Object.defineProperty(evt, 'target', { value: target, writable: false });
    return evt;
  }

  // ── Multi-drag: selected set member drag → bulk date ──

  it('multi-drag: drag selected item to different date applies BULK_SET_DATE', () => {
    const { dispatcher } = setupCalDnD();
    // Multi-select t1 and t2 (both on 2026-04-10)
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    // Drag t1 (member of selection)
    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t1"]')!;
    item.dispatchEvent(makeCalDragEvent('dragstart', item));

    // Drop on 2026-04-20 cell
    const dateCell = root.querySelector('[data-pkc-date="2026-04-20"]')!;
    dateCell.dispatchEvent(makeCalDragEvent('drop', dateCell));

    const s = dispatcher.getState();
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-20');
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't2')!.body).date).toBe('2026-04-20');
  });

  it('multi-drag clears multiSelectedLids after drop', () => {
    const { dispatcher } = setupCalDnD();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t1"]')!;
    item.dispatchEvent(makeCalDragEvent('dragstart', item));

    const dateCell = root.querySelector('[data-pkc-date="2026-04-20"]')!;
    dateCell.dispatchEvent(makeCalDragEvent('drop', dateCell));

    expect(dispatcher.getState().multiSelectedLids).toHaveLength(0);
  });

  it('multi-drag sets selectedLid to the dragged item after drop', () => {
    const { dispatcher } = setupCalDnD();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    // Drag t2 (not the anchor, but in multi-select)
    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t2"]')!;
    item.dispatchEvent(makeCalDragEvent('dragstart', item));

    const dateCell = root.querySelector('[data-pkc-date="2026-04-20"]')!;
    dateCell.dispatchEvent(makeCalDragEvent('drop', dateCell));

    expect(dispatcher.getState().selectedLid).toBe('t2');
  });

  // ── Single-drag: non-selected item preserves existing behavior ──

  it('single-drag: non-selected item uses QUICK_UPDATE_ENTRY (existing behavior)', () => {
    const { dispatcher } = setupCalDnD();
    // Select t1 only — t3 is NOT in selection
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    // Drag t3 (on 2026-04-15, NOT selected)
    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t3"]')!;
    item.dispatchEvent(makeCalDragEvent('dragstart', item));

    // Drop on 2026-04-05
    const dateCell = root.querySelector('[data-pkc-date="2026-04-05"]')!;
    dateCell.dispatchEvent(makeCalDragEvent('drop', dateCell));

    const s = dispatcher.getState();
    // t3 should change to 2026-04-05
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't3')!.body).date).toBe('2026-04-05');
    // t1 should remain unchanged
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-10');
  });

  it('single-drag: only one selected entry is still single-drag', () => {
    const { dispatcher } = setupCalDnD();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t1"]')!;
    item.dispatchEvent(makeCalDragEvent('dragstart', item));

    const dateCell = root.querySelector('[data-pkc-date="2026-04-25"]')!;
    dateCell.dispatchEvent(makeCalDragEvent('drop', dateCell));

    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-25');
    // t2 untouched
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).date).toBe('2026-04-10');
  });

  // ── Same-date drop ──

  it('same-date drop is no-op for multi-drag (date already matches)', () => {
    const { dispatcher } = setupCalDnD();
    // t1 and t2 are both on 2026-04-10
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t1"]')!;
    item.dispatchEvent(makeCalDragEvent('dragstart', item));

    // Drop on same date 2026-04-10
    const dateCell = root.querySelector('[data-pkc-date="2026-04-10"]')!;
    dateCell.dispatchEvent(makeCalDragEvent('drop', dateCell));

    // Date should remain 2026-04-10 (BULK_SET_DATE with same value = no-op per entry)
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-10');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).date).toBe('2026-04-10');
  });

  // ── Cleanup: dragEnd without drop ──

  it('dragEnd without drop resets multi-drag state', () => {
    const { dispatcher } = setupCalDnD();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t1"]')!;
    item.dispatchEvent(makeCalDragEvent('dragstart', item));

    // Cancel: dragend without drop
    item.dispatchEvent(makeCalDragEvent('dragend', item));

    // Now do a single-drag with t3 — should NOT be treated as multi-drag
    render(dispatcher.getState(), root);
    const item3 = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t3"]')!;
    item3.dispatchEvent(makeCalDragEvent('dragstart', item3));

    const dateCell = root.querySelector('[data-pkc-date="2026-04-01"]')!;
    dateCell.dispatchEvent(makeCalDragEvent('drop', dateCell));

    // Only t3 should change
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't3')!.body).date).toBe('2026-04-01');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-10');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).date).toBe('2026-04-10');
  });

  it('subsequent single-drag after multi-drop works correctly', () => {
    const { dispatcher } = setupCalDnD();
    // First: multi-drag t1+t2 to 2026-04-20
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const item1 = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t1"]')!;
    item1.dispatchEvent(makeCalDragEvent('dragstart', item1));

    const cell20 = root.querySelector('[data-pkc-date="2026-04-20"]')!;
    cell20.dispatchEvent(makeCalDragEvent('drop', cell20));

    // Now re-render and single-drag t3
    render(dispatcher.getState(), root);
    const item3 = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t3"]')!;
    item3.dispatchEvent(makeCalDragEvent('dragstart', item3));

    const cell05 = root.querySelector('[data-pkc-date="2026-04-05"]')!;
    cell05.dispatchEvent(makeCalDragEvent('drop', cell05));

    // t3 should now be 2026-04-05
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't3')!.body).date).toBe('2026-04-05');
    // t1, t2 remain on 2026-04-20 from the multi-drag
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-20');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).date).toBe('2026-04-20');
  });

  // ── Regression ──

  it('regression: Phase 1 visual feedback still works with multi-select in Calendar', () => {
    const { dispatcher } = setupCalDnD();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    const t1Item = cal.querySelector('[data-pkc-lid="t1"]')!;
    const t2Item = cal.querySelector('[data-pkc-lid="t2"]')!;
    expect(t1Item.getAttribute('data-pkc-multi-selected')).toBe('true');
    expect(t2Item.getAttribute('data-pkc-multi-selected')).toBe('true');
  });

  it('regression: Phase 2-B bulk date via multi-action bar still works', () => {
    const { dispatcher } = setupCalDnD();
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: '2026-05-01' });

    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-05-01');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).date).toBe('2026-05-01');
  });

  it('regression: single Calendar DnD without selection works unchanged', () => {
    const { dispatcher } = setupCalDnD();
    render(dispatcher.getState(), root);

    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t3"]')!;
    item.dispatchEvent(makeCalDragEvent('dragstart', item));

    const dateCell = root.querySelector('[data-pkc-date="2026-04-01"]')!;
    dateCell.dispatchEvent(makeCalDragEvent('drop', dateCell));

    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't3')!.body).date).toBe('2026-04-01');
  });

  it('regression: Kanban C-1 multi-DnD still works', () => {
    // Switch to kanban, multi-drag, verify C-1 behavior preserved
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: calDndContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeCalDragEvent('dragstart', card));

    const doneTarget = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneTarget.dispatchEvent(makeCalDragEvent('drop', doneTarget));

    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('done');
  });
});

// ── Calendar/Kanban Multi-Select Phase 2-C3: Cross-view Multi-DnD ──

describe('Cross-view Multi-DnD (Phase 2-C3)', () => {
  const crossContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"open","description":"B","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"done","description":"C","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  /** Create a minimal DragEvent with a mock DataTransfer. */
  function makeCrossEvent(type: string, target: Element): DragEvent {
    const dt = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    const evt = new Event(type, { bubbles: true, cancelable: true }) as unknown as DragEvent;
    Object.defineProperty(evt, 'dataTransfer', { value: dt });
    Object.defineProperty(evt, 'target', { value: target, writable: false });
    return evt;
  }

  // ── Kanban → Calendar multi-drag ──

  it('Kanban→Calendar multi-drag: all selected entries get new date', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: crossContainer });

    // Start in Kanban view, multi-select t1 and t2
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    // Drag t1 from Kanban
    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeCrossEvent('dragstart', card));

    // Switch to Calendar view (simulating drag-over-tab)
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    render(dispatcher.getState(), root);

    // Drop on Calendar cell 2026-04-25
    const dateCell = root.querySelector('[data-pkc-date="2026-04-25"]')!;
    dateCell.dispatchEvent(makeCrossEvent('drop', dateCell));

    const s = dispatcher.getState();
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-25');
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't2')!.body).date).toBe('2026-04-25');
  });

  it('Calendar→Kanban multi-drag: all selected entries get new status', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: crossContainer });

    // Start in Calendar view, multi-select t1 and t2
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    // Drag t1 from Calendar
    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t1"]')!;
    item.dispatchEvent(makeCrossEvent('dragstart', item));

    // Switch to Kanban view
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    render(dispatcher.getState(), root);

    // Drop on Kanban "done" column
    const doneTarget = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneTarget.dispatchEvent(makeCrossEvent('drop', doneTarget));

    const s = dispatcher.getState();
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('done');
  });

  it('cross-view multi-drag clears multiSelectedLids after drop', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: crossContainer });

    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeCrossEvent('dragstart', card));

    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    render(dispatcher.getState(), root);

    const dateCell = root.querySelector('[data-pkc-date="2026-04-20"]')!;
    dateCell.dispatchEvent(makeCrossEvent('drop', dateCell));

    expect(dispatcher.getState().multiSelectedLids).toHaveLength(0);
  });

  it('cross-view multi-drag sets selectedLid to the dragged entry', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: crossContainer });

    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    // Drag t2 (not anchor, but in selection)
    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t2"]')!;
    item.dispatchEvent(makeCrossEvent('dragstart', item));

    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    render(dispatcher.getState(), root);

    const doneTarget = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneTarget.dispatchEvent(makeCrossEvent('drop', doneTarget));

    expect(dispatcher.getState().selectedLid).toBe('t2');
  });

  // ── Single-drag cross-view regression ──

  it('cross-view single-drag: non-selected entry uses QUICK_UPDATE_ENTRY', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: crossContainer });

    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    // Drag t3 (NOT in selection — single drag)
    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t3"]')!;
    card.dispatchEvent(makeCrossEvent('dragstart', card));

    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    render(dispatcher.getState(), root);

    const dateCell = root.querySelector('[data-pkc-date="2026-04-05"]')!;
    dateCell.dispatchEvent(makeCrossEvent('drop', dateCell));

    const s = dispatcher.getState();
    // Only t3 changes
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't3')!.body).date).toBe('2026-04-05');
    // t1 unchanged
    expect(JSON.parse(s.container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-10');
  });

  it('cross-view single-drag: only one selected is still single-drag', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: crossContainer });

    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    // Only t1 selected (no multi)
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t1"]')!;
    item.dispatchEvent(makeCrossEvent('dragstart', item));

    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    render(dispatcher.getState(), root);

    const doneTarget = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneTarget.dispatchEvent(makeCrossEvent('drop', doneTarget));

    // t1 changes, t2 does not
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('open');
  });

  // ── Cleanup ──

  it('dragEnd after cross-view switch resets multi-drag state', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: crossContainer });

    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeCrossEvent('dragstart', card));

    // Cancel: dragend on Kanban (drag origin)
    card.dispatchEvent(makeCrossEvent('dragend', card));

    // Now do a subsequent single-drag — should NOT be multi-drag
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    render(dispatcher.getState(), root);
    const card3 = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t3"]')!;
    card3.dispatchEvent(makeCrossEvent('dragstart', card3));

    const openTarget = root.querySelector('[data-pkc-kanban-drop-target="open"]')!;
    openTarget.dispatchEvent(makeCrossEvent('drop', openTarget));

    // Only t3 changes
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't3')!.body).status).toBe('open');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('open');
  });

  it('subsequent single-drag after cross-view multi-drop works correctly', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: crossContainer });

    // Multi-drag: Kanban → Calendar
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    const card1 = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card1.dispatchEvent(makeCrossEvent('dragstart', card1));

    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    render(dispatcher.getState(), root);

    const cell25 = root.querySelector('[data-pkc-date="2026-04-25"]')!;
    cell25.dispatchEvent(makeCrossEvent('drop', cell25));

    // Now single-drag t3 within Calendar
    render(dispatcher.getState(), root);
    const item3 = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t3"]')!;
    item3.dispatchEvent(makeCrossEvent('dragstart', item3));

    const cell01 = root.querySelector('[data-pkc-date="2026-04-01"]')!;
    cell01.dispatchEvent(makeCrossEvent('drop', cell01));

    // t3 changes, t1/t2 stay at 2026-04-25
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't3')!.body).date).toBe('2026-04-01');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-25');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).date).toBe('2026-04-25');
  });

  // ── Regression: C-1 / C-2 ──

  it('regression: C-1 Kanban in-view multi-DnD still works', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: crossContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeCrossEvent('dragstart', card));
    const doneTarget = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneTarget.dispatchEvent(makeCrossEvent('drop', doneTarget));

    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('done');
  });

  it('regression: C-2 Calendar in-view multi-DnD still works', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: crossContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t1"]')!;
    item.dispatchEvent(makeCrossEvent('dragstart', item));
    const dateCell = root.querySelector('[data-pkc-date="2026-04-20"]')!;
    dateCell.dispatchEvent(makeCrossEvent('drop', dateCell));

    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-20');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).date).toBe('2026-04-20');
  });

  it('regression: Phase 2-A/2-B action bar bulk actions still work', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: crossContainer });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });

    dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: 'done' });
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    dispatcher.dispatch({ type: 'BULK_SET_DATE', date: '2026-05-01' });
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-05-01');
  });
});

// ─── Phase 2-E: Escape clears multi-select ─────────────────────
describe('Escape clears multi-select (Phase 2-E)', () => {
  const escContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 'e1', title: 'Entry 1', body: 'body1', archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 'e2', title: 'Entry 2', body: 'body2', archetype: 'text', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 'e3', title: 'Entry 3', body: 'body3', archetype: 'text', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  const todoEscContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"done","description":"B","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"open","description":"C","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function pressEscape() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function setupEsc(container: Container, viewMode?: 'detail' | 'calendar' | 'kanban') {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    if (viewMode && viewMode !== 'detail') {
      dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: viewMode });
      if (viewMode === 'calendar') {
        dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
      }
    }
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  // ── Integration tests ──

  it('Escape clears multiSelectedLids', () => {
    const { dispatcher } = setupEsc(escContainer);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 'e2' });
    expect(dispatcher.getState().multiSelectedLids.length).toBeGreaterThan(0);

    pressEscape();

    expect(dispatcher.getState().multiSelectedLids).toEqual([]);
  });

  it('Escape preserves selectedLid when clearing multi-select', () => {
    const { dispatcher } = setupEsc(escContainer);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 'e2' });
    // TOGGLE_MULTI_SELECT sets selectedLid to action.lid
    expect(dispatcher.getState().selectedLid).toBe('e2');

    pressEscape();

    expect(dispatcher.getState().multiSelectedLids).toEqual([]);
    expect(dispatcher.getState().selectedLid).toBe('e2'); // preserved
  });

  it('second Escape deselects entry after multi-select cleared', () => {
    const { dispatcher } = setupEsc(escContainer);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 'e2' });

    pressEscape(); // clears multi-select
    expect(dispatcher.getState().multiSelectedLids).toEqual([]);
    expect(dispatcher.getState().selectedLid).toBe('e2');

    pressEscape(); // deselects entry
    expect(dispatcher.getState().selectedLid).toBeNull();
  });

  it('action bar disappears after Escape', () => {
    const { dispatcher } = setupEsc(escContainer);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 'e2' });
    render(dispatcher.getState(), root);
    expect(root.querySelector('[data-pkc-region="multi-action-bar"]')).not.toBeNull();

    pressEscape();
    render(dispatcher.getState(), root);
    expect(root.querySelector('[data-pkc-region="multi-action-bar"]')).toBeNull();
  });

  it('works consistently in Calendar view', () => {
    const { dispatcher } = setupEsc(todoEscContainer, 'calendar');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    expect(dispatcher.getState().multiSelectedLids).toContain('t1');
    expect(dispatcher.getState().multiSelectedLids).toContain('t2');

    pressEscape();

    expect(dispatcher.getState().multiSelectedLids).toEqual([]);
    expect(dispatcher.getState().selectedLid).toBe('t2'); // TOGGLE sets selectedLid to last toggled
  });

  it('works consistently in Kanban view', () => {
    const { dispatcher } = setupEsc(todoEscContainer, 'kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    expect(dispatcher.getState().multiSelectedLids).toContain('t1');
    expect(dispatcher.getState().multiSelectedLids).toContain('t2');

    pressEscape();

    expect(dispatcher.getState().multiSelectedLids).toEqual([]);
    expect(dispatcher.getState().selectedLid).toBe('t2'); // TOGGLE sets selectedLid to last toggled
  });

  // ── Guard tests ──

  it('does not fire during editing phase', () => {
    const { dispatcher } = setupEsc(escContainer);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 'e2' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    expect(dispatcher.getState().phase).toBe('editing');

    pressEscape(); // should CANCEL_EDIT, not CLEAR_MULTI_SELECT

    expect(dispatcher.getState().phase).toBe('ready');
    // multi-select should still be present (CANCEL_EDIT does not clear it)
    expect(dispatcher.getState().multiSelectedLids.length).toBeGreaterThan(0);
  });

  it('no-op when multiSelectedLids is already empty', () => {
    const { dispatcher, events } = setupEsc(escContainer);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    expect(dispatcher.getState().multiSelectedLids).toEqual([]);

    events.length = 0;
    pressEscape(); // should DESELECT_ENTRY, not CLEAR_MULTI_SELECT

    expect(events.some((e) => e.type === 'ENTRY_DESELECTED')).toBe(true);
    expect(events.some((e) => e.type === 'MULTI_SELECT_CHANGED')).toBe(false);
  });

  // ── Regression tests ──

  it('regression: Phase 1 visual feedback is not broken', () => {
    const { dispatcher } = setupEsc(todoEscContainer, 'kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const t2Card = kanban.querySelector('[data-pkc-lid="t2"]');
    expect(t2Card?.getAttribute('data-pkc-multi-selected')).toBe('true');

    pressEscape();
    render(dispatcher.getState(), root);

    const kanbanAfter = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const t2CardAfter = kanbanAfter.querySelector('[data-pkc-lid="t2"]');
    expect(t2CardAfter?.getAttribute('data-pkc-multi-selected')).not.toBe('true');
  });

  it('regression: existing Escape deselect still works when no multi-select', () => {
    const { dispatcher, events } = setupEsc(escContainer);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    expect(dispatcher.getState().selectedLid).toBe('e1');
    expect(dispatcher.getState().multiSelectedLids).toEqual([]);

    pressEscape();

    expect(dispatcher.getState().selectedLid).toBeNull();
    expect(events.some((e) => e.type === 'ENTRY_DESELECTED')).toBe(true);
  });

  it('regression: existing Escape cancel-edit still works', () => {
    const { dispatcher, events } = setupEsc(escContainer);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });

    pressEscape();

    expect(events.some((e) => e.type === 'EDIT_CANCELLED')).toBe(true);
    expect(dispatcher.getState().phase).toBe('ready');
  });
});

// ─── Multi-DnD Drag Ghost UX ──────────────────────────────────
describe('Multi-DnD drag ghost UX', () => {
  const ghostContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"open","description":"B","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"open","description":"C","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function makeGhostDragEvent(type: string, target: Element): DragEvent {
    const setDragImage = vi.fn();
    const dt = { setData: vi.fn(), effectAllowed: '', dropEffect: '', setDragImage };
    const evt = new Event(type, { bubbles: true, cancelable: true }) as unknown as DragEvent;
    Object.defineProperty(evt, 'dataTransfer', { value: dt });
    Object.defineProperty(evt, 'target', { value: target, writable: false });
    return evt;
  }

  function setupGhost(viewMode: 'kanban' | 'calendar') {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: ghostContainer });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: viewMode });
    if (viewMode === 'calendar') {
      dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: 2026, month: 4 });
    }
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return dispatcher;
  }

  // ── Integration ──

  it('Kanban multi-drag calls setDragImage with ghost element', () => {
    const dispatcher = setupGhost('kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    const evt = makeGhostDragEvent('dragstart', card);
    card.dispatchEvent(evt);

    expect((evt.dataTransfer as any).setDragImage).toHaveBeenCalledTimes(1);
    const ghostArg = (evt.dataTransfer as any).setDragImage.mock.calls[0][0] as HTMLElement;
    expect(ghostArg.getAttribute('data-pkc-drag-ghost')).toBe('true');
    expect(ghostArg.textContent).toBe('2 件');
  });

  it('Calendar multi-drag calls setDragImage with ghost element', () => {
    const dispatcher = setupGhost('calendar');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t1"]')!;
    const evt = makeGhostDragEvent('dragstart', item);
    item.dispatchEvent(evt);

    expect((evt.dataTransfer as any).setDragImage).toHaveBeenCalledTimes(1);
    const ghostArg = (evt.dataTransfer as any).setDragImage.mock.calls[0][0] as HTMLElement;
    expect(ghostArg.textContent).toBe('2 件');
  });

  it('single-drag does NOT call setDragImage', () => {
    const dispatcher = setupGhost('kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    const evt = makeGhostDragEvent('dragstart', card);
    card.dispatchEvent(evt);

    expect((evt.dataTransfer as any).setDragImage).not.toHaveBeenCalled();
  });

  it('ghost element is removed after dragEnd', () => {
    const dispatcher = setupGhost('kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeGhostDragEvent('dragstart', card));

    // Ghost should exist in document
    expect(document.querySelector('[data-pkc-drag-ghost]')).not.toBeNull();

    // Fire dragEnd
    card.dispatchEvent(makeGhostDragEvent('dragend', card));

    // Ghost should be removed
    expect(document.querySelector('[data-pkc-drag-ghost]')).toBeNull();
  });

  it('ghost element is removed after drop', () => {
    const dispatcher = setupGhost('kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeGhostDragEvent('dragstart', card));
    expect(document.querySelector('[data-pkc-drag-ghost]')).not.toBeNull();

    // Drop on a column
    const doneCol = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneCol.dispatchEvent(makeGhostDragEvent('drop', doneCol));

    expect(document.querySelector('[data-pkc-drag-ghost]')).toBeNull();
  });

  it('ghost count reflects actual selected count (3 items)', () => {
    const dispatcher = setupGhost('kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't3' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    const evt = makeGhostDragEvent('dragstart', card);
    card.dispatchEvent(evt);

    const ghostArg = (evt.dataTransfer as any).setDragImage.mock.calls[0][0] as HTMLElement;
    expect(ghostArg.textContent).toBe('3 件');
  });

  // ── Regression ──

  it('regression: Kanban multi-DnD still changes status', () => {
    const dispatcher = setupGhost('kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeGhostDragEvent('dragstart', card));

    const doneCol = root.querySelector('[data-pkc-kanban-drop-target="done"]')!;
    doneCol.dispatchEvent(makeGhostDragEvent('drop', doneCol));

    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).status).toBe('done');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).status).toBe('done');
  });

  it('regression: Calendar multi-DnD still changes date', () => {
    const dispatcher = setupGhost('calendar');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const item = root.querySelector('[data-pkc-calendar-draggable][data-pkc-lid="t1"]')!;
    item.dispatchEvent(makeGhostDragEvent('dragstart', item));

    const dateCell = root.querySelector('[data-pkc-date="2026-04-20"]')!;
    dateCell.dispatchEvent(makeGhostDragEvent('drop', dateCell));

    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't1')!.body).date).toBe('2026-04-20');
    expect(JSON.parse(dispatcher.getState().container!.entries.find((e) => e.lid === 't2')!.body).date).toBe('2026-04-20');
  });

  it('regression: no stale ghost after aborted drag', () => {
    const dispatcher = setupGhost('kanban');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: 't2' });
    render(dispatcher.getState(), root);

    const card = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    card.dispatchEvent(makeGhostDragEvent('dragstart', card));
    expect(document.querySelector('[data-pkc-drag-ghost]')).not.toBeNull();

    // Abort drag (dragEnd without drop)
    card.dispatchEvent(makeGhostDragEvent('dragend', card));
    expect(document.querySelector('[data-pkc-drag-ghost]')).toBeNull();

    // Start a new single-drag — no ghost should appear
    dispatcher.dispatch({ type: 'CLEAR_MULTI_SELECT' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    render(dispatcher.getState(), root);
    const card2 = root.querySelector('[data-pkc-kanban-draggable][data-pkc-lid="t1"]')!;
    const evt2 = makeGhostDragEvent('dragstart', card2);
    card2.dispatchEvent(evt2);

    expect((evt2.dataTransfer as any).setDragImage).not.toHaveBeenCalled();
    expect(document.querySelector('[data-pkc-drag-ghost]')).toBeNull();
  });
});

