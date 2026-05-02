/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetContentsWarningForTests,
  buildDebugEnvironment,
  clearDebugEvents,
  debugFeatures,
  dispatchDebugReport,
  extractStructuralFromAction,
  isContentModeEnabled,
  isDebugEnabled,
  isRecordingEnabled,
  MAX_CONTENT_BYTES,
  parseDebugList,
  readDebugEvents,
  recordDebugEvent,
  snapshotActionForContent,
  type DebugReport,
} from '@runtime/debug-flags';

function setUrl(query: string): void {
  // happy-dom honours pushState updates to location.search.
  window.history.replaceState(null, '', query.length > 0 ? `?${query}` : '/');
}

beforeEach(() => {
  setUrl('');
  window.localStorage.clear();
  clearDebugEvents();
  _resetContentsWarningForTests();
});

describe('parseDebugList', () => {
  it('returns empty Set for null / undefined / empty', () => {
    expect(parseDebugList(null).size).toBe(0);
    expect(parseDebugList(undefined).size).toBe(0);
    expect(parseDebugList('').size).toBe(0);
  });

  it('parses a single feature name', () => {
    const set = parseDebugList('sync');
    expect(set.size).toBe(1);
    expect(set.has('sync')).toBe(true);
  });

  it('parses comma-separated features and trims whitespace', () => {
    const set = parseDebugList('sync, kanban , calendar');
    expect(set.size).toBe(3);
    expect(set.has('sync')).toBe(true);
    expect(set.has('kanban')).toBe(true);
    expect(set.has('calendar')).toBe(true);
  });

  it('drops empty tokens (",, sync,,")', () => {
    const set = parseDebugList(',, sync,,');
    expect(set.size).toBe(1);
    expect(set.has('sync')).toBe(true);
  });

  it('keeps the * wildcard as a literal token', () => {
    const set = parseDebugList('*');
    expect(set.has('*')).toBe(true);
  });
});

describe('debugFeatures / isDebugEnabled — URL source', () => {
  it('reads ?pkc-debug=sync,kanban', () => {
    setUrl('pkc-debug=sync,kanban');
    expect(debugFeatures()).toEqual(new Set(['sync', 'kanban']));
    expect(isDebugEnabled('sync')).toBe(true);
    expect(isDebugEnabled('kanban')).toBe(true);
    expect(isDebugEnabled('calendar')).toBe(false);
  });

  it('treats * as enabling every feature', () => {
    setUrl('pkc-debug=*');
    expect(isDebugEnabled('sync')).toBe(true);
    expect(isDebugEnabled('kanban')).toBe(true);
    expect(isDebugEnabled('any-future-name')).toBe(true);
  });

  it('returns empty when ?pkc-debug is absent', () => {
    expect(debugFeatures().size).toBe(0);
    expect(isDebugEnabled('sync')).toBe(false);
  });

  it('returns empty when ?pkc-debug= is present but blank', () => {
    setUrl('pkc-debug=');
    expect(debugFeatures().size).toBe(0);
  });
});

describe('debugFeatures — localStorage fallback and URL precedence', () => {
  it('falls back to localStorage when URL flag absent', () => {
    window.localStorage.setItem('pkc2.debug', 'sync');
    expect(debugFeatures()).toEqual(new Set(['sync']));
    expect(isDebugEnabled('sync')).toBe(true);
  });

  it('URL takes precedence over localStorage even when URL is blank', () => {
    // Spec §3.1: "URL が優先". An explicitly-blank URL flag means
    // "off" — it should NOT silently inherit the localStorage value.
    window.localStorage.setItem('pkc2.debug', 'kanban');
    setUrl('pkc-debug=');
    expect(debugFeatures().size).toBe(0);
  });

  it('URL value overrides a different localStorage value', () => {
    window.localStorage.setItem('pkc2.debug', 'kanban');
    setUrl('pkc-debug=sync');
    expect(debugFeatures()).toEqual(new Set(['sync']));
  });
});

