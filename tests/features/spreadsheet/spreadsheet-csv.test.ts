/**
 * @vitest-environment node
 *
 * 領域 10-4 spreadsheet Phase 3(user direction 2026-05-29「1 と 2 両方」):
 * features/spreadsheet/spreadsheet-body.ts に追加した CSV / TSV import
 * helpers の動作 verify。
 */

import { describe, it, expect } from 'vitest';
import {
  parseCsvToBody,
  serializeBodyToCsv,
  detectPasteAsSpreadsheet,
} from '@features/spreadsheet/spreadsheet-body';

describe('parseCsvToBody(Phase 3 CSV import)', () => {
  it('case 1: 単純な CSV', () => {
    const body = parseCsvToBody('a,b,c\n1,2,3');
    expect(body.rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('case 2: quote 内 comma を保持', () => {
    const body = parseCsvToBody('a,"x,y",c\n1,2,3');
    expect(body.rows).toEqual([['a', 'x,y', 'c'], ['1', '2', '3']]);
  });

  it('case 3: quote 内改行を保持(1 cell 複数行)', () => {
    const body = parseCsvToBody('a,"line1\nline2",c');
    expect(body.rows).toEqual([['a', 'line1\nline2', 'c']]);
  });

  it('case 4: quote 内の `""` を escape された `"` として解釈', () => {
    const body = parseCsvToBody('a,"He said ""hi""",c');
    expect(body.rows).toEqual([['a', 'He said "hi"', 'c']]);
  });

  it('case 5: CRLF を LF 正規化', () => {
    const body = parseCsvToBody('a,b\r\n1,2\r\n');
    expect(body.rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('case 6: 空文字列 → 空 body', () => {
    expect(parseCsvToBody('')).toEqual({ rows: [] });
  });

  it('case 7: 末尾の空 row 1 件は trim(改行終端の標準形)', () => {
    const body = parseCsvToBody('a\nb\n');
    expect(body.rows).toEqual([['a'], ['b']]);
  });

  it('case 8: 空 cell も保持', () => {
    const body = parseCsvToBody('a,,c\n,,');
    expect(body.rows).toEqual([['a', '', 'c'], ['', '', '']]);
  });

  it('case 9: 単一 cell も parse(1 行 1 列)', () => {
    const body = parseCsvToBody('hello');
    expect(body.rows).toEqual([['hello']]);
  });
});

describe('serializeBodyToCsv(Phase 3)', () => {
  it('case 1: round-trip(parseCsvToBody(serialize(body)) ≅ body)', () => {
    const body = { rows: [['a', 'b'], ['1', '2']] };
    const csv = serializeBodyToCsv(body);
    expect(csv).toBe('a,b\n1,2');
    expect(parseCsvToBody(csv).rows).toEqual(body.rows);
  });

  it('case 2: cell 内 comma / 改行 / quote は escape', () => {
    const body = { rows: [['x,y', 'line1\nline2', 'He said "hi"']] };
    const csv = serializeBodyToCsv(body);
    expect(csv).toBe('"x,y","line1\nline2","He said ""hi"""');
    expect(parseCsvToBody(csv).rows).toEqual(body.rows);
  });

  it('case 3: 空 body → 空文字列', () => {
    expect(serializeBodyToCsv({ rows: [] })).toBe('');
  });
});

describe('detectPasteAsSpreadsheet(Phase 3 paste auto-detect)', () => {
  it('case 1: tab を含む multi-line → TSV として parse', () => {
    const body = detectPasteAsSpreadsheet('a\tb\n1\t2');
    expect(body?.rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('case 2: comma + 改行 → CSV として parse', () => {
    const body = detectPasteAsSpreadsheet('a,b\n1,2');
    expect(body?.rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('case 3: 改行のみ → 1 列の複数行 cell', () => {
    const body = detectPasteAsSpreadsheet('line1\nline2\nline3');
    expect(body?.rows).toEqual([['line1'], ['line2'], ['line3']]);
  });

  it('case 4: tab を含むが改行なし → TSV(1 行)として parse', () => {
    const body = detectPasteAsSpreadsheet('a\tb\tc');
    expect(body?.rows).toEqual([['a', 'b', 'c']]);
  });

  it('case 5: 単一 cell(改行 / tab / comma なし)→ null(default paste へ)', () => {
    expect(detectPasteAsSpreadsheet('single value')).toBeNull();
  });

  it('case 6: 空文字列 → null', () => {
    expect(detectPasteAsSpreadsheet('')).toBeNull();
  });

  it('case 7: comma だけ + 改行なし → null(単一行 comma は CSV 不確定)', () => {
    // 単一行 comma は cell 値の一部かもしれず、auto-detect では default 動作にする
    expect(detectPasteAsSpreadsheet('one, two, three')).toBeNull();
  });

  it('case 8: tab を含む CSV(混在)は TSV 優先', () => {
    const body = detectPasteAsSpreadsheet('a,b\tc\n1,2\t3');
    expect(body?.rows).toEqual([['a,b', 'c'], ['1,2', '3']]);
  });

  it('case 9: CRLF も検出対象', () => {
    const body = detectPasteAsSpreadsheet('a\tb\r\n1\t2');
    expect(body?.rows).toEqual([['a', 'b'], ['1', '2']]);
  });
});
