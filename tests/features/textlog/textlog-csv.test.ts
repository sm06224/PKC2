import { describe, it, expect } from 'vitest';
import {
  serializeTextlogAsCsv,
  collectTextlogAssetKeys,
  stripMarkdownForCsvPlain,
  compactTextlogBodyAgainst,
  TEXTLOG_CSV_HEADER,
} from '@features/textlog/textlog-csv';
import type { TextlogBody } from '@features/textlog/textlog-body';

// ── helpers ────────────────────────

function makeBody(...entries: Array<Partial<TextlogBody['entries'][number]>>): TextlogBody {
  return {
    entries: entries.map((e, i) => ({
      id: e.id ?? `log-${i + 1}`,
      text: e.text ?? '',
      createdAt: e.createdAt ?? `2026-04-09T10:0${i}:00.000Z`,
      flags: e.flags ?? [],
    })),
  };
}

/**
 * Parse a CSV string produced by `serializeTextlogAsCsv` back into
 * rows of fields. Implements only the subset we need (RFC-4180-style
 * quoted fields, doubled internal `"`, embedded newlines preserved,
 * CRLF record separator). Used by the round-trip tests so we can
 * assert column-by-column without committing to ad-hoc string
 * matching.
 */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\r' && csv[i + 1] === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ── header / shape ────────────────────────

describe('serializeTextlogAsCsv – header & shape', () => {
  it('always emits the header row even when the log is empty', () => {
    const csv = serializeTextlogAsCsv({ entries: [] });
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([...TEXTLOG_CSV_HEADER]);
  });

  it('emits header followed by one row per log entry', () => {
    const body = makeBody(
      { id: 'log-1', text: 'First' },
      { id: 'log-2', text: 'Second' },
      { id: 'log-3', text: 'Third' },
    );
    const rows = parseCsv(serializeTextlogAsCsv(body));
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual([...TEXTLOG_CSV_HEADER]);
  });

  it('uses CRLF record separators between rows', () => {
    const body = makeBody({ text: 'a' }, { text: 'b' });
    const csv = serializeTextlogAsCsv(body);
    // Should contain at least one CRLF; should NOT contain a bare LF
    // outside of any embedded text fields (which we don't have here).
    expect(csv.includes('\r\n')).toBe(true);
    expect(csv.split('\r\n').length).toBeGreaterThanOrEqual(3);
  });

  it('quotes every field, including the header', () => {
    const csv = serializeTextlogAsCsv(makeBody({ text: 'hello' }));
    // First line is the header — should start with `"log_id"` not just `log_id`.
    expect(csv.startsWith('"log_id"')).toBe(true);
  });
});

// ── column contract ────────────────────────

describe('serializeTextlogAsCsv – column contract', () => {
  it('puts log_id, ISO timestamp, display timestamp, important, markdown, plain, asset_keys in fixed order', () => {
    const iso = '2026-04-09T10:00:00.000Z';
    const body: TextlogBody = {
      entries: [
        {
          id: 'log-42',
          text: 'Meeting **with** Alice',
          createdAt: iso,
          flags: ['important'],
        },
      ],
    };
    const rows = parseCsv(serializeTextlogAsCsv(body));
    const row = rows[1]!;
    expect(row[0]).toBe('log-42');
    expect(row[1]).toBe(iso);
    // `timestamp_display` emits the raw ISO value (export fidelity —
    // see textlog-readability-hardening.md §4). The column is retained
    // in the schema for backward compatibility with consumers that key
    // off the named column.
    expect(row[2]).toBe(iso);
    expect(row[3]).toBe('true');
    expect(row[4]).toBe('Meeting **with** Alice');
    expect(row[5]).toBe('Meeting with Alice');
    expect(row[6]).toBe('');
  });

  it('emits `false` in the important column when no important flag is set', () => {
    const rows = parseCsv(serializeTextlogAsCsv(makeBody({ text: 'plain', flags: [] })));
    expect(rows[1]![3]).toBe('false');
  });

  it('preserves embedded newlines inside text_markdown verbatim', () => {
    const body = makeBody({ text: 'line1\nline2\nline3' });
    const csv = serializeTextlogAsCsv(body);
    // The literal `\n` MUST survive inside the quoted field — RFC 4180
    // explicitly allows embedded line breaks inside `"…"`. The parseCsv
    // helper strips field boundaries; the recovered field equals the
    // original.
    const rows = parseCsv(csv);
    expect(rows[1]![4]).toBe('line1\nline2\nline3');
  });

  it('doubles internal double-quotes per RFC 4180', () => {
    const body = makeBody({ text: 'He said "yes"' });
    const csv = serializeTextlogAsCsv(body);
    // Raw CSV must contain the doubled quote (`""`) inside the field.
    expect(csv).toContain('He said ""yes""');
    // Round-trip must restore the original text.
    expect(parseCsv(csv)[1]![4]).toBe('He said "yes"');
  });

  it('preserves embedded commas inside quoted fields', () => {
    const body = makeBody({ text: 'a,b,c,d' });
    const rows = parseCsv(serializeTextlogAsCsv(body));
    expect(rows[1]![4]).toBe('a,b,c,d');
  });
});