describe('buildDebugEnvironment', () => {
  it('returns the schema-versioned env slice with no app-state fields', () => {
    setUrl('pkc-debug=sync,kanban');
    const env = buildDebugEnvironment();
    expect(env.schema).toBe(3);
    expect(typeof env.pkc.version).toBe('string');
    expect(env.pkc.version.length).toBeGreaterThan(0);
    expect(typeof env.ts).toBe('string');
    // ISO 8601: 2026-05-02T00:50:01.234Z
    expect(env.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(typeof env.url).toBe('string');
    expect(typeof env.ua).toBe('string');
    expect(env.viewport).toMatchObject({
      w: expect.any(Number),
      h: expect.any(Number),
      dpr: expect.any(Number),
    });
    expect(env.pointer).toMatchObject({ coarse: expect.any(Boolean) });
    // flags is a sorted list reflecting active features at build time.
    expect(env.flags).toEqual(['kanban', 'sync']);
  });

  it('reports an empty flags list when no debug feature is active', () => {
    expect(buildDebugEnvironment().flags).toEqual([]);
  });

  it('defaults to structural level / contentsIncluded:false / recent:[]', () => {
    setUrl('pkc-debug=sync');
    const env = buildDebugEnvironment();
    expect(env.level).toBe('structural');
    expect(env.contentsIncluded).toBe(false);
    expect(env.recent).toEqual([]);
  });

  it('reflects ring-buffer contents in env.recent', () => {
    setUrl('pkc-debug=sync');
    recordDebugEvent({ kind: 'dispatch', seq: 1, ts: 't1', type: 'SELECT_ENTRY', lid: 'e-1' });
    recordDebugEvent({ kind: 'dispatch', seq: 2, ts: 't2', type: 'SET_VIEW_MODE' });
    expect(buildDebugEnvironment().recent).toEqual([
      { kind: 'dispatch', seq: 1, ts: 't1', type: 'SELECT_ENTRY', lid: 'e-1' },
      { kind: 'dispatch', seq: 2, ts: 't2', type: 'SET_VIEW_MODE' },
    ]);
  });

  it('flips level/contentsIncluded when content mode is opted in', () => {
    setUrl('pkc-debug=*&pkc-debug-contents=1');
    const env = buildDebugEnvironment();
    expect(env.level).toBe('content');
    expect(env.contentsIncluded).toBe(true);
  });
});

describe('dispatchDebugReport — synthesizes <a download> click for the JSON', () => {
  const sample: DebugReport = {
    schema: 3,
    pkc: { version: '0.0.0-test', commit: 'deadbeef' },
    ts: '2026-05-02T00:00:00.000Z',
    url: 'http://test/',
    ua: 'test-ua',
    viewport: { w: 100, h: 100, dpr: 1 },
    pointer: { coarse: false },
    storage: null,
    phase: 'ready',
    view: 'detail',
    selectedLid: null,
    editingLid: null,
    container: null,
    flags: [],
    level: 'structural',
    contentsIncluded: false,
    recent: [],
    errors: [],
    truncatedCounts: { recent: 0, errors: 0, replayDropped: false },
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('creates a Blob URL and clicks an <a download="..."> with that URL', () => {
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (b: Blob) => {
        blobs.push(b);
        return 'blob:test-1';
      },
      revokeObjectURL: () => undefined,
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    const result = dispatchDebugReport(sample);
    expect(result).toBe(true);
    expect(blobs).toHaveLength(1);
    expect(blobs[0]!.type).toBe('application/json');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.href).toBe('blob:test-1');
    expect(anchor.download).toMatch(
      /^pkc2-debug-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/,
    );
    // Anchor must have been removed after the click — no DOM litter.
    expect(document.body.querySelector('a[download]')).toBeNull();
  });

  it('returns false (no throw) when URL.createObjectURL fails', () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => {
        throw new Error('out of memory');
      },
      revokeObjectURL: () => undefined,
    });
    expect(() => dispatchDebugReport(sample)).not.toThrow();
    expect(dispatchDebugReport(sample)).toBe(false);
  });

  it('returns false when document is unavailable (SSR / non-DOM env)', () => {
    vi.stubGlobal('document', undefined);
    expect(dispatchDebugReport(sample)).toBe(false);
  });

  it('emits pretty-printed JSON (round-trip + 2-space indent)', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    );
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (b: Blob) => {
        blobs.push(b);
        return 'blob:test-3';
      },
      revokeObjectURL: () => undefined,
    });

    dispatchDebugReport(sample);
    const text = await blobs[0]!.text();
    expect(JSON.parse(text)).toEqual(sample);
    expect(text).toContain('\n  ');
  });
});

describe('isRecordingEnabled', () => {
  it('is false when no debug flag is set', () => {
    expect(isRecordingEnabled()).toBe(false);
  });

  it('is true when ?pkc-debug=<feature> is set', () => {
    setUrl('pkc-debug=sync');
    expect(isRecordingEnabled()).toBe(true);
  });

  it('is true when ?pkc-debug=* is set', () => {
    setUrl('pkc-debug=*');
    expect(isRecordingEnabled()).toBe(true);
  });
});

