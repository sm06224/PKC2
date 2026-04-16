import { describe, it, expect } from 'vitest';
import {
  buildFindRegex,
  countMatches,
  countMatchesInRange,
  replaceAll,
  replaceAllInRange,
} from '@features/text/text-replace';

describe('buildFindRegex', () => {
  it('returns an error for an empty query', () => {
    const r = buildFindRegex('', { regex: false, caseSensitive: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/empty/i);
  });

  it('escapes regex metacharacters in plain mode', () => {
    const r = buildFindRegex('a.b+c', { regex: false, caseSensitive: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // The produced regex should only match the literal "a.b+c"
      expect('a.b+c'.match(r.regex)).not.toBeNull();
      expect('axbxc'.match(r.regex)).toBeNull();
    }
  });

  it('uses gi flags when case-insensitive', () => {
    const r = buildFindRegex('abc', { regex: false, caseSensitive: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.regex.flags).toContain('g');
      expect(r.regex.flags).toContain('i');
    }
  });

  it('uses g only when case-sensitive', () => {
    const r = buildFindRegex('abc', { regex: false, caseSensitive: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.regex.flags).toContain('g');
      expect(r.regex.flags).not.toContain('i');
    }
  });

  it('accepts a valid regex pattern', () => {
    const r = buildFindRegex('a\\d+b', { regex: true, caseSensitive: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect('a123b'.match(r.regex)).not.toBeNull();
    }
  });

  it('returns an error for an invalid regex', () => {
    const r = buildFindRegex('[unclosed', { regex: true, caseSensitive: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });
});

describe('countMatches', () => {
  const BODY = 'Apple apple APPLE orange apple';

  it('counts plain case-insensitive matches', () => {
    const n = countMatches(BODY, 'apple', { regex: false, caseSensitive: false });
    expect(n).toBe(4);
  });

  it('counts plain case-sensitive matches', () => {
    const n = countMatches(BODY, 'apple', { regex: false, caseSensitive: true });
    expect(n).toBe(2);
  });

  it('counts regex matches', () => {
    const n = countMatches(
      'one1 two22 three333',
      '\\d+',
      { regex: true, caseSensitive: true },
    );
    expect(n).toBe(3);
  });

  it('returns 0 for an empty query', () => {
    expect(countMatches(BODY, '', { regex: false, caseSensitive: false })).toBe(0);
  });

  it('returns 0 for an invalid regex', () => {
    expect(
      countMatches(BODY, '[unclosed', { regex: true, caseSensitive: false }),
    ).toBe(0);
  });

  it('returns 0 when nothing matches', () => {
    expect(countMatches(BODY, 'banana', { regex: false, caseSensitive: false })).toBe(0);
  });
});

describe('replaceAll', () => {
  it('replaces plain text case-insensitively', () => {
    const out = replaceAll(
      'Apple apple APPLE',
      'apple',
      'pear',
      { regex: false, caseSensitive: false },
    );
    expect(out).toBe('pear pear pear');
  });

  it('replaces plain text case-sensitively', () => {
    const out = replaceAll(
      'Apple apple APPLE',
      'apple',
      'pear',
      { regex: false, caseSensitive: true },
    );
    expect(out).toBe('Apple pear APPLE');
  });

  it('respects regex back-references in regex mode', () => {
    const out = replaceAll(
      'John Smith, Mary Jane',
      '(\\w+) (\\w+)',
      '$2 $1',
      { regex: true, caseSensitive: true },
    );
    expect(out).toBe('Smith John, Jane Mary');
  });

  it('escapes $ in the replacement string in plain mode', () => {
    // User wants to replace "foo" with the literal "$1" — and we
    // must NOT interpret that as a back-reference.
    const out = replaceAll(
      'foo foo foo',
      'foo',
      '$1',
      { regex: false, caseSensitive: true },
    );
    expect(out).toBe('$1 $1 $1');
  });

  it('returns body unchanged for an empty query', () => {
    const out = replaceAll('body', '', 'x', { regex: false, caseSensitive: false });
    expect(out).toBe('body');
  });

  it('returns body unchanged for an invalid regex', () => {
    const out = replaceAll(
      'body',
      '[unclosed',
      'x',
      { regex: true, caseSensitive: false },
    );
    expect(out).toBe('body');
  });

  it('returns body unchanged when nothing matches (no-op apply)', () => {
    const body = 'hello world';
    const out = replaceAll(body, 'xxx', 'yyy', {
      regex: false,
      caseSensitive: false,
    });
    expect(out).toBe(body);
  });

  it('handles an empty replacement (delete all matches)', () => {
    const out = replaceAll(
      'remove-me and-remove-me',
      'remove-me',
      '',
      { regex: false, caseSensitive: true },
    );
    expect(out).toBe(' and-');
  });
});

describe('countMatchesInRange', () => {
  const BODY = 'apple apple apple';

  it('counts only matches that fall inside [start, end)', () => {
    // Selection covers the first two "apple"s.
    const n = countMatchesInRange(
      BODY,
      0,
      11,
      'apple',
      { regex: false, caseSensitive: true },
    );
    expect(n).toBe(2);
  });

  it('returns 0 when the range is empty (start === end)', () => {
    const n = countMatchesInRange(
      BODY,
      5,
      5,
      'apple',
      { regex: false, caseSensitive: true },
    );
    expect(n).toBe(0);
  });

  it('returns 0 for a negative / inverted / out-of-bounds range', () => {
    expect(countMatchesInRange(BODY, -1, 5, 'apple', { regex: false, caseSensitive: true })).toBe(0);
    expect(countMatchesInRange(BODY, 10, 5, 'apple', { regex: false, caseSensitive: true })).toBe(0);
    expect(countMatchesInRange(BODY, 0, BODY.length + 10, 'apple', { regex: false, caseSensitive: true })).toBe(0);
  });

  it('respects case-sensitive option inside the range', () => {
    const body = 'Apple APPLE apple';
    const n = countMatchesInRange(body, 0, 11, 'apple', {
      regex: false,
      caseSensitive: true,
    });
    expect(n).toBe(0);
    const m = countMatchesInRange(body, 0, 11, 'apple', {
      regex: false,
      caseSensitive: false,
    });
    expect(m).toBe(2);
  });

  it('honours regex mode inside the range', () => {
    const body = 'a1 a22 a333';
    const n = countMatchesInRange(body, 0, 6, 'a\\d+', {
      regex: true,
      caseSensitive: true,
    });
    expect(n).toBe(2);
  });
});

describe('replaceAllInRange', () => {
  const BODY = 'apple apple apple';

  it('replaces only inside the range and stitches the rest verbatim', () => {
    const out = replaceAllInRange(
      BODY,
      0,
      11,
      'apple',
      'pear',
      { regex: false, caseSensitive: true },
    );
    expect(out).toBe('pear pear apple');
  });

  it('leaves the body unchanged when range has no hits', () => {
    const out = replaceAllInRange(
      BODY,
      0,
      5,
      'banana',
      'x',
      { regex: false, caseSensitive: true },
    );
    expect(out).toBe(BODY);
  });

  it('leaves the body unchanged when the range is empty', () => {
    const out = replaceAllInRange(
      BODY,
      5,
      5,
      'apple',
      'x',
      { regex: false, caseSensitive: true },
    );
    expect(out).toBe(BODY);
  });

  it('leaves the body unchanged for an invalid range', () => {
    expect(
      replaceAllInRange(BODY, -1, 5, 'apple', 'x', { regex: false, caseSensitive: true }),
    ).toBe(BODY);
    expect(
      replaceAllInRange(BODY, 10, 5, 'apple', 'x', { regex: false, caseSensitive: true }),
    ).toBe(BODY);
  });

  it('supports regex back-references inside the range', () => {
    const body = 'John Smith lived here; Mary Jane lived there';
    const out = replaceAllInRange(
      body,
      0,
      10,
      '(\\w+) (\\w+)',
      '$2 $1',
      { regex: true, caseSensitive: true },
    );
    expect(out).toBe('Smith John lived here; Mary Jane lived there');
  });

  it('produces a length-changing replacement that shifts content after the range', () => {
    const body = '[aa][aa][aa]';
    // Replace "aa" with "bbbb" but only in the first two brackets.
    const out = replaceAllInRange(
      body,
      0,
      8,
      'aa',
      'bbbb',
      { regex: false, caseSensitive: true },
    );
    // First two brackets expanded; the third is verbatim.
    expect(out).toBe('[bbbb][bbbb][aa]');
  });
});
