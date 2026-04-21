/**
 * @vitest-environment happy-dom
 *
 * C-2 v1 (2026-04-17) UI slice tests: manual mode sidebar ordering
 * + Move up / Move down buttons.
 *
 * Scope mirrors contract §4.2 + §6.2 / I-Order3 / I-Order-View:
 * - Manual-mode sidebar reflects `entry_order` (flat + tree).
 * - Non-manual mode unchanged (temporal / title sort).
 * - Move up/down buttons appear only for the selected entry under
 *   manual + detail + !readonly + no import preview.
 * - Clicking Move up/down dispatches MOVE_ENTRY_UP / _DOWN.
 * - Reducer gates top/bottom edge as a no-op; UI still dispatches.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';
import type { Dispatcher } from '@adapter/state/dispatcher';
import type { Dispatchable } from '@core/action';
import type { ReduceResult } from '@adapter/state/app-state';

function mkEntry(lid: string, overrides: Partial<Entry> = {}): Entry {
  return {
    lid,
    title: lid.toUpperCase(),
    body: '',
    archetype: 'text',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mkContainer(entries: Entry[], relations: Relation[] = [], entry_order?: string[]): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
      ...(entry_order ? { entry_order } : {}),
    },
    entries,
    relations,
    revisions: [],
    assets: {},
  };
}

function readyState(overrides: Partial<AppState> & { container: Container }): AppState {
  return {
    ...createInitialState(),
    phase: 'ready',
    ...overrides,
  };
}

function sidebarLids(root: HTMLElement): string[] {
  const items = root.querySelectorAll<HTMLElement>(
    '[data-pkc-action="select-entry"][data-pkc-lid]',
  );
  return Array.from(items).map((el) => el.getAttribute('data-pkc-lid')!);
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    root.remove();
  };
});

describe('C-2 UI: sidebar list order under manual mode', () => {
  it('flat sidebar reflects entry_order in manual mode', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const container = mkContainer(entries, [], ['c', 'a', 'b']);
    const state = readyState({ container, sortKey: 'manual' });
    render(state, root);
    expect(sidebarLids(root)).toEqual(['c', 'a', 'b']);
  });

  it('unknown lids in entry_order are skipped; missing entries append at tail', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c'), mkEntry('d')];
    // 'z' dangling, 'd' missing; applyManualOrder skips 'z', appends 'd' at tail.
    const container = mkContainer(entries, [], ['z', 'c', 'a']);
    const state = readyState({ container, sortKey: 'manual' });
    render(state, root);
    expect(sidebarLids(root)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('non-manual mode is unaffected by entry_order', () => {
    const entries = [
      mkEntry('a', { updated_at: '2026-01-01T00:00:00Z' }),
      mkEntry('b', { updated_at: '2026-03-01T00:00:00Z' }),
      mkEntry('c', { updated_at: '2026-02-01T00:00:00Z' }),
    ];
    const container = mkContainer(entries, [], ['a', 'b', 'c']);
    const state = readyState({
      container,
      sortKey: 'updated_at',
      sortDirection: 'desc',
    });
    render(state, root);
    // entry_order is ignored — desc by updated_at.
    expect(sidebarLids(root)).toEqual(['b', 'c', 'a']);
  });

  it('tree children reorder to follow entry_order under manual mode', () => {
    const entries = [
      mkEntry('folder', { archetype: 'folder' }),
      mkEntry('child1'),
      mkEntry('child2'),
      mkEntry('child3'),
    ];
    const ts = '2026-01-01T00:00:00Z';
    const relations: Relation[] = [
      { id: 'r1', kind: 'structural', from: 'folder', to: 'child1', created_at: ts, updated_at: ts },
      { id: 'r2', kind: 'structural', from: 'folder', to: 'child2', created_at: ts, updated_at: ts },
      { id: 'r3', kind: 'structural', from: 'folder', to: 'child3', created_at: ts, updated_at: ts },
    ];
    // Manual override: reverse child order within folder.
    const container = mkContainer(entries, relations, [
      'folder',
      'child3',
      'child2',
      'child1',
    ]);
    const state = readyState({ container, sortKey: 'manual' });
    render(state, root);
    // Tree flattens parent → children in visual order.
    expect(sidebarLids(root)).toEqual(['folder', 'child3', 'child2', 'child1']);
  });
});

describe('C-2 UI: Move up / Move down button visibility', () => {
  it('renders Move up/down for selected entry in manual + detail + editable', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const container = mkContainer(entries, [], ['a', 'b', 'c']);
    const state = readyState({
      container,
      sortKey: 'manual',
      selectedLid: 'b',
    });
    render(state, root);
    const selected = root.querySelector<HTMLElement>('.pkc-entry-item[data-pkc-selected="true"]')!;
    expect(selected.querySelector('[data-pkc-action="move-entry-up"]')).not.toBeNull();
    expect(selected.querySelector('[data-pkc-action="move-entry-down"]')).not.toBeNull();
    // Non-selected entries have no buttons.
    const others = root.querySelectorAll('[data-pkc-action="select-entry"]:not([data-pkc-selected])');
    for (const o of Array.from(others)) {
      expect(o.querySelector('[data-pkc-action^="move-entry-"]')).toBeNull();
    }
  });

  it('no buttons under non-manual sort mode', () => {
    const entries = [mkEntry('a'), mkEntry('b')];
    const container = mkContainer(entries);
    const state = readyState({
      container,
      sortKey: 'updated_at',
      selectedLid: 'a',
    });
    render(state, root);
    expect(root.querySelector('[data-pkc-action="move-entry-up"]')).toBeNull();
    expect(root.querySelector('[data-pkc-action="move-entry-down"]')).toBeNull();
  });

  it('no buttons when readonly', () => {
    const entries = [mkEntry('a'), mkEntry('b')];
    const container = mkContainer(entries, [], ['a', 'b']);
    const state = readyState({
      container,
      sortKey: 'manual',
      selectedLid: 'a',
      readonly: true,
    });
    render(state, root);
    expect(root.querySelector('[data-pkc-action="move-entry-up"]')).toBeNull();
    expect(root.querySelector('[data-pkc-action="move-entry-down"]')).toBeNull();
  });

  it('no buttons when view mode is calendar', () => {
    const entries = [mkEntry('a'), mkEntry('b')];
    const container = mkContainer(entries, [], ['a', 'b']);
    const state = readyState({
      container,
      sortKey: 'manual',
      selectedLid: 'a',
      viewMode: 'calendar',
    });
    render(state, root);
    expect(root.querySelector('[data-pkc-action="move-entry-up"]')).toBeNull();
    expect(root.querySelector('[data-pkc-action="move-entry-down"]')).toBeNull();
  });

  it('no buttons while an import preview is active', () => {
    const entries = [mkEntry('a'), mkEntry('b')];
    const container = mkContainer(entries, [], ['a', 'b']);
    const state = readyState({
      container,
      sortKey: 'manual',
      selectedLid: 'a',
      importPreview: {
        title: 'Incoming',
        container_id: 'c2',
        entry_count: 0,
        revision_count: 0,
        schema_version: 1,
        source: 'incoming.json',
        container: mkContainer([]),
      },
    });
    render(state, root);
    expect(root.querySelector('[data-pkc-action="move-entry-up"]')).toBeNull();
    expect(root.querySelector('[data-pkc-action="move-entry-down"]')).toBeNull();
  });
});

describe('C-2 UI: Move up / Move down dispatch through action-binder', () => {
  interface FakeDispatcher extends Dispatcher {
    received: Dispatchable[];
  }

  function mkFake(): FakeDispatcher {
    const received: Dispatchable[] = [];
    const fake: FakeDispatcher = {
      received,
      dispatch(action: Dispatchable): ReduceResult {
        received.push(action);
        return { state: createInitialState(), events: [] };
      },
      getState() {
        return createInitialState();
      },
      onState() {
        return () => {};
      },
      onEvent() {
        return () => {};
      },
    };
    return fake;
  }

  it('click Move up dispatches MOVE_ENTRY_UP with the lid', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const container = mkContainer(entries, [], ['a', 'b', 'c']);
    const state = readyState({
      container,
      sortKey: 'manual',
      selectedLid: 'b',
    });
    render(state, root);
    const fake = mkFake();
    bindActions(root, fake);

    const upBtn = root.querySelector<HTMLElement>(
      '[data-pkc-action="move-entry-up"][data-pkc-lid="b"]',
    )!;
    upBtn.click();

    const dispatched = fake.received.filter(
      (a) => a.type === 'MOVE_ENTRY_UP' || a.type === 'SELECT_ENTRY',
    );
    expect(dispatched).toHaveLength(1); // no SELECT_ENTRY due to stopPropagation
    expect(dispatched[0]).toEqual({ type: 'MOVE_ENTRY_UP', lid: 'b' });
  });

  it('click Move down dispatches MOVE_ENTRY_DOWN with the lid', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const container = mkContainer(entries, [], ['a', 'b', 'c']);
    const state = readyState({
      container,
      sortKey: 'manual',
      selectedLid: 'b',
    });
    render(state, root);
    const fake = mkFake();
    bindActions(root, fake);

    const downBtn = root.querySelector<HTMLElement>(
      '[data-pkc-action="move-entry-down"][data-pkc-lid="b"]',
    )!;
    downBtn.click();

    expect(fake.received).toContainEqual({ type: 'MOVE_ENTRY_DOWN', lid: 'b' });
    expect(fake.received.some((a) => a.type === 'SELECT_ENTRY')).toBe(false);
  });
});

describe('C-2 UI: end-to-end via reducer (renderer + action-binder + reduce)', () => {
  it('Move up swaps selected entry with its previous visible sibling', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const container = mkContainer(entries, [], ['a', 'b', 'c']);
    const state = readyState({
      container,
      sortKey: 'manual',
      selectedLid: 'b',
    });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_UP', lid: 'b' });
    expect(next.container?.meta.entry_order).toEqual(['b', 'a', 'c']);
    render(next, root);
    expect(sidebarLids(root)).toEqual(['b', 'a', 'c']);
  });

  it('Move down at bottom edge is a no-op (state ref preserved)', () => {
    const entries = [mkEntry('a'), mkEntry('b'), mkEntry('c')];
    const container = mkContainer(entries, [], ['a', 'b', 'c']);
    const state = readyState({
      container,
      sortKey: 'manual',
      selectedLid: 'c',
    });
    const { state: next } = reduce(state, { type: 'MOVE_ENTRY_DOWN', lid: 'c' });
    expect(next).toBe(state);
  });
});
