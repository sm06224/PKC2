/**
 * @vitest-environment happy-dom
 *
 * Tier 2-2: bulk restore UI.
 *
 * The feature is UI-only — no new reducer action was introduced.
 * When a BULK_* operation tags its pre-mutation snapshots with a
 * shared `bulk_id`, the renderer surfaces a "Revert bulk (N)" /
 * "Restore bulk (N)" affordance. Clicking it resolves the group via
 * `getRevisionsByBulkId` and dispatches one `RESTORE_ENTRY` per
 * revision through the existing single-entry path.
 *
 * This file pins:
 *   - renderer: meta pane shows the bulk button exactly when the
 *     latest revision has a bulk_id AND the group has size > 1
 *   - renderer: trash panel groups deleted entries sharing a
 *     bulk_id and shows the affordance on the FIRST item of the
 *     group (de-duplicated)
 *   - action-binder: click → confirm → N dispatches of RESTORE_ENTRY
 *   - action-binder: cancel → zero dispatches
 *   - end-to-end: BULK_SET_STATUS → bulk revert → all reverted
 *   - end-to-end: BULK_DELETE → bulk restore → all re-created
 *   - partial-success: stale revision in bulk is silently skipped
 *   - regression guard: single RESTORE_ENTRY path untouched
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { createInitialState } from '@adapter/state/app-state';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { todoPresenter } from '@adapter/ui/todo-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import { serializeTodoBody } from '@features/todo/todo-body';
import type { Container } from '@core/model/container';

registerPresenter('todo', todoPresenter);
registerPresenter('textlog', textlogPresenter);

const T = '2026-04-14T00:00:00Z';

function todoEntry(lid: string, title: string, status: 'open' | 'done'): Container['entries'][number] {
  return {
    lid, title, archetype: 'todo',
    body: serializeTodoBody({ status, description: '', date: '2026-04-20' }),
    created_at: T, updated_at: T,
  };
}

/** Build a container where three todos were just toggled from open
 *  to done via BULK_SET_STATUS. The three pre-bulk revisions share
 *  the same `bulk_id`. */
function containerWithBulkStatusHistory(): Container {
  return {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      todoEntry('t1', 'Task 1', 'done'),
      todoEntry('t2', 'Task 2', 'done'),
      todoEntry('t3', 'Task 3', 'done'),
    ],
    relations: [],
    revisions: [
      {
        id: 'r-t1', entry_lid: 't1',
        snapshot: JSON.stringify(todoEntry('t1', 'Task 1', 'open')),
        created_at: '2026-04-14T09:00:00Z', bulk_id: 'bulk-abc',
      },
      {
        id: 'r-t2', entry_lid: 't2',
        snapshot: JSON.stringify(todoEntry('t2', 'Task 2', 'open')),
        created_at: '2026-04-14T09:00:00Z', bulk_id: 'bulk-abc',
      },
      {
        id: 'r-t3', entry_lid: 't3',
        snapshot: JSON.stringify(todoEntry('t3', 'Task 3', 'open')),
        created_at: '2026-04-14T09:00:00Z', bulk_id: 'bulk-abc',
      },
    ],
    assets: {},
  };
}

/** Build a container where three todos were bulk-deleted. Their
 *  final revisions all share a bulk_id; the entries themselves are
 *  gone (soft-deleted via revision-only retention).
 *
 *  NB: one "survivor" text entry remains. The trash panel is
 *  rendered under a conditional that requires `entries.length > 0`
 *  (pre-existing UX quirk — fully-empty containers currently hide
 *  the sidebar tail, including the trash panel). We keep a single
 *  unrelated entry so the test exercises the real render path the
 *  production code takes after any bulk-delete that leaves at
 *  least one entry behind. */
