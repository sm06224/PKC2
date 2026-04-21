/**
 * @vitest-environment happy-dom
 *
 * Recent Entries Pane v1 — E2E click behavior.
 * Spec: docs/development/recent-entries-pane-v1.md §4
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

const mockContainer: Container = {
  meta: {
    container_id: 'recent-e2e',
    title: 'Recent E2E',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'older',
      title: 'Older',
      body: 'body',
      archetype: 'text',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      lid: 'newer',
      title: 'Newer',
      body: 'body',
      archetype: 'text',
      created_at: '2026-04-20T00:00:00Z',
      updated_at: '2026-04-20T00:00:00Z',
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: () => void;

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

function setup() {
  const dispatcher = createDispatcher();
  const events: DomainEvent[] = [];
  dispatcher.onEvent((e) => events.push(e));
  dispatcher.onState((state) => render(state, root));

  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);

  return { dispatcher, events };
}

function paneItem(lid: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(
    `[data-pkc-region="recent-entries"] [data-pkc-action="select-recent-entry"][data-pkc-lid="${lid}"]`,
  );
  if (!el) throw new Error(`recent-entries item for lid=${lid} not found`);
  return el;
}

describe('Recent Entries Pane v1 — click behavior (§4)', () => {
  it('single click dispatches SELECT_ENTRY for the clicked lid', () => {
    const { dispatcher, events } = setup();

    paneItem('older').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

    expect(dispatcher.getState().selectedLid).toBe('older');
    expect(events.some((e) => e.type === 'ENTRY_SELECTED')).toBe(true);
  });

  it('single click from non-detail view also dispatches SET_VIEW_MODE to detail', () => {
    const { dispatcher } = setup();
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    render(dispatcher.getState(), root);

    paneItem('newer').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

    expect(dispatcher.getState().viewMode).toBe('detail');
    expect(dispatcher.getState().selectedLid).toBe('newer');
  });

  it('double click (detail >= 2) routes through handleDblClickAction (opens entry window)', () => {
    // `handleDblClickAction` opens the entry in a separate browser
    // window via `window.open`, so observing the `open` call is the
    // most direct evidence that the dblclick branch ran.
    const childDoc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const childWin = { document: childDoc, closed: false } as unknown as Window;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(childWin);
    try {
      const { dispatcher } = setup();

      paneItem('newer').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));

      expect(openSpy).toHaveBeenCalled();
      // Dblclick also selects the lid before opening the window.
      expect(dispatcher.getState().selectedLid).toBe('newer');
    } finally {
      openSpy.mockRestore();
    }
  });

  it('ctrl/meta click does NOT start multi-select from the pane', () => {
    const { dispatcher } = setup();

    paneItem('older').dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1, ctrlKey: true }),
    );

    expect(dispatcher.getState().selectedLid).toBe('older');
    expect(dispatcher.getState().multiSelectedLids).toEqual([]);
  });

  it('shift click does NOT start range-select from the pane', () => {
    const { dispatcher } = setup();

    paneItem('newer').dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1, shiftKey: true }),
    );

    expect(dispatcher.getState().selectedLid).toBe('newer');
    expect(dispatcher.getState().multiSelectedLids).toEqual([]);
  });
});
