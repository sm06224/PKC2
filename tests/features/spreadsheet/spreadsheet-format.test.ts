/**
 * 領域 10-4 spreadsheet Phase 4(user direction 2026-06-03「基本的なデータ型と
 * 見せ方には対応すべき」):列ごとの ColumnFormat(number/currency/percent/date/text)
 * を gate。
 */

import { describe, it, expect } from 'vitest';
import {
  parseSpreadsheetBody,
  serializeSpreadsheetBody,
  findColumnFormat,
  formatCellValue,
  type ColumnFormat,
} from '@features/spreadsheet/spreadsheet-body';

describe('spreadsheet column format(reform 2026-06-03)', () => {
  describe('parse / serialize round-trip', () => {
    it('case 1: columnFormats が JSON に保持される', () => {
      const body = {
        rows: [['x']],
        columnFormats: [
          { col: 0, type: 'number' as const, precision: 2, useGrouping: true },
          { col: 1, type: 'currency' as const, currency: 'JPY' },
          { col: 2, type: 'percent' as const, precision: 1 },
          { col: 3, type: 'date' as const, dateFormat: 'long' as const },
        ],
      };
      const json = serializeSpreadsheetBody(body);
      const parsed = parseSpreadsheetBody(json);
      expect(parsed.columnFormats).toEqual(body.columnFormats);
    });

    it('case 2: 不正な type / col は parse 時に除外', () => {
      const parsed = parseSpreadsheetBody(JSON.stringify({
        rows: [['a']],
        columnFormats: [
          { col: 0, type: 'number' },        // OK
          { col: 1, type: 'invalid-kind' },  // type 不正
          { col: 'x', type: 'number' },       // col 不正
          { type: 'currency' },               // col 無し
        ],
      }));
      expect(parsed.columnFormats).toEqual([{ col: 0, type: 'number' }]);
    });
  });

  describe('findColumnFormat / formatCellValue', () => {
    const body = {
      rows: [['x']],
      columnFormats: [
        { col: 0, type: 'number' as const, precision: 2 },
        { col: 1, type: 'currency' as const, currency: 'JPY', precision: 0 },
        { col: 2, type: 'percent' as const, precision: 1 },
        { col: 3, type: 'date' as const, dateFormat: 'short' as const },
      ],
    };

    it('case 3: number 0.5 → "0.50"(precision=2)', () => {
      expect(formatCellValue('0.5', findColumnFormat(body, 0), 'en-US')).toBe('0.50');
    });

    it('case 4: number 1234567 → "1,234,567"(default useGrouping)', () => {
      expect(formatCellValue('1234567', { col: 0, type: 'number' }, 'en-US')).toBe('1,234,567');
    });

    it('case 5: currency JPY 1000 → "¥1,000"', () => {
      const formatted = formatCellValue('1000', findColumnFormat(body, 1), 'ja-JP');
      // 通貨 symbol は locale 依存。少なくとも 1000 と通貨 token が含まれる。
      expect(formatted).toContain('1,000');
      expect(formatted).toMatch(/[¥￥JPY]/);
    });

    it('case 6: percent 0.25 → "25.0%"', () => {
      expect(formatCellValue('0.25', findColumnFormat(body, 2), 'en-US')).toBe('25.0%');
    });

    it('case 7: date 2026-06-03 → 短い日付表示', () => {
      const formatted = formatCellValue('2026-06-03', findColumnFormat(body, 3), 'ja-JP');
      // ja-JP short: 「2026/06/03」 等(実装によって ja format 差異あり)
      expect(formatted).toMatch(/2026/);
    });

    it('case 8: text type / format null → raw 文字列のまま', () => {
      expect(formatCellValue('abc', { col: 0, type: 'text' }, 'en-US')).toBe('abc');
      expect(formatCellValue('abc', null, 'en-US')).toBe('abc');
    });

    it('case 9: 数値でない cell は number format でも raw のまま', () => {
      expect(formatCellValue('hello', { col: 0, type: 'number' }, 'en-US')).toBe('hello');
    });

    it('case 10: 空 cell は format 適用してもそのまま空文字', () => {
      expect(formatCellValue('', { col: 0, type: 'currency' }, 'en-US')).toBe('');
    });

    it('case 11: 不正 currency code → fallback で number format(throw しない)', () => {
      const fmt: ColumnFormat = { col: 0, type: 'currency', currency: 'INVALID' };
      const result = formatCellValue('100', fmt, 'en-US');
      // Intl.NumberFormat は throw、catch して number 経路に fallback → "100"
      expect(result).toMatch(/100/);
    });

    it('case 12: useGrouping=false で桁区切り無し', () => {
      const fmt: ColumnFormat = { col: 0, type: 'number', useGrouping: false };
      expect(formatCellValue('1234567', fmt, 'en-US')).toBe('1234567');
    });
  });
});
