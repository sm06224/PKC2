import { describe, it, expect } from 'vitest';
import {
  parseTextlogBody,
  serializeTextlogBody,
  appendLogEntry,
  updateLogEntry,
  toggleLogFlag,
  deleteLogEntry,
  formatLogTimestamp,
  serializeTextlogAsMarkdown,
} from '@features/textlog/textlog-body';
import type { TextlogBody } from '@features/textlog/textlog-body';

// ── parseTextlogBody ──

describe('parseTextlogBody', () => {
  it('parses valid JSON body', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-1', text: 'First entry', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    });
    const parsed = parseTextlogBody(body);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]!.text).toBe('First entry');
    expect(parsed.entries[0]!.id).toBe('log-1');
    expect(parsed.entries[0]!.flags).toEqual([]);
  });

  it('returns empty body for empty string', () => {
    const parsed = parseTextlogBody('');
    expect(parsed.entries).toEqual([]);
  });

  it('returns empty body for invalid JSON', () => {
    const parsed = parseTextlogBody('not json');
    expect(parsed.entries).toEqual([]);
  });

  it('returns empty body for JSON without entries array', () => {
    const parsed = parseTextlogBody('{"foo":"bar"}');
    expect(parsed.entries).toEqual([]);
  });

  it('handles entries with missing fields gracefully', () => {
    const body = JSON.stringify({
      entries: [{ text: 'only text' }],
    });
    const parsed = parseTextlogBody(body);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]!.text).toBe('only text');
    expect(parsed.entries[0]!.id).toBeTruthy();
    expect(parsed.entries[0]!.createdAt).toBeTruthy();
    expect(parsed.entries[0]!.flags).toEqual([]);
  });

  it('filters non-string flags', () => {
    const body = JSON.stringify({
      entries: [{ id: 'log-1', text: 'test', createdAt: '2026-01-01', flags: ['important', 123, null] }],
    });
    const parsed = parseTextlogBody(body);
    expect(parsed.entries[0]!.flags).toEqual(['important']);
  });
});

// ── serializeTextlogBody ──

describe('serializeTextlogBody', () => {
  it('round-trips through parse', () => {
    const original: TextlogBody = {
      entries: [
        { id: 'log-1', text: 'Entry 1', createdAt: '2026-04-09T10:00:00Z', flags: ['important'] },
        { id: 'log-2', text: 'Entry 2', createdAt: '2026-04-09T11:00:00Z', flags: [] },
      ],
    };
    const serialized = serializeTextlogBody(original);
    const parsed = parseTextlogBody(serialized);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]!.text).toBe('Entry 1');
    expect(parsed.entries[0]!.flags).toEqual(['important']);
    expect(parsed.entries[1]!.text).toBe('Entry 2');
  });
});

// ── appendLogEntry ──

describe('appendLogEntry', () => {
  it('appends a new entry with timestamp', () => {
    const body: TextlogBody = { entries: [] };
    const now = new Date('2026-04-09T14:00:00Z');
    const result = appendLogEntry(body, 'New log entry', now);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.text).toBe('New log entry');
    expect(result.entries[0]!.createdAt).toBe('2026-04-09T14:00:00.000Z');
    expect(result.entries[0]!.flags).toEqual([]);
    expect(result.entries[0]!.id).toBeTruthy();
  });

  it('preserves existing entries', () => {
    const body: TextlogBody = {
      entries: [{ id: 'log-1', text: 'First', createdAt: '2026-04-09T10:00:00Z', flags: [] }],
    };
    const result = appendLogEntry(body, 'Second');
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]!.text).toBe('First');
    expect(result.entries[1]!.text).toBe('Second');
  });

  it('does not mutate original body', () => {
    const body: TextlogBody = { entries: [] };
    appendLogEntry(body, 'New');
    expect(body.entries).toHaveLength(0);
  });
});

// ── updateLogEntry ──

