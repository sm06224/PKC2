import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '@features/search/query-parser';

/**
 * `color:<id>` parser tests — Color tag Slice 4.
 *
 * Spec: docs/spec/search-filter-semantics-v1.md §5 reserved
 *       prefixes; docs/spec/color-tag-data-model-v1-minimum-scope.md
 *       §6.4 (unknown ID round-trip).
 *
 * The parser is read-only and case-sensitive on the prefix name
 * (§5.6). Unknown palette IDs are preserved verbatim so a future
 * palette extension does not silently drop saved filters.
 */

describe('parseSearchQuery — color: prefix', () => {
  it('extracts a single color: token into parsed.colors', () => {
    const r = parseSearchQuery('color:red');
    expect(Array.from(r.colors)).toEqual(['red']);
    expect(r.fullText).toBe('');
    expect(r.tags.size).toBe(0);
  });

  it('extracts every canonical palette ID', () => {
    const ids = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray'];
    for (const id of ids) {
      const r = parseSearchQuery(`color:${id}`);
      expect(r.colors.has(id)).toBe(true);
    }
  });

  it('strips multiple color: tokens out of FullText', () => {
    const r = parseSearchQuery('color:red color:blue');
    expect(Array.from(r.colors).sort()).toEqual(['blue', 'red']);
    expect(r.fullText).toBe('');
  });

  it('deduplicates repeated color: tokens', () => {
    const r = parseSearchQuery('color:red color:red color:red');
    expect(Array.from(r.colors)).toEqual(['red']);
  });

  it('keeps non-prefix tokens in FullText', () => {
    const r = parseSearchQuery('hello color:blue world');
    expect(r.fullText).toBe('hello world');
    expect(Array.from(r.colors)).toEqual(['blue']);
  });

  it('combines with tag: tokens', () => {
    const r = parseSearchQuery('tag:urgent color:red');
    expect(Array.from(r.tags)).toEqual(['urgent']);
    expect(Array.from(r.colors)).toEqual(['red']);
    expect(r.fullText).toBe('');
  });

  it('combines tag, color, and FullText', () => {
    const r = parseSearchQuery('proposal color:blue tag:reviewed');
    expect(r.fullText).toBe('proposal');
    expect(Array.from(r.colors)).toEqual(['blue']);
    expect(Array.from(r.tags)).toEqual(['reviewed']);
  });

  it('preserves unknown palette IDs verbatim (round-trip)', () => {
    // data-model spec §6.4 / §7.2: the filter must not drop unknown
    // IDs because a future palette extension or a copy-paste from a
    // newer container may reference them.
    const r = parseSearchQuery('color:teal color:magenta');
    expect(r.colors.has('teal')).toBe(true);
    expect(r.colors.has('magenta')).toBe(true);
  });

  it('rejects an empty value (color: alone) silently', () => {
    const r = parseSearchQuery('color:');
    expect(r.colors.size).toBe(0);
    // The literal `color:` token disappears from the result; the
    // raw query is still in `state.searchQuery` upstream so the
    // user sees what they typed.
    expect(r.fullText).toBe('');
  });

  it('does NOT recognise an uppercase prefix (Color: / COLOR:)', () => {
    // Spec §5.6: prefix name is lowercase-only. Uppercase falls
    // through to FullText so the user can self-correct.
    const r1 = parseSearchQuery('Color:red');
    expect(r1.colors.size).toBe(0);
    expect(r1.fullText).toBe('Color:red');

    const r2 = parseSearchQuery('COLOR:red');
    expect(r2.colors.size).toBe(0);
    expect(r2.fullText).toBe('COLOR:red');
  });

  it('preserves the case of the value (does not lowercase Red→red)', () => {
    // Palette IDs are lowercase canonical, so a user who types
    // `Red` is making a typo. The parser keeps the value verbatim
    // — the filter will then yield zero results, which is the
    // honest signal that the typo did not match anything.
    const r = parseSearchQuery('color:Red');
    expect(r.colors.has('Red')).toBe(true);
    expect(r.colors.has('red')).toBe(false);
  });

  it('returns an empty colors Set for queries with no color: token', () => {
    const r = parseSearchQuery('hello world tag:urgent');
    expect(r.colors.size).toBe(0);
  });

  it('handles trailing / leading whitespace gracefully', () => {
    const r = parseSearchQuery('   color:red   ');
    expect(Array.from(r.colors)).toEqual(['red']);
    expect(r.fullText).toBe('');
  });
});
