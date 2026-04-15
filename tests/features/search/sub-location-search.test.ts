import { describe, it, expect } from 'vitest';
import { findSubLocationHits } from '@features/search/sub-location-search';
import type { Entry } from '@core/model/record';

/**
 * USER_REQUEST_LEDGER S-18 (A-4 FULL, 2026-04-14) — pure-function
 * coverage for the sub-location indexer. Renderer + navigation
 * integration pins live in tests/adapter/sub-location-*.test.ts.
 *
 * Contract:
 *   - TEXT archetype: hits attributed to nearest preceding heading
 *     slug (matches renderer's `heading_open` id). No heading →
 *     `entry:<lid>` fallback.
 *   - TEXTLOG archetype: hits attributed to `log:<logId>`.
 *   - All other archetypes → empty list (no sub-locations).
 *   - Empty query → empty list.
 *   - Dedup by sub-id: first match per heading / log wins.
 *   - maxPerEntry caps total hits.
 *   - Fenced code blocks are skipped.
 */

function makeEntry(archetype: Entry['archetype'], body: string, overrides: Partial<Entry> = {}): Entry {
  return {
    lid: overrides.lid ?? 'e1',
    title: overrides.title ?? 'Test Entry',
    body,
    archetype,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

describe('findSubLocationHits — TEXT archetype', () => {
  it('returns a heading-scoped hit for a match under a `# Heading`', () => {
    const body = [
      '# Intro',
      'This is the intro paragraph.',
      '',
      '# Details',
      'The widget specification says banana.',
    ].join('\n');
    const hits = findSubLocationHits(makeEntry('text', body), 'banana');
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatchObject({
      entryLid: 'e1',
      subId: 'heading:details',
      kind: 'heading',
      label: 'Details',
    });
    expect(hits[0]!.snippet).toContain('banana');
  });

  it('attributes to nearest preceding heading when multiple precede', () => {
    const body = [
      '# Top',
      '## Sub A',
      'alpha text',
      '## Sub B',
      'beta text has the word banana here',
    ].join('\n');
    const hits = findSubLocationHits(makeEntry('text', body), 'banana');
    expect(hits[0]!.subId).toBe('heading:sub-b');
  });

  it('falls back to `entry:<lid>` when no heading precedes the match', () => {
    const body = 'just a paragraph with banana inside\n# Later heading';
    const hits = findSubLocationHits(makeEntry('text', body, { lid: 'ef-1' }), 'banana');
    expect(hits[0]!.kind).toBe('entry');
    expect(hits[0]!.subId).toBe('entry:ef-1');
  });

  it('dedups multiple matches inside the same heading', () => {
    const body = [
      '# Topic',
      'banana banana banana',
      'another banana line',
    ].join('\n');
    const hits = findSubLocationHits(makeEntry('text', body), 'banana');
    expect(hits.length).toBe(1);
    expect(hits[0]!.subId).toBe('heading:topic');
  });

  it('produces multiple hits across distinct headings', () => {
    const body = [
      '# First',
      'banana 1',
      '# Second',
      'banana 2',
      '# Third',
      'banana 3',
    ].join('\n');
    const hits = findSubLocationHits(makeEntry('text', body), 'banana');
    expect(hits.length).toBe(3);
    expect(hits.map((h) => h.subId)).toEqual([
      'heading:first',
      'heading:second',
      'heading:third',
    ]);
  });

  it('respects maxPerEntry', () => {
    const body = [
      '# h1', 'banana x',
      '# h2', 'banana y',
      '# h3', 'banana z',
    ].join('\n');
    const hits = findSubLocationHits(makeEntry('text', body), 'banana', 2);
    expect(hits.length).toBe(2);
  });

  it('skips matches inside fenced code blocks', () => {
    const body = [
      '# Intro',
      'plain banana here',
      '```',
      'code banana here',
      '```',
      '# After',
      'second banana here',
    ].join('\n');
    const hits = findSubLocationHits(makeEntry('text', body), 'banana');
    // Expect only two hits (Intro + After). Code block is skipped.
    expect(hits.length).toBe(2);
    expect(hits.map((h) => h.subId)).toEqual(['heading:intro', 'heading:after']);
  });

  it('is case-insensitive', () => {
    const body = '# Case\nTHE BANANA IS YELLOW';
    const hits = findSubLocationHits(makeEntry('text', body), 'banana');
    expect(hits.length).toBe(1);
    expect(hits[0]!.snippet.toLowerCase()).toContain('banana');
  });

  it('returns [] for empty / whitespace-only query', () => {
    const body = '# h\nbanana';
    expect(findSubLocationHits(makeEntry('text', body), '')).toEqual([]);
    expect(findSubLocationHits(makeEntry('text', body), '   ')).toEqual([]);
  });
});

describe('findSubLocationHits — TEXTLOG archetype', () => {
  const logBody = JSON.stringify({
    entries: [
      {
        id: 'log-1',
        text: 'morning task - finish banana report',
        createdAt: '2026-04-10T09:00:00Z',
        flags: [],
      },
      {
        id: 'log-2',
        text: 'afternoon status update - no fruit today',
        createdAt: '2026-04-10T14:30:00Z',
        flags: [],
      },
      {
        id: 'log-3',
        text: 'wrap up the banana spec review',
        createdAt: '2026-04-10T17:45:00Z',
        flags: [],
      },
    ],
  });

  it('returns one hit per matching log entry with log:<id> subId', () => {
    const hits = findSubLocationHits(makeEntry('textlog', logBody), 'banana');
    expect(hits.length).toBe(2);
    expect(hits.map((h) => h.subId)).toEqual(['log:log-1', 'log:log-3']);
    expect(hits.every((h) => h.kind === 'log')).toBe(true);
  });

  it('formats the log label with HH:MM:SS prefix', () => {
    const hits = findSubLocationHits(makeEntry('textlog', logBody), 'banana');
    expect(hits[0]!.label.startsWith('09:00:00')).toBe(true);
    expect(hits[1]!.label.startsWith('17:45:00')).toBe(true);
  });

  it('case-insensitive match in log text', () => {
    const hits = findSubLocationHits(makeEntry('textlog', logBody), 'AFTERNOON');
    expect(hits.length).toBe(1);
    expect(hits[0]!.subId).toBe('log:log-2');
  });

  it('returns [] when no log matches', () => {
    const hits = findSubLocationHits(makeEntry('textlog', logBody), 'pineapple');
    expect(hits).toEqual([]);
  });

  it('respects maxPerEntry for textlog hits too', () => {
    const hits = findSubLocationHits(makeEntry('textlog', logBody), 'banana', 1);
    expect(hits.length).toBe(1);
  });

  it('handles malformed textlog body without throwing', () => {
    const hits = findSubLocationHits(makeEntry('textlog', 'not json'), 'anything');
    expect(hits).toEqual([]);
  });
});

describe('findSubLocationHits — non-text archetypes', () => {
  it.each(['todo', 'form', 'attachment', 'folder', 'generic', 'opaque'] as const)(
    'returns [] for archetype=%s',
    (archetype) => {
      const hits = findSubLocationHits(
        makeEntry(archetype, 'body contains banana here'),
        'banana',
      );
      expect(hits).toEqual([]);
    },
  );
});
