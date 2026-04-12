import { describe, it, expect } from 'vitest';
import { generateLogId, isUlid } from '@features/textlog/log-id';

describe('generateLogId', () => {
  it('produces a 26-character string', () => {
    const id = generateLogId();
    expect(id).toHaveLength(26);
  });

  it('uses only Crockford Base32 characters', () => {
    const id = generateLogId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it('generates unique IDs across many calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateLogId());
    expect(ids.size).toBe(1000);
  });

  it('is k-sortable lexicographically by timestamp', () => {
    const t1 = 1_700_000_000_000;
    const t2 = 1_700_000_001_000;
    const t3 = 1_700_000_002_000;
    const a = generateLogId({ now: () => t1, random: () => 0 });
    const b = generateLogId({ now: () => t2, random: () => 0 });
    const c = generateLogId({ now: () => t3, random: () => 0 });
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it('produces identical IDs with identical clock and random sources', () => {
    const a = generateLogId({ now: () => 1_700_000_000_000, random: () => 0.5 });
    const b = generateLogId({ now: () => 1_700_000_000_000, random: () => 0.5 });
    expect(a).toBe(b);
  });

  it('varies the random tail when randomness changes', () => {
    const t = 1_700_000_000_000;
    const a = generateLogId({ now: () => t, random: () => 0.1 });
    const b = generateLogId({ now: () => t, random: () => 0.9 });
    // time prefix is equal, randomness suffix differs
    expect(a.slice(0, 10)).toBe(b.slice(0, 10));
    expect(a.slice(10)).not.toBe(b.slice(10));
  });

  it('throws for a negative or non-finite timestamp', () => {
    expect(() => generateLogId({ now: () => -1 })).toThrow();
    expect(() => generateLogId({ now: () => Number.NaN })).toThrow();
    expect(() => generateLogId({ now: () => Number.POSITIVE_INFINITY })).toThrow();
  });

  it('handles random sources that return 1.0 at the boundary', () => {
    const id = generateLogId({ now: () => 0, random: () => 0.9999999 });
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });
});

describe('isUlid', () => {
  it('accepts a freshly generated ULID', () => {
    expect(isUlid(generateLogId())).toBe(true);
  });

  it('rejects legacy `log-<ts>-<n>` IDs', () => {
    expect(isUlid('log-1744185600000-1')).toBe(false);
  });

  it('rejects wrong-length strings', () => {
    expect(isUlid('')).toBe(false);
    expect(isUlid('ABC')).toBe(false);
    expect(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV0')).toBe(false); // 27
  });

  it('rejects out-of-alphabet characters', () => {
    // Crockford excludes I, L, O, U.
    const bad = '01ARZ3NDEKTSV4RRFFQ69G5FAI'; // contains 'I'
    expect(isUlid(bad)).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isUlid(undefined as unknown as string)).toBe(false);
    expect(isUlid(null as unknown as string)).toBe(false);
    expect(isUlid(123 as unknown as string)).toBe(false);
  });
});
