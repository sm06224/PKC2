/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDebugEnvironment,
  debugFeatures,
  dispatchDebugReport,
  isDebugEnabled,
  parseDebugList,
  type DebugReport,
} from '@runtime/debug-flags';

function setUrl(query: string): void {
  // happy-dom honours pushState updates to location.search.
  window.history.replaceState(null, '', query.length > 0 ? `?${query}` : '/');
}

beforeEach(() => {
  setUrl('');
  window.localStorage.clear();
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
    expect(env.schema).toBe(1);
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
});

describe('dispatchDebugReport', () => {
  const sample: DebugReport = {
    schema: 1,
    pkc: { version: '0.0.0-test' },
    ts: '2026-05-02T00:00:00.000Z',
    url: 'http://test/',
    ua: 'test-ua',
    viewport: { w: 100, h: 100, dpr: 1 },
    pointer: { coarse: false },
    phase: 'ready',
    view: 'detail',
    selectedLid: null,
    editingLid: null,
    container: null,
    flags: [],
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes pretty JSON to navigator.clipboard.writeText and resolves true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const ok = await dispatchDebugReport(sample);
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    const arg = writeText.mock.calls[0]![0] as string;
    // Must round-trip and remain pretty-printed (2-space indent).
    expect(JSON.parse(arg)).toEqual(sample);
    expect(arg).toContain('\n  ');
  });

  it('resolves false when clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const ok = await dispatchDebugReport(sample);
    expect(ok).toBe(false);
  });

  it('resolves false when navigator.clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const ok = await dispatchDebugReport(sample);
    expect(ok).toBe(false);
  });
});
