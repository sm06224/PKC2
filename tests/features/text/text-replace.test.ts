import { describe, it, expect } from 'vitest';
import {
  buildFindRegex,
  countMatches,
  replaceAll,
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
