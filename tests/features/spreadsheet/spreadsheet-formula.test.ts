/**
 * 領域 10-4 spreadsheet Phase 4(user direction 2026-06-02、9 項目一括 #2):
 * formula evaluator(=A1+B1, =SUM(...) 等 Excel-like)の case matrix。
 *
 * Wave §4 規律で 10 件以上 + edge case + user 提供想定ケース。
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateFormula,
  evaluateBody,
  isFormula,
  parseCellRef,
  colLetterToIndex,
  colIndexToLetter,
  type SpreadsheetBody,
} from '@features/spreadsheet/spreadsheet-body';

function body(rows: string[][]): SpreadsheetBody {
  return { rows };
}

describe('spreadsheet Phase 4 formula evaluator', () => {
  describe('cell ref helpers', () => {
    it('case 1: colLetterToIndex A=0, B=1, Z=25, AA=26', () => {
      expect(colLetterToIndex('A')).toBe(0);
      expect(colLetterToIndex('B')).toBe(1);
      expect(colLetterToIndex('Z')).toBe(25);
      expect(colLetterToIndex('AA')).toBe(26);
      expect(colLetterToIndex('')).toBe(-1);
      expect(colLetterToIndex('a')).toBe(-1); // lowercase rejected
    });

    it('case 2: colIndexToLetter 0=A, 25=Z, 26=AA, 51=AZ, 52=BA', () => {
      expect(colIndexToLetter(0)).toBe('A');
      expect(colIndexToLetter(25)).toBe('Z');
      expect(colIndexToLetter(26)).toBe('AA');
      expect(colIndexToLetter(51)).toBe('AZ');
      expect(colIndexToLetter(52)).toBe('BA');
      expect(colIndexToLetter(-1)).toBe('');
    });

    it('case 3: parseCellRef A1 → {row:0, col:0}, B3 → {row:2, col:1}, Z10 → {row:9, col:25}', () => {
      expect(parseCellRef('A1')).toEqual({ row: 0, col: 0 });
      expect(parseCellRef('B3')).toEqual({ row: 2, col: 1 });
      expect(parseCellRef('Z10')).toEqual({ row: 9, col: 25 });
      expect(parseCellRef('AA1')).toEqual({ row: 0, col: 26 });
      expect(parseCellRef('bad')).toBeNull();
    });
  });

  describe('isFormula detection', () => {
    it('case 4: `=A1` → true, `123` → false, `text` → false', () => {
      expect(isFormula('=A1')).toBe(true);
      expect(isFormula('=SUM(A1:B2)')).toBe(true);
      expect(isFormula('123')).toBe(false);
      expect(isFormula('text')).toBe(false);
      expect(isFormula('')).toBe(false);
    });
  });

  describe('basic arithmetic', () => {
    it('case 5: `=1+2` → "3"', () => {
      expect(evaluateFormula('=1+2', body([]))).toBe('3');
    });

    it('case 6: 演算子優先(`=1+2*3` → "7", `=(1+2)*3` → "9")', () => {
      expect(evaluateFormula('=1+2*3', body([]))).toBe('7');
      expect(evaluateFormula('=(1+2)*3', body([]))).toBe('9');
    });

    it('case 7: 除算 / べき乗(`=10/4` → "2.5", `=2^10` → "1024")', () => {
      expect(evaluateFormula('=10/4', body([]))).toBe('2.5');
      expect(evaluateFormula('=2^10', body([]))).toBe('1024');
    });

    it('case 8: 単項マイナス(`=-5+3` → "-2")', () => {
      expect(evaluateFormula('=-5+3', body([]))).toBe('-2');
    });

    it('case 9: ゼロ除算は `#ERR!`', () => {
      expect(evaluateFormula('=1/0', body([]))).toBe('#ERR!');
    });
  });

  describe('cell references', () => {
    it('case 10: `=A1` で隣 cell の値を取得', () => {
      const b = body([['42', '0']]);
      expect(evaluateFormula('=A1', b)).toBe('42');
    });

    it('case 11: `=A1+B1` で隣 cell の合算', () => {
      const b = body([['10', '20']]);
      expect(evaluateFormula('=A1+B1', b)).toBe('30');
    });

    it('case 12: cell 内 formula も再帰評価(`=A1+1` で A1 が `=2*3`)', () => {
      const b = body([['=2*3', '']]);
      expect(evaluateFormula('=A1+1', b)).toBe('7');
    });

    it('case 13: 循環参照は `#CYCLE!` を返す(A1=B1, B1=A1)', () => {
      const b = body([['=B1', '=A1']]);
      // evaluateBody での評価では `#CYCLE!` または `#ERR!` のいずれか(parser が cycle を catch)
      const result = evaluateFormula('=A1', b);
      expect(['#CYCLE!', '#ERR!']).toContain(result);
    });

    it('case 14: 範囲外 cell 参照は 0 扱い', () => {
      const b = body([['1']]);
      expect(evaluateFormula('=Z99+1', b)).toBe('1');
    });
  });

  describe('functions', () => {
    it('case 15: `=SUM(A1:A3)` で範囲合算', () => {
      const b = body([['10'], ['20'], ['30']]);
      expect(evaluateFormula('=SUM(A1:A3)', b)).toBe('60');
    });

    it('case 16: `=AVG(A1:A3)` で平均', () => {
      const b = body([['10'], ['20'], ['30']]);
      expect(evaluateFormula('=AVG(A1:A3)', b)).toBe('20');
    });

    it('case 17: `=MIN(A1:C1)` / `=MAX(A1:C1)`', () => {
      const b = body([['5', '12', '3']]);
      expect(evaluateFormula('=MIN(A1:C1)', b)).toBe('3');
      expect(evaluateFormula('=MAX(A1:C1)', b)).toBe('12');
    });

    it('case 18: `=COUNT(A1:A5)` で数値 cell の件数', () => {
      const b = body([['1'], ['x'], ['2'], [''], ['3']]);
      expect(evaluateFormula('=COUNT(A1:A5)', b)).toBe('3');
    });

    it('case 19: `=IF(A1>5,"big","small")`', () => {
      const b = body([['10']]);
      expect(evaluateFormula('=IF(A1>5,"big","small")', b)).toBe('big');
      const b2 = body([['1']]);
      expect(evaluateFormula('=IF(A1>5,"big","small")', b2)).toBe('small');
    });

    it('case 20: `=ABS(-7)` → "7", `=ROUND(3.14159, 2)` → "3.14"', () => {
      expect(evaluateFormula('=ABS(-7)', body([]))).toBe('7');
      expect(evaluateFormula('=ROUND(3.14159,2)', body([]))).toBe('3.14');
    });

    it('case 21: `=CONCAT("hello"," ","world")` → "hello world"', () => {
      expect(evaluateFormula('=CONCAT("hello"," ","world")', body([]))).toBe('hello world');
    });

    it('case 22: 未知関数は `#ERR!`', () => {
      expect(evaluateFormula('=UNKNOWN(1,2)', body([]))).toBe('#ERR!');
    });
  });

  describe('comparison operators', () => {
    it('case 23: `=1<2` → "1", `=5<=5` → "1", `=3<>3` → "0"', () => {
      expect(evaluateFormula('=1<2', body([]))).toBe('1');
      expect(evaluateFormula('=5<=5', body([]))).toBe('1');
      expect(evaluateFormula('=3<>3', body([]))).toBe('0');
    });
  });

  describe('evaluateBody integration', () => {
    it('case 24: 全 cell を評価して 2D grid を返す', () => {
      const b = body([
        ['1', '2', '=A1+B1'],
        ['10', '20', '=A2+B2'],
        ['=SUM(A1:A2)', '=SUM(B1:B2)', '=A3+B3'],
      ]);
      const out = evaluateBody(b);
      expect(out[0]?.[2]).toBe('3');
      expect(out[1]?.[2]).toBe('30');
      expect(out[2]?.[0]).toBe('11');
      expect(out[2]?.[1]).toBe('22');
      expect(out[2]?.[2]).toBe('33');
    });

    it('case 25: 非 formula cell は raw のまま', () => {
      const b = body([['name', 'count'], ['apple', '5']]);
      const out = evaluateBody(b);
      expect(out[0]?.[0]).toBe('name');
      expect(out[1]?.[0]).toBe('apple');
      expect(out[1]?.[1]).toBe('5');
    });
  });
});
