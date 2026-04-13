import { describe, it, expect } from 'vitest';
import { textlogToText } from '@features/textlog/textlog-to-text';
import type { Entry } from '../../../src/core/model/record';

function makeTextlogEntry(
  entries: { id: string; text: string; createdAt: string; flags?: string[] }[],
  overrides: Partial<Entry> = {},
): Entry {
  return {
    lid: 'src-lid',
    title: 'My Log',
    archetype: 'textlog',
    body: JSON.stringify({
      entries: entries.map((e) => ({ ...e, flags: e.flags ?? [] })),
    }),
    created_at: '2026-04-09T00:00:00Z',
    updated_at: '2026-04-09T00:00:00Z',
    ...overrides,
  };
}

// A fixed `now` so title suffix and blockquote metadata are deterministic
// across environments.
const NOW = new Date('2026-04-20T10:00:00Z');

describe('textlogToText', () => {
  it('emits a single day heading when all selected logs fall on the same local day', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 'first', createdAt: '2026-04-09T10:00:00' },
      { id: 'b', text: 'second', createdAt: '2026-04-09T11:05:00' },
    ]);
    const result = textlogToText(entry, ['a', 'b'], { now: NOW });
    // Exactly one ## day heading.
    const dayHeadings = result.body.match(/^## \d{4}-\d{2}-\d{2}$/gm);
    expect(dayHeadings?.length).toBe(1);
    expect(result.emittedCount).toBe(2);
    expect(result.skippedEmptyCount).toBe(0);
  });

  it('emits multiple ## day headings when logs span multiple local days', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 'mon-morn', createdAt: '2026-04-09T10:00:00' },
      { id: 'b', text: 'tue-morn', createdAt: '2026-04-10T09:30:00' },
    ]);
    const result = textlogToText(entry, ['a', 'b'], { now: NOW });
    const dayHeadings = result.body.match(/^## \d{4}-\d{2}-\d{2}$/gm) ?? [];
    expect(dayHeadings.length).toBe(2);
  });

  it('uses slug generated from the first non-empty line (capped at 40 source chars)', () => {
    const entry = makeTextlogEntry([
      {
        id: 'a',
        text: 'This is a very long first line that should be trimmed',
        createdAt: '2026-04-09T10:00:00',
      },
    ]);
    const result = textlogToText(entry, ['a'], { now: NOW });
    // Heading line should be `### HH:mm:ss — <slug>`.
    const logHeading = result.body.match(/^### \d{2}:\d{2}:\d{2} — (.+)$/m);
    expect(logHeading).not.toBeNull();
    const slug = logHeading![1]!;
    // slugifyHeading lowercases and replaces spaces with dashes. After 40-char
    // source cap the slug is at most ~40 chars plus collision suffix (none here).
    expect(slug.length).toBeLessThanOrEqual(45);
    expect(slug).toMatch(/^this-is-a-very/);
  });

  it('emits a source-log backlink for each emitted log', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 'alpha', createdAt: '2026-04-09T10:00:00' },
      { id: 'b', text: 'beta', createdAt: '2026-04-09T11:00:00' },
    ]);
    const result = textlogToText(entry, ['a', 'b'], { now: NOW });
    expect(result.body).toContain('[↩ source log](entry:src-lid#log/a)');
    expect(result.body).toContain('[↩ source log](entry:src-lid#log/b)');
  });

  it('skips logs whose text is empty or whitespace-only', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 'alpha', createdAt: '2026-04-09T10:00:00' },
      { id: 'b', text: '   \n  ', createdAt: '2026-04-09T10:05:00' },
      { id: 'c', text: '', createdAt: '2026-04-09T10:10:00' },
    ]);
    const result = textlogToText(entry, ['a', 'b', 'c'], { now: NOW });
    expect(result.emittedCount).toBe(1);
    expect(result.skippedEmptyCount).toBe(2);
    // Only one `### HH:mm:ss` heading should be present.
    expect(result.body.match(/^### /gm)?.length).toBe(1);
  });

  it('emits logs in chronological ascending order regardless of input order', () => {
    const entry = makeTextlogEntry([
      { id: 'b', text: 'second', createdAt: '2026-04-09T11:00:00' },
      { id: 'a', text: 'first',  createdAt: '2026-04-09T10:00:00' },
      { id: 'c', text: 'third',  createdAt: '2026-04-09T12:00:00' },
    ]);
    const result = textlogToText(entry, ['c', 'a', 'b'], { now: NOW });
    const idxA = result.body.indexOf('first');
    const idxB = result.body.indexOf('second');
    const idxC = result.body.indexOf('third');
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it('produces a stable markdown body (deterministic under a fixed `now`)', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 'alpha line', createdAt: '2026-04-09T10:00:00' },
    ]);
    const a = textlogToText(entry, ['a'], { now: NOW });
    const b = textlogToText(entry, ['a'], { now: NOW });
    expect(a.body).toBe(b.body);
    expect(a.title).toBe(b.title);
  });

  it('title follows `<src title> — log extract <yyyy-mm-dd>` format', () => {
    const entry = makeTextlogEntry(
      [{ id: 'a', text: 'x', createdAt: '2026-04-09T10:00:00' }],
      { title: 'Daily Journal' },
    );
    const result = textlogToText(entry, ['a'], { now: NOW });
    expect(result.title).toMatch(/^Daily Journal — log extract \d{4}-\d{2}-\d{2}$/);
  });

  it('emittedCount === 0 when the selection is empty or matches nothing', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 'alpha', createdAt: '2026-04-09T10:00:00' },
    ]);
    const resultEmpty = textlogToText(entry, [], { now: NOW });
    expect(resultEmpty.emittedCount).toBe(0);
    const resultMissing = textlogToText(entry, ['nope'], { now: NOW });
    expect(resultMissing.emittedCount).toBe(0);
  });

  it('emittedCount === 0 when source is not a TEXTLOG archetype', () => {
    const textEntry: Entry = {
      lid: 'x',
      title: 'just text',
      archetype: 'text',
      body: '# hello',
      created_at: '',
      updated_at: '',
    };
    const result = textlogToText(textEntry, ['whatever'], { now: NOW });
    expect(result.emittedCount).toBe(0);
    // Body still contains the header and blockquote so the preview is
    // meaningful, but no day sections.
    expect(result.body).toContain('# just text (log extract)');
    expect(result.body.match(/^## /gm)).toBeNull();
  });

  it('ignores `flags` on logs (important marker does not survive)', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 'alpha', createdAt: '2026-04-09T10:00:00', flags: ['important'] },
    ]);
    const result = textlogToText(entry, ['a'], { now: NOW });
    expect(result.body).not.toContain('important');
    expect(result.body).not.toContain('★');
  });

  it('accepts a Set as selectedLogIds', () => {
    const entry = makeTextlogEntry([
      { id: 'a', text: 'alpha', createdAt: '2026-04-09T10:00:00' },
      { id: 'b', text: 'beta',  createdAt: '2026-04-09T11:00:00' },
    ]);
    const result = textlogToText(entry, new Set(['a', 'b']), { now: NOW });
    expect(result.emittedCount).toBe(2);
  });

  it('log bodies are emitted verbatim (no reflow / no asset resolution)', () => {
    const entry = makeTextlogEntry([
      {
        id: 'a',
        text: 'line1\nline2\n- bullet',
        createdAt: '2026-04-09T10:00:00',
      },
    ]);
    const result = textlogToText(entry, ['a'], { now: NOW });
    expect(result.body).toContain('line1\nline2\n- bullet');
  });
});