describe('updateLogEntry', () => {
  it('updates text of matching entry', () => {
    const body: TextlogBody = {
      entries: [
        { id: 'log-1', text: 'Original', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    };
    const result = updateLogEntry(body, 'log-1', 'Updated text');
    expect(result.entries[0]!.text).toBe('Updated text');
    expect(result.entries[0]!.id).toBe('log-1');
  });

  it('does not modify non-matching entries', () => {
    const body: TextlogBody = {
      entries: [
        { id: 'log-1', text: 'Entry 1', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-2', text: 'Entry 2', createdAt: '2026-04-09T11:00:00Z', flags: [] },
      ],
    };
    const result = updateLogEntry(body, 'log-1', 'Updated');
    expect(result.entries[0]!.text).toBe('Updated');
    expect(result.entries[1]!.text).toBe('Entry 2');
  });
});

// ── toggleLogFlag ──

describe('toggleLogFlag', () => {
  it('adds flag when not present', () => {
    const body: TextlogBody = {
      entries: [{ id: 'log-1', text: 'test', createdAt: '2026-04-09T10:00:00Z', flags: [] }],
    };
    const result = toggleLogFlag(body, 'log-1', 'important');
    expect(result.entries[0]!.flags).toEqual(['important']);
  });

  it('removes flag when present', () => {
    const body: TextlogBody = {
      entries: [{ id: 'log-1', text: 'test', createdAt: '2026-04-09T10:00:00Z', flags: ['important'] }],
    };
    const result = toggleLogFlag(body, 'log-1', 'important');
    expect(result.entries[0]!.flags).toEqual([]);
  });

  it('does not modify non-matching entries', () => {
    const body: TextlogBody = {
      entries: [
        { id: 'log-1', text: 'test', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-2', text: 'test2', createdAt: '2026-04-09T11:00:00Z', flags: ['important'] },
      ],
    };
    const result = toggleLogFlag(body, 'log-1', 'important');
    expect(result.entries[0]!.flags).toEqual(['important']);
    expect(result.entries[1]!.flags).toEqual(['important']);
  });
});

// ── deleteLogEntry ──

describe('deleteLogEntry', () => {
  it('removes matching entry', () => {
    const body: TextlogBody = {
      entries: [
        { id: 'log-1', text: 'First', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-2', text: 'Second', createdAt: '2026-04-09T11:00:00Z', flags: [] },
      ],
    };
    const result = deleteLogEntry(body, 'log-1');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.id).toBe('log-2');
  });

  it('returns same entries when id not found', () => {
    const body: TextlogBody = {
      entries: [{ id: 'log-1', text: 'First', createdAt: '2026-04-09T10:00:00Z', flags: [] }],
    };
    const result = deleteLogEntry(body, 'nonexistent');
    expect(result.entries).toHaveLength(1);
  });
});

// ── formatLogTimestamp ──

describe('formatLogTimestamp', () => {
  it('formats valid ISO timestamp', () => {
    const result = formatLogTimestamp('2026-04-09T14:30:00Z');
    // Should contain date and time parts
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it('returns input for invalid timestamp', () => {
    expect(formatLogTimestamp('not a date')).toBe('not a date');
  });
});

// ── serializeTextlogAsMarkdown ──

describe('serializeTextlogAsMarkdown', () => {
  it('returns empty string for empty log', () => {
    expect(serializeTextlogAsMarkdown({ entries: [] })).toBe('');
  });

  it('emits one `## timestamp` heading per entry followed by its text', () => {
    const body: TextlogBody = {
      entries: [
        { id: 'log-1', text: 'First line', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    };
    const md = serializeTextlogAsMarkdown(body);
    // Heading is emitted with the same timestamp format used on screen.
    const expectedTs = formatLogTimestamp('2026-04-09T10:00:00Z');
    expect(md).toBe(`## ${expectedTs}\n\nFirst line`);
  });

  it('preserves original order (no timestamp re-sort)', () => {
    // Later timestamp appears FIRST in entries[] — the serializer must
    // keep the append order as-is, matching textlog-foundation rules.
    const body: TextlogBody = {
      entries: [
        { id: 'log-a', text: 'Appended first (later time)', createdAt: '2026-04-09T12:00:00Z', flags: [] },
        { id: 'log-b', text: 'Appended second (earlier time)', createdAt: '2026-04-09T08:00:00Z', flags: [] },
      ],
    };
    const md = serializeTextlogAsMarkdown(body);
    const idxFirst = md.indexOf('Appended first');
    const idxSecond = md.indexOf('Appended second');
    expect(idxFirst).toBeGreaterThanOrEqual(0);
    expect(idxSecond).toBeGreaterThan(idxFirst);
  });

  it('adds a trailing ★ marker to headings whose entry has the important flag', () => {
    const body: TextlogBody = {
      entries: [
        { id: 'log-1', text: 'Regular', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-2', text: 'Starred', createdAt: '2026-04-09T10:05:00Z', flags: ['important'] },
      ],
    };
    const md = serializeTextlogAsMarkdown(body);
    const lines = md.split('\n');
    const headings = lines.filter((l) => l.startsWith('## '));
    expect(headings).toHaveLength(2);
    expect(headings[0]!.endsWith('★')).toBe(false);
    expect(headings[1]!.endsWith('★')).toBe(true);
  });

  it('joins multiple entries with blank-line separators', () => {
    const body: TextlogBody = {
      entries: [
        { id: 'log-1', text: 'alpha', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-2', text: 'beta', createdAt: '2026-04-09T10:05:00Z', flags: [] },
      ],
    };
    const md = serializeTextlogAsMarkdown(body);
    // Two entries means two `## ` headings, with a blank line between the
    // first body text and the second heading.
    expect(md.match(/## /g)?.length).toBe(2);
    expect(md).toContain('\n\nalpha\n\n## ');
    expect(md).toContain('\n\nbeta');
  });

  it('emits markdown text verbatim (does not escape)', () => {
    const body: TextlogBody = {
      entries: [
        {
          id: 'log-1',
          text: '**bold** and `code` and [link](https://example.com)',
          createdAt: '2026-04-09T10:00:00Z',
          flags: [],
        },
      ],
    };
    const md = serializeTextlogAsMarkdown(body);
    // Markdown syntax must survive — the serializer is not supposed to
    // escape the body, only frame it with a heading.
    expect(md).toContain('**bold**');
    expect(md).toContain('`code`');
    expect(md).toContain('[link](https://example.com)');
  });
});
