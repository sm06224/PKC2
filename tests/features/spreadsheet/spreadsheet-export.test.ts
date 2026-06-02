/**
 * 領域 10-4 spreadsheet Phase 4(user direction 2026-06-02、9 項目一括 #9):
 * ODF Flat XML(.fods)export + CSV export(評価値ベース)。
 */

import { describe, it, expect } from 'vitest';
import {
  serializeBodyToFods,
  serializeBodyToCsv,
  serializeBodyToTsv,
  parseSpreadsheetBody,
  serializeSpreadsheetBody,
  evaluateBody,
} from '@features/spreadsheet/spreadsheet-body';

describe('spreadsheet Phase 4 export', () => {
  describe('FODS (ODF Flat XML)', () => {
    it('case 1: 基本 body を valid な FODS XML に変換', () => {
      const fods = serializeBodyToFods({ rows: [['name', 'age'], ['alice', '30']] });
      expect(fods).toContain('<?xml version="1.0"');
      expect(fods).toContain('office:mimetype="application/vnd.oasis.opendocument.spreadsheet"');
      expect(fods).toContain('<table:table-row>');
      expect(fods).toContain('alice');
      expect(fods).toContain('30');
    });

    it('case 2: 数値 cell は office:value-type="float" + office:value', () => {
      const fods = serializeBodyToFods({ rows: [['30']] });
      expect(fods).toContain('office:value-type="float"');
      expect(fods).toContain('office:value="30"');
    });

    it('case 3: 文字列 cell は office:value-type="string"', () => {
      const fods = serializeBodyToFods({ rows: [['hello']] });
      expect(fods).toContain('office:value-type="string"');
    });

    it('case 4: XML special char(< > & " \')を escape', () => {
      const fods = serializeBodyToFods({ rows: [['<x>&"y\'']] });
      expect(fods).toContain('&lt;x&gt;&amp;&quot;y&apos;');
      expect(fods).not.toContain('<x>');
    });

    it('case 5: sheet name は table:name attribute に', () => {
      const fods = serializeBodyToFods({ rows: [['a']] }, 'MySheet');
      expect(fods).toContain('table:name="MySheet"');
    });

    it('case 6: 空 body でも valid FODS(rows なし、table 構造は残る)', () => {
      const fods = serializeBodyToFods({ rows: [] });
      expect(fods).toContain('<table:table');
      expect(fods).toContain('</table:table>');
    });
  });

  describe('CSV export with evaluated formulas', () => {
    it('case 7: formula を含む body は evaluateBody 後に CSV へ', () => {
      const body = { rows: [['1', '2', '=A1+B1']] };
      const evaluated = evaluateBody(body);
      const csv = serializeBodyToCsv({ rows: evaluated });
      expect(csv).toBe('1,2,3');
    });

    it('case 8: cell 内 comma / quote / 改行は CSV 規約で escape', () => {
      const csv = serializeBodyToCsv({ rows: [['has,comma', 'has"quote', 'line\nbreak']] });
      expect(csv).toContain('"has,comma"');
      expect(csv).toContain('"has""quote"');
      expect(csv).toContain('"line\nbreak"');
    });
  });

  describe('TSV / JSON round-trip with metadata', () => {
    it('case 9: colWidths / rowHeights / charts / noHeader を JSON で保持', () => {
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

    it('case 10: 不正 chart kind / 不正 number field は parse 時に rejected', () => {
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
    it('case 11: TSV serialization は rows のみ、metadata 失う', () => {
      const body = { rows: [['a', 'b'], ['1', '2']], noHeader: true };
      const tsv = serializeBodyToTsv(body);
      expect(tsv).toBe('a\tb\n1\t2');
    });
  });
});
