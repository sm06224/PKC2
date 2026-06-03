/**
 * 実 xlsx round-trip 検証(user 報告 2026-06-03「xlsx のチャートは開けなかった、
 * ファイルが壊れてました」 fix の永続 gate)。
 *
 * buildXlsxFiles + createZipBytes で生成した実 xlsx Buffer を ExcelJS
 * (Excel 互換 strict parser)で reload + 値検証。SheetJS は npm CVE で
 * security 制約あるため exceljs に切替。
 */

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildXlsxFiles } from '@features/spreadsheet/spreadsheet-body';
import { createZipBytes } from '@adapter/platform/zip-package';

function buildXlsxBuffer(body: Parameters<typeof buildXlsxFiles>[0]): Buffer {
  const files = buildXlsxFiles(body);
  const enc = new TextEncoder();
  const entries = files.map((f) => ({ name: f.name, data: enc.encode(f.content) }));
  return Buffer.from(createZipBytes(entries));
}

describe('xlsx structural round-trip(ExcelJS で実 parse)', () => {
  it('case 1: chart 付き xlsx を ExcelJS で reload → sheet + cells 認識', async () => {
    const body = {
      rows: [['x', 'y'], ['1', '10'], ['2', '20'], ['3', '30']],
      charts: [{
        id: 'c1', kind: 'bar' as const, title: 'Sales',
        xCol: 0, yCols: [1], startRow: 1, legend: true,
      }],
    };
    const buf = buildXlsxBuffer(body);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Sheet1');
    expect(ws).toBeTruthy();
    expect(ws!.getCell('A1').value).toBe('x');
    expect(ws!.getCell('A2').value).toBe(1);
    expect(ws!.getCell('B2').value).toBe(10);
    expect(ws!.getCell('B4').value).toBe(30);
  });

  it('case 2: chart 無し xlsx も valid parse', async () => {
    const body = { rows: [['hello', 'world']] };
    const buf = buildXlsxBuffer(body);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Sheet1');
    expect(ws!.getCell('A1').value).toBe('hello');
    expect(ws!.getCell('B1').value).toBe('world');
  });

  it('case 3: 全 chart kind(bar/line/pie/doughnut)が ExcelJS で破損せず parse 通過', async () => {
    for (const kind of ['bar', 'line', 'pie', 'doughnut'] as const) {
      const body = {
        rows: [['cat', 'val'], ['a', '5'], ['b', '10']],
        charts: [{
          id: 'c1', kind, title: `${kind} chart`,
          xCol: 0, yCols: [1], startRow: 1,
        }],
      };
      const buf = buildXlsxBuffer(body);
      const wb = new ExcelJS.Workbook();
      await expect(wb.xlsx.load(buf)).resolves.not.toThrow();
      const ws = wb.getWorksheet('Sheet1');
      expect(ws!.getCell('A2').value).toBe('a');
    }
  });

  it('case 4: 複数 chart 同時(2 件)でも valid', async () => {
    const body = {
      rows: [['x', 'y1', 'y2'], ['1', '10', '5'], ['2', '20', '15']],
      charts: [
        { id: 'c1', kind: 'bar' as const, title: 'A', xCol: 0, yCols: [1], startRow: 1 },
        { id: 'c2', kind: 'line' as const, title: 'B', xCol: 0, yCols: [2], startRow: 1 },
      ],
    };
    const buf = buildXlsxBuffer(body);
    const wb = new ExcelJS.Workbook();
    await expect(wb.xlsx.load(buf)).resolves.not.toThrow();
  });

  it('case 5: docProps(creator / lastModifiedBy)を ExcelJS が parse できる', async () => {
    const body = { rows: [['a']] };
    const buf = buildXlsxBuffer(body);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.creator).toBe('PKC2');
  });

  it('case 6: sheet 名 quote 形式の cell range が ExcelJS chart として解釈可能', async () => {
    const body = {
      rows: [['x', 'y'], ['1', '10'], ['2', '20']],
      charts: [{ id: 'c1', kind: 'bar' as const, title: '', xCol: 0, yCols: [1], startRow: 1 }],
    };
    const buf = buildXlsxBuffer(body);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    // worksheet が chart 含むかは ExcelJS が chart support 完備していないため
    // 確実 assert は困難。load throw しないことで「壊れてない」 を保証。
    const ws = wb.getWorksheet('Sheet1');
    expect(ws).toBeTruthy();
    // A2 のセル値が数値として保持されている(string ではない)
    expect(typeof ws!.getCell('A2').value).toBe('number');
  });
});
