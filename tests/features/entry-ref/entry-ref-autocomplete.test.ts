import { describe, it, expect } from 'vitest';
import {
  filterEntryCandidates,
  findBracketCompletionContext,
  findEntryCompletionContext,
  reorderByRecentFirst,
} from '@features/entry-ref/entry-ref-autocomplete';
import type { Entry } from '@core/model/record';

function makeEntry(lid: string, title: string): Entry {
  return {
    lid,
    title,
    body: '',
    archetype: 'text',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

// ── findEntryCompletionContext ──

describe('findEntryCompletionContext', () => {
  it('matches at `(entry:|` with empty query', () => {
    const text = '[x](entry:';
    const res = findEntryCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.queryStart).toBe(text.length);
    expect(res!.query).toBe('');
  });

  it('matches at `(entry:foo|` with partial query', () => {
    const text = '[x](entry:foo';
    const res = findEntryCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.query).toBe('foo');
  });

  it('allows lid-legal characters (hyphen, underscore, digits)', () => {
    const text = '[x](entry:foo-bar_baz123';
    const res = findEntryCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.query).toBe('foo-bar_baz123');
  });

  it('matches with caret partway through the lid run', () => {
    const text = '[x](entry:foo-bar)';
    const caret = text.indexOf('bar') + 2; // inside 'bar' at 'ba|r'
    const res = findEntryCompletionContext(text, caret);
    expect(res).not.toBeNull();
    expect(res!.query).toBe('foo-ba');
  });

  it('does not match without preceding `(`', () => {
    const text = 'entry:foo';
    expect(findEntryCompletionContext(text, text.length)).toBeNull();
  });

  it('does not match inside URL like `https://site/entry:`', () => {
    const text = 'https://example.com/entry:bad';
    expect(findEntryCompletionContext(text, text.length)).toBeNull();
  });

  it('does not match when preceding char before `entry:` is not `(`', () => {
    const text = 'xentry:a';
    expect(findEntryCompletionContext(text, text.length)).toBeNull();
  });

  it('does not match when a space interrupts the lid run', () => {
    const text = '[x](entry:foo bar';
    expect(findEntryCompletionContext(text, text.length)).toBeNull();
  });

  it('does not match when caret sits after `)`', () => {
    const text = '[x](entry:foo) and more';
    expect(findEntryCompletionContext(text, text.length)).toBeNull();
  });

  it('does not match when caret is before the trigger', () => {
    const text = '[x](entry:foo)';
    expect(findEntryCompletionContext(text, 2)).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(findEntryCompletionContext('', 0)).toBeNull();
  });

  it('handles caret at positions too small for the trigger', () => {
    expect(findEntryCompletionContext('abc', 3)).toBeNull();
    expect(findEntryCompletionContext('(entry', 6)).toBeNull();
  });
});

// ── filterEntryCandidates ──

describe('filterEntryCandidates', () => {
  const all: Entry[] = [
    makeEntry('abc123', 'Project Alpha'),
    makeEntry('def456', 'Meeting notes'),
    makeEntry('ghi789', 'photo gallery'),
  ];

  it('returns full list (copy) for empty query', () => {
    const res = filterEntryCandidates(all, '');
    expect(res).toEqual(all);
    res.pop();
    expect(all).toHaveLength(3);
  });

  it('matches by title substring (case-insensitive)', () => {
    const res = filterEntryCandidates(all, 'project');
    expect(res).toHaveLength(1);
    expect(res[0]!.lid).toBe('abc123');
  });

  it('matches by lid substring', () => {
    const res = filterEntryCandidates(all, 'def');
    expect(res).toHaveLength(1);
    expect(res[0]!.lid).toBe('def456');
  });

  it('returns empty array when nothing matches', () => {
    expect(filterEntryCandidates(all, 'zzz')).toEqual([]);
  });

  it('is case-insensitive on both lid and title', () => {
    expect(filterEntryCandidates(all, 'PHOTO')).toHaveLength(1);
    expect(filterEntryCandidates(all, 'ABC')).toHaveLength(1);
  });
});

// ── findBracketCompletionContext (v1.1 `[[` wiki-style trigger) ──

