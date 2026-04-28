import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  findSubLocationHits,
  __resetSubLocationHitsCacheForTest,
} from '@features/search/sub-location-search';
import type { Entry } from '@core/model/record';

/**
 * PR #190 — prefix-incremental no-match cache contract.
 *
 * Tests pin the cache invariants the renderer's hot path relies on:
 *   1. correctness preservation (existing P-1..P-21 still pass; this
 *      file adds prefix-walking + invalidation cases)
 *   2. cache hit when the user extends the previous query
 *   3. cache invalidates when the query shrinks
 *   4. cache invalidates when the query changes to a non-extension
 *   5. WeakSet keying: a fresh Entry reference (post-COMMIT_EDIT)
 *      is NOT cached as no-match even if the lid is the same
 *
 * Correctness proxy: rather than counting body-scan calls (would need
 * mocking), we use Spy on Entry.body access — every body-scan call
 * reads `.body`. A cached no-match skips the read.
 */

const T = '2026-04-28T00:00:00Z';

beforeEach(() => {
  __resetSubLocationHitsCacheForTest();
});

function makeEntry(lid: string, body: string): Entry {
  return {
    lid,
    title: lid,
    archetype: 'text',
    body,
    created_at: T,
    updated_at: T,
  };
}

function spyOnBody(entry: Entry): { reads: number; restore: () => void } {
  const original = entry.body;
  let reads = 0;
  Object.defineProperty(entry, 'body', {
    configurable: true,
    get: () => {
      reads++;
      return original;
    },
  });
  return {
    get reads() { return reads; },
    restore() {
      Object.defineProperty(entry, 'body', {
        configurable: true,
        writable: true,
        value: original,
      });
    },
  };
}

describe('findSubLocationHits — PR #190 prefix-incremental cache', () => {
  it('returns the same hits for same query (correctness preserved)', () => {
    const entry = makeEntry('e1', 'meeting agenda for project meet');
    const hits1 = findSubLocationHits(entry, 'meet');
    const hits2 = findSubLocationHits(entry, 'meet');
    expect(hits2).toEqual(hits1);
  });

  it('cache hit on extension: no-match on "me" → no body re-scan on "mee"', () => {
    const entry = makeEntry('e1', 'no overlap with the new search');
    const initial = findSubLocationHits(entry, 'me');
    expect(initial).toEqual([]);

    const spy = spyOnBody(entry);
    try {
      const hits = findSubLocationHits(entry, 'mee');
      expect(hits).toEqual([]);
      expect(spy.reads).toBe(0); // cache short-circuit, body never read
    } finally {
      spy.restore();
    }
  });

  it('cache hit chains across multiple extensions: "m" → "me" → "mee" → "meet"', () => {
    const entry = makeEntry('e1', 'absolutely no overlap');
    findSubLocationHits(entry, 'm'); // populate cache as no-match
    const spy = spyOnBody(entry);
    try {
      findSubLocationHits(entry, 'me');
      findSubLocationHits(entry, 'mee');
      findSubLocationHits(entry, 'meet');
      expect(spy.reads).toBe(0); // every extension was cache-hit
    } finally {
      spy.restore();
    }
  });

  it('cache invalidates when query shrinks (longer → shorter)', () => {
    const entry = makeEntry('e1', 'abc');
    findSubLocationHits(entry, 'xyz'); // no-match
    const spy = spyOnBody(entry);
    try {
      // Shorter query "xy" is NOT an extension of "xyz" — cache must
      // invalidate and the body must be re-scanned.
      findSubLocationHits(entry, 'xy');
      expect(spy.reads).toBeGreaterThan(0);
    } finally {
      spy.restore();
    }
  });

  it('cache invalidates when query changes to non-extension', () => {
    const entry = makeEntry('e1', 'abc');
    findSubLocationHits(entry, 'xy'); // no-match
    const spy = spyOnBody(entry);
    try {
      // "ab" is a different query, not an extension of "xy". Body
      // contains "abc" → the new query DOES match. Cache must
      // invalidate.
      const hits = findSubLocationHits(entry, 'ab');
      expect(hits.length).toBeGreaterThan(0);
      expect(spy.reads).toBeGreaterThan(0);
    } finally {
      spy.restore();
    }
  });

  it('a different Entry reference (post-edit) is NOT in the no-match set', () => {
    const e1 = makeEntry('e1', 'abc');
    findSubLocationHits(e1, 'xyz'); // no-match → e1 cached
    // Simulate COMMIT_EDIT producing a new Entry reference for the
    // same lid with new body that DOES match.
    const e1New = makeEntry('e1', 'xyz here');
    const hits = findSubLocationHits(e1New, 'xyz');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('matching entries are NOT poisoned into the no-match set', () => {
    const matcher = makeEntry('match', 'meet here');
    const nonMatcher = makeEntry('nope', 'no overlap');
    findSubLocationHits(matcher, 'meet');     // hit
    findSubLocationHits(nonMatcher, 'meet');  // no-match
    // Now query extended:
    const hits = findSubLocationHits(matcher, 'meeti');
    // "meet here" doesn't contain "meeti" → returns empty BUT body
    // must still be scanned because matcher was never a no-match.
    expect(hits).toEqual([]);
    // Re-extend to verify matcher cached as no-match for "meeti"
    const spy = spyOnBody(matcher);
    try {
      findSubLocationHits(matcher, 'meetin');
      expect(spy.reads).toBe(0); // now cached
    } finally {
      spy.restore();
    }
  });

  it('empty query returns empty regardless of cache state', () => {
    const entry = makeEntry('e1', 'meet');
    expect(findSubLocationHits(entry, '')).toEqual([]);
    expect(findSubLocationHits(entry, '   ')).toEqual([]);
  });

  it('non-text/textlog archetype returns empty without polluting cache', () => {
    const entry: Entry = {
      lid: 'a1', title: 'pic', archetype: 'attachment', body: '{}',
      created_at: T, updated_at: T,
    };
    expect(findSubLocationHits(entry, 'meet')).toEqual([]);
    // The next text query must still scan a fresh entry's body.
    const text = makeEntry('t1', 'meet here');
    const hits = findSubLocationHits(text, 'meet');
    expect(hits.length).toBeGreaterThan(0);
  });

  // Avoid unused vi import warning under strict lint.
  it('spy harness sanity check', () => {
    const spy = spyOnBody({ ...makeEntry('x', 'ok') });
    expect(spy.reads).toBe(0);
    spy.restore();
    vi.clearAllMocks();
  });
});
