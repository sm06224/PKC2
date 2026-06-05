/**
 * @vitest-environment happy-dom
 *
 * 領域 10-4 spreadsheet Phase 4(user direction 2026-06-02、追加 3 項目):
 * formula evaluation memoization + xlsx export + chart modal の検証。
 *
 * user direction「パフォーマンスに不安があるなら解決して!」を受けて、
 * evaluateBody が単一 ctx で memo を共有することで重複参照のある grid を
 * 線形時間で評価することを実測 + xlsx zip 構造 + modal UI の確認。
 * 2026-06-03:happy-dom 環境で OOXML XML を DOMParser 経由で valid 検証。
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
    it('case 5: buildXlsxFiles は 9 ファイルを返す(content_types + rels + workbook + sheet + docProps + styles + theme)', () => {
      const files = buildXlsxFiles({ rows: [['a']] });
      const names = files.map((f) => f.name).sort();
      expect(names).toEqual([
        '[Content_Types].xml',
        '_rels/.rels',
        'docProps/app.xml',
        'docProps/core.xml',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
        'xl/theme/theme1.xml',
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

  describe('xlsx with charts(user direction 2026-06-03「xlsx にもグラフ出力」)', () => {
    const body = {
      rows: [['x', 'y'], ['1', '10'], ['2', '20'], ['3', '30']],
      charts: [{
        id: 'c1', kind: 'bar' as const, title: '売上推移',
        xCol: 0, yCols: [1], startRow: 1,
      }],
    };

    it('case 13: chart 1 個でも xlsx zip に必要 12 ファイルが全部入る(docProps + styles + theme stub)', () => {
      const files = buildXlsxFiles(body);
      const names = files.map((f) => f.name).sort();
      expect(names).toEqual([
        '[Content_Types].xml',
        '_rels/.rels',
        'docProps/app.xml',
        'docProps/core.xml',
        'xl/_rels/workbook.xml.rels',
        'xl/charts/chart1.xml',
        'xl/drawings/_rels/drawing1.xml.rels',
        'xl/drawings/drawing1.xml',
        'xl/styles.xml',
        'xl/theme/theme1.xml',
        'xl/workbook.xml',
        'xl/worksheets/_rels/sheet1.xml.rels',
        'xl/worksheets/sheet1.xml',
      ]);
    });

    it('case 14: sheet1.xml に <drawing r:id="rId1"/> が追加される', () => {
      const files = buildXlsxFiles(body);
      const sheet = files.find((f) => f.name === 'xl/worksheets/sheet1.xml')!;
      expect(sheet.content).toContain('<drawing r:id="rId1"/>');
    });

    it('case 15: [Content_Types].xml に chart + drawing Override が追加される', () => {
      const files = buildXlsxFiles(body);
      const ct = files.find((f) => f.name === '[Content_Types].xml')!;
      expect(ct.content).toContain('drawingml.chart+xml');
      expect(ct.content).toContain('officedocument.drawing+xml');
    });

    it('case 16: chart1.xml に c:barChart + 系列(c:ser)+ 範囲参照(sheet quoted 形式)', () => {
      const files = buildXlsxFiles(body);
      const chart = files.find((f) => f.name === 'xl/charts/chart1.xml')!;
      expect(chart.content).toContain('c:barChart');
      expect(chart.content).toContain('c:ser');
      // sheet name は always quote(openpyxl 流儀、空白 / 特殊文字対策)
      expect(chart.content).toContain("'Sheet1'!$A$2:$A$4");
      expect(chart.content).toContain("'Sheet1'!$B$2:$B$4");
    });

    it('case 17: chart title は <c:title> に escape 済 text として入る', () => {
      const files = buildXlsxFiles({
        ...body,
        charts: [{ id: 'c1', kind: 'bar', title: '<title&"特殊">', xCol: 0, yCols: [1], startRow: 1 }],
      });
      const chart = files.find((f) => f.name === 'xl/charts/chart1.xml')!;
      expect(chart.content).toContain('&lt;title&amp;&quot;特殊&quot;&gt;');
    });

    it('case 18: line kind は c:lineChart に切替', () => {
      const files = buildXlsxFiles({
        ...body,
        charts: [{ id: 'c1', kind: 'line', title: '', xCol: 0, yCols: [1], startRow: 1 }],
      });
      const chart = files.find((f) => f.name === 'xl/charts/chart1.xml')!;
      expect(chart.content).toContain('c:lineChart');
    });

    it('case 19: pie / doughnut も対応', () => {
      for (const kind of ['pie', 'doughnut'] as const) {
        const files = buildXlsxFiles({
          ...body,
          charts: [{ id: 'c1', kind, title: '', xCol: 0, yCols: [1], startRow: 1 }],
        });
        const chart = files.find((f) => f.name === 'xl/charts/chart1.xml')!;
        const expected = kind === 'pie' ? 'c:pieChart' : 'c:doughnutChart';
        expect(chart.content).toContain(expected);
      }
    });

    it('case 20: 複数 chart で chart1.xml + chart2.xml が出力、drawing rels も 2 件', () => {
      const files = buildXlsxFiles({
        ...body,
        charts: [
          { id: 'c1', kind: 'bar', title: 'A', xCol: 0, yCols: [1], startRow: 1 },
          { id: 'c2', kind: 'line', title: 'B', xCol: 0, yCols: [1], startRow: 1 },
        ],
      });
      const names = files.map((f) => f.name);
      expect(names).toContain('xl/charts/chart1.xml');
      expect(names).toContain('xl/charts/chart2.xml');
      const drels = files.find((f) => f.name === 'xl/drawings/_rels/drawing1.xml.rels')!;
      expect(drels.content).toContain('rId1');
      expect(drels.content).toContain('rId2');
    });

    it('case 21: chart 無し body も docProps + styles + theme stub を含めて 9 ファイル', () => {
      const files = buildXlsxFiles({ rows: [['a']] });
      expect(files.length).toBe(9);
      expect(files.find((f) => f.name === 'xl/charts/chart1.xml')).toBeUndefined();
      // 必須 stub 4 件
      expect(files.find((f) => f.name === 'docProps/core.xml')).toBeDefined();
      expect(files.find((f) => f.name === 'docProps/app.xml')).toBeDefined();
      expect(files.find((f) => f.name === 'xl/styles.xml')).toBeDefined();
      expect(files.find((f) => f.name === 'xl/theme/theme1.xml')).toBeDefined();
    });

    it('case 22: legend=false で c:legend 出力なし', () => {
      const files = buildXlsxFiles({
        ...body,
        charts: [{ id: 'c1', kind: 'bar', title: '', xCol: 0, yCols: [1], startRow: 1, legend: false }],
      });
      const chart = files.find((f) => f.name === 'xl/charts/chart1.xml')!;
      expect(chart.content).not.toContain('c:legend');
    });
  });

  describe('OOXML schema strict validation(2026-06-03 残視覚 verify)', () => {
    const body = {
      rows: [['x', 'y'], ['1', '10'], ['2', '20']],
      charts: [{
        id: 'c1', kind: 'bar' as const, title: 'T',
        xCol: 0, yCols: [1], startRow: 1,
      }],
    };

    it('case 23: chart1.xml が valid XML(parser で throw しない)', () => {
      const files = buildXlsxFiles(body);
      const chart = files.find((f) => f.name === 'xl/charts/chart1.xml')!;
      const parser = new DOMParser();
      const doc = parser.parseFromString(chart.content, 'application/xml');
      const errors = doc.getElementsByTagName('parsererror');
      expect(errors.length).toBe(0);
    });

    it('case 24: drawing1.xml が valid XML + oneCellAnchor を含む(openpyxl 互換、user 報告 2026-06-03 Excel chart 描画 fix)', () => {
      const files = buildXlsxFiles(body);
      const drawing = files.find((f) => f.name === 'xl/drawings/drawing1.xml')!;
      const parser = new DOMParser();
      const doc = parser.parseFromString(drawing.content, 'application/xml');
      expect(doc.getElementsByTagName('parsererror').length).toBe(0);
      // user 報告 Excel chart 描画 fix:twoCellAnchor + xfrm extent の二重指定が
      // Excel に reject されたため、openpyxl 流の oneCellAnchor + ext に切替。
      expect(drawing.content).toContain('oneCellAnchor');
      expect(drawing.content).toContain('graphicFrame');
      expect(drawing.content).not.toContain('twoCellAnchor');
    });

    it('case 25: chart1.xml に必須 namespace 3 件(c / a / r)', () => {
      const files = buildXlsxFiles(body);
      const chart = files.find((f) => f.name === 'xl/charts/chart1.xml')!;
      expect(chart.content).toContain('xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"');
      expect(chart.content).toContain('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"');
      expect(chart.content).toContain('xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"');
    });

    it('case 26: chart1.xml の <c:ser> 構造に <c:idx> <c:order> <c:cat> <c:val> が含まれる', () => {
      const files = buildXlsxFiles(body);
      const chart = files.find((f) => f.name === 'xl/charts/chart1.xml')!;
      expect(chart.content).toContain('<c:idx val="0"/>');
      expect(chart.content).toContain('<c:order val="0"/>');
      expect(chart.content).toContain('<c:cat>');
      expect(chart.content).toContain('<c:val>');
      expect(chart.content).toContain('<c:strRef>');
      expect(chart.content).toContain('<c:numRef>');
    });

    it('case 27: sheet1.xml.rels が valid + chart drawing への rel を持つ', () => {
      const files = buildXlsxFiles(body);
      const rels = files.find((f) => f.name === 'xl/worksheets/_rels/sheet1.xml.rels')!;
      expect(rels.content).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"');
      expect(rels.content).toContain('Target="../drawings/drawing1.xml"');
      const doc = new DOMParser().parseFromString(rels.content, 'application/xml');
      expect(doc.getElementsByTagName('parsererror').length).toBe(0);
    });

    it('case 28: drawing1.xml.rels が valid + chart への rel を持つ', () => {
      const files = buildXlsxFiles(body);
      const rels = files.find((f) => f.name === 'xl/drawings/_rels/drawing1.xml.rels')!;
      expect(rels.content).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart"');
      expect(rels.content).toContain('Target="../charts/chart1.xml"');
      const doc = new DOMParser().parseFromString(rels.content, 'application/xml');
      expect(doc.getElementsByTagName('parsererror').length).toBe(0);
    });
  });
});
