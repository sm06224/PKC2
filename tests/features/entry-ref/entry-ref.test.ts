import { describe, it, expect } from 'vitest';
import {
  parseEntryRef,
  formatEntryRef,
  isValidEntryRef,
} from '@features/entry-ref/entry-ref';

describe('parseEntryRef — entry-only', () => {
  it('parses a bare entry reference', () => {
    expect(parseEntryRef('entry:abc-123')).toEqual({ kind: 'entry', lid: 'abc-123' });
  });

  it('rejects an empty lid', () => {
    expect(parseEntryRef('entry:').kind).toBe('invalid');
  });

  it('rejects an lid with disallowed characters', () => {
    expect(parseEntryRef('entry:hello world').kind).toBe('invalid');
    expect(parseEntryRef('entry:a/b').kind).toBe('invalid');
  });
});

describe('parseEntryRef — log fragment', () => {
  it('parses entry:<lid>#log/<id> (ULID)', () => {
    expect(parseEntryRef('entry:lid-abc#log/01JABCDEF0GHJKMNPQRSTV')).toEqual({
      kind: 'log',
      lid: 'lid-abc',
      logId: '01JABCDEF0GHJKMNPQRSTV',
    });
  });

  it('parses entry:<lid>#log/<legacy-id-with-dashes>', () => {
    expect(parseEntryRef('entry:lid#log/log-1744185600000-1')).toEqual({
      kind: 'log',
      lid: 'lid',
      logId: 'log-1744185600000-1',
    });
  });

  it('rejects empty logId after log/', () => {
    expect(parseEntryRef('entry:lid#log/').kind).toBe('invalid');
  });
});

describe('parseEntryRef — range fragment', () => {
  it('parses entry:<lid>#log/<a>..<b>', () => {
    expect(parseEntryRef('entry:lid#log/aaa..bbb')).toEqual({
      kind: 'range',
      lid: 'lid',
      fromId: 'aaa',
      toId: 'bbb',
    });
  });

  it('rejects empty from or to', () => {
    expect(parseEntryRef('entry:lid#log/..bbb').kind).toBe('invalid');
    expect(parseEntryRef('entry:lid#log/aaa..').kind).toBe('invalid');
  });
});

describe('parseEntryRef — day fragment', () => {
  it('parses entry:<lid>#day/<yyyy-mm-dd>', () => {
    expect(parseEntryRef('entry:lid#day/2026-04-12')).toEqual({
      kind: 'day',
      lid: 'lid',
      dateKey: '2026-04-12',
    });
  });

  it('rejects non-calendar dates (Feb 30, month 13)', () => {
    expect(parseEntryRef('entry:lid#day/2026-02-30').kind).toBe('invalid');
    expect(parseEntryRef('entry:lid#day/2026-13-01').kind).toBe('invalid');
  });

  it('rejects malformed date shapes', () => {
    expect(parseEntryRef('entry:lid#day/2026-4-9').kind).toBe('invalid');
    expect(parseEntryRef('entry:lid#day/20260412').kind).toBe('invalid');
    expect(parseEntryRef('entry:lid#day/').kind).toBe('invalid');
  });
});

describe('parseEntryRef — heading fragment', () => {
  it('parses entry:<lid>#log/<id>/<slug>', () => {
    expect(parseEntryRef('entry:lid#log/01ABC/my-heading')).toEqual({
      kind: 'heading',
      lid: 'lid',
      logId: '01ABC',
      slug: 'my-heading',
    });
  });

  it('rejects slugs with disallowed characters', () => {
    expect(parseEntryRef('entry:lid#log/id/slug with space').kind).toBe('invalid');
    expect(parseEntryRef('entry:lid#log/id/slug_underscore').kind).toBe('invalid');
  });

  it('rejects empty slug', () => {
    expect(parseEntryRef('entry:lid#log/id/').kind).toBe('invalid');
  });
});

describe('parseEntryRef — legacy fragment', () => {
  it('parses entry:<lid>#<legacy-id> (no log/ prefix)', () => {
    expect(parseEntryRef('entry:lid#log-1744185600000-1')).toEqual({
      kind: 'legacy',
      lid: 'lid',
      logId: 'log-1744185600000-1',
    });
  });

  it('treats a bare ULID after # as legacy form', () => {
    expect(parseEntryRef('entry:lid#01JABCDEF0GHJKMNPQRSTV')).toEqual({
      kind: 'legacy',
      lid: 'lid',
      logId: '01JABCDEF0GHJKMNPQRSTV',
    });
  });
});

describe('parseEntryRef — invalid inputs', () => {
  it('rejects non-entry schemes', () => {
    expect(parseEntryRef('asset:key').kind).toBe('invalid');
    expect(parseEntryRef('http://example.com').kind).toBe('invalid');
    expect(parseEntryRef('').kind).toBe('invalid');
  });

  it('rejects unknown fragment prefixes', () => {
    expect(parseEntryRef('entry:lid#week/2026-W14').kind).toBe('invalid');
    // '#' with an empty fragment is malformed.
    expect(parseEntryRef('entry:lid#').kind).toBe('invalid');
  });

  it('never throws for exotic input', () => {
    expect(() => parseEntryRef(undefined as unknown as string)).not.toThrow();
    expect(() => parseEntryRef(null as unknown as string)).not.toThrow();
    expect(() => parseEntryRef(42 as unknown as string)).not.toThrow();
    expect(parseEntryRef(undefined as unknown as string).kind).toBe('invalid');
  });
});