// ── ordering ────────────────────────

describe('serializeTextlogAsCsv – ordering', () => {
  it('emits entries in append order, never re-sorting by timestamp', () => {
    // Later timestamp first in entries[]; the serializer must NOT re-sort.
    const body: TextlogBody = {
      entries: [
        { id: 'log-a', text: 'Appended first (later time)', createdAt: '2026-04-09T12:00:00.000Z', flags: [] },
        { id: 'log-b', text: 'Appended second (earlier time)', createdAt: '2026-04-09T08:00:00.000Z', flags: [] },
      ],
    };
    const rows = parseCsv(serializeTextlogAsCsv(body));
    expect(rows[1]![0]).toBe('log-a');
    expect(rows[2]![0]).toBe('log-b');
  });
});

// ── asset_keys column ────────────────────────

describe('serializeTextlogAsCsv – asset_keys column', () => {
  it('emits an empty string when the row references no assets', () => {
    const rows = parseCsv(serializeTextlogAsCsv(makeBody({ text: 'plain text' })));
    expect(rows[1]![6]).toBe('');
  });

  it('lists a single image asset reference', () => {
    const body = makeBody({ text: 'See ![chart](asset:ast-001)' });
    const rows = parseCsv(serializeTextlogAsCsv(body));
    expect(rows[1]![6]).toBe('ast-001');
  });

  it('lists a single non-image link reference', () => {
    const body = makeBody({ text: 'Download [budget](asset:ast-002)' });
    const rows = parseCsv(serializeTextlogAsCsv(body));
    expect(rows[1]![6]).toBe('ast-002');
  });

  it('joins multiple asset keys with `;` in first-occurrence order', () => {
    const body = makeBody({
      text: '![a](asset:ast-001) and [b](asset:ast-002) and ![c](asset:ast-003)',
    });
    const rows = parseCsv(serializeTextlogAsCsv(body));
    expect(rows[1]![6]).toBe('ast-001;ast-002;ast-003');
  });

  it('deduplicates the same asset key referenced twice in one row', () => {
    const body = makeBody({
      text: '![a](asset:ast-001) and ![also-a](asset:ast-001)',
    });
    const rows = parseCsv(serializeTextlogAsCsv(body));
    expect(rows[1]![6]).toBe('ast-001');
  });
});

// ── collectTextlogAssetKeys ────────────────────────

describe('collectTextlogAssetKeys', () => {
  it('returns an empty array for an empty body', () => {
    expect(collectTextlogAssetKeys({ entries: [] })).toEqual([]);
  });

  it('returns the deduplicated, first-occurrence-ordered list across all rows', () => {
    const body = makeBody(
      { text: '![](asset:ast-001)' },
      { text: '[doc](asset:ast-002)' },
      { text: '![](asset:ast-001)' }, // dup of row 1 — should not appear twice
      { text: 'plain' },
      { text: '![](asset:ast-003)' },
    );
    expect(collectTextlogAssetKeys(body)).toEqual(['ast-001', 'ast-002', 'ast-003']);
  });

  it('recognises both image and link reference forms', () => {
    const body = makeBody({
      text: '![img](asset:ast-img) and [doc](asset:ast-doc)',
    });
    expect(collectTextlogAssetKeys(body)).toEqual(['ast-img', 'ast-doc']);
  });
});

// ── stripMarkdownForCsvPlain ────────────────────────

