import { describe, it, expect } from 'vitest';
import {
  buildTextlogDoc,
  toLocalDateKey,
} from '@features/textlog/textlog-doc';
import type { Entry } from '../../../src/core/model/record';

function makeTextlogEntry(entries: { id: string; text: string; createdAt: string; flags?: string[] }[]): Entry {
  return {
    lid: 'lid-abc',
    title: 'Sample TEXTLOG',
    archetype: 'textlog',
    body: JSON.stringify({
      entries: entries.map((e) => ({ ...e, flags: e.flags ?? [] })),
    }),
    created_at: '2026-04-09T00:00:00Z',
    updated_at: '2026-04-12T00:00:00Z',
  };
}

function makeTextEntry(body: string): Entry {
  return {
    lid: 'lid-text',
    title: 'Plain text',
    archetype: 'text',
    body,
    created_at: '2026-04-09T00:00:00Z',
    updated_at: '2026-04-09T00:00:00Z',
  };
}

describe('buildTextlogDoc', () => {
  it('returns an empty document for a TEXTLOG entry with no logs', () => {
    const doc = buildTextlogDoc(makeTextlogEntry([]));
    expect(doc.sourceLid).toBe('lid-abc');
    expect(doc.order).toBe('asc');
    expect(doc.sections).toEqual([]);
  });

  it('returns an empty document for non-textlog archetypes', () => {
    const doc = buildTextlogDoc(makeTextEntry('# Hello'));
    expect(doc.sections).toEqual([]);
    expect(doc.sourceLid).toBe('lid-text');
  });

  it('groups logs into per-day sections', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 'first',  createdAt: '2026-04-09T10:00:00Z' },
      { id: 'b', text: 'second', createdAt: '2026-04-09T11:00:00Z' },
      { id: 'c', text: 'third',  createdAt: '2026-04-10T09:00:00Z' },
    ]);
    const doc = buildTextlogDoc(entry);
    expect(doc.sections.map((s) => s.dateKey)).toEqual(['2026-04-09', '2026-04-10']);
    expect(doc.sections[0]!.logs.map((l) => l.id)).toEqual(['a', 'b']);
    expect(doc.sections[1]!.logs.map((l) => l.id)).toEqual(['c']);
  });

  it("applies `order='asc'` to both day sections and logs within each day", () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 't1', createdAt: '2026-04-09T10:00:00Z' },
      { id: 'b', text: 't2', createdAt: '2026-04-09T11:00:00Z' },
      { id: 'c', text: 't3', createdAt: '2026-04-10T09:00:00Z' },
    ]);
    const doc = buildTextlogDoc(entry, { order: 'asc' });
    expect(doc.sections.map((s) => s.dateKey)).toEqual(['2026-04-09', '2026-04-10']);
    expect(doc.sections[0]!.logs.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it("applies `order='desc'` symmetrically to sections AND logs within each day", () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 't1', createdAt: '2026-04-09T10:00:00Z' },
      { id: 'b', text: 't2', createdAt: '2026-04-09T11:00:00Z' },
      { id: 'c', text: 't3', createdAt: '2026-04-10T09:00:00Z' },
      { id: 'd', text: 't4', createdAt: '2026-04-10T10:00:00Z' },
    ]);
    const doc = buildTextlogDoc(entry, { order: 'desc' });
    // Newest day first.
    expect(doc.sections.map((s) => s.dateKey)).toEqual(['2026-04-10', '2026-04-09']);
    // AND within each day, newest log first (contract: single `order`
    // drives both layers).
    expect(doc.sections[0]!.logs.map((l) => l.id)).toEqual(['d', 'c']);
    expect(doc.sections[1]!.logs.map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('defaults order to "asc" when options are omitted', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 't1', createdAt: '2026-04-09T10:00:00Z' },
      { id: 'b', text: 't2', createdAt: '2026-04-10T10:00:00Z' },
    ]);
    const doc = buildTextlogDoc(entry);
    expect(doc.order).toBe('asc');
    expect(doc.sections.map((s) => s.dateKey)).toEqual(['2026-04-09', '2026-04-10']);
  });

  it('preserves mixed legacy and ULID log IDs verbatim', () => {
    const entry = makeTextlogEntry([
      { id: 'log-1744185600000-1', text: 'legacy', createdAt: '2026-04-09T10:00:00Z' },
      { id: '01JABCDEF0GHJKMNPQRSTV', text: 'new',  createdAt: '2026-04-09T11:00:00Z' },
    ]);
    const doc = buildTextlogDoc(entry);
    expect(doc.sections[0]!.logs.map((l) => l.id)).toEqual([
      'log-1744185600000-1',
      '01JABCDEF0GHJKMNPQRSTV',
    ]);
  });

  it('does not mutate the source entry or its body', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 't1', createdAt: '2026-04-09T10:00:00Z', flags: ['important'] },
    ]);
    const bodyBefore = entry.body;
    const doc = buildTextlogDoc(entry);
    // Mutate the derived doc — original must be untouched.
    doc.sections[0]!.logs[0]!.flags.push('important');
    const bodyAfter = entry.body;
    expect(bodyAfter).toBe(bodyBefore);
  });

  it('places logs with unparseable timestamps into an empty-key bucket', () => {
    const entry = makeTextlogEntry([
      { id: 'bad', text: 'broken', createdAt: 'not-a-date' },
      { id: 'ok',  text: 'ok',     createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const doc = buildTextlogDoc(entry, { order: 'asc' });
    expect(doc.sections.map((s) => s.dateKey)).toEqual(['', '2026-04-09']);
    expect(doc.sections[0]!.logs.map((l) => l.id)).toEqual(['bad']);
  });

  it('preserves raw ISO timestamps on LogArticle (no reformatting)', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 't', createdAt: '2026-04-09T10:00:00.123Z' },
    ]);
    const doc = buildTextlogDoc(entry);
    expect(doc.sections[0]!.logs[0]!.createdAt).toBe('2026-04-09T10:00:00.123Z');
  });

  it('carries flags through to LogArticle', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 't', createdAt: '2026-04-09T10:00:00Z', flags: ['important'] },
    ]);
    const doc = buildTextlogDoc(entry);
    expect(doc.sections[0]!.logs[0]!.flags).toEqual(['important']);
  });

  it('exposes the raw markdown source in bodySource (unresolved)', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 'see ![](asset:k1) and [x](entry:other)', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const doc = buildTextlogDoc(entry);
    expect(doc.sections[0]!.logs[0]!.bodySource).toBe(
      'see ![](asset:k1) and [x](entry:other)',
    );
  });
});

describe('toLocalDateKey', () => {
  it('formats a valid ISO into yyyy-mm-dd (local time)', () => {
    const d = new Date(2026, 3, 9); // 2026-04-09 local
    expect(toLocalDateKey(d.toISOString())).toBe('2026-04-09');
  });

  it('returns the empty string for an unparseable input', () => {
    expect(toLocalDateKey('')).toBe('');
    expect(toLocalDateKey('not-a-date')).toBe('');
  });

  it('zero-pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5); // Jan 5
    expect(toLocalDateKey(d.toISOString())).toBe('2026-01-05');
  });
});
