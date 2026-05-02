/**
 * @vitest-environment happy-dom
 *
 * Stage β integration: dispatcher × debug ring buffer.
 *
 * The dispatcher records every action it processes into a module-
 * scoped FIFO buffer, but ONLY when at least one debug feature is
 * active. Structural mode (default when any flag is set) cherry-picks
 * `{ type, lid? }` from each action; content mode (`?pkc-debug-contents=1`)
 * additionally captures the full action payload.
 *
 * The "no leak" tests below construct actions that carry maximally
 * sensitive payloads (TOP-SECRET-* sentinels) and JSON-stringify the
 * whole ring buffer to assert the sentinels never appear in structural
 * mode. See `docs/development/debug-privacy-philosophy.md` §4 原則 2 +
 * §5-1 for the upper-tier privacy regulation this verifies.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  clearDebugEvents,
  readDebugEvents,
  _resetContentsWarningForTests,
} from '@runtime/debug-flags';
import type { Container } from '@core/model/container';

const ts = '2026-05-02T00:00:00Z';
const mockContainer: Container = {
  meta: {
    container_id: 'c-test',
    title: 'Test',
    created_at: ts,
    updated_at: ts,
    schema_version: 1,
  },
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

function setUrl(query: string): void {
  window.history.replaceState(null, '', query.length > 0 ? `?${query}` : '/');
}

beforeEach(() => {
  setUrl('');
  window.localStorage.clear();
  clearDebugEvents();
  _resetContentsWarningForTests();
});

describe('dispatcher × debug ring buffer — recording gate', () => {
  it('does NOT record when no debug flag is set', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e-1' });
    expect(readDebugEvents()).toEqual([]);
  });

  it('records every dispatch when ?pkc-debug=<feature> is set', () => {
    setUrl('pkc-debug=sync');
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e-1' });
    d.dispatch({ type: 'DESELECT_ENTRY' });
    const events = readDebugEvents();
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual([
      'SYS_INIT_COMPLETE',
      'SELECT_ENTRY',
      'DESELECT_ENTRY',
    ]);
  });
});

describe('dispatcher × debug ring buffer — structural mode (default)', () => {
  it('captures only { type, lid?, ts, kind } per event', () => {
    setUrl('pkc-debug=*');
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e-42' });
    const events = readDebugEvents();
    expect(events[0]).toEqual({
      kind: 'dispatch',
      ts: expect.any(String),
      type: 'SYS_INIT_COMPLETE',
    });
    expect(events[1]).toEqual({
      kind: 'dispatch',
      ts: expect.any(String),
      type: 'SELECT_ENTRY',
      lid: 'e-42',
    });
    expect(events[1]!.content).toBeUndefined();
  });

  it('NEVER leaks entry body / title / asset bytes into the buffer', () => {
    setUrl('pkc-debug=*');
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({
      type: 'COMMIT_EDIT',
      lid: 'e-1',
      title: 'TOP-SECRET-TITLE-9F2A',
      body: 'TOP-SECRET-BODY-PASSPHRASE',
      assets: {
        'asset-key': 'data:image/png;base64,VEVTVF9TRUNSRVRfQkFTRTY0',
      },
    });
    const json = JSON.stringify(readDebugEvents());
    expect(json).not.toContain('TOP-SECRET-TITLE-9F2A');
    expect(json).not.toContain('TOP-SECRET-BODY-PASSPHRASE');
    expect(json).not.toContain('VEVTVF9TRUNSRVRfQkFTRTY0');
  });

  it('NEVER leaks SystemCommand container payloads (SYS_INIT_COMPLETE)', () => {
    setUrl('pkc-debug=*');
    const sensitiveContainer: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'e-1',
          title: 'private',
          body: 'TOP-SECRET-CONTAINER-LEAK',
          archetype: 'text',
          created_at: ts,
          updated_at: ts,
        },
      ],
    };
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: sensitiveContainer });
    const json = JSON.stringify(readDebugEvents());
    expect(json).not.toContain('TOP-SECRET-CONTAINER-LEAK');
  });
});

describe('dispatcher × debug ring buffer — content mode (opt-in)', () => {
  it('captures the full action verbatim in event.content', () => {
    setUrl('pkc-debug=*&pkc-debug-contents=1');
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({
      type: 'COMMIT_EDIT',
      lid: 'e-1',
      title: 'Hello',
      body: 'world',
    });
    const events = readDebugEvents();
    expect(events[1]!.content).toEqual({
      type: 'COMMIT_EDIT',
      lid: 'e-1',
      title: 'Hello',
      body: 'world',
    });
  });

  it('content sentinels DO appear when user has opted in (sanity)', () => {
    setUrl('pkc-debug=*&pkc-debug-contents=1');
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({
      type: 'COMMIT_EDIT',
      lid: 'e-1',
      title: 'OPT-IN-VISIBLE-TITLE',
      body: 'OPT-IN-VISIBLE-BODY',
    });
    const json = JSON.stringify(readDebugEvents());
    // User explicitly asked for content mode → these MUST appear.
    expect(json).toContain('OPT-IN-VISIBLE-TITLE');
    expect(json).toContain('OPT-IN-VISIBLE-BODY');
  });
});
