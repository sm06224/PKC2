import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '@features/search/query-parser';

/**
 * Parser minimum slice — W1 Tag wave.
 *
 * Pins the recognition rules for `tag:<value>` tokens inside the
 * raw sidebar search string. Raw string itself is NOT modified by
 * anything in this module; the parser just returns a classified
 * view for the filter pipeline.
 */

describe('parseSearchQuery — tag: token extraction', () => {
  it('extracts a single tag: token and empties the fullText', () => {
    const r = parseSearchQuery('tag:urgent');
    expect(Array.from(r.tags)).toEqual(['urgent']);
    expect(r.fullText).toBe('');
  });

  it('separates tag: tokens from surrounding plain text', () => {
    const r = parseSearchQuery('foo tag:urgent bar');
    expect(Array.from(r.tags)).toEqual(['urgent']);
    expect(r.fullText).toBe('foo bar');
  });

  it('accumulates multiple tag: tokens as an AND-within-axis set', () => {
    const r = parseSearchQuery('tag:urgent tag:review');
    expect(new Set(r.tags)).toEqual(new Set(['urgent', 'review']));
    expect(r.fullText).toBe('');
  });

  it('handles mixed order of tag: and plain text tokens', () => {
    const r = parseSearchQuery('bugfix tag:urgent parser tag:review');
    expect(new Set(r.tags)).toEqual(new Set(['urgent', 'review']));
    // fullText joins remaining tokens with a single space, preserving order.
    expect(r.fullText).toBe('bugfix parser');
  });

  it('deduplicates repeated tag: values', () => {
    const r = parseSearchQuery('tag:urgent tag:urgent');
    expect(Array.from(r.tags)).toEqual(['urgent']);
  });
});

describe('parseSearchQuery — edge cases', () => {
  it('treats a bare `tag:` as an empty token and drops it', () => {
    const r = parseSearchQuery('tag:');
    expect(r.tags.size).toBe(0);
    expect(r.fullText).toBe('');
  });

  it('drops `tag:` followed only by whitespace (tokens are split on whitespace)', () => {
    // "tag:   " collapses: the bare "tag:" is a single token with
    // empty value → dropped; remaining tokens are whitespace only.
    const r = parseSearchQuery('tag:   ');
    expect(r.tags.size).toBe(0);
    expect(r.fullText).toBe('');
  });

  it('returns empty result for an empty string', () => {
    const r = parseSearchQuery('');
    expect(r.tags.size).toBe(0);
    expect(r.fullText).toBe('');
  });

  it('returns empty result for whitespace-only input', () => {
    const r = parseSearchQuery('   \t  ');
    expect(r.tags.size).toBe(0);
    expect(r.fullText).toBe('');
  });

  it('passes through plain text with no `tag:` tokens', () => {
    const r = parseSearchQuery('hello world');
    expect(r.tags.size).toBe(0);
    expect(r.fullText).toBe('hello world');
  });

  it('preserves token order in fullText (first-seen wins)', () => {
    const r = parseSearchQuery('alpha beta gamma');
    expect(r.fullText).toBe('alpha beta gamma');
  });

  it('collapses runs of whitespace between tokens', () => {
    const r = parseSearchQuery('alpha   beta');
    expect(r.fullText).toBe('alpha beta');
  });
});

describe('parseSearchQuery — prefix case-sensitivity (spec §5.6)', () => {
  it('TAG:foo (uppercase) is NOT recognised as a prefix — falls through to FullText', () => {
    const r = parseSearchQuery('TAG:urgent');
    expect(r.tags.size).toBe(0);
    expect(r.fullText).toBe('TAG:urgent');
  });

  it('Tag:foo (mixed case) is NOT recognised as a prefix', () => {
    const r = parseSearchQuery('Tag:urgent');
    expect(r.tags.size).toBe(0);
    expect(r.fullText).toBe('Tag:urgent');
  });

  it('the Tag *value* keeps its case verbatim (Slice B R6 — case-sensitive values)', () => {
    const r = parseSearchQuery('tag:Urgent tag:URGENT');
    // Both are distinct values — value comparison is case-sensitive
    // so they round-trip as separate tag requirements.
    expect(new Set(r.tags)).toEqual(new Set(['Urgent', 'URGENT']));
  });
});

describe('parseSearchQuery — rare but legal values', () => {
  it('accepts values containing colons (no quote handling in this slice)', () => {
    // Slice scope: the value is literally everything after the
    // first "tag:" prefix, so secondary colons survive verbatim.
    // Future quote support may re-interpret this — flagged by the
    // test so a breaking change shows up in review.
    const r = parseSearchQuery('tag:foo:bar');
    expect(Array.from(r.tags)).toEqual(['foo:bar']);
    expect(r.fullText).toBe('');
  });

  it('accepts multibyte values (Slice B R5 preserves raw text)', () => {
    const r = parseSearchQuery('tag:日本語');
    expect(Array.from(r.tags)).toEqual(['日本語']);
  });
});
