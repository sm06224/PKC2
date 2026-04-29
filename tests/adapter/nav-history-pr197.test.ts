/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountNavHistory } from '@adapter/ui/nav-history';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

/**
 * PR #197 — nav history bridge contract.
 *
 * Tests pin the round-trip between dispatcher state changes and
 * the browser's `history` stack:
 *
 *   1. Initial mount records the boot snapshot via replaceState
 *      (NOT pushState, so the boot frame stays implicit).
 *   2. SELECT_ENTRY pushes a new history entry whose state carries
 *      the new selectedLid.
 *   3. SET_VIEW_MODE pushes a new entry.
 *   4. Identity-equal navigations (same selectedLid + viewMode) do
 *      NOT push duplicate entries.
 *   5. popstate restores the snapshot — selectedLid + viewMode are
 *      re-applied via dispatcher actions, and the restoration itself
 *      does NOT push another history entry (no infinite loop).
 *   6. dispose() removes the popstate listener.
 *
 * happy-dom implements `window.history` with stack-like semantics
 * sufficient for these tests.
 */

const T = '2026-04-28T00:00:00Z';

function fixtureContainer(): Container {
  return {
    meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'a', title: 'A', archetype: 'text', body: 'a', created_at: T, updated_at: T },
      { lid: 'b', title: 'B', archetype: 'text', body: 'b', created_at: T, updated_at: T },
      { lid: 'c', title: 'C', archetype: 'text', body: 'c', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

let dispatcher: ReturnType<typeof createDispatcher>;
let dispose: () => void;

beforeEach(() => {
  // Each test gets a fresh dispatcher AND a fresh history-equivalent
  // stack frame. happy-dom doesn't expose history.length reset, so we
  // pushState a sentinel and use the test's first replaceState as the
  // baseline.
  dispatcher = createDispatcher();
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: fixtureContainer() });
  const handle = mountNavHistory(dispatcher);
  dispose = handle.dispose;
});

afterEach(() => {
  dispose();
});

function getNavState(): { selectedLid: string | null; viewMode: string } | null {
  const env = window.history.state as { pkc2?: { selectedLid: string | null; viewMode: string } } | null;
  return env?.pkc2 ?? null;
}

describe('mountNavHistory — PR #197', () => {
  it('seeds the boot snapshot via replaceState', () => {
    const seeded = getNavState();
    expect(seeded).not.toBeNull();
    expect(seeded?.selectedLid).toBeNull();
    expect(seeded?.viewMode).toBe('detail');
  });

  it('SELECT_ENTRY pushes a new snapshot to history', () => {
    const beforeLen = window.history.length;
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    expect(window.history.length).toBeGreaterThan(beforeLen);
    expect(getNavState()?.selectedLid).toBe('a');
  });

  it('SET_VIEW_MODE pushes a new snapshot', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    const beforeLen = window.history.length;
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'kanban' });
    expect(window.history.length).toBeGreaterThan(beforeLen);
    expect(getNavState()?.viewMode).toBe('kanban');
  });

  it('does not push when navigation is a no-op (same selectedLid + viewMode)', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    const lenAfterFirst = window.history.length;
    // A render-irrelevant dispatch should NOT push (selectedLid + viewMode unchanged).
    dispatcher.dispatch({ type: 'TOGGLE_RECENT_PANE' });
    expect(window.history.length).toBe(lenAfterFirst);
  });

  it('popstate restores the snapshot via SELECT_ENTRY', async () => {
    // a → b → c, then popstate twice = back to a
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'b' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'c' });
    expect(dispatcher.getState().selectedLid).toBe('c');

    // Synthesize popstate to the snapshot for entry 'a'.
    // happy-dom doesn't auto-fire popstate on history.go(-2), so we
    // dispatch a synthetic PopStateEvent with the target snapshot.
    const popEvent = new PopStateEvent('popstate', {
      state: { pkc2: { selectedLid: 'a', viewMode: 'detail' } },
    });
    window.dispatchEvent(popEvent);
    expect(dispatcher.getState().selectedLid).toBe('a');
  });

  it('popstate to null clears selection', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    expect(dispatcher.getState().selectedLid).toBe('a');
    const popEvent = new PopStateEvent('popstate', {
      state: { pkc2: { selectedLid: null, viewMode: 'detail' } },
    });
    window.dispatchEvent(popEvent);
    expect(dispatcher.getState().selectedLid).toBeNull();
  });

  it('popstate-driven restore does NOT push another history entry', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'b' });
    const lenBefore = window.history.length;
    // Restore to 'a' via popstate.
    const popEvent = new PopStateEvent('popstate', {
      state: { pkc2: { selectedLid: 'a', viewMode: 'detail' } },
    });
    window.dispatchEvent(popEvent);
    // The restoration should not have created a NEW history entry.
    expect(window.history.length).toBe(lenBefore);
  });

  it('dispose() detaches popstate handler', () => {
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'a' });
    dispose();
    dispose = () => { /* idempotent */ };
    // Now a popstate should NOT cause re-dispatch.
    const popEvent = new PopStateEvent('popstate', {
      state: { pkc2: { selectedLid: 'b', viewMode: 'detail' } },
    });
    window.dispatchEvent(popEvent);
    // selectedLid stays 'a', popstate handler is detached.
    expect(dispatcher.getState().selectedLid).toBe('a');
  });
});
