import { describe, it, expect } from 'vitest';
import {
  collectFragmentCandidates,
  filterFragmentCandidates,
  findFragmentCompletionContext,
} from '@features/entry-ref/fragment-completion';
import type { Entry } from '@core/model/record';

const T = '2026-04-20T09:30:00Z';

function makeEntry(partial: Partial<Entry> & { lid: string; archetype: Entry['archetype'] }): Entry {
  return {
    title: '',
    body: '',
    created_at: T,
    updated_at: T,
    ...partial,
  };
}

function makeTextlog(lid: string, logs: Array<{ id: string; text: string; createdAt: string }>): Entry {
  return makeEntry({
    lid,
    archetype: 'textlog',
    body: JSON.stringify({
      entries: logs.map((l) => ({ ...l, flags: [] })),
    }),
  });
}

// ── findFragmentCompletionContext ──

describe('findFragmentCompletionContext', () => {
  it('matches immediately after `(entry:<lid>#` with empty query', () => {
    const text = '[x](entry:my-log#';
    const res = findFragmentCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.lid).toBe('my-log');
    expect(res!.queryStart).toBe(text.length);
    expect(res!.query).toBe('');
  });

  it('captures query typed so far', () => {
    const text = '[x](entry:my-log#log/ab';
    const res = findFragmentCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.lid).toBe('my-log');
    expect(res!.query).toBe('log/ab');
  });

  it('allows lid with hyphens and underscores', () => {
    const text = '[x](entry:foo_bar-baz123#day/2026';
    const res = findFragmentCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.lid).toBe('foo_bar-baz123');
    expect(res!.query).toBe('day/2026');
  });

  it('caret partway through the query run returns partial query', () => {
    const text = '[x](entry:my-log#log/full-id)';
    // Caret right after 'l' in 'full-id' → inside query
    const caret = text.indexOf('-id');
    const res = findFragmentCompletionContext(text, caret);
    expect(res).not.toBeNull();
    expect(res!.query).toBe('log/full');
  });

  it('returns null without preceding `(`', () => {
    const text = 'entry:my-log#';
    expect(findFragmentCompletionContext(text, text.length)).toBeNull();
  });

  it('returns null when `entry:` is missing', () => {
    const text = '(my-log#';
    expect(findFragmentCompletionContext(text, text.length)).toBeNull();
  });

  it('returns null when lid is empty', () => {
    const text = '(entry:#';
    expect(findFragmentCompletionContext(text, text.length)).toBeNull();
  });

  it('returns null when caret is not after a `#`', () => {
    const text = '(entry:my-log';
    expect(findFragmentCompletionContext(text, text.length)).toBeNull();
  });

  it('returns null when whitespace breaks the query run', () => {
    const text = '(entry:my-log#log hi';
    expect(findFragmentCompletionContext(text, text.length)).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(findFragmentCompletionContext('', 0)).toBeNull();
  });

  it('returns null when caret is before the trigger', () => {
    const text = '(entry:my-log#log/foo';
    expect(findFragmentCompletionContext(text, 3)).toBeNull();
  });

  it('distinguishes from entry-url trigger — no `#` means no fragment context', () => {
    const text = '(entry:my-log';
    expect(findFragmentCompletionContext(text, text.length)).toBeNull();
  });
});

// ── collectFragmentCandidates ──

