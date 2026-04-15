/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

/**
 * USER_REQUEST_LEDGER S-18 (A-4 FULL, 2026-04-14) — end-to-end tests
 * for the NAVIGATE_TO_LOCATION action, the sidebar sub-location row
 * emission, and the click → dispatch wiring. Purity / DOM helpers are
 * covered separately in
 *   tests/features/search/sub-location-search.test.ts
 *   tests/adapter/location-nav.test.ts
 */

function makeContainer(): Container {
  const textBody = [
    '# Intro',
    'A quick introduction paragraph with a banana mention.',
    '',
    '## Details',
    'Here the banana reappears in the detailed section.',
  ].join('\n');
  const textlogBody = JSON.stringify({
    entries: [
      { id: 'log-A', text: 'morning shift — banana delivery on time', createdAt: '2026-04-01T09:00:00Z', flags: [] },
      { id: 'log-B', text: 'afternoon note no fruit mentioned', createdAt: '2026-04-01T14:00:00Z', flags: [] },
      { id: 'log-C', text: 'evening wrap banana report finalised', createdAt: '2026-04-01T18:00:00Z', flags: [] },
    ],
  });
  return {
    meta: {
      container_id: 's18-cid',
      title: 'S-18',
      created_at: '2026-04-01T00:00:00.000Z',
      updated_at: '2026-04-01T00:00:00.000Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'txt',
        title: 'Notes on banana ops',
        body: textBody,
        archetype: 'text',
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
      },
      {
        lid: 'tlog',
        title: 'Daily log',
        body: textlogBody,
        archetype: 'textlog',
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

// ── Reducer ─────────────────────────────────────────

describe('NAVIGATE_TO_LOCATION reducer', () => {
  it('sets selectedLid + pendingNav and emits ENTRY_SELECTED', () => {
    const base: AppState = {
      ...createInitialState(),
      phase: 'ready',
      container: makeContainer(),
    };
    const { state, events } = reduce(base, {
      type: 'NAVIGATE_TO_LOCATION',
      lid: 'txt',
      subId: 'heading:details',
      ticket: 42,
    });
    expect(state.selectedLid).toBe('txt');
    expect(state.pendingNav).toEqual({ subId: 'heading:details', ticket: 42 });
    expect(events).toEqual([{ type: 'ENTRY_SELECTED', lid: 'txt' }]);
  });

  it('is blocked when phase is not ready', () => {
    const base: AppState = {
      ...createInitialState(),
      phase: 'initializing',
      container: makeContainer(),
    };
    const { state } = reduce(base, {
      type: 'NAVIGATE_TO_LOCATION', lid: 'txt', subId: 'heading:details', ticket: 1,
    });
    // blocked → state unchanged
    expect(state.selectedLid).toBeNull();
    expect(state.pendingNav ?? null).toBeNull();
  });

  it('is blocked when container is null', () => {
    const base: AppState = { ...createInitialState(), phase: 'ready' };
    const { state } = reduce(base, {
      type: 'NAVIGATE_TO_LOCATION', lid: 'txt', subId: 'heading:details', ticket: 1,
    });
    expect(state.selectedLid).toBeNull();
    expect(state.pendingNav ?? null).toBeNull();
  });

  it('a second NAVIGATE_TO_LOCATION advances ticket (monotonic)', () => {
    const base: AppState = {
      ...createInitialState(),
      phase: 'ready',
      container: makeContainer(),
    };
    const r1 = reduce(base, {
      type: 'NAVIGATE_TO_LOCATION', lid: 'txt', subId: 'heading:intro', ticket: 1,
    });
    const r2 = reduce(r1.state, {
      type: 'NAVIGATE_TO_LOCATION', lid: 'txt', subId: 'heading:details', ticket: 2,
    });
    expect(r2.state.pendingNav).toEqual({ subId: 'heading:details', ticket: 2 });
  });
});

// ── Renderer sidebar sub-location rows ──────────────────

describe('renderer — sub-location sub-items under matching entries', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => {
    document.body.removeChild(root);
  });

  function stateWithQuery(query: string): AppState {
    return {
      ...createInitialState(),
      phase: 'ready',
      container: makeContainer(),
      searchQuery: query,
    };
  }

  it('emits one sub-location row per heading match for a TEXT entry', () => {
    render(stateWithQuery('banana'), root);
    const rows = root.querySelectorAll(
      '.pkc-entry-subloc[data-pkc-lid="txt"]',
    );
    expect(rows.length).toBe(2); // Intro + Details
    const subIds = Array.from(rows).map((r) => r.getAttribute('data-pkc-sub-id'));
    expect(subIds).toEqual(['heading:intro', 'heading:details']);
    rows.forEach((r) => {
      expect(r.getAttribute('data-pkc-action')).toBe('navigate-to-location');
    });
  });

  it('emits one sub-location row per matching log for TEXTLOG', () => {
    render(stateWithQuery('banana'), root);
    const rows = root.querySelectorAll(
      '.pkc-entry-subloc[data-pkc-lid="tlog"]',
    );
    expect(rows.length).toBe(2); // log-A + log-C
    const subIds = Array.from(rows).map((r) => r.getAttribute('data-pkc-sub-id'));
    expect(subIds).toEqual(['log:log-A', 'log:log-C']);
  });

  it('no sub-location rows when search query is empty', () => {
    render(stateWithQuery(''), root);
    expect(root.querySelectorAll('.pkc-entry-subloc').length).toBe(0);
  });

  it('sub-location row carries its kind indicator class', () => {
    render(stateWithQuery('banana'), root);
    const first = root.querySelector<HTMLElement>(
      '.pkc-entry-subloc[data-pkc-lid="txt"]',
    )!;
    expect(first.getAttribute('data-pkc-subloc-kind')).toBe('heading');
    expect(first.querySelector('.pkc-entry-subloc-label')!.textContent).toBe('Intro');
    expect(first.querySelector('.pkc-entry-subloc-snippet')!.textContent)
      .toContain('banana');
  });
});

// ── Action-binder click → dispatch ─────────────────────

describe('action-binder — navigate-to-location click dispatches NAVIGATE_TO_LOCATION', () => {
  let root: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
  });
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.removeChild(root);
  });

  it('clicking a sub-loc row dispatches NAVIGATE_TO_LOCATION with the row attributes', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: 'banana' });
    render(dispatcher.getState(), root);

    const row = root.querySelector<HTMLElement>(
      '.pkc-entry-subloc[data-pkc-sub-id="heading:details"]',
    );
    expect(row).toBeTruthy();

    // Track dispatch calls after the boot actions.
    const dispatched: { type: string; [k: string]: unknown }[] = [];
    const origDispatch = dispatcher.dispatch;
    dispatcher.dispatch = ((action) => {
      dispatched.push(action as { type: string });
      return origDispatch(action);
    }) as typeof dispatcher.dispatch;

    row!.click();

    const navCalls = dispatched.filter((a) => a.type === 'NAVIGATE_TO_LOCATION');
    expect(navCalls.length).toBe(1);
    expect(navCalls[0]).toMatchObject({
      type: 'NAVIGATE_TO_LOCATION',
      lid: 'txt',
      subId: 'heading:details',
    });
    // ticket must be a number (monotonic — we don't assert the value).
    expect(typeof (navCalls[0] as { ticket?: unknown }).ticket).toBe('number');
  });

  it('re-clicking the same row advances the ticket (so the scroll re-fires)', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: 'banana' });
    render(dispatcher.getState(), root);

    const row = () => root.querySelector<HTMLElement>(
      '.pkc-entry-subloc[data-pkc-sub-id="heading:details"]',
    )!;
    row().click();
    const firstTicket = dispatcher.getState().pendingNav!.ticket;
    // Re-render (state changed) then click again.
    render(dispatcher.getState(), root);
    row().click();
    const secondTicket = dispatcher.getState().pendingNav!.ticket;
    expect(secondTicket).toBeGreaterThan(firstTicket);
  });
});