function containerWithBulkDeleteHistory(): Container {
  return {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      {
        lid: 'survivor', title: 'Survivor', body: 'still here',
        archetype: 'text', created_at: T, updated_at: T,
      },
    ],
    relations: [],
    revisions: [
      {
        id: 'd-t1', entry_lid: 't1',
        snapshot: JSON.stringify(todoEntry('t1', 'Deleted 1', 'open')),
        created_at: '2026-04-14T08:00:00Z', bulk_id: 'bulk-del',
      },
      {
        id: 'd-t2', entry_lid: 't2',
        snapshot: JSON.stringify(todoEntry('t2', 'Deleted 2', 'open')),
        created_at: '2026-04-14T08:00:00Z', bulk_id: 'bulk-del',
      },
      {
        id: 'd-t3', entry_lid: 't3',
        snapshot: JSON.stringify(todoEntry('t3', 'Deleted 3', 'open')),
        created_at: '2026-04-14T08:00:00Z', bulk_id: 'bulk-del',
      },
    ],
    assets: {},
  };
}

function baseAppState(
  container: Container,
  overrides: Partial<import('@adapter/state/app-state').AppState> = {},
): import('@adapter/state/app-state').AppState {
  return {
    ...createInitialState(),
    phase: 'ready',
    container,
    ...overrides,
  };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
});

// ════════════════════════════════════════════════════════════════════
// Renderer: meta pane
// ════════════════════════════════════════════════════════════════════