describe('isContentModeEnabled — graduated opt-in', () => {
  it('is false when no debug flag is set, even if contents flag is on', () => {
    setUrl('pkc-debug-contents=1');
    expect(isContentModeEnabled()).toBe(false);
  });

  it('is false when only ?pkc-debug=<feature> is set (default structural)', () => {
    setUrl('pkc-debug=sync');
    expect(isContentModeEnabled()).toBe(false);
  });

  it('is true only when both pkc-debug=* and pkc-debug-contents=1 are present', () => {
    setUrl('pkc-debug=*&pkc-debug-contents=1');
    expect(isContentModeEnabled()).toBe(true);
  });

  it('accepts pkc-debug-contents=true as an alias for =1', () => {
    setUrl('pkc-debug=*&pkc-debug-contents=true');
    expect(isContentModeEnabled()).toBe(true);
  });

  it('is false for any non-truthy value (e.g., =0 / =off)', () => {
    setUrl('pkc-debug=*&pkc-debug-contents=0');
    expect(isContentModeEnabled()).toBe(false);
    setUrl('pkc-debug=*&pkc-debug-contents=off');
    expect(isContentModeEnabled()).toBe(false);
  });

  it('reads pkc2.debug-contents from localStorage when URL flag absent', () => {
    setUrl('pkc-debug=sync');
    window.localStorage.setItem('pkc2.debug-contents', '1');
    expect(isContentModeEnabled()).toBe(true);
  });

  it('console.warn fires once when content mode is read from localStorage', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setUrl('pkc-debug=sync');
    window.localStorage.setItem('pkc2.debug-contents', '1');
    isContentModeEnabled();
    isContentModeEnabled();
    isContentModeEnabled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/content mode is enabled via localStorage/);
    warn.mockRestore();
  });

  it('console.warn does NOT fire when content mode comes from URL only', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setUrl('pkc-debug=*&pkc-debug-contents=1');
    isContentModeEnabled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('recordDebugEvent / readDebugEvents — ring buffer', () => {
  it('records events in dispatch order', () => {
    recordDebugEvent({ kind: 'dispatch', seq: 1, ts: 't1', type: 'A' });
    recordDebugEvent({ kind: 'dispatch', seq: 2, ts: 't2', type: 'B', lid: 'e-1' });
    recordDebugEvent({ kind: 'dispatch', seq: 3, ts: 't3', type: 'C' });
    expect(readDebugEvents()).toEqual([
      { kind: 'dispatch', seq: 1, ts: 't1', type: 'A' },
      { kind: 'dispatch', seq: 2, ts: 't2', type: 'B', lid: 'e-1' },
      { kind: 'dispatch', seq: 3, ts: 't3', type: 'C' },
    ]);
  });

  it('caps at 100 events with FIFO eviction (oldest dropped)', () => {
    for (let i = 0; i < 150; i++) {
      recordDebugEvent({ kind: 'dispatch', seq: i + 1, ts: `t${i}`, type: `A${i}` });
    }
    const events = readDebugEvents();
    expect(events).toHaveLength(100);
    // oldest 50 dropped — first remaining should be t50
    expect(events[0]).toMatchObject({ ts: 't50', type: 'A50' });
    expect(events[99]).toMatchObject({ ts: 't149', type: 'A149' });
  });

  it('readDebugEvents returns a snapshot (caller cannot mutate the buffer)', () => {
    recordDebugEvent({ kind: 'dispatch', seq: 1, ts: 't1', type: 'A' });
    const snap = readDebugEvents();
    snap.push({ kind: 'dispatch', seq: 2, ts: 't2', type: 'B' });
    expect(readDebugEvents()).toHaveLength(1);
  });

  it('clearDebugEvents empties the buffer', () => {
    recordDebugEvent({ kind: 'dispatch', seq: 1, ts: 't1', type: 'A' });
    clearDebugEvents();
    expect(readDebugEvents()).toEqual([]);
  });
});

describe('extractStructuralFromAction — privacy by construction', () => {
  it('returns only { type } for actions without a lid', () => {
    expect(extractStructuralFromAction({ type: 'CANCEL_EDIT' })).toEqual({
      type: 'CANCEL_EDIT',
    });
  });

  it('cherry-picks lid when present as a string', () => {
    expect(
      extractStructuralFromAction({ type: 'SELECT_ENTRY', lid: 'e-1' }),
    ).toEqual({ type: 'SELECT_ENTRY', lid: 'e-1' });
  });

  it('omits lid when it is not a string (e.g., undefined / number)', () => {
    expect(
      extractStructuralFromAction({ type: 'X', lid: undefined }),
    ).toEqual({ type: 'X' });
    expect(
      extractStructuralFromAction({ type: 'X', lid: 42 as unknown as string }),
    ).toEqual({ type: 'X' });
  });

  it('NEVER copies body / title / asset / from / to even if present', () => {
    // Privacy by construction (philosophy doc §4 原則 2): the function
    // cherry-picks fields by name, never spreads the action. A future
    // action with a new sensitive field cannot leak through this path.
    const out = extractStructuralFromAction({
      type: 'COMMIT_EDIT',
      lid: 'e-1',
      title: 'TOP-SECRET-TITLE',
      body: 'TOP-SECRET-BODY',
      assets: { 'k': 'data:image/png;base64,VEVTVA==' },
    });
    expect(out).toEqual({ type: 'COMMIT_EDIT', lid: 'e-1' });
    const json = JSON.stringify(out);
    expect(json).not.toContain('TOP-SECRET-TITLE');
    expect(json).not.toContain('TOP-SECRET-BODY');
    expect(json).not.toContain('VEVTVA==');
  });

  it('survives nested / hostile action shapes', () => {
    const hostile: { type: string } & Record<string, unknown> = {
      type: 'SYS_INIT_COMPLETE',
      container: { entries: [{ body: 'leak-me' }] },
      lid: 'e-1',
    };
    const out = extractStructuralFromAction(hostile);
    expect(JSON.stringify(out)).not.toContain('leak-me');
    expect(out).toEqual({ type: 'SYS_INIT_COMPLETE', lid: 'e-1' });
  });
});

describe('snapshotActionForContent — eager clone + size cap', () => {
  it('returns a deep clone of small payloads (immutable snapshot)', () => {
    const action = { type: 'COMMIT_EDIT', lid: 'e-1', body: 'hello' };
    const snap = snapshotActionForContent(action) as Record<string, unknown>;
    expect(snap).toEqual(action);
    // Mutating the original must not affect the snapshot — proves
    // the buffer is not pinning a live reference.
    (action as { body: string }).body = 'mutated';
    expect((snap as { body: string }).body).toBe('hello');
  });

  it('truncates payloads above MAX_CONTENT_BYTES with a marker', () => {
    const huge = 'X'.repeat(MAX_CONTENT_BYTES + 100);
    const snap = snapshotActionForContent({
      type: 'COMMIT_EDIT',
      lid: 'e-1',
      body: huge,
    }) as Record<string, unknown>;
    expect(snap._truncated).toBe(true);
    expect(snap.type).toBe('COMMIT_EDIT');
    expect(snap.reason).toBe('oversize');
    expect(typeof snap.approxBytes).toBe('number');
    expect(snap.approxBytes as number).toBeGreaterThan(MAX_CONTENT_BYTES);
    // The huge body MUST NOT appear anywhere in the truncated snapshot.
    expect(JSON.stringify(snap)).not.toContain('XXXX');
  });

  it('emits an unserializable marker for cyclic / function payloads', () => {
    const cyclic: Record<string, unknown> = { type: 'BAD' };
    cyclic.self = cyclic;
    const snap = snapshotActionForContent(cyclic) as Record<string, unknown>;
    expect(snap._truncated).toBe(true);
    expect(snap.reason).toBe('unserializable');
    expect(snap.type).toBe('BAD');
  });

  it('preserves nested fields below the cap (deep equality)', () => {
    const action = {
      type: 'SYS_INIT_COMPLETE',
      container: { entries: [{ lid: 'e-1', title: 't', body: 'b' }] },
    };
    const snap = snapshotActionForContent(action);
    expect(snap).toEqual(action);
  });
});

describe('applyMessagePrivacy — error message truncation', () => {
  it('returns message verbatim in content mode', async () => {
    const { applyMessagePrivacy } = await import('@runtime/debug-flags');
    const long = 'X'.repeat(500);
    expect(applyMessagePrivacy(long, true)).toBe(long);
  });

  it('truncates to 200 chars + marker in structural mode', async () => {
    const { applyMessagePrivacy } = await import('@runtime/debug-flags');
    const long = 'X'.repeat(500);
    const out = applyMessagePrivacy(long, false);
    expect(out.length).toBeLessThanOrEqual(220);
    expect(out).toMatch(/\[truncated\]$/);
  });

  it('passes short messages through unchanged in either mode', async () => {
    const { applyMessagePrivacy } = await import('@runtime/debug-flags');
    expect(applyMessagePrivacy('hello', true)).toBe('hello');
    expect(applyMessagePrivacy('hello', false)).toBe('hello');
  });
});

describe('errors[] ring buffer — recordDebugError / readDebugErrors', () => {
  it('records error events in order', async () => {
    const { recordDebugError, readDebugErrors, clearDebugErrors } = await import(
      '@runtime/debug-flags'
    );
    clearDebugErrors();
    recordDebugError({ kind: 'error', ts: 't1', message: 'a', lastSeq: 1 });
    recordDebugError({ kind: 'console-error', ts: 't2', message: 'b', lastSeq: 2 });
    expect(readDebugErrors()).toEqual([
      { kind: 'error', ts: 't1', message: 'a', lastSeq: 1 },
      { kind: 'console-error', ts: 't2', message: 'b', lastSeq: 2 },
    ]);
  });

  it('caps at 10 with FIFO eviction', async () => {
    const { recordDebugError, readDebugErrors, clearDebugErrors } = await import(
      '@runtime/debug-flags'
    );
    clearDebugErrors();
    for (let i = 0; i < 15; i++) {
      recordDebugError({ kind: 'error', ts: `t${i}`, message: `m${i}`, lastSeq: i });
    }
    const errors = readDebugErrors();
    expect(errors).toHaveLength(10);
    expect(errors[0]!.message).toBe('m5');
    expect(errors[9]!.message).toBe('m14');
  });
});

describe('applyTotalSizeCap — 1 MiB hard cap with priority truncation', () => {
  function makeReport(
    overrides: Partial<DebugReport> = {},
  ): DebugReport {
    return {
      schema: 3,
      pkc: { version: '0', commit: 'x' },
      ts: 't',
      url: '',
      ua: '',
      viewport: { w: 1, h: 1, dpr: 1 },
      pointer: { coarse: false },
      storage: null,
      phase: 'ready',
      view: 'detail',
      selectedLid: null,
      editingLid: null,
      container: null,
      flags: [],
      level: 'structural',
      contentsIncluded: false,
      recent: [],
      errors: [],
      truncatedCounts: { recent: 0, errors: 0, replayDropped: false },
      ...overrides,
    };
  }

  it('passes through reports under the cap unchanged', async () => {
    const { applyTotalSizeCap } = await import('@runtime/debug-flags');
    const r = makeReport();
    const out = applyTotalSizeCap(r);
    expect(out).toEqual(r);
  });

  it('drops replay first when a content-mode report exceeds the cap', async () => {
    const { applyTotalSizeCap, MAX_REPORT_BYTES } = await import('@runtime/debug-flags');
    // Build a replay payload large enough to trigger truncation.
    const huge = 'A'.repeat(MAX_REPORT_BYTES + 1024);
    const r = makeReport({
      level: 'content',
      contentsIncluded: true,
      replay: { initialContainer: { huge } },
    });
    const out = applyTotalSizeCap(r);
    expect(out.replay).toBeUndefined();
    expect(out.truncatedCounts.replayDropped).toBe(true);
  });

  it('then trims recent[] FIFO, then errors[] FIFO, surfacing counts', async () => {
    const { applyTotalSizeCap, MAX_REPORT_BYTES } = await import('@runtime/debug-flags');
    // Each event ~1 KiB → need ~1100 events to exceed 1 MiB.
    const recent = Array.from({ length: 1200 }, (_, i) => ({
      kind: 'dispatch' as const,
      seq: i + 1,
      ts: 't',
      type: 'X'.repeat(900),
    }));
    const r = makeReport({ recent });
    const out = applyTotalSizeCap(r);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    expect(out.truncatedCounts.recent).toBeGreaterThan(0);
  });

  it('drops replay when stringify throws (cyclic / overflow surrogate)', async () => {
    // Real-world failure surrogate: a value that JSON.stringify
    // refuses to serialize (cyclic). The user-reported Firefox
    // "InternalError: allocation size overflow" hits the same
    // try/catch path inside safeMeasureJsonLength → returns Infinity →
    // applyTotalSizeCap drops replay rather than letting the error
    // escape into the click handler.
    const { applyTotalSizeCap } = await import('@runtime/debug-flags');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const r = makeReport({
      level: 'content',
      contentsIncluded: true,
      replay: { initialContainer: cyclic },
    });
    expect(() => applyTotalSizeCap(r)).not.toThrow();
    const out = applyTotalSizeCap(r);
    expect(out.replay).toBeUndefined();
    expect(out.truncatedCounts.replayDropped).toBe(true);
  });
});

describe('recordInitialContainer — replay seed bounded at storage time', () => {
  const TS = '2026-05-02T00:00:00Z';

  function makeContainer(overrides: Record<string, unknown> = {}) {
    return {
      meta: {
        container_id: 'c-stress',
        title: 'stress',
        created_at: TS,
        updated_at: TS,
        schema_version: 1,
      },
      entries: [],
      relations: [],
      revisions: [],
      assets: {},
      ...overrides,
    };
  }

  it('stores plain references for small containers', async () => {
    const { recordInitialContainer, readInitialContainer, clearInitialContainerForTests } =
      await import('@runtime/debug-flags');
    clearInitialContainerForTests();
    const c = makeContainer({
      entries: [{ lid: 'e-1', title: 't', body: 'b', archetype: 'text' }],
    });
    recordInitialContainer(c);
    expect(readInitialContainer()).toEqual(c);
  });

  it('replaces with oversize-assets marker BEFORE attempting JSON.stringify', async () => {
    // Real-world worst case: a single image asset that exceeds the
    // asset budget. The pre-scan stops at the first violator so we
    // never traverse 100k assets needlessly AND never feed a
    // multi-megabyte string to JSON.stringify.
    const {
      recordInitialContainer,
      readInitialContainer,
      clearInitialContainerForTests,
      MAX_REPLAY_ASSET_BYTES,
    } = await import('@runtime/debug-flags');
    clearInitialContainerForTests();
    const huge = 'A'.repeat(MAX_REPLAY_ASSET_BYTES + 1024);
    const c = makeContainer({
      assets: { 'big-asset': huge },
    });
    recordInitialContainer(c);
    const stored = readInitialContainer() as Record<string, unknown>;
    expect(stored._truncated).toBe(true);
    expect(stored.reason).toBe('oversize-assets');
    expect(typeof stored.approxAssetBytes).toBe('number');
    // Critical: the giant asset must NOT appear in the stored value.
    expect(JSON.stringify(stored)).not.toContain('AAAAAA');
  });

  it('replaces with oversize marker when stringified container exceeds MAX_REPLAY_BYTES', async () => {
    // Asset budget passes (no assets), but many entries with large
    // bodies push the JSON length over MAX_REPLAY_BYTES.
    const {
      recordInitialContainer,
      readInitialContainer,
      clearInitialContainerForTests,
      MAX_REPLAY_BYTES,
    } = await import('@runtime/debug-flags');
    clearInitialContainerForTests();
    const body = 'B'.repeat(10 * 1024); // 10 KiB body
    const entries = Array.from({ length: 100 }, (_, i) => ({
      lid: `e-${i}`,
      title: `t${i}`,
      body,
      archetype: 'text',
    }));
    const c = makeContainer({ entries });
    recordInitialContainer(c);
    const stored = readInitialContainer() as Record<string, unknown>;
    expect(stored._truncated).toBe(true);
    expect(stored.reason).toBe('oversize');
    expect(stored.approxBytes as number).toBeGreaterThan(MAX_REPLAY_BYTES);
  });

  it('replaces with unserializable marker when JSON.stringify throws', async () => {
    // Surrogate for the Firefox "allocation size overflow" path —
    // any thrown error inside JSON.stringify must be caught and
    // mapped to a marker rather than escaping.
    const { recordInitialContainer, readInitialContainer, clearInitialContainerForTests } =
      await import('@runtime/debug-flags');
    clearInitialContainerForTests();
    const cyclic: Record<string, unknown> = { entries: [], relations: [], assets: {} };
    cyclic.self = cyclic;
    expect(() => recordInitialContainer(cyclic)).not.toThrow();
    expect(readInitialContainer()).toMatchObject({
      _truncated: true,
      reason: 'unserializable',
    });
  });
});

describe('dispatchDebugReport — overflow guard at final stringify', () => {
  it('returns false without throwing when JSON.stringify(report) throws', async () => {
    // The post-applyTotalSizeCap report should be safe, but defense-
    // in-depth: if a future schema addition slips an unserializable
    // value through, the click handler must still bail gracefully.
    const { dispatchDebugReport } = await import('@runtime/debug-flags');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    );
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:test',
      revokeObjectURL: () => undefined,
    });
    const result = dispatchDebugReport(cyclic as never);
    expect(result).toBe(false);
  });
});