describe('findBracketCompletionContext', () => {
  it('matches immediately after `[[` with empty query', () => {
    const text = '[[';
    const res = findBracketCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.bracketStart).toBe(0);
    expect(res!.query).toBe('');
  });

  it('matches `[[foo` with partial query', () => {
    const text = '[[foo';
    const res = findBracketCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.bracketStart).toBe(0);
    expect(res!.query).toBe('foo');
  });

  it('allows spaces and mixed characters in the query', () => {
    const text = '[[foo bar 123_xy';
    const res = findBracketCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.query).toBe('foo bar 123_xy');
  });

  it('does not match single `[` (not a wiki trigger)', () => {
    const text = '[foo';
    expect(findBracketCompletionContext(text, text.length)).toBeNull();
  });

  it('does not match plain text', () => {
    expect(findBracketCompletionContext('plain text', 10)).toBeNull();
  });

  it('does not match when caret is before the trigger', () => {
    const text = '[[foo';
    expect(findBracketCompletionContext(text, 1)).toBeNull();
  });

  it('bails on `]` between `[[` and caret', () => {
    const text = '[[foo]bar';
    expect(findBracketCompletionContext(text, text.length)).toBeNull();
  });

  it('bails on newline between `[[` and caret', () => {
    const text = '[[foo\nbar';
    expect(findBracketCompletionContext(text, text.length)).toBeNull();
  });

  it('picks the innermost `[[` when nested triple brackets exist', () => {
    const text = '[[[foo';
    const res = findBracketCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.bracketStart).toBe(1);
    expect(res!.query).toBe('foo');
  });

  it('matches when text contains prior closed brackets on other lines', () => {
    const text = '[x](entry:e1)\n[[foo';
    const res = findBracketCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.query).toBe('foo');
    expect(res!.bracketStart).toBe(14);
  });

  it('returns null for empty text', () => {
    expect(findBracketCompletionContext('', 0)).toBeNull();
  });

  it('returns null when caret is at position < 2', () => {
    expect(findBracketCompletionContext('[', 1)).toBeNull();
    expect(findBracketCompletionContext('x', 1)).toBeNull();
  });

  it('does not match at `[[|text]]` — caret exists after `]`', () => {
    const text = '[[foo]]';
    expect(findBracketCompletionContext(text, text.length)).toBeNull();
  });

  it('matches mid-query (caret inside the query run)', () => {
    const text = '[[foobar]';
    // Caret just before `]`, i.e. at position 8
    const res = findBracketCompletionContext(text, 8);
    expect(res).not.toBeNull();
    expect(res!.query).toBe('foobar');
  });
});

// ── reorderByRecentFirst (v1.3 recent-first ordering) ──

describe('reorderByRecentFirst', () => {
  const entries: Entry[] = [
    makeEntry('a', 'Alpha'),
    makeEntry('b', 'Beta'),
    makeEntry('c', 'Gamma'),
    makeEntry('d', 'Delta'),
  ];

  it('returns a copy unchanged when recentLids is empty', () => {
    const out = reorderByRecentFirst(entries, []);
    expect(out.map((e) => e.lid)).toEqual(['a', 'b', 'c', 'd']);
    // Not aliased
    out.pop();
    expect(entries).toHaveLength(4);
  });

  it('returns a copy unchanged when entries is empty', () => {
    const out = reorderByRecentFirst([], ['a', 'b']);
    expect(out).toEqual([]);
  });

  it('promotes a single recent lid to the front', () => {
    const out = reorderByRecentFirst(entries, ['c']);
    expect(out.map((e) => e.lid)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('promotes multiple recent lids in recency order (head = most recent)', () => {
    const out = reorderByRecentFirst(entries, ['d', 'b']);
    // d first (most recent), then b, then remaining original order
    expect(out.map((e) => e.lid)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('ignores recent lids that do not match any candidate', () => {
    const out = reorderByRecentFirst(entries, ['ghost', 'c', 'void']);
    expect(out.map((e) => e.lid)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('tolerates duplicate recent lids (first occurrence wins)', () => {
    const out = reorderByRecentFirst(entries, ['b', 'b', 'c']);
    expect(out.map((e) => e.lid)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('preserves the remainder order after promoted entries', () => {
    const out = reorderByRecentFirst(entries, ['d']);
    expect(out.map((e) => e.lid)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('never changes the entry set', () => {
    const out = reorderByRecentFirst(entries, ['c', 'a', 'ghost']);
    expect(new Set(out.map((e) => e.lid))).toEqual(new Set(['a', 'b', 'c', 'd']));
  });
});