describe('renderer — meta pane bulk restore', () => {
  it('shows "Revert bulk (N)" when the selected entry\'s latest revision has a bulk_id and the group size > 1', () => {
    const state = baseAppState(containerWithBulkStatusHistory(), { selectedLid: 't1' });
    render(state, root);
    const btn = root.querySelector('[data-pkc-region="revision-info"] [data-pkc-action="restore-bulk"]');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-pkc-bulk-id')).toBe('bulk-abc');
    expect(btn!.getAttribute('data-pkc-bulk-size')).toBe('3');
    expect(btn!.textContent).toContain('3');
  });

  it('does NOT show the bulk button when the latest revision has no bulk_id', () => {
    const c = containerWithBulkStatusHistory();
    // Strip bulk_id from all revisions.
    c.revisions = c.revisions.map((r) => ({ ...r, bulk_id: undefined }));
    const state = baseAppState(c, { selectedLid: 't1' });
    render(state, root);
    const btn = root.querySelector('[data-pkc-region="revision-info"] [data-pkc-action="restore-bulk"]');
    expect(btn).toBeNull();
    // The single Revert button is still there.
    expect(root.querySelector('[data-pkc-region="revision-info"] [data-pkc-action="restore-entry"]')).not.toBeNull();
  });

  it('does NOT show the bulk button when the group has size 1', () => {
    const c = containerWithBulkStatusHistory();
    // Keep only one revision in the bulk group.
    c.revisions = [c.revisions[0]!];
    c.entries = [c.entries[0]!];
    const state = baseAppState(c, { selectedLid: 't1' });
    render(state, root);
    const btn = root.querySelector('[data-pkc-region="revision-info"] [data-pkc-action="restore-bulk"]');
    expect(btn).toBeNull();
    // Single Revert still present.
    expect(root.querySelector('[data-pkc-region="revision-info"] [data-pkc-action="restore-entry"]')).not.toBeNull();
  });

  it('does NOT show the bulk button in readonly mode (canEdit is false)', () => {
    const state = baseAppState(containerWithBulkStatusHistory(), {
      selectedLid: 't1', readonly: true,
    });
    render(state, root);
    // The single Revert is already suppressed for readonly; the bulk
    // button sits under the same `canEdit && latest` guard.
    expect(root.querySelector('[data-pkc-region="revision-info"] [data-pkc-action="restore-bulk"]')).toBeNull();
    expect(root.querySelector('[data-pkc-region="revision-info"] [data-pkc-action="restore-entry"]')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════
// Renderer: trash panel
// ════════════════════════════════════════════════════════════════════

describe('renderer — trash panel bulk restore', () => {
  it('shows "Restore bulk (N)" on the FIRST item of a bulk-deleted group', () => {
    const state = baseAppState(containerWithBulkDeleteHistory());
    render(state, root);
    // eslint-disable-next-line no-console
    const bulkBtns = root.querySelectorAll(
      '[data-pkc-region="restore-candidates"] [data-pkc-action="restore-bulk"]',
    );
    // Exactly one bulk button across the three grouped items
    // (de-duplicated — subsequent items in the same group skip it).
    expect(bulkBtns.length).toBe(1);
    expect(bulkBtns[0]!.getAttribute('data-pkc-bulk-id')).toBe('bulk-del');
    expect(bulkBtns[0]!.getAttribute('data-pkc-bulk-size')).toBe('3');
    // Individual per-item Restore buttons still render for each entry.
    const perItemBtns = root.querySelectorAll(
      '[data-pkc-region="restore-candidates"] [data-pkc-action="restore-entry"]',
    );
    expect(perItemBtns.length).toBe(3);
  });

  it('does NOT show the bulk button when a single deleted entry has a bulk_id by itself (group size 1)', () => {
    const c = containerWithBulkDeleteHistory();
    c.revisions = [c.revisions[0]!]; // only one of the three
    const state = baseAppState(c);
    render(state, root);
    const bulkBtns = root.querySelectorAll(
      '[data-pkc-region="restore-candidates"] [data-pkc-action="restore-bulk"]',
    );
    expect(bulkBtns.length).toBe(0);
  });

  it('does NOT show the bulk button for deleted entries that have no bulk_id', () => {
    const c = containerWithBulkDeleteHistory();
    c.revisions = c.revisions.map((r) => ({ ...r, bulk_id: undefined }));
    const state = baseAppState(c);
    render(state, root);
    const bulkBtns = root.querySelectorAll(
      '[data-pkc-region="restore-candidates"] [data-pkc-action="restore-bulk"]',
    );
    expect(bulkBtns.length).toBe(0);
    // Individual Restore still present.
    const perItemBtns = root.querySelectorAll(
      '[data-pkc-region="restore-candidates"] [data-pkc-action="restore-entry"]',
    );
    expect(perItemBtns.length).toBe(3);
  });

  it('does NOT show bulk buttons in readonly mode (trash buttons suppressed)', () => {
    const state = baseAppState(containerWithBulkDeleteHistory(), { readonly: true });
    render(state, root);
    const bulkBtns = root.querySelectorAll(
      '[data-pkc-region="restore-candidates"] [data-pkc-action="restore-bulk"]',
    );
    expect(bulkBtns.length).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// Action-binder: click handler
// ════════════════════════════════════════════════════════════════════

describe('action-binder — restore-bulk handler', () => {
  let dispatched: Array<{ type: string }>;
  let unbind: (() => void) | undefined;
  let dispatcher: ReturnType<typeof createDispatcher>;

  beforeEach(() => {
    dispatched = [];
  });

  afterEach(() => {
    unbind?.();
    unbind = undefined;
    vi.restoreAllMocks();
  });

  function bootstrap(container: Container, selectedLid: string | null = null) {
    dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    if (selectedLid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectedLid });
    // Intercept dispatches — wrap the original dispatch so we can
    // both record and forward.
    const origDispatch = dispatcher.dispatch.bind(dispatcher);
    dispatcher.dispatch = ((action: Parameters<typeof origDispatch>[0]) => {
      dispatched.push(action as { type: string });
      return origDispatch(action);
    }) as typeof origDispatch;
    dispatcher.onState((s) => render(s, root));
    render(dispatcher.getState(), root);
    unbind = bindActions(root, dispatcher);
  }

  it('dispatches RESTORE_ENTRY for every revision in the bulk group after confirm', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    bootstrap(containerWithBulkStatusHistory(), 't1');
    // Trigger click on the Revert bulk button
    const btn = root.querySelector(
      '[data-pkc-region="revision-info"] [data-pkc-action="restore-bulk"]',
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    dispatched.length = 0; // clear bootstrap dispatches
    btn!.click();
    // Three RESTORE_ENTRY dispatches — one per revision in bulk-abc.
    const restores = dispatched.filter((d) => d.type === 'RESTORE_ENTRY');
    expect(restores.length).toBe(3);
    const lids = new Set((restores as unknown as Array<{ lid: string }>).map((r) => r.lid));
    expect(lids).toEqual(new Set(['t1', 't2', 't3']));
  });

  it('dispatches nothing when the user cancels the confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    bootstrap(containerWithBulkStatusHistory(), 't1');
    const btn = root.querySelector(
      '[data-pkc-region="revision-info"] [data-pkc-action="restore-bulk"]',
    ) as HTMLButtonElement | null;
    dispatched.length = 0;
    btn!.click();
    const restores = dispatched.filter((d) => d.type === 'RESTORE_ENTRY');
    expect(restores.length).toBe(0);
  });

  it('single restore-entry path is unchanged (no extra dispatches when clicking Revert)', () => {
    bootstrap(containerWithBulkStatusHistory(), 't1');
    const btn = root.querySelector(
      '[data-pkc-region="revision-info"] [data-pkc-action="restore-entry"]',
    ) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    dispatched.length = 0;
    btn!.click();
    // Exactly one RESTORE_ENTRY dispatch.
    const restores = dispatched.filter((d) => d.type === 'RESTORE_ENTRY');
    expect(restores.length).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════
// Integration: end-to-end bulk flows
// ════════════════════════════════════════════════════════════════════

describe('integration — bulk restore reverts all entries', () => {
  let unbind: (() => void) | undefined;
  afterEach(() => {
    unbind?.();
    unbind = undefined;
    vi.restoreAllMocks();
  });

  it('BULK_SET_STATUS → Revert bulk → all entries return to pre-bulk status', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: containerWithBulkStatusHistory() });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.onState((s) => render(s, root));
    render(dispatcher.getState(), root);
    unbind = bindActions(root, dispatcher);

    // Sanity: all three todos are currently 'done'.
    for (const lid of ['t1', 't2', 't3']) {
      const entry = dispatcher.getState().container!.entries.find((e) => e.lid === lid);
      const parsed = JSON.parse(entry!.body);
      expect(parsed.status).toBe('done');
    }

    // Click the bulk restore button.
    const btn = root.querySelector(
      '[data-pkc-region="revision-info"] [data-pkc-action="restore-bulk"]',
    ) as HTMLButtonElement;
    btn.click();

    // All three entries restored to 'open'.
    for (const lid of ['t1', 't2', 't3']) {
      const entry = dispatcher.getState().container!.entries.find((e) => e.lid === lid);
      const parsed = JSON.parse(entry!.body);
      expect(parsed.status).toBe('open');
    }
  });

  it('BULK_DELETE → Restore bulk → all entries re-created', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: containerWithBulkDeleteHistory() });
    dispatcher.onState((s) => render(s, root));
    render(dispatcher.getState(), root);
    unbind = bindActions(root, dispatcher);

    // Sanity: only the survivor is live — t1/t2/t3 are deleted.
    const initialLids = new Set(dispatcher.getState().container!.entries.map((e) => e.lid));
    expect(initialLids).toEqual(new Set(['survivor']));

    // Open the trash <details> so the bulk button is in the DOM.
    const det = root.querySelector('[data-pkc-region="restore-candidates"]') as HTMLDetailsElement;
    det.open = true;
    // Click the bulk restore button.
    const btn = det.querySelector('[data-pkc-action="restore-bulk"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();

    const lids = new Set(dispatcher.getState().container!.entries.map((e) => e.lid));
    expect(lids).toEqual(new Set(['survivor', 't1', 't2', 't3']));
  });

  it('partial-success: stale revision in the bulk group is silently skipped', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const c = containerWithBulkStatusHistory();
    // Mangle one revision so parseRevisionSnapshot rejects it —
    // RESTORE_ENTRY will silently no-op for that lid.
    c.revisions[1] = { ...c.revisions[1]!, snapshot: '{not: valid json' };
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 't1' });
    dispatcher.onState((s) => render(s, root));
    render(dispatcher.getState(), root);
    unbind = bindActions(root, dispatcher);

    const btn = root.querySelector(
      '[data-pkc-region="revision-info"] [data-pkc-action="restore-bulk"]',
    ) as HTMLButtonElement;
    btn.click();

    // t1 and t3 restored to open, t2 stays done (stale rev skipped).
    const status = (lid: string) => {
      const entry = dispatcher.getState().container!.entries.find((e) => e.lid === lid)!;
      return JSON.parse(entry.body).status;
    };
    expect(status('t1')).toBe('open');
    expect(status('t2')).toBe('done'); // untouched
    expect(status('t3')).toBe('open');
  });
});
