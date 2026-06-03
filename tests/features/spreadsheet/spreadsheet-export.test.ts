/**
 * 領域 10-4 spreadsheet Phase 4(user direction 2026-06-02、9 項目一括 #9):
 * CSV export(評価値ベース)+ JSON round-trip。ODF は 2026-06-02 user
 * direction「ODF 廃止、xlsx あれば不要」 で完全撤去、xlsx は別 test file。
 */

import { describe, it, expect } from 'vitest';
import {
  serializeBodyToCsv,
  serializeBodyToTsv,
  parseSpreadsheetBody,
  serializeSpreadsheetBody,
  evaluateBody,
} from '@features/spreadsheet/spreadsheet-body';

describe('spreadsheet Phase 4 export', () => {
  describe('CSV export with evaluated formulas', () => {
    it('case 1: formula を含む body は evaluateBody 後に CSV へ', () => {
      const body = { rows: [['1', '2', '=A1+B1']] };
      const evaluated = evaluateBody(body);
      const csv = serializeBodyToCsv({ rows: evaluated });
      expect(csv).toBe('1,2,3');
    });

    it('case 2: cell 内 comma / quote / 改行は CSV 規約で escape', () => {
      const csv = serializeBodyToCsv({ rows: [['has,comma', 'has"quote', 'line\nbreak']] });
      expect(csv).toContain('"has,comma"');
      expect(csv).toContain('"has""quote"');
      expect(csv).toContain('"line\nbreak"');
    });
  });

  describe('TSV / JSON round-trip with metadata', () => {
    it('case 3: colWidths / rowHeights / charts / noHeader を JSON で保持', () => {
      const body = {
        rows: [['a']],
        colWidths: [120, 80],
        rowHeights: [30],
        noHeader: true,
        charts: [{
          id: 'c1',
          kind: 'bar' as const,
          title: 'Test',
          xCol: 0,
          yCols: [1],
          startRow: 0,
        }],
      };
      const json = serializeSpreadsheetBody(body);
      const parsed = parseSpreadsheetBody(json);
      expect(parsed.colWidths).toEqual([120, 80]);
      expect(parsed.rowHeights).toEqual([30]);
      expect(parsed.noHeader).toBe(true);
      expect(parsed.charts?.[0]?.id).toBe('c1');
      expect(parsed.charts?.[0]?.kind).toBe('bar');
    });

    it('case 4: 不正 chart kind / 不正 number field は parse 時に rejected', () => {
      const parsed = parseSpreadsheetBody(JSON.stringify({
        rows: [['a']],
        charts: [
          { id: 'c1', kind: 'invalid', xCol: 0, yCols: [1] },
          { id: 'c2', kind: 'bar', xCol: 'not-number', yCols: [1] },
        ],
      }));
      expect(parsed.charts ?? []).toEqual([]);
    });
  });

  describe('TSV serialization (legacy compatibility)', () => {
    it('case 5: TSV serialization は rows のみ、metadata 失う', () => {
      const body = { rows: [['a', 'b'], ['1', '2']], noHeader: true };
      const tsv = serializeBodyToTsv(body);
      expect(tsv).toBe('a\tb\n1\t2');
    });
  });
});
