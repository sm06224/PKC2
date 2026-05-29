/**
 * @vitest-environment node
 *
 * 領域 10-4 spreadsheet archetype Phase 1(2026-05-28、user direction #4):
 * features/spreadsheet/spreadsheet-body.ts の pure helpers の動作を verify。
 */

import { describe, it, expect } from 'vitest';
import {
  parseSpreadsheetBody,
  serializeSpreadsheetBody,
  parseTsvToBody,
  serializeBodyToTsv,
  getColumnCount,
  getRowCount,
  EMPTY_SPREADSHEET_BODY,
} from '@features/spreadsheet/spreadsheet-body';

describe('parseSpreadsheetBody', () => {
  it('case 1: 空文字列 → 空 body', () => {
    expect(parseSpreadsheetBody('')).toEqual({ rows: [] });
  });

  it('case 2: whitespace のみ → 空 body', () => {
    expect(parseSpreadsheetBody('   ')).toEqual({ rows: [] });
  });

  it('case 3: 正常な JSON', () => {
    const body = parseSpreadsheetBody('{"rows":[["a","b"],["1","2"]]}');
    expect(body.rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('case 4: 不正な JSON → 空 body(silent fallback)', () => {
    expect(parseSpreadsheetBody('not json')).toEqual({ rows: [] });
    expect(parseSpreadsheetBody('{rows:}')).toEqual({ rows: [] });
  });

  it('case 5: rows が array でない → 空 body', () => {
    expect(parseSpreadsheetBody('{"rows":"oops"}')).toEqual({ rows: [] });
    expect(parseSpreadsheetBody('{"rows":42}')).toEqual({ rows: [] });
  });

  it('case 6: 非 array row は skip', () => {
    const body = parseSpreadsheetBody('{"rows":[["a"],"oops",["b"]]}');
    expect(body.rows).toEqual([['a'], ['b']]);
  });

  it('case 7: null / undefined cell → 空文字列に coerce', () => {
    const body = parseSpreadsheetBody('{"rows":[[null,"x",null]]}');
    expect(body.rows).toEqual([['', 'x', '']]);
  });

  it('case 8: 数値 cell → String() coerce', () => {
    const body = parseSpreadsheetBody('{"rows":[[1,2.5,true]]}');
    expect(body.rows).toEqual([['1', '2.5', 'true']]);
  });
});

describe('serializeSpreadsheetBody', () => {
  it('case 1: round-trip 安定(parse(serialize(body)) === body)', () => {
    const body = { rows: [['a', 'b'], ['1', '2']] };
    const json = serializeSpreadsheetBody(body);
    expect(parseSpreadsheetBody(json)).toEqual(body);
  });

  it('case 2: 空 body → "{\\"rows\\":[]}"', () => {
    expect(serializeSpreadsheetBody({ rows: [] })).toBe('{"rows":[]}');
  });
});

describe('parseTsvToBody', () => {
  it('case 1: 単純な TSV', () => {
    const body = parseTsvToBody('a\tb\n1\t2');
    expect(body.rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('case 2: 空文字列 → 空 body', () => {
    expect(parseTsvToBody('')).toEqual({ rows: [] });
  });

  it('case 3: 末尾 newline は 1 個 trim(標準形)', () => {
    const body = parseTsvToBody('a\tb\n');
    expect(body.rows).toEqual([['a', 'b']]);
  });

  it('case 4: CRLF を LF 正規化', () => {
    const body = parseTsvToBody('a\tb\r\n1\t2\r\n');
    expect(body.rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('case 5: ragged row(列数バラバラ)も保持', () => {
    const body = parseTsvToBody('a\tb\tc\n1\t2');
    expect(body.rows).toEqual([['a', 'b', 'c'], ['1', '2']]);
  });

  it('case 6: 空 cell も保持', () => {
    const body = parseTsvToBody('a\t\tc');
    expect(body.rows).toEqual([['a', '', 'c']]);
  });

  it('case 7: 末尾空行は全て trim(TSV canonical 形)', () => {
    // 末尾連続空行は全て trim。canonical 形では trailing 空行は意味なし。
    const body = parseTsvToBody('a\n\n\n');
    expect(body.rows).toEqual([['a']]);
    expect(parseTsvToBody('a\tb\n\n').rows).toEqual([['a', 'b']]);
  });
});

describe('serializeBodyToTsv', () => {
  it('case 1: round-trip(parseTsvToBody(serialize(body)) ≅ body)', () => {
    const body = { rows: [['a', 'b'], ['1', '2']] };
    const tsv = serializeBodyToTsv(body);
    expect(tsv).toBe('a\tb\n1\t2');
    expect(parseTsvToBody(tsv)).toEqual(body);
  });

  it('case 2: 空 body → 空文字列', () => {
    expect(serializeBodyToTsv({ rows: [] })).toBe('');
  });
});

describe('getColumnCount / getRowCount', () => {
  it('case 1: 空 body は 0 / 0', () => {
    expect(getColumnCount({ rows: [] })).toBe(0);
    expect(getRowCount({ rows: [] })).toBe(0);
  });

  it('case 2: ragged row → 最大列数', () => {
    const body = { rows: [['a'], ['1', '2', '3'], ['x', 'y']] };
    expect(getColumnCount(body)).toBe(3);
    expect(getRowCount(body)).toBe(3);
  });
});

describe('EMPTY_SPREADSHEET_BODY', () => {
  it('case 1: rows: []', () => {
    expect(EMPTY_SPREADSHEET_BODY).toEqual({ rows: [] });
  });
});