describe('formatEntryRef', () => {
  it('round-trips canonical forms', () => {
    const inputs = [
      'entry:lid',
      'entry:lid#log/01JABCDEF',
      'entry:lid#log/aaa..bbb',
      'entry:lid#day/2026-04-12',
      'entry:lid#log/01ABC/my-heading',
    ];
    for (const s of inputs) {
      expect(formatEntryRef(parseEntryRef(s))).toBe(s);
    }
  });

  it('preserves the legacy form when re-emitting a legacy parse', () => {
    const s = 'entry:lid#log-1744185600000-1';
    expect(formatEntryRef(parseEntryRef(s))).toBe(s);
  });

  it('does NOT silently promote legacy refs to canonical on format', () => {
    // Callers that want canonical must construct a fresh { kind:'log' }.
    const parsed = parseEntryRef('entry:lid#old-id');
    expect(parsed).toEqual({ kind: 'legacy', lid: 'lid', logId: 'old-id' });
    expect(formatEntryRef(parsed)).toBe('entry:lid#old-id');
    // explicit canonical construction:
    const canonical = formatEntryRef({ kind: 'log', lid: 'lid', logId: 'old-id' });
    expect(canonical).toBe('entry:lid#log/old-id');
  });

  it('echoes the raw string for an invalid ref', () => {
    const parsed = parseEntryRef('not-a-ref');
    expect(formatEntryRef(parsed)).toBe('not-a-ref');
  });
});

describe('isValidEntryRef', () => {
  it('returns true for every canonical form', () => {
    expect(isValidEntryRef('entry:a')).toBe(true);
    expect(isValidEntryRef('entry:a#log/x')).toBe(true);
    expect(isValidEntryRef('entry:a#log/x..y')).toBe(true);
    expect(isValidEntryRef('entry:a#day/2026-04-12')).toBe(true);
    expect(isValidEntryRef('entry:a#log/x/s')).toBe(true);
    expect(isValidEntryRef('entry:a#legacy-id')).toBe(true);
  });

  it('returns false for malformed strings', () => {
    expect(isValidEntryRef('entry:')).toBe(false);
    expect(isValidEntryRef('entry:a#')).toBe(false);
    expect(isValidEntryRef('asset:k')).toBe(false);
  });
});

// PR-V17 U1(2026-05-14、TEXTLOG redesign Phase 1 §4.5):context-relative
// fragment-only ref。`#log/...` / `#day/...` を opts.currentLid 経由で同
// entry 内 ref として parse。
describe('parseEntryRef — context-relative fragment(PR-V17)', () => {
  it('#log/<id> with currentLid → log kind same entry', () => {
    const r = parseEntryRef('#log/abc', { currentLid: 'my-entry' });
    expect(r.kind).toBe('log');
    if (r.kind === 'log') {
      expect(r.lid).toBe('my-entry');
      expect(r.logId).toBe('abc');
    }
  });

  it('#day/2026-04-12 with currentLid → day kind same entry', () => {
    const r = parseEntryRef('#day/2026-04-12', { currentLid: 'tl-1' });
    expect(r.kind).toBe('day');
    if (r.kind === 'day') {
      expect(r.lid).toBe('tl-1');
      expect(r.dateKey).toBe('2026-04-12');
    }
  });

  it('#log/<a>..<b> with currentLid → range kind same entry', () => {
    const r = parseEntryRef('#log/a..b', { currentLid: 'cur' });
    expect(r.kind).toBe('range');
    if (r.kind === 'range') expect(r.lid).toBe('cur');
  });

  it('#log/<id>/<slug> with currentLid → heading kind same entry', () => {
    const r = parseEntryRef('#log/x/section-1', { currentLid: 'tl' });
    expect(r.kind).toBe('heading');
    if (r.kind === 'heading') expect(r.slug).toBe('section-1');
  });

  it('#<legacy-id> with currentLid → legacy kind same entry', () => {
    const r = parseEntryRef('#log-12345', { currentLid: 'cur' });
    expect(r.kind).toBe('legacy');
  });

  it('#frag without currentLid → invalid(prefix 必須)', () => {
    const r = parseEntryRef('#log/abc');
    expect(r.kind).toBe('invalid');
  });

  it('#frag with empty currentLid → invalid', () => {
    const r = parseEntryRef('#log/abc', { currentLid: '' });
    expect(r.kind).toBe('invalid');
  });

  it('entry:lid#... is unaffected by currentLid(explicit prefix wins)', () => {
    const r = parseEntryRef('entry:explicit#log/abc', { currentLid: 'other' });
    expect(r.kind).toBe('log');
    if (r.kind === 'log') expect(r.lid).toBe('explicit');
  });

  it('malformed currentLid:invalid lid token in opts → invalid', () => {
    const r = parseEntryRef('#log/abc', { currentLid: 'bad lid with spaces' });
    expect(r.kind).toBe('invalid');
  });

  it('#day/<invalid-date> → invalid even with currentLid', () => {
    const r = parseEntryRef('#day/2026-13-99', { currentLid: 'cur' });
    expect(r.kind).toBe('invalid');
  });
});