describe('stripMarkdownForCsvPlain', () => {
  it('returns empty string for empty input', () => {
    expect(stripMarkdownForCsvPlain('')).toBe('');
  });

  it('flattens images down to alt text', () => {
    expect(stripMarkdownForCsvPlain('See ![chart of growth](asset:ast-001)')).toBe(
      'See chart of growth',
    );
  });

  it('flattens links down to label text', () => {
    expect(stripMarkdownForCsvPlain('Open [the budget](asset:ast-002)')).toBe(
      'Open the budget',
    );
  });

  it('strips bold and italic markers', () => {
    expect(stripMarkdownForCsvPlain('**bold** and *italic* and __emph__ and _alt_')).toBe(
      'bold and italic and emph and alt',
    );
  });

  it('strips inline code backticks but keeps the code text', () => {
    expect(stripMarkdownForCsvPlain('use `npm test` to run')).toBe('use npm test to run');
  });

  it('strips heading markers at the start of a line', () => {
    expect(stripMarkdownForCsvPlain('# Title\n## Subtitle\nbody')).toBe(
      'Title\nSubtitle\nbody',
    );
  });

  it('strips blockquote markers and list bullets', () => {
    expect(stripMarkdownForCsvPlain('> a quote\n- item one\n* item two')).toBe(
      'a quote\nitem one\nitem two',
    );
  });

  it('collapses runs of blank lines down to a single blank line', () => {
    expect(stripMarkdownForCsvPlain('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('leaves plain text untouched aside from trim', () => {
    expect(stripMarkdownForCsvPlain('plain text with no markdown')).toBe(
      'plain text with no markdown',
    );
  });
});

// ── compactTextlogBodyAgainst ────────────────────────

describe('compactTextlogBodyAgainst', () => {
  it('leaves entries unchanged when every referenced key is present', () => {
    const body = makeBody(
      { text: '![a](asset:k1)' },
      { text: '[b](asset:k2)' },
    );
    const result = compactTextlogBodyAgainst(body, new Set(['k1', 'k2']));
    expect(result.entries[0]!.text).toBe('![a](asset:k1)');
    expect(result.entries[1]!.text).toBe('[b](asset:k2)');
  });

  it('strips broken ![alt](asset:<missing>) down to alt text', () => {
    const body = makeBody({ text: 'See ![chart](asset:ast-gone) now' });
    const result = compactTextlogBodyAgainst(body, new Set());
    expect(result.entries[0]!.text).toBe('See chart now');
  });

  it('strips broken [label](asset:<missing>) down to label text', () => {
    const body = makeBody({ text: 'Open [budget](asset:ast-missing)' });
    const result = compactTextlogBodyAgainst(body, new Set());
    expect(result.entries[0]!.text).toBe('Open budget');
  });

  it('only strips broken references — valid references are preserved verbatim', () => {
    const body = makeBody({
      text: '![ok](asset:k-ok) and [gone](asset:k-gone)',
    });
    const result = compactTextlogBodyAgainst(body, new Set(['k-ok']));
    expect(result.entries[0]!.text).toBe('![ok](asset:k-ok) and gone');
  });

  it('handles multiple broken refs in a single entry', () => {
    const body = makeBody({
      text: '![a](asset:k1) ![b](asset:k2) [c](asset:k3)',
    });
    const result = compactTextlogBodyAgainst(body, new Set());
    expect(result.entries[0]!.text).toBe('a b c');
  });

  it('leaves non-asset markdown links untouched', () => {
    const body = makeBody({
      text: 'See [docs](https://example.com) and [broken](asset:k-gone)',
    });
    const result = compactTextlogBodyAgainst(body, new Set());
    expect(result.entries[0]!.text).toBe(
      'See [docs](https://example.com) and broken',
    );
  });

  it('leaves plain text entries untouched', () => {
    const body = makeBody({ text: 'no refs at all' });
    const result = compactTextlogBodyAgainst(body, new Set());
    expect(result.entries[0]!.text).toBe('no refs at all');
  });

  it('is pure — does not mutate the input body or its entries', () => {
    const body = makeBody({ text: '![x](asset:k-gone)' });
    const snapshot = JSON.stringify(body);
    const result = compactTextlogBodyAgainst(body, new Set());
    // The input body must be byte-identical after the call.
    expect(JSON.stringify(body)).toBe(snapshot);
    // The returned body must be a NEW reference, not the original.
    expect(result).not.toBe(body);
    expect(result.entries).not.toBe(body.entries);
  });

  it('preserves entry id, createdAt, and flags on the rewritten copy', () => {
    const body: TextlogBody = {
      entries: [
        {
          id: 'log-42',
          text: '![x](asset:gone)',
          createdAt: '2026-04-09T10:00:00.000Z',
          flags: ['important'],
        },
      ],
    };
    const result = compactTextlogBodyAgainst(body, new Set());
    expect(result.entries[0]!.id).toBe('log-42');
    expect(result.entries[0]!.createdAt).toBe('2026-04-09T10:00:00.000Z');
    expect(result.entries[0]!.flags).toEqual(['important']);
    expect(result.entries[0]!.text).toBe('x');
  });

  it('empty body returns empty body (no throw)', () => {
    const result = compactTextlogBodyAgainst({ entries: [] }, new Set());
    expect(result.entries).toEqual([]);
  });
});
