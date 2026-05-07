import { describe, it, expect, vi } from 'vitest';
import { extractIsbn, fetchOpenBd, openBdToFrontmatter } from '@features/auto-fill/openbd';

describe('extractIsbn', () => {
  it('extracts ISBN from raw 10/13 digit strings', () => {
    expect(extractIsbn('9784062748681')).toBe('9784062748681');
    expect(extractIsbn('4062748681')).toBe('4062748681');
    expect(extractIsbn('978-4-06-274868-1')).toBe('9784062748681');
  });

  it('extracts ASIN/ISBN from Amazon /dp/ URLs', () => {
    expect(extractIsbn('https://www.amazon.co.jp/dp/4062748681')).toBe('4062748681');
    expect(extractIsbn('https://amazon.com/dp/B0DRABCDEF/')).toBe('B0DRABCDEF');
  });

  it('returns null when no ISBN-like sequence is present', () => {
    expect(extractIsbn('plain text')).toBeNull();
    expect(extractIsbn('')).toBeNull();
  });
});

describe('fetchOpenBd', () => {
  it('returns the first summary on success', async () => {
    const summary = { isbn: '9784062748681', title: 'ノルウェイの森', author: '村上 春樹' };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [{ summary }],
    } as unknown as Response));
    const out = await fetchOpenBd('9784062748681', fetchMock as unknown as typeof fetch);
    expect(out).toEqual(summary);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('returns null on empty array', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [null],
    } as unknown as Response));
    const out = await fetchOpenBd('0000000000', fetchMock as unknown as typeof fetch);
    expect(out).toBeNull();
  });

  it('throws on non-2xx', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as unknown as Response));
    await expect(
      fetchOpenBd('9784062748681', fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/503/);
  });

  it('returns null for empty isbn', async () => {
    const fetchMock = vi.fn();
    const out = await fetchOpenBd('', fetchMock as unknown as typeof fetch);
    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('openBdToFrontmatter', () => {
  it('extracts the year from pubdate', () => {
    const fm = openBdToFrontmatter({
      isbn: '9784062748681',
      title: 'ノルウェイの森',
      author: '村上 春樹',
      publisher: '講談社',
      pubdate: '20040907',
    });
    expect(fm.kind).toBe('book');
    expect(fm.year).toBe('2004');
  });

  it('omits fields that are missing', () => {
    expect(openBdToFrontmatter({ title: 'Bare' })).toEqual({ kind: 'book', title: 'Bare' });
  });
});
