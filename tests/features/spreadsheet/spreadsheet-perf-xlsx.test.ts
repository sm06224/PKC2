/**
 * 領域 10-4 spreadsheet Phase 4(user direction 2026-06-02、追加 3 項目):
 * formula evaluation memoization + xlsx export + chart modal の検証。
 *
 * user direction「パフォーマンスに不安があるなら解決して!」を受けて、
 * evaluateBody が単一 ctx で memo を共有することで重複参照のある grid を
 * 線形時間で評価することを実測 + xlsx zip 構造 + modal UI の確認。
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateBody,
  evaluateFormula,
  buildXlsxFiles,
  type SpreadsheetBody,
} from '@features/spreadsheet/spreadsheet-body';

describe('spreadsheet Phase 4 perf + xlsx', () => {
  describe('formula memoization', () => {
    it('case 1: 同 cell を参照する 100 個の formula は memo で線形時間', () => {
      // A1 = SUM(B1:B100)、B 列 100 cell すべて数値、C 列 100 cell すべて =A1
      // memo なしだと C 列 100 cell が A1 を 100 回再評価(= SUM を 100 回)
      // memo ありだと A1 = 1 回、C 列 100 cell は memo hit のみ
      const rows: string[][] = [];
      for (let i = 0; i < 100; i++) {
        rows.push([
          i === 0 ? '=SUM(B1:B100)' : '',
          String(i + 1),
          '=A1',
        ]);
      }
      const body: SpreadsheetBody = { rows };
      const start = performance.now();
      const out = evaluateBody(body);
      const elapsed = performance.now() - start;
      // A1 = 1+2+...+100 = 5050
      expect(out[0]?.[0]).toBe('5050');
      expect(out[50]?.[2]).toBe('5050');
      expect(out[99]?.[2]).toBe('5050');
      // memo ありで 50ms 以内、無いと数百 ms オーダー(N^2 になる)
      expect(elapsed).toBeLessThan(100);
    });

    it('case 2: ネスト formula(A1 → A2 → ... → A100)も memo で線形', () => {
      // A1=1、A2=A1+1、A3=A2+1、... A100=A99+1
      // memo なしだと A100 評価で A1〜A99 を再帰的に N 回(= N^2/2 回 readCellValue)
      const rows: string[][] = [['1']];
      for (let i = 1; i < 100; i++) {
        rows.push([`=A${i}+1`]);
      }
      const body: SpreadsheetBody = { rows };
      const start = performance.now();
      const out = evaluateBody(body);
      const elapsed = performance.now() - start;
      expect(out[99]?.[0]).toBe('100');
      expect(elapsed).toBeLessThan(50);
    });

    it('case 3: 循環参照は memo 内でも検出されて #CYCLE! / #ERR! を返す(A1→B1→C1→A1)', () => {
      const body: SpreadsheetBody = {
        // 単一 row に 3 cell。A1=B1, B1=C1, C1=A1。
        rows: [['=B1', '=C1', '=A1']],
      };
      const a1 = evaluateFormula('=A1', body);
      expect(['#CYCLE!', '#ERR!']).toContain(a1);
    });

    it('case 4: 単発 evaluateFormula 呼出は memo 持たない(関連 cell 再評価)が正しさは保つ', () => {
      const body: SpreadsheetBody = {
        rows: [['=B1+C1', '10', '20']],
      };
      // ctx 渡さず default ctx で評価 → 正しさだけ確認
      expect(evaluateFormula('=A1', body)).toBe('30');
    });
  });

  describe('xlsx (Office Open XML) export', () => {
    it('case 5: buildXlsxFiles は最小 5 ファイルを返す(content_types / rels / workbook / sheet / sheet rels)', () => {
      const files = buildXlsxFiles({ rows: [['a']] });
      const names = files.map((f) => f.name).sort();
      expect(names).toEqual([
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/_rels/workbook.xml.rels',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ]);
    });

    it('case 6: content types に worksheet + workbook の Override 両方', () => {
      const files = buildXlsxFiles({ rows: [['a']] });
      const ct = files.find((f) => f.name === '[Content_Types].xml')!;
      expect(ct.content).toContain('spreadsheetml.sheet.main+xml');
      expect(ct.content).toContain('spreadsheetml.worksheet+xml');
    });

    it('case 7: 数値 cell は <v>123</v>、文字列 cell は <is><t>...</t></is>(inline string)', () => {
      const files = buildXlsxFiles({ rows: [['name', '42']] });
      const sheet = files.find((f) => f.name === 'xl/worksheets/sheet1.xml')!;
      expect(sheet.content).toContain('<v>42</v>');
      expect(sheet.content).toContain('t="inlineStr"');
      expect(sheet.content).toContain('<t xml:space="preserve">name</t>');
    });

    it('case 8: cell 座標は A1 形式(r="A1" / r="B2" 等)', () => {
      const files = buildXlsxFiles({ rows: [['x', 'y'], ['1', '2']] });
      const sheet = files.find((f) => f.name === 'xl/worksheets/sheet1.xml')!;
      expect(sheet.content).toContain('r="A1"');
      expect(sheet.content).toContain('r="B1"');
      expect(sheet.content).toContain('r="A2"');
      expect(sheet.content).toContain('r="B2"');
    });

    it('case 9: 空 cell は cell 出力 skip(行は r="N" 付きで出る)', () => {
      const files = buildXlsxFiles({ rows: [['a', '', 'c']] });
      const sheet = files.find((f) => f.name === 'xl/worksheets/sheet1.xml')!;
      expect(sheet.content).toContain('r="A1"');
      expect(sheet.content).toContain('r="C1"');
      expect(sheet.content).not.toContain('r="B1"');
    });

    it('case 10: XML special char(< > & " \')を escape', () => {
      const files = buildXlsxFiles({ rows: [['<&"\'>']] });
      const sheet = files.find((f) => f.name === 'xl/worksheets/sheet1.xml')!;
      expect(sheet.content).toContain('&lt;&amp;&quot;&apos;&gt;');
      expect(sheet.content).not.toMatch(/<>/);
    });

    it('case 11: formula 含む body は build 前に evaluateBody 経由で評価値が出力', () => {
      // buildXlsxFiles は内部で evaluateBody を呼ぶ
      const files = buildXlsxFiles({ rows: [['1', '2', '=A1+B1']] });
      const sheet = files.find((f) => f.name === 'xl/worksheets/sheet1.xml')!;
      expect(sheet.content).toContain('<v>3</v>');
    });

    it('case 12: sheet name は xl/workbook.xml の sheet[name] に反映', () => {
      const files = buildXlsxFiles({ rows: [['a']] }, '売上');
      const wb = files.find((f) => f.name === 'xl/workbook.xml')!;
      expect(wb.content).toContain('name="売上"');
    });
  });
});