describe('collectFragmentCandidates', () => {
  it('returns [] for non-textlog archetypes', () => {
    for (const arch of ['text', 'todo', 'form', 'attachment', 'folder', 'generic', 'opaque'] as const) {
      const entry = makeEntry({ lid: 'x', archetype: arch, body: '' });
      expect(collectFragmentCandidates(entry)).toEqual([]);
    }
  });

  it('returns [] for textlog with no logs', () => {
    const entry = makeTextlog('empty', []);
    expect(collectFragmentCandidates(entry)).toEqual([]);
  });

  it('emits one log candidate per entry (newest first)', () => {
    const entry = makeTextlog('tl', [
      { id: 'L1', text: 'first', createdAt: '2026-04-19T08:00:00Z' },
      { id: 'L2', text: 'second', createdAt: '2026-04-19T09:00:00Z' },
      { id: 'L3', text: 'third', createdAt: '2026-04-20T10:00:00Z' },
    ]);
    const cands = collectFragmentCandidates(entry);
    const logs = cands.filter((c) => c.kind === 'log');
    expect(logs).toHaveLength(3);
    // newest first
    expect(logs[0]!.fragment).toBe('log/L3');
    expect(logs[1]!.fragment).toBe('log/L2');
    expect(logs[2]!.fragment).toBe('log/L1');
  });

  it('emits one day candidate per unique local date (newest first)', () => {
    const entry = makeTextlog('tl', [
      { id: 'L1', text: 'a', createdAt: '2026-04-18T10:00:00Z' },
      { id: 'L2', text: 'b', createdAt: '2026-04-19T10:00:00Z' },
      { id: 'L3', text: 'c', createdAt: '2026-04-19T11:00:00Z' },
      { id: 'L4', text: 'd', createdAt: '2026-04-20T10:00:00Z' },
    ]);
    const cands = collectFragmentCandidates(entry);
    const days = cands.filter((c) => c.kind === 'day');
    expect(days).toHaveLength(3);
    // Dates are UTC-to-local; in typical CI (UTC TZ) these stay the same
    const dayFragments = days.map((d) => d.fragment);
    expect(new Set(dayFragments).size).toBe(3);
    // Sorted descending
    expect([...dayFragments].sort().reverse()).toEqual(dayFragments);
  });

  it('places all logs before any day candidate', () => {
    const entry = makeTextlog('tl', [
      { id: 'L1', text: 'a', createdAt: '2026-04-19T10:00:00Z' },
      { id: 'L2', text: 'b', createdAt: '2026-04-20T10:00:00Z' },
    ]);
    const cands = collectFragmentCandidates(entry);
    const firstDayIdx = cands.findIndex((c) => c.kind === 'day');
    const lastLogIdx = (() => {
      let i = -1;
      cands.forEach((c, idx) => { if (c.kind === 'log') i = idx; });
      return i;
    })();
    expect(lastLogIdx).toBeLessThan(firstDayIdx);
  });

  it('uses makeLogLabel for log candidate label (HH:mm:ss + preview)', () => {
    const entry = makeTextlog('tl', [
      { id: 'L1', text: 'hello world', createdAt: '2026-04-20T09:30:00Z' },
    ]);
    const cands = collectFragmentCandidates(entry);
    const log = cands.find((c) => c.kind === 'log')!;
    // The label contains both a time component and the preview text.
    expect(log.label).toContain('hello world');
    expect(log.label).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

// ── filterFragmentCandidates ──

describe('filterFragmentCandidates', () => {
  const sample = [
    { kind: 'log' as const, fragment: 'log/abc', label: '09:00  first line' },
    { kind: 'log' as const, fragment: 'log/def', label: '10:00  another' },
    { kind: 'day' as const, fragment: 'day/2026-04-20', label: '2026-04-20' },
  ];

  it('returns full list (copy) for empty query', () => {
    const out = filterFragmentCandidates(sample, '');
    expect(out).toEqual(sample);
    out.pop();
    expect(sample).toHaveLength(3);
  });

  it('matches fragment substring', () => {
    expect(filterFragmentCandidates(sample, 'abc')).toHaveLength(1);
    expect(filterFragmentCandidates(sample, 'day/')).toHaveLength(1);
  });

  it('matches label substring', () => {
    expect(filterFragmentCandidates(sample, 'another')).toHaveLength(1);
  });

  it('is case-insensitive', () => {
    expect(filterFragmentCandidates(sample, 'DAY/')).toHaveLength(1);
  });

  it('returns [] when nothing matches', () => {
    expect(filterFragmentCandidates(sample, 'zzzzz')).toEqual([]);
  });
});
