import { describe, it, expect } from 'vitest';
import {
  detectCsvLang,
  isHeaderDisabled,
  parseCsv,
  rowsToHtml,
  renderCsvFence,
} from '@features/markdown/csv-table';

/**
 * USER_REQUEST_LEDGER S-16 (2026-04-14, B-1) — pure unit coverage
 * for the CSV-fence renderer. The markdown-it integration is pinned
 * separately in tests/features/markdown/markdown-render.test.ts.
 *
 * Contract pinned here:
 *   - Info string parsing (csv / tsv / psv + noheader flag)
 *   - RFC 4180 subset CSV parser (quoted cells, embedded delimiter,
 *     embedded newline, doubled-quote escape, CRLF)
 *   - HTML escaping of cell content
 *   - Header-on / header-off rendering modes
 *   - Padding short rows to widest row (rectangular table)
 *   - Empty / whitespace-only fallback (returns null)
 */

describe('detectCsvLang', () => {
  it('returns the lang id for csv / tsv / psv', () => {
    expect(detectCsvLang('csv')).toBe('csv');
    expect(detectCsvLang('tsv')).toBe('tsv');
    expect(detectCsvLang('psv')).toBe('psv');
  });
  it('is case-insensitive on the first token', () => {
    expect(detectCsvLang('CSV')).toBe('csv');
    expect(detectCsvLang('Tsv')).toBe('tsv');
  });
  it('reads only the FIRST whitespace-delimited token', () => {
    expect(detectCsvLang('csv noheader')).toBe('csv');
    expect(detectCsvLang('  tsv   foo bar  ')).toBe('tsv');
  });
  it('returns null for unknown / empty info strings', () => {
    expect(detectCsvLang('')).toBeNull();
    expect(detectCsvLang(null)).toBeNull();
    expect(detectCsvLang(undefined)).toBeNull();
    expect(detectCsvLang('javascript')).toBeNull();
    expect(detectCsvLang('text/csv')).toBeNull();
  });
});

describe('isHeaderDisabled', () => {
  it('detects the noheader flag after the lang id', () => {
    expect(isHeaderDisabled('csv noheader')).toBe(true);
    expect(isHeaderDisabled('tsv  noheader')).toBe(true);
    expect(isHeaderDisabled('csv NoHeader')).toBe(true);
  });
  it('returns false when the flag is absent or only the lang id is present', () => {
    expect(isHeaderDisabled('csv')).toBe(false);
    expect(isHeaderDisabled('csv someOtherFlag')).toBe(false);
    expect(isHeaderDisabled('')).toBe(false);
    expect(isHeaderDisabled(null)).toBe(false);
  });
  it('does not match the lang id itself as the flag', () => {
    // Only flags AFTER the lang count.
    expect(isHeaderDisabled('noheader')).toBe(false);
  });
});

describe('parseCsv', () => {
  it('splits a simple comma-separated grid', () => {
    const rows = parseCsv('a,b,c\n1,2,3\n4,5,6', ',');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
      ['4', '5', '6'],
    ]);
  });

  it('handles quoted cells containing the delimiter', () => {
    const rows = parseCsv('name,note\n"Smith, Jr.",hello', ',');
    expect(rows).toEqual([
      ['name', 'note'],
      ['Smith, Jr.', 'hello'],
    ]);
  });

  it('handles quoted cells containing newlines', () => {
    const rows = parseCsv('a,b\n"line1\nline2",ok', ',');
    expect(rows).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'ok'],
    ]);
  });

  it('treats doubled quote inside a quoted cell as a literal quote', () => {
    const rows = parseCsv('a,b\n"He said ""hi""",x', ',');
    expect(rows).toEqual([
      ['a', 'b'],
      ['He said "hi"', 'x'],
    ]);
  });

  it('normalises CRLF / CR line endings to LF', () => {
    const rows = parseCsv('a,b\r\n1,2\r3,4', ',');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('drops a single trailing blank row produced by a final newline', () => {
    const rows = parseCsv('a,b\n1,2\n', ',');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(parseCsv('', ',')).toBeNull();
    expect(parseCsv('   \n  \n', ',')).toBeNull();
  });

  it('parses TSV with the tab delimiter', () => {
    const rows = parseCsv('a\tb\tc\n1\t2\t3', '\t');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });
});

describe('rowsToHtml', () => {
  it('emits thead + tbody when withHeader=true', () => {
    const html = rowsToHtml(
      [
        ['name', 'qty'],
        ['apple', '3'],
      ],
      true,
    );
    expect(html).toContain('<table class="pkc-md-rendered-csv">');
    expect(html).toContain('<thead>');
    expect(html).toContain('<th>name</th>');
    expect(html).toContain('<th>qty</th>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('<td>apple</td>');
    expect(html).toContain('<td>3</td>');
    expect(html).not.toContain('<th>apple</th>');
  });

  it('skips thead when withHeader=false (every row in tbody)', () => {
    const html = rowsToHtml(
      [
        ['a', 'b'],
        ['1', '2'],
      ],
      false,
    );
    expect(html).not.toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('<td>a</td>');
    expect(html).toContain('<td>1</td>');
  });

  it('escapes HTML in cell content', () => {
    const html = rowsToHtml(
      [
        ['raw'],
        ['<script>alert(1)</script>'],
        ['a & b'],
      ],
      true,
    );
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('a &amp; b');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('pads short rows to the widest row (rectangular layout)', () => {
    const html = rowsToHtml(
      [
        ['a', 'b', 'c'],
        ['1'],
        ['x', 'y'],
      ],
      true,
    );
    // First row 3 cells, 2 short rows padded to 3 cells each.
    // Expect 3 th + (2 + 1) padding tds + 2 + 1 padding tds = 6 td.
    const tdCount = (html.match(/<td>/g) ?? []).length;
    expect(tdCount).toBe(6);
  });
});

describe('renderCsvFence', () => {
  it('returns null for a non-csv lang (caller should fall back to default fence)', () => {
    expect(renderCsvFence('a,b\n1,2', 'javascript')).toBeNull();
    expect(renderCsvFence('a,b\n1,2', '')).toBeNull();
  });

  it('renders csv with header by default', () => {
    const html = renderCsvFence('name,qty\napple,3', 'csv');
    expect(html).toContain('<th>name</th>');
    expect(html).toContain('<td>apple</td>');
  });

  it('renders csv noheader without thead', () => {
    const html = renderCsvFence('a,b\n1,2', 'csv noheader');
    expect(html).not.toContain('<thead>');
    expect(html).toContain('<td>a</td>');
  });

  it('renders tsv with the tab delimiter', () => {
    const html = renderCsvFence('a\tb\n1\t2', 'tsv');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('returns null for empty input so caller falls back', () => {
    expect(renderCsvFence('', 'csv')).toBeNull();
    expect(renderCsvFence('  \n  ', 'csv')).toBeNull();
  });
});
