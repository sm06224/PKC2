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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  clearDebugEvents,
  clearInitialContainerForTests,
  readDebugEvents,
  readInitialContainer,
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
  clearInitialContainerForTests();
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
  it('captures only { type, lid?, ts, kind, seq, durMs } per event', () => {
    setUrl('pkc-debug=*');
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e-42' });
    const events = readDebugEvents();
    expect(events[0]).toEqual({
      kind: 'dispatch',
      seq: 1,
      ts: expect.any(String),
      type: 'SYS_INIT_COMPLETE',
      durMs: expect.any(Number),
    });
    expect(events[1]).toEqual({
      kind: 'dispatch',
      seq: 2,
      ts: expect.any(String),
      type: 'SELECT_ENTRY',
      lid: 'e-42',
      durMs: expect.any(Number),
    });
    expect(events[1]!.content).toBeUndefined();
    expect(events[1]!.durMs).toBeGreaterThanOrEqual(0);
  });

  it('seq is monotonic and survives FIFO eviction', () => {
    setUrl('pkc-debug=*');
    const d = createDispatcher();
    for (let i = 0; i < 105; i++) {
      d.dispatch({ type: 'SELECT_ENTRY', lid: `e-${i}` });
    }
    const events = readDebugEvents();
    expect(events).toHaveLength(100);
    // First retained event is the 6th dispatched (seq 6), oldest 5 evicted.
    expect(events[0]!.seq).toBe(6);
    expect(events[99]!.seq).toBe(105);
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

  it('captures initialContainer for replay only on first SYS_INIT_COMPLETE', () => {
    setUrl('pkc-debug=*&pkc-debug-contents=1');
    const d = createDispatcher();
    expect(readInitialContainer()).toBeNull();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    // Stored as an immutable deep clone (recordInitialContainer
    // re-parses the JSON), so we check structural equality, not
    // identity. Mutating the original after capture must not affect
    // the snapshot — that's the whole point of the deep clone.
    expect(readInitialContainer()).toEqual(mockContainer);
    expect(readInitialContainer()).not.toBe(mockContainer);
  });

  it('does NOT capture initialContainer in structural mode', () => {
    setUrl('pkc-debug=*');
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    expect(readInitialContainer()).toBeNull();
  });

  it('truncates oversize payloads in content mode (Firefox allocation guard)', () => {
    setUrl('pkc-debug=*&pkc-debug-contents=1');
    // Simulate the boot scenario that triggered the user-reported
    // "InternalError: allocation size overflow": a SYS_INIT_COMPLETE
    // carrying a Container that exceeds the per-event content cap.
    // The body sentinel (`HUGE-BODY-...`) must NOT appear in the
    // serialized buffer; the event must carry a truncation marker.
    const HUGE = 'A'.repeat(80 * 1024); // > MAX_CONTENT_BYTES
    const huge: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'e-big',
          title: 't',
          body: `HUGE-BODY-SHOULD-BE-TRUNCATED-${HUGE}`,
          archetype: 'text',
          created_at: ts,
          updated_at: ts,
        },
      ],
    };
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: huge });
    const events = readDebugEvents();
    expect(events).toHaveLength(1);
    const content = events[0]!.content as Record<string, unknown>;
    expect(content._truncated).toBe(true);
    expect(content.type).toBe('SYS_INIT_COMPLETE');
    expect(content.reason).toBe('oversize');
    const json = JSON.stringify(events);
    expect(json).not.toContain('HUGE-BODY-SHOULD-BE-TRUNCATED');
  });
});

describe('user stress repro — oversized container in content mode', () => {
  /**
   * Reproduces the user-reported "InternalError: allocation size
   * overflow" path. The user opened a deployment with a real PKC2
   * container that carried hundreds of MB of base64 assets in IDB,
   * with `?pkc-debug=*&pkc-debug-contents=1`. The previous fix
   * (snapshotActionForContent for recent[].content) was protected,
   * but recordInitialContainer stored a raw reference and
   * applyTotalSizeCap / dispatchDebugReport called JSON.stringify
   * on the resulting report unprotected — Firefox / Safari raised
   * an uncaught allocation overflow.
   *
   * This test exercises the whole boot → click flow on a synthetic
   * but realistic container shape and asserts NOTHING throws.
   */
  it('boots and dumps a report without throwing for a 600 KiB-asset container', async () => {
    setUrl('pkc-debug=*&pkc-debug-contents=1');
    const fatContainer: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'e-photo',
          title: 'photo',
          body: 'see attached',
          archetype: 'attachment',
          created_at: ts,
          updated_at: ts,
        },
      ],
      assets: {
        // Single asset above MAX_REPLAY_ASSET_BYTES (512 KiB) → the
        // pre-scan must trip and store a truncation marker BEFORE
        // attempting JSON.stringify.
        'photo-asset': 'A'.repeat(600 * 1024),
      },
    };
    const d = createDispatcher();
    expect(() => {
      d.dispatch({ type: 'SYS_INIT_COMPLETE', container: fatContainer });
    }).not.toThrow();

    // Verify the recorded initialContainer is the truncation marker —
    // the giant asset string MUST NOT have been pinned in memory.
    const stored = readInitialContainer() as Record<string, unknown>;
    expect(stored._truncated).toBe(true);
    expect(stored.reason).toBe('oversize-assets');
    expect(JSON.stringify(stored)).not.toContain('AAAAAA');

    // The whole click path: build report → applyTotalSizeCap →
    // JSON.stringify in dispatchDebugReport. None of these may throw.
    const { buildDebugReportFromState } = await import(
      '@adapter/ui/debug-report'
    );
    const { dispatchDebugReport } = await import('@runtime/debug-flags');
    const fakeWindow = {} as Window;
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:stress',
      revokeObjectURL: () => undefined,
    });
    expect(() => {
      const report = buildDebugReportFromState(d.getState());
      const result = dispatchDebugReport(report);
      expect(result).toBe(fakeWindow);
    }).not.toThrow();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
