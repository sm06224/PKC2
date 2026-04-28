import { describe, it, expect, beforeEach } from 'vitest';
import {
  findSubLocationHits,
  __resetSubLocationHitsCacheForTest,
} from '@features/search/sub-location-search';
import type { Entry } from '@core/model/record';

/**
 * PR #191 — prebuilt per-entry analysis cache contract.
 *
 * Caches `body.toLowerCase()` + `body.split('\n')` + lowercased lines
 * (and parsed textlog body) by Entry reference. Subsequent calls on
 * the same Entry ref skip every per-call allocation.
 *
 * Tests pin:
 *   1. correctness preservation — same hits for same input
 *   2. cache hit avoids re-reading `entry.body` (single read on
 *      first call, zero on subsequent calls)
 *   3. body change (post-COMMIT_EDIT new Entry ref) re-builds the
 *      analysis transparently
 *   4. textlog parses once (verified by spy on entry.body — same
 *      body-read pattern as text)
 */

const T = '2026-04-28T00:00:00Z';

beforeEach(() => {
  __resetSubLocationHitsCacheForTest();
});

function makeText(lid: string, body: string): Entry {
  return { lid, title: lid, archetype: 'text', body, created_at: T, updated_at: T };
}

function makeTextlog(lid: string, body: string): Entry {
  return { lid, title: lid, archetype: 'textlog', body, created_at: T, updated_at: T };
}

function spyOnBody(entry: Entry): { readonly reads: number; restore: () => void } {
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

describe('findSubLocationHits — PR #191 prebuilt analysis cache', () => {
  it('text: returns the same hits across repeated queries', () => {
    const entry = makeText('e1', 'meeting agenda for project meet');
    const a = findSubLocationHits(entry, 'meet');
    const b = findSubLocationHits(entry, 'meet');
    expect(b).toEqual(a);
  });

  it('text: body is read at most once even across many queries', () => {
    const entry = makeText('e1', 'meeting agenda for project meet');
    findSubLocationHits(entry, 'meet'); // populates the analysis cache
    const spy = spyOnBody(entry);
    try {
      findSubLocationHits(entry, 'me');
      findSubLocationHits(entry, 'meet');
      findSubLocationHits(entry, 'agenda');
      findSubLocationHits(entry, 'project');
      // After the first call, the analysis cache holds lines + lower
      // lines; no subsequent body read is needed.
      expect(spy.reads).toBe(0);
    } finally {
      spy.restore();
    }
  });

  it('text: a fresh Entry reference triggers a fresh analysis build', () => {
    const e1 = makeText('e1', 'hello world');
    findSubLocationHits(e1, 'hello'); // builds analysis for e1
    const e1New = makeText('e1', 'updated body with goodbye');
    const hits = findSubLocationHits(e1New, 'goodbye');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('textlog: parsed body is reused across queries', () => {
    const body = JSON.stringify({
      version: 1,
      entries: [
        { id: 'log-1', createdAt: T, text: 'meeting at 10am' },
        { id: 'log-2', createdAt: T, text: 'lunch with team' },
      ],
    });
    const entry = makeTextlog('e1', body);
    findSubLocationHits(entry, 'meet'); // builds analysis
    const spy = spyOnBody(entry);
    try {
      findSubLocationHits(entry, 'lunch');
      findSubLocationHits(entry, 'team');
      expect(spy.reads).toBe(0); // parsed body cached, no re-read
    } finally {
      spy.restore();
    }
  });

  it('correctness: heading hit attribution unchanged', () => {
    const entry = makeText('doc', '# H1\nbody one\n## H2\nmeet here');
    const hits = findSubLocationHits(entry, 'meet');
    expect(hits.length).toBe(1);
    expect(hits[0]!.kind).toBe('heading');
    expect(hits[0]!.label).toBe('H2');
  });

  it('correctness: fence skipping unchanged', () => {
    const entry = makeText('doc', '```\nmeet inside fence\n```\nmeet outside');
    const hits = findSubLocationHits(entry, 'meet');
    expect(hits.length).toBe(1);
    // Outside-fence hit only — fence content is skipped.
    expect(hits[0]!.snippet).toContain('outside');
  });
});
