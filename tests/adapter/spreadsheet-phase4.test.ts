/**
 * @vitest-environment happy-dom
 *
 * 領域 10-4 spreadsheet Phase 4(user direction 2026-06-02、9 項目一括):
 * presenter 側で chart / form / resize / embed / 関数表示 / default title 等の
 * 動作確認 case matrix。Wave §4 規律で 10 件以上。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { spreadsheetPresenter } from '@adapter/ui/spreadsheet-presenter';
import type { Entry } from '@core/model/record';

const TS = '2026-06-02T00:00:00Z';

function mkEntry(body: string): Entry {
  return {
    lid: 's1', title: 'Sheet', body,
    archetype: 'spreadsheet',
    created_at: TS, updated_at: TS,
  };
}

function mountEditor(body: string): HTMLElement {
  document.body.innerHTML = '';
  const el = spreadsheetPresenter.renderEditorBody(mkEntry(body));
  document.body.appendChild(el);
  return el;
}

function mountView(body: string): HTMLElement {
  document.body.innerHTML = '';
  const el = spreadsheetPresenter.renderBody(mkEntry(body));
  document.body.appendChild(el);
  return el;
}

describe('spreadsheet Phase 4 — 9 features', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('#1 最初からセル表示', () => {
    it('case 1: 空 body の view mode も 20 行 × 12 列 grid を出す(Phase 4 拡大、user direction「デフォのセル数少なすぎ」)', () => {
      const el = mountView('');
      const table = el.querySelector('table.pkc-spreadsheet');
      expect(table).not.toBeNull();
      const cells = table!.querySelectorAll('tbody td');
      expect(cells.length).toBe(20 * 12);
    });

    it('case 2: 編集 mode も同じく 12 列 × 20 行 seed grid', () => {
      const el = mountEditor('');
      const editableCells = el.querySelectorAll('[contenteditable][data-row][data-col]');
      expect(editableCells.length).toBe(20 * 12);
    });
  });

  describe('#2 関数 / cell 参照', () => {
    it('case 3: view mode で formula が評価値表示', () => {
      const el = mountView('{"rows":[["1","2","=A1+B1"]],"noHeader":true}');
      const cells = el.querySelectorAll('tbody td');
      expect(cells[2]?.textContent).toBe('3');
    });

    it('case 4: edit mode で formula cell に 𝑓 hint(data-pkc-raw 属性)', () => {
      const el = mountEditor('{"rows":[["1","2","=A1+B1"]],"noHeader":true}');
      const formulaCell = el.querySelector('[data-pkc-raw]');
      expect(formulaCell).not.toBeNull();
      expect(formulaCell?.getAttribute('data-pkc-raw')).toBe('=A1+B1');
    });

    it('case 5: SUM range も view mode で評価', () => {
      const el = mountView('{"rows":[["10"],["20"],["=SUM(A1:A2)"]],"noHeader":true}');
      const cells = el.querySelectorAll('tbody td');
      expect(cells[2]?.textContent).toBe('30');
    });
  });

  describe('#3 グラフ作成', () => {
    it('case 6: charts metadata があると Chart.js canvas が render される(2026-06-03 chart.js 移行)', () => {
      const body = JSON.stringify({
        rows: [['x', 'y'], ['1', '10'], ['2', '20'], ['3', '30']],
        charts: [{
          id: 'c1', kind: 'bar', title: 'Test Chart',
          xCol: 0, yCols: [1], startRow: 1,
        }],
      });
      const el = mountView(body);
      // Chart.js は <canvas> を要求。自前 SVG は撤去。
      const canvas = el.querySelector('.pkc-spreadsheet-chart-canvas');
      expect(canvas).not.toBeNull();
      const caption = el.querySelector('.pkc-spreadsheet-chart-title');
      expect(caption?.textContent).toBe('Test Chart');
    });

    it('case 7: kind 別 chart(bar/line/pie)それぞれ canvas + data-pkc-chart-kind attribute で識別', () => {
      const mkBody = (kind: 'bar' | 'line' | 'pie'): string => JSON.stringify({
        rows: [['a', '1'], ['b', '2']],
        noHeader: true,
        charts: [{ id: 'c1', kind, title: '', xCol: 0, yCols: [1], startRow: 0 }],
      });
      for (const kind of ['bar', 'line', 'pie'] as const) {
        const el = mountView(mkBody(kind));
        const fig = el.querySelector('.pkc-spreadsheet-chart');
        expect(fig).not.toBeNull();
        expect(fig?.getAttribute('data-pkc-chart-kind')).toBe(kind);
        expect(fig?.querySelector('canvas')).not.toBeNull();
      }
    });

    it('case 8: edit mode で chart に削除 button が出る', () => {
      const body = JSON.stringify({
        rows: [['a', '1']],
        noHeader: true,
        charts: [{ id: 'c1', kind: 'bar', title: '', xCol: 0, yCols: [1], startRow: 0 }],
      });
      const el = mountEditor(body);
      const rm = el.querySelector('[data-pkc-action="spreadsheet-remove-chart"]');
      expect(rm).not.toBeNull();
      expect(rm?.getAttribute('data-pkc-chart-id')).toBe('c1');
    });
  });

  describe('#5 埋め込み導線', () => {
    it('case 9: 🔗 埋込 toolbar button は view 側に出る(user direction 2026-06-02「閲覧側の機能」)', () => {
      const el = mountView('');
      const btn = el.querySelector('[data-pkc-action="spreadsheet-copy-embed"]');
      expect(btn).not.toBeNull();
    });

    it('case 10: wrapper に data-pkc-spreadsheet-lid が付与される(embed link 生成用)', () => {
      const el = mountEditor('');
      expect(el.getAttribute('data-pkc-spreadsheet-lid')).toBe('s1');
    });
  });

  describe('#6 セルサイズ調整', () => {
    it('case 11: 各 column header に resize handle が出る(Phase 4 default 12 列)', () => {
      const el = mountEditor('');
      const handles = el.querySelectorAll('.pkc-spreadsheet-col-resize');
      expect(handles.length).toBe(12);
    });

    it('case 12: row header にも resize handle(Phase 4 default 20 行)', () => {
      const el = mountEditor('');
      const handles = el.querySelectorAll('.pkc-spreadsheet-row-resize');
      expect(handles.length).toBe(20);
    });

    it('case 13: colWidths が指定されていると colgroup col の width に反映', () => {
      const body = JSON.stringify({
        rows: [['', '']],
        noHeader: true,
        colWidths: [200, 50],
      });
      const el = mountView(body);
      const cols = el.querySelectorAll('table.pkc-spreadsheet colgroup col');
      expect((cols[0] as HTMLElement).style.width).toBe('200px');
    });
  });

  describe('#7 テーブル化(header toggle)', () => {
    it('case 14: noHeader=false(default)では先頭行が thead', () => {
      const el = mountView('{"rows":[["name","age"],["alice","30"]]}');
      const ths = el.querySelectorAll('thead th');
      expect(ths.length).toBe(2);
    });

    it('case 15: noHeader=true なら thead 内 (A B C ...) のみ、データ用 thead は無し', () => {
      const el = mountView('{"rows":[["row1","row2"]],"noHeader":true}');
      const dataTds = el.querySelectorAll('tbody td');
      expect(dataTds.length).toBe(2);
      // header row として扱われていない(2 cell とも tbody td)
    });

    it('case 16: 📋 ヘッダー toolbar button が出る', () => {
      const el = mountEditor('');
      const btn = el.querySelector('[data-pkc-action="spreadsheet-toggle-header"]');
      expect(btn).not.toBeNull();
    });
  });

  describe('#8 レコード form 入出力', () => {
    it('case 17: 📝 フォーム toolbar button が出る', () => {
      const el = mountEditor('');
      const btn = el.querySelector('[data-pkc-action="spreadsheet-open-form"]');
      expect(btn).not.toBeNull();
    });

    it('case 18: form button click で modal overlay が出現、header label が input 横に', () => {
      const el = mountEditor('{"rows":[["氏名","年齢"]]}');
      const btn = el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-open-form"]')!;
      btn.click();
      const modal = document.querySelector('.pkc-spreadsheet-form-modal');
      expect(modal).not.toBeNull();
      const labels = modal!.querySelectorAll('.pkc-spreadsheet-form-row span');
      expect(labels[0]?.textContent).toBe('氏名');
      expect(labels[1]?.textContent).toBe('年齢');
    });

    it('case 19: form noHeader=true の場合は A / B / C... を label に', () => {
      const el = mountEditor('{"rows":[["x","y"]],"noHeader":true}');
      const btn = el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-open-form"]')!;
      btn.click();
      const labels = document.querySelectorAll('.pkc-spreadsheet-form-modal .pkc-spreadsheet-form-row span');
      expect(labels[0]?.textContent).toBe('A');
      expect(labels[1]?.textContent).toBe('B');
    });
  });

  describe('#9 export(view 側に移管 2026-06-02、ODF 廃止 → CSV + XLSX 2 経路)', () => {
    it('case 20: 💾 CSV / 💾 XLSX toolbar button は view mode に出る、edit mode には無い、ODF は完全廃止', () => {
      const elView = mountView('');
      expect(elView.querySelector('[data-pkc-action="spreadsheet-export-csv"]')).not.toBeNull();
      expect(elView.querySelector('[data-pkc-action="spreadsheet-export-xlsx"]')).not.toBeNull();
      expect(elView.querySelector('[data-pkc-action="spreadsheet-export-fods"]')).toBeNull();
      const elEdit = mountEditor('');
      expect(elEdit.querySelector('[data-pkc-action="spreadsheet-export-csv"]')).toBeNull();
      expect(elEdit.querySelector('[data-pkc-action="spreadsheet-export-xlsx"]')).toBeNull();
      expect(elEdit.querySelector('[data-pkc-action="spreadsheet-export-fods"]')).toBeNull();
    });
  });
});
