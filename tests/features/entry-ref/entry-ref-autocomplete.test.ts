import { describe, it, expect } from 'vitest';
import {
  filterEntryCandidates,
  findEntryCompletionContext,
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
