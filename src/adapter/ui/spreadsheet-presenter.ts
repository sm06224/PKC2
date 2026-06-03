/**
 * Spreadsheet archetype presenter(Phase 1-4、2026-05-28〜2026-06-02)。
 *
 * Phase 4 拡張(user direction 2026-06-02、9 項目一括):
 *   1. 最初からセル表示 ── empty body も 5x6 grid を render
 *   2. 関数 / cell 参照 ── `=A1+B1` / `=SUM(A1:A10)` 等
 *   3. グラフ作成 ── inline SVG bar/line/pie
 *   4. デフォルト entry 名 ── reducer 側で "Untitled Sheet N" 採番(本 file 外)
 *   5. 埋め込み導線 ── toolbar "🔗 埋込" で `![[lid]]` を clipboard
 *   6. セルサイズ調整 ── column header 右端 drag で resize
 *   7. テーブル化 ── "📋 ヘッダー化 / 解除" toolbar button
 *   8. record フォーム入出力 ── "📝 フォーム" modal
 *   9. ODF / CSV export ── "💾 Export ▾" dropdown
 *
 * features/ 層 import:browser API 非依存(core ← features の規律)。
 */

import type { Entry } from '@core/model/record';
import type { DetailPresenter } from './detail-presenter';
import {
  parseSpreadsheetBody,
  serializeSpreadsheetBody,
  parseTsvToBody,
  serializeBodyToTsv,
  serializeBodyToCsv,
  buildXlsxFiles,
  getColumnCount,
  detectPasteAsSpreadsheet,
  evaluateBody,
  isFormula,
  evaluateFormulaDetail,
  evaluateFormula,
  colIndexToLetter,
  type SpreadsheetBody,
  type ChartConfig,
} from '@features/spreadsheet/spreadsheet-body';
import { createZipBlob } from '../platform/zip-package';
// user direction 2026-06-03「他のプロダクトを参考にするとか一旦依存するとかで
// まともになりませんか?」 fix:自前 SVG chart を捨て Chart.js に置換。
// chart.js v4(treeshakable、~150KB bundle)を auto register で取り込み。
import {
  Chart,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarController, BarElement,
  LineController, LineElement, PointElement,
  PieController, DoughnutController, ArcElement,
  ScatterController,
  PolarAreaController,
  RadarController,
  Tooltip, Legend, Title,
  type ChartConfiguration,
} from 'chart.js';
Chart.register(
  CategoryScale, LinearScale, RadialLinearScale,
  BarController, BarElement,
  LineController, LineElement, PointElement,
  PieController, DoughnutController, ArcElement,
  ScatterController,
  PolarAreaController,
  RadarController,
  Tooltip, Legend, Title,
);

// user direction 2026-06-02「デフォのセル数少なすぎ」 → 5x6 → 12x20。
// Excel ライクに広い canvas を最初から表示。
const DEFAULT_VIEW_ROWS = 20;
const DEFAULT_VIEW_COLS = 12;
const DEFAULT_COL_WIDTH = 96; // px
const DEFAULT_ROW_HEIGHT = 28; // px
const MIN_COL_WIDTH = 32;
const MIN_ROW_HEIGHT = 18;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 空 body にも default grid を出すための seed。view / edit 共通。 */
function seedBodyIfEmpty(body: SpreadsheetBody): SpreadsheetBody {
  if (body.rows.length > 0) return body;
  return {
    rows: Array.from({ length: DEFAULT_VIEW_ROWS }, () =>
      Array.from({ length: DEFAULT_VIEW_COLS }, () => '')),
    noHeader: true,
  };
}

/** colWidths[c] を返す(未設定 / 0 なら default)。 */
function colWidthAt(body: SpreadsheetBody, c: number): number {
  const w = body.colWidths?.[c];
  return w && w >= MIN_COL_WIDTH ? w : DEFAULT_COL_WIDTH;
}

/** rowHeights[r] を返す(未設定 / 0 なら default)。 */
function rowHeightAt(body: SpreadsheetBody, r: number): number {
  const h = body.rowHeights?.[r];
  return h && h >= MIN_ROW_HEIGHT ? h : DEFAULT_ROW_HEIGHT;
}

/**
 * read-only HTML table を build。先頭行を `<thead>`(noHeader 時は全行 tbody)。
 * formula は evaluateBody で評価済み値を表示、ragged row は短い行に空 td を補う。
 */
function buildTableElement(doc: Document, body: SpreadsheetBody): HTMLTableElement {
  const seed = seedBodyIfEmpty(body);
  const table = doc.createElement('table');
  table.className = 'pkc-spreadsheet pkc-md-rendered';
  table.setAttribute('data-pkc-region', 'spreadsheet-table');
  const cols = Math.max(1, getColumnCount(seed));
  const evaluated = evaluateBody(seed);
  // colgroup で column 幅を指定
  const colgroup = doc.createElement('colgroup');
  for (let c = 0; c < cols; c++) {
    const colEl = doc.createElement('col');
    colEl.style.width = `${colWidthAt(seed, c)}px`;
    colgroup.appendChild(colEl);
  }
  table.appendChild(colgroup);
  const showHeader = !seed.noHeader && seed.rows.length > 0;
  const [headerRaw, ...dataRowsRaw] = evaluated;
  if (showHeader && headerRaw) {
    const thead = doc.createElement('thead');
    const tr = doc.createElement('tr');
    tr.style.height = `${rowHeightAt(seed, 0)}px`;
    for (let i = 0; i < cols; i++) {
      const th = doc.createElement('th');
      th.textContent = headerRaw[i] ?? '';
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);
  }
  const tbody = doc.createElement('tbody');
  const dataRows = showHeader ? dataRowsRaw : evaluated;
  const rowOffset = showHeader ? 1 : 0;
  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r]!;
    const tr = doc.createElement('tr');
    tr.style.height = `${rowHeightAt(seed, r + rowOffset)}px`;
    for (let i = 0; i < cols; i++) {
      const td = doc.createElement('td');
      td.textContent = row[i] ?? '';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

// ── Chart rendering (inline SVG) ────────────────────────

const CHART_PALETTE = ['#4f8cff', '#ff7a59', '#3ecf8e', '#ffcc4d', '#a36cf7', '#ff5d8f'];

function renderChart(doc: Document, body: SpreadsheetBody, chart: ChartConfig): HTMLElement {
  const wrap = doc.createElement('figure');
  wrap.className = 'pkc-spreadsheet-chart';
  wrap.setAttribute('data-pkc-chart-id', chart.id);
  wrap.setAttribute('data-pkc-chart-kind', chart.kind);
  const caption = doc.createElement('figcaption');
  caption.className = 'pkc-spreadsheet-chart-title';
  caption.textContent = chart.title || `Chart (${chart.kind})`;
  wrap.appendChild(caption);
  const evaluated = evaluateBody(body);
  const start = Math.max(0, chart.startRow);
  const end = chart.endRow ?? evaluated.length;
  const labels: string[] = [];
  const series: number[][] = chart.yCols.map(() => []);
  for (let r = start; r < Math.min(end, evaluated.length); r++) {
    labels.push(evaluated[r]?.[chart.xCol] ?? '');
    for (let i = 0; i < chart.yCols.length; i++) {
      const v = parseFloat(evaluated[r]?.[chart.yCols[i]!] ?? '');
      series[i]!.push(Number.isNaN(v) ? 0 : v);
    }
  }
  // Chart.js は <canvas> を要求。data を組み立て、defer して mount 後に init。
  const canvas = doc.createElement('canvas');
  canvas.className = 'pkc-spreadsheet-chart-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', chart.title || `${chart.kind} chart`);
  wrap.appendChild(canvas);

  // Chart.js init は canvas が DOM に append されないと context が取れない場合がある
  // ため、requestAnimationFrame で defer(`document.body.appendChild` 経由で
  // 確実に attach されたタイミングで init)。SSR / test 環境では Chart.js は
  // import 済だが canvas.getContext が undefined を返すこともあるため safe-fail。
  const setupChart = (): void => {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // 円系(pie / doughnut / polarArea)は category ごとに色違いで、
      // それ以外は dataset ごとに統一色。
      const isCategoryColored = chart.kind === 'pie' || chart.kind === 'doughnut' || chart.kind === 'polarArea';
      // scatter 系は {x, y} 形式
      const datasets = chart.yCols.map((yc, i) => {
        const baseColor = CHART_PALETTE[i % CHART_PALETTE.length]!;
        const dataPoints = chart.kind === 'scatter'
          ? labels.map((lbl, j) => ({ x: parseFloat(lbl), y: series[i]?.[j] ?? 0 }))
          : (series[i] ?? []);
        return {
          label: `Col ${colIndexToLetter(yc)}`,
          data: dataPoints,
          backgroundColor: isCategoryColored
            ? labels.map((_, j) => CHART_PALETTE[j % CHART_PALETTE.length]!)
            : baseColor,
          borderColor: baseColor,
          borderWidth: chart.kind === 'line' || chart.kind === 'radar' ? 2 : 1,
          fill: chart.kind === 'radar',
          pointRadius: chart.kind === 'scatter' || chart.kind === 'line' || chart.kind === 'radar' ? 4 : 0,
          tension: chart.kind === 'line' ? 0.1 : 0,
        };
      });
      const showLegend = chart.legend !== false && (chart.yCols.length > 1 || isCategoryColored);
      const cfg: ChartConfiguration = {
        type: chart.kind,
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: {
              display: showLegend,
              position: 'top',
              labels: { boxWidth: 14, padding: 8 },
            },
            tooltip: {
              enabled: true,
              mode: chart.kind === 'pie' || chart.kind === 'doughnut' ? 'nearest' : 'index',
              intersect: false,
            },
            title: chart.title ? { display: false, text: chart.title } : undefined,
          },
        },
      };
      // 既存 chart instance があれば destroy(再描画 race 回避)
      const existing = Chart.getChart(canvas);
      if (existing) existing.destroy();
      new Chart(ctx, cfg);
    } catch {
      // canvas 未対応環境(test 等)では silent skip
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(setupChart);
  } else {
    setupChart();
  }
  return wrap;
}

// ── Phase 4 grid editor helpers ────────────────────────

function readBodyFromGrid(table: HTMLTableElement, prevBody?: SpreadsheetBody): SpreadsheetBody {
  const rows: string[][] = [];
  const trs = table.querySelectorAll<HTMLTableRowElement>('tr[data-row]');
  for (const tr of Array.from(trs)) {
    const cells = tr.querySelectorAll<HTMLElement>('[data-col][contenteditable]');
    const rowVals: string[] = [];
    for (const c of Array.from(cells)) {
      // data-pkc-raw が存在する = formula cell が commit 済み(focusout 経路で
      // 設定、focusin で clear)。raw が存在する限り **必ず raw を採用**(textContent
      // は評価値で formula 文字列ではないため)。
      // raw が無い場合は textContent が truth(普通の文字列 cell または編集中)。
      const raw = c.getAttribute('data-pkc-raw');
      if (raw !== null) {
        rowVals.push(raw);
      } else {
        rowVals.push(c.textContent ?? '');
      }
    }
    rows.push(rowVals);
  }
  const out: SpreadsheetBody = { rows };
  if (prevBody?.colWidths) out.colWidths = prevBody.colWidths;
  if (prevBody?.rowHeights) out.rowHeights = prevBody.rowHeights;
  if (prevBody?.charts) out.charts = prevBody.charts;
  if (prevBody?.noHeader) out.noHeader = prevBody.noHeader;
  return out;
}

function syncGridToTextarea(wrapper: HTMLElement): void {
  const table = wrapper.querySelector<HTMLTableElement>('table.pkc-spreadsheet-grid');
  const ta = wrapper.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
  if (!table || !ta) return;
  const prev = readBodyState(wrapper);
  const body = readBodyFromGrid(table, prev);
  // body 内 evaluated cell を refresh
  refreshFormulaDisplay(table, body);
  ta.value = serializeSpreadsheetBody(body);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function readBodyState(wrapper: HTMLElement): SpreadsheetBody {
  const raw = wrapper.getAttribute('data-pkc-spreadsheet-body');
  if (!raw) return { rows: [] };
  try {
    return JSON.parse(raw) as SpreadsheetBody;
  } catch {
    return { rows: [] };
  }
}

function writeBodyState(wrapper: HTMLElement, body: SpreadsheetBody): void {
  wrapper.setAttribute('data-pkc-spreadsheet-body', JSON.stringify(body));
}

function refreshFormulaDisplay(table: HTMLTableElement, body: SpreadsheetBody): void {
  const cells = table.querySelectorAll<HTMLElement>('[data-col][contenteditable]');
  for (const c of Array.from(cells)) {
    // focus 中の cell は触らない(user 編集中の text を上書きしない、入力状態保持)
    if (document.activeElement === c) continue;
    const r = parseInt(c.getAttribute('data-row') ?? '-1', 10);
    const col = parseInt(c.getAttribute('data-col') ?? '-1', 10);
    if (r < 0 || col < 0) continue;
    const raw = body.rows[r]?.[col] ?? '';
    if (isFormula(raw)) {
      // user direction 2026-06-02「関数エラーが出て何がエラーかわからん」 fix:
      // evaluateFormulaDetail で errorReason を取り、tooltip / data attribute に。
      const detail = evaluateFormulaDetail(raw, body);
      c.setAttribute('data-pkc-raw', raw);
      c.textContent = detail.value;
      if (detail.errorCode) {
        c.setAttribute('data-pkc-formula-error', detail.errorCode);
        c.title = `${detail.errorCode}:${detail.errorReason ?? '不明なエラー'}\n数式:${raw}`;
      } else {
        c.removeAttribute('data-pkc-formula-error');
        c.title = `数式:${raw}\n結果:${detail.value}`;
      }
    } else {
      c.removeAttribute('data-pkc-raw');
      c.removeAttribute('data-pkc-formula-error');
      c.removeAttribute('title');
    }
  }
}

function focusCell(wrapper: HTMLElement, row: number, col: number): boolean {
  const cell = wrapper.querySelector<HTMLElement>(
    `[contenteditable][data-row="${row}"][data-col="${col}"]`,
  );
  if (!cell) return false;
  // formula cell は focus 時に raw を表示
  const raw = cell.getAttribute('data-pkc-raw');
  if (raw !== null) cell.textContent = raw;
  cell.focus();
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return true;
}

function rebuildGrid(wrapper: HTMLElement, body: SpreadsheetBody, focusAt: { row: number; col: number } | null): void {
  const oldTable = wrapper.querySelector<HTMLTableElement>('table.pkc-spreadsheet-grid');
  if (!oldTable) return;
  writeBodyState(wrapper, body);
  const newTable = buildGridTable(document, body);
  oldTable.replaceWith(newTable);
  refreshFormulaDisplay(newTable, body);
  rebuildChartsArea(wrapper, body);
  if (focusAt) focusCell(wrapper, focusAt.row, focusAt.col);
}

function rebuildChartsArea(wrapper: HTMLElement, body: SpreadsheetBody): void {
  const old = wrapper.querySelector('[data-pkc-region="spreadsheet-charts"]');
  if (old) old.remove();
  if (!body.charts || body.charts.length === 0) return;
  const area = document.createElement('div');
  area.setAttribute('data-pkc-region', 'spreadsheet-charts');
  area.className = 'pkc-spreadsheet-charts';
  for (const ch of body.charts) {
    const el = renderChart(document, body, ch);
    // edit mode では chart の削除 button を出す
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'pkc-spreadsheet-chart-remove';
    rm.setAttribute('data-pkc-action', 'spreadsheet-remove-chart');
    rm.setAttribute('data-pkc-chart-id', ch.id);
    rm.textContent = '×';
    rm.title = 'グラフを削除';
    el.appendChild(rm);
    area.appendChild(el);
  }
  wrapper.appendChild(area);
}

function buildGridTable(doc: Document, body: SpreadsheetBody): HTMLTableElement {
  const seed = seedBodyIfEmpty(body);
  const table = doc.createElement('table');
  table.className = 'pkc-spreadsheet pkc-spreadsheet-grid';
  table.setAttribute('data-pkc-region', 'spreadsheet-grid');
  const cols = Math.max(1, getColumnCount(seed));
  // colgroup で初期幅
  const colgroup = doc.createElement('colgroup');
  // row header(行番号)用の column
  const rowHeaderCol = doc.createElement('col');
  rowHeaderCol.style.width = '36px';
  colgroup.appendChild(rowHeaderCol);
  for (let c = 0; c < cols; c++) {
    const colEl = doc.createElement('col');
    colEl.style.width = `${colWidthAt(seed, c)}px`;
    colgroup.appendChild(colEl);
  }
  table.appendChild(colgroup);

  // column header(A, B, C, ...)+ resize handle
  const colHeaderRow = doc.createElement('tr');
  colHeaderRow.className = 'pkc-spreadsheet-colheader';
  const corner = doc.createElement('th');
  corner.className = 'pkc-spreadsheet-corner';
  colHeaderRow.appendChild(corner);
  for (let c = 0; c < cols; c++) {
    const th = doc.createElement('th');
    th.className = 'pkc-spreadsheet-colhead';
    th.setAttribute('data-pkc-col-index', String(c));
    th.textContent = colIndexToLetter(c);
    // resize handle
    const handle = doc.createElement('span');
    handle.className = 'pkc-spreadsheet-col-resize';
    handle.setAttribute('data-pkc-action', 'spreadsheet-col-resize');
    handle.setAttribute('data-pkc-col-index', String(c));
    handle.setAttribute('aria-label', `Resize column ${colIndexToLetter(c)}`);
    th.appendChild(handle);
    colHeaderRow.appendChild(th);
  }
  const colHeaderHead = doc.createElement('thead');
  colHeaderHead.appendChild(colHeaderRow);
  table.appendChild(colHeaderHead);

  // 値 grid を tbody に
  const tbody = doc.createElement('tbody');
  for (let r = 0; r < seed.rows.length; r++) {
    const tr = doc.createElement('tr');
    tr.setAttribute('data-row', String(r));
    tr.style.height = `${rowHeightAt(seed, r)}px`;
    // row header(行番号)
    const rh = doc.createElement('th');
    rh.className = 'pkc-spreadsheet-rowhead';
    rh.setAttribute('data-pkc-row-index', String(r));
    rh.textContent = String(r + 1);
    // row resize handle
    const rhandle = doc.createElement('span');
    rhandle.className = 'pkc-spreadsheet-row-resize';
    rhandle.setAttribute('data-pkc-action', 'spreadsheet-row-resize');
    rhandle.setAttribute('data-pkc-row-index', String(r));
    rh.appendChild(rhandle);
    tr.appendChild(rh);
    // header 行(noHeader=false かつ r=0)は th 系 class を当てる
    const isHeaderRow = !seed.noHeader && r === 0;
    for (let c = 0; c < cols; c++) {
      const cell = doc.createElement(isHeaderRow ? 'th' : 'td');
      cell.contentEditable = 'true';
      cell.setAttribute('data-row', String(r));
      cell.setAttribute('data-col', String(c));
      cell.textContent = seed.rows[r]?.[c] ?? '';
      tr.appendChild(cell);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function wireGridEvents(wrapper: HTMLElement): void {
  // 1) cell input → hidden textarea sync + dirty mark
  wrapper.addEventListener('input', (e: Event) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    if (t.getAttribute('data-col') === null) return;
    // data-pkc-edit-dirty を立てる ── 以後 readBodyFromGrid は textContent を採用
    // (data-pkc-raw の stale 読み出しを構造的に阻止、user direction 2026-06-02
    // 「保存して編集を繰り返すと表の表示が壊れる」 fix)。
    t.setAttribute('data-pkc-edit-dirty', 'true');
    syncGridToTextarea(wrapper);
  });

  // 2) focus / blur で formula raw / evaluated 切替 + 選択状態更新
  wrapper.addEventListener('focusin', (e: FocusEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    // body state(truth source)から raw を取り出して表示。data-pkc-raw 経由
    // ではなく body state から拾うため、edit-dirty 経路で更新された latest 値が
    // 反映される。
    const row = parseInt(t.getAttribute('data-row') ?? '-1', 10);
    const col = parseInt(t.getAttribute('data-col') ?? '-1', 10);
    if (row >= 0 && col >= 0) {
      const body = readBodyState(wrapper);
      const raw = body.rows[row]?.[col] ?? '';
      if (raw !== t.textContent) t.textContent = raw;
      // 編集中は data-pkc-raw を一時 clear(refreshFormulaDisplay の上書き判定で
      // 「focus 中は skip」 と並んで二重防衛)。
      t.removeAttribute('data-pkc-raw');
      t.removeAttribute('data-pkc-formula-error');
      setSelection(wrapper, row, col, row, col);
    }
  });
  wrapper.addEventListener('focusout', (e: FocusEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    // user direction 2026-06-03「関数入力がセル入力画面でできない」 fix:
    // focusout 時点で activeElement が exiting cell のままになるケース
    // (happy-dom test / blur 直前 race)を吸収するため、退出 cell は
    // **明示的に commit + 評価** する。refreshFormulaDisplay の activeElement
    // skip 経路に頼らず、ここで body 反映 + display 更新を強制。
    const r = parseInt(t.getAttribute('data-row') ?? '-1', 10);
    const col = parseInt(t.getAttribute('data-col') ?? '-1', 10);
    if (r < 0 || col < 0) return;
    // 1. textContent を body に commit(dirty 経路)
    const body = readBodyState(wrapper);
    while (body.rows.length <= r) body.rows.push([]);
    while ((body.rows[r]!).length <= col) body.rows[r]!.push('');
    body.rows[r]![col] = t.textContent ?? '';
    writeBodyState(wrapper, body);
    // 2. textarea sync
    const ta = wrapper.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (ta) {
      ta.value = serializeSpreadsheetBody(body);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // 3. dirty mark を取る
    t.removeAttribute('data-pkc-edit-dirty');
    // 4. 退出 cell を明示評価(activeElement check を回避)
    const raw = body.rows[r]![col]!;
    if (isFormula(raw)) {
      const detail = evaluateFormulaDetail(raw, body);
      t.setAttribute('data-pkc-raw', raw);
      t.textContent = detail.value;
      if (detail.errorCode) {
        t.setAttribute('data-pkc-formula-error', detail.errorCode);
        t.title = `${detail.errorCode}:${detail.errorReason ?? '不明なエラー'}\n数式:${raw}`;
      } else {
        t.removeAttribute('data-pkc-formula-error');
        t.title = `数式:${raw}\n結果:${detail.value}`;
      }
    } else {
      t.removeAttribute('data-pkc-raw');
      t.removeAttribute('data-pkc-formula-error');
      t.removeAttribute('title');
    }
    // 5. 他 cell(この cell を参照する formula)を refresh
    const table = wrapper.querySelector<HTMLTableElement>('table.pkc-spreadsheet-grid');
    if (table) refreshFormulaDisplay(table, body);
  });

  // 3) keyboard navigation(Excel-like:Tab/Enter/Arrow/Shift+Arrow/Ctrl+Arrow/Esc/Delete/Ctrl+C)
  wrapper.addEventListener('keydown', (e: KeyboardEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    const rowAttr = t.getAttribute('data-row');
    const colAttr = t.getAttribute('data-col');
    if (rowAttr === null || colAttr === null) return;
    const row = parseInt(rowAttr, 10);
    const col = parseInt(colAttr, 10);

    // Esc:現 cell の編集を取り消し(focus 直後の raw に戻して blur)
    if (e.key === 'Escape') {
      e.preventDefault();
      const body = readBodyState(wrapper);
      const orig = body.rows[row]?.[col] ?? '';
      t.textContent = orig;
      t.blur();
      return;
    }
    // Delete / Backspace:選択範囲を一括クリア(複数 cell に効く Excel-like)
    if ((e.key === 'Delete' || e.key === 'Backspace') && getSelection_(wrapper) && !isSelectionSingleCell(wrapper)) {
      e.preventDefault();
      clearSelectionCells(wrapper);
      return;
    }
    // Ctrl+C:選択範囲を TSV として clipboard へ
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      copySelectionTsv(wrapper);
      return;
    }
    // Ctrl+ArrowKey:contiguous な data block の端まで jump
    if ((e.ctrlKey || e.metaKey) && (e.key.startsWith('Arrow'))) {
      e.preventDefault();
      const body = readBodyState(wrapper);
      let nextRow = row;
      let nextCol = col;
      if (e.key === 'ArrowDown') nextRow = jumpEdge(body, row, col, 1, 0);
      else if (e.key === 'ArrowUp') nextRow = jumpEdge(body, row, col, -1, 0);
      else if (e.key === 'ArrowRight') nextCol = jumpEdge(body, row, col, 0, 1);
      else if (e.key === 'ArrowLeft') nextCol = jumpEdge(body, row, col, 0, -1);
      focusCell(wrapper, nextRow, nextCol);
      return;
    }
    // Shift+Arrow:選択範囲を拡張(anchor を保持して active corner を移動)
    if (e.shiftKey && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const sel = getSelection_(wrapper);
      const anchor = sel ? { row: sel.r1, col: sel.c1 } : { row, col };
      let nextRow = row, nextCol = col;
      if (e.key === 'ArrowDown') nextRow = row + 1;
      else if (e.key === 'ArrowUp') nextRow = Math.max(0, row - 1);
      else if (e.key === 'ArrowRight') nextCol = col + 1;
      else if (e.key === 'ArrowLeft') nextCol = Math.max(0, col - 1);
      setSelection(wrapper, anchor.row, anchor.col, nextRow, nextCol);
      focusCell(wrapper, nextRow, nextCol);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const nextCol = e.shiftKey ? col - 1 : col + 1;
      if (!focusCell(wrapper, row, nextCol)) {
        if (e.shiftKey && col === 0 && row > 0) {
          const body0 = readBodyState(wrapper);
          const cols = getColumnCount(body0);
          focusCell(wrapper, row - 1, Math.max(0, cols - 1));
        } else if (!e.shiftKey) {
          if (!focusCell(wrapper, row + 1, 0)) {
            addRow(wrapper);
            focusCell(wrapper, row + 1, 0);
          }
        }
      }
      return;
    }
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const nextRow = e.shiftKey ? row - 1 : row + 1;
      if (!focusCell(wrapper, nextRow, col)) {
        if (!e.shiftKey) {
          addRow(wrapper);
          focusCell(wrapper, row + 1, col);
        }
      }
      return;
    }
    if (e.key === 'ArrowDown' && !e.altKey && !e.shiftKey) {
      if (t.textContent && t.textContent.includes('\n')) return;
      e.preventDefault();
      focusCell(wrapper, row + 1, col);
      return;
    }
    if (e.key === 'ArrowUp' && !e.altKey && !e.shiftKey) {
      if (t.textContent && t.textContent.includes('\n')) return;
      e.preventDefault();
      focusCell(wrapper, row - 1, col);
      return;
    }
    if (e.key === 'ArrowRight' && !e.altKey && !e.shiftKey) {
      // caret が末尾なら次列、それ以外は default
      const sel = window.getSelection();
      if (sel && sel.anchorNode === t.firstChild && sel.anchorOffset === (t.textContent?.length ?? 0)) {
        e.preventDefault();
        focusCell(wrapper, row, col + 1);
        return;
      }
    }
    if (e.key === 'ArrowLeft' && !e.altKey && !e.shiftKey) {
      const sel = window.getSelection();
      if (sel && sel.anchorOffset === 0) {
        e.preventDefault();
        focusCell(wrapper, row, col - 1);
        return;
      }
    }
  });

  // Shift+Click で selection 拡張(anchor 保持、target を active corner に)
  wrapper.addEventListener('mousedown', (e: MouseEvent) => {
    if (!e.shiftKey) return;
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    const r = parseInt(t.getAttribute('data-row') ?? '-1', 10);
    const c = parseInt(t.getAttribute('data-col') ?? '-1', 10);
    if (r < 0 || c < 0) return;
    const sel = getSelection_(wrapper);
    if (!sel) return;
    e.preventDefault();
    setSelection(wrapper, sel.r1, sel.c1, r, c);
    focusCell(wrapper, r, c);
  });

  // user direction 2026-06-02「マウス入力補助もない、範囲選択もできない」 fix:
  // マウス click + drag で範囲選択(Excel-like)。pointerdown で anchor、
  // 別 cell に enter したら drag mode 起動して focus を移さず selection 拡張、
  // pointerup / pointercancel / mouseleave で end。click のみで終わった場合は
  // contentEditable の native 編集モードに自然遷移(preventDefault せず)。
  let dragAnchor: { row: number; col: number } | null = null;
  let dragActive = false;
  wrapper.addEventListener('pointerdown', (e: PointerEvent) => {
    // resize handle は別 path
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.classList.contains('pkc-spreadsheet-col-resize')) return;
    if (t.classList.contains('pkc-spreadsheet-row-resize')) return;
    if (!t.hasAttribute('contenteditable')) return;
    if (e.shiftKey) return;
    if (e.button !== 0) return;
    const r = parseInt(t.getAttribute('data-row') ?? '-1', 10);
    const c = parseInt(t.getAttribute('data-col') ?? '-1', 10);
    if (r < 0 || c < 0) return;
    dragAnchor = { row: r, col: c };
    dragActive = false;
    // single click は native edit mode に自然遷移(focus + setSelection は focusin で済)
  });
  wrapper.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragAnchor) return;
    if (e.buttons === 0) { dragAnchor = null; dragActive = false; return; }
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    const r = parseInt(t.getAttribute('data-row') ?? '-1', 10);
    const c = parseInt(t.getAttribute('data-col') ?? '-1', 10);
    if (r < 0 || c < 0) return;
    if (r === dragAnchor.row && c === dragAnchor.col) return;
    // 別 cell に enter したので drag mode 起動。focus は anchor のままにして、
    // selection を extend(text selection mode を抜けるため blur 不要、
    // contenteditable は native selection が走るが、CSS で highlight が勝つ)。
    dragActive = true;
    e.preventDefault();
    // テキスト selection を解除
    const ws = window.getSelection();
    if (ws) ws.removeAllRanges();
    setSelection(wrapper, dragAnchor.row, dragAnchor.col, r, c);
  });
  const endDrag = (): void => {
    if (dragActive) {
      // drag で範囲を構築した場合は anchor cell を focus したまま留め置く
      // (キャレットは消えるが selection 表示は残る)
    }
    dragAnchor = null;
    dragActive = false;
  };
  wrapper.addEventListener('pointerup', endDrag);
  wrapper.addEventListener('pointercancel', endDrag);
  // column header / row header click で行 / 列単位の selection
  wrapper.addEventListener('click', (e: MouseEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.classList.contains('pkc-spreadsheet-colhead') && t.hasAttribute('data-pkc-col-index')) {
      const col = parseInt(t.getAttribute('data-pkc-col-index') ?? '-1', 10);
      if (col < 0) return;
      const body = readBodyState(wrapper);
      setSelection(wrapper, 0, col, Math.max(0, body.rows.length - 1), col);
      focusCell(wrapper, 0, col);
    } else if (t.classList.contains('pkc-spreadsheet-rowhead') && t.hasAttribute('data-pkc-row-index')) {
      const row = parseInt(t.getAttribute('data-pkc-row-index') ?? '-1', 10);
      if (row < 0) return;
      const body = readBodyState(wrapper);
      const cols = Math.max(1, getColumnCount(body));
      setSelection(wrapper, row, 0, row, cols - 1);
      focusCell(wrapper, row, 0);
    }
  });

  // 4) paste auto-import
  wrapper.addEventListener('paste', (e: ClipboardEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    const rowAttr = t.getAttribute('data-row');
    const colAttr = t.getAttribute('data-col');
    if (rowAttr === null || colAttr === null) return;
    const text = e.clipboardData?.getData('text/plain') ?? '';
    const pasted = detectPasteAsSpreadsheet(text);
    if (!pasted) return;
    e.preventDefault();
    const startRow = parseInt(rowAttr, 10);
    const startCol = parseInt(colAttr, 10);
    applyPasteAtCell(wrapper, startRow, startCol, pasted);
  });

  // 5) toolbar buttons + chart remove
  wrapper.addEventListener('click', (e: MouseEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const action = t.getAttribute('data-pkc-action');
    if (!action) return;
    switch (action) {
      case 'spreadsheet-add-row': {
        addRow(wrapper);
        const body = readBodyState(wrapper);
        focusCell(wrapper, body.rows.length - 1, 0);
        break;
      }
      case 'spreadsheet-add-column':
        addColumn(wrapper);
        break;
      case 'spreadsheet-toggle-tsv':
        toggleTsvView(wrapper);
        break;
      case 'spreadsheet-toggle-header':
        toggleHeader(wrapper);
        break;
      case 'spreadsheet-add-chart':
        addChart(wrapper);
        break;
      case 'spreadsheet-remove-chart': {
        const id = t.getAttribute('data-pkc-chart-id') ?? '';
        removeChart(wrapper, id);
        break;
      }
      case 'spreadsheet-open-form':
        openRecordForm(wrapper);
        break;
      case 'spreadsheet-export-csv':
        downloadFile(wrapper, 'csv');
        break;
      case 'spreadsheet-export-xlsx':
        downloadFile(wrapper, 'xlsx');
        break;
      case 'spreadsheet-show-formula-help':
        openFormulaHelp(wrapper);
        break;
      case 'spreadsheet-copy-embed':
        copyEmbedLink(wrapper);
        break;
    }
  });

  // 6) column / row resize(pointerdown on handle → mousemove → mouseup)
  wrapper.addEventListener('pointerdown', (e: PointerEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.classList.contains('pkc-spreadsheet-col-resize')) {
      const colIdx = parseInt(t.getAttribute('data-pkc-col-index') ?? '-1', 10);
      if (colIdx < 0) return;
      startColResize(wrapper, colIdx, e.clientX);
      e.preventDefault();
    } else if (t.classList.contains('pkc-spreadsheet-row-resize')) {
      const rowIdx = parseInt(t.getAttribute('data-pkc-row-index') ?? '-1', 10);
      if (rowIdx < 0) return;
      startRowResize(wrapper, rowIdx, e.clientY);
      e.preventDefault();
    }
  });
}

// ── resize ──────────────────────────────────────────────

function startColResize(wrapper: HTMLElement, colIdx: number, startX: number): void {
  const body = readBodyState(wrapper);
  const startW = colWidthAt(body, colIdx);
  const onMove = (e: MouseEvent): void => {
    const dx = e.clientX - startX;
    const newW = Math.max(MIN_COL_WIDTH, startW + dx);
    applyColWidthLive(wrapper, colIdx, newW);
  };
  const onUp = (e: MouseEvent): void => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    const dx = e.clientX - startX;
    const newW = Math.max(MIN_COL_WIDTH, startW + dx);
    const b = readBodyState(wrapper);
    const widths = [...(b.colWidths ?? [])];
    while (widths.length <= colIdx) widths.push(0);
    widths[colIdx] = newW;
    const next: SpreadsheetBody = { ...b, colWidths: widths };
    writeBodyState(wrapper, next);
    const ta = wrapper.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (ta) {
      ta.value = serializeSpreadsheetBody(next);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function applyColWidthLive(wrapper: HTMLElement, colIdx: number, w: number): void {
  const table = wrapper.querySelector<HTMLTableElement>('table.pkc-spreadsheet-grid');
  if (!table) return;
  const colgroup = table.querySelector('colgroup');
  if (!colgroup) return;
  // 0 = row header col、+1 で data col
  const col = colgroup.querySelectorAll('col')[colIdx + 1] as HTMLElement | undefined;
  if (col) col.style.width = `${w}px`;
}

function startRowResize(wrapper: HTMLElement, rowIdx: number, startY: number): void {
  const body = readBodyState(wrapper);
  const startH = rowHeightAt(body, rowIdx);
  const onMove = (e: MouseEvent): void => {
    const dy = e.clientY - startY;
    const newH = Math.max(MIN_ROW_HEIGHT, startH + dy);
    applyRowHeightLive(wrapper, rowIdx, newH);
  };
  const onUp = (e: MouseEvent): void => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    const dy = e.clientY - startY;
    const newH = Math.max(MIN_ROW_HEIGHT, startH + dy);
    const b = readBodyState(wrapper);
    const heights = [...(b.rowHeights ?? [])];
    while (heights.length <= rowIdx) heights.push(0);
    heights[rowIdx] = newH;
    const next: SpreadsheetBody = { ...b, rowHeights: heights };
    writeBodyState(wrapper, next);
    const ta = wrapper.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (ta) {
      ta.value = serializeSpreadsheetBody(next);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function applyRowHeightLive(wrapper: HTMLElement, rowIdx: number, h: number): void {
  const tr = wrapper.querySelector<HTMLTableRowElement>(`tr[data-row="${rowIdx}"]`);
  if (tr) tr.style.height = `${h}px`;
}

// ── Selection state(Excel-like range)─────────────────

interface CellSelection {
  r1: number; c1: number; r2: number; c2: number;
}

function getSelection_(wrapper: HTMLElement): CellSelection | null {
  const raw = wrapper.getAttribute('data-pkc-selection');
  if (!raw) return null;
  const parts = raw.split(',').map((s) => parseInt(s, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  return { r1: parts[0]!, c1: parts[1]!, r2: parts[2]!, c2: parts[3]! };
}

function setSelection(wrapper: HTMLElement, r1: number, c1: number, r2: number, c2: number): void {
  wrapper.setAttribute('data-pkc-selection', `${r1},${c1},${r2},${c2}`);
  applySelectionHighlight(wrapper);
}

function isSelectionSingleCell(wrapper: HTMLElement): boolean {
  const sel = getSelection_(wrapper);
  if (!sel) return true;
  return sel.r1 === sel.r2 && sel.c1 === sel.c2;
}

function applySelectionHighlight(wrapper: HTMLElement): void {
  const sel = getSelection_(wrapper);
  const cells = wrapper.querySelectorAll<HTMLElement>('[data-col][contenteditable]');
  for (const c of Array.from(cells)) {
    c.removeAttribute('data-pkc-cell-selected');
  }
  if (!sel) return;
  const minR = Math.min(sel.r1, sel.r2);
  const maxR = Math.max(sel.r1, sel.r2);
  const minC = Math.min(sel.c1, sel.c2);
  const maxC = Math.max(sel.c1, sel.c2);
  for (let r = minR; r <= maxR; r++) {
    for (let col = minC; col <= maxC; col++) {
      const cell = wrapper.querySelector<HTMLElement>(`[contenteditable][data-row="${r}"][data-col="${col}"]`);
      if (cell) cell.setAttribute('data-pkc-cell-selected', 'true');
    }
  }
}

function clearSelectionCells(wrapper: HTMLElement): void {
  const sel = getSelection_(wrapper);
  if (!sel) return;
  const body = readBodyState(wrapper);
  const minR = Math.min(sel.r1, sel.r2);
  const maxR = Math.max(sel.r1, sel.r2);
  const minC = Math.min(sel.c1, sel.c2);
  const maxC = Math.max(sel.c1, sel.c2);
  for (let r = minR; r <= maxR; r++) {
    if (!body.rows[r]) continue;
    for (let c = minC; c <= maxC; c++) {
      body.rows[r]![c] = '';
    }
  }
  writeBodyState(wrapper, body);
  rebuildGrid(wrapper, body, { row: minR, col: minC });
  setSelection(wrapper, minR, minC, maxR, maxC);
  syncGridToTextarea(wrapper);
}

function copySelectionTsv(wrapper: HTMLElement): void {
  const sel = getSelection_(wrapper);
  if (!sel) return;
  const body = readBodyState(wrapper);
  const minR = Math.min(sel.r1, sel.r2);
  const maxR = Math.max(sel.r1, sel.r2);
  const minC = Math.min(sel.c1, sel.c2);
  const maxC = Math.max(sel.c1, sel.c2);
  const lines: string[] = [];
  for (let r = minR; r <= maxR; r++) {
    const row: string[] = [];
    for (let c = minC; c <= maxC; c++) {
      row.push(body.rows[r]?.[c] ?? '');
    }
    lines.push(row.join('\t'));
  }
  const tsv = lines.join('\n');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(tsv).catch(() => undefined);
  }
}

/**
 * Ctrl+Arrow:contiguous data block の端まで jump(Excel と同じ動作)。
 * 現 cell が値 cell なら、同方向の最後の値 cell まで。空 cell なら次の値 cell まで。
 */
function jumpEdge(body: SpreadsheetBody, row: number, col: number, dr: number, dc: number): number {
  const isVertical = dr !== 0;
  const limit = isVertical ? body.rows.length : getColumnCount(body);
  const current = body.rows[row]?.[col] ?? '';
  const inData = current !== '';
  let r = row;
  let c = col;
  // 1 歩進める
  r += dr; c += dc;
  if (r < 0 || c < 0 || r >= body.rows.length || c >= limit) {
    return isVertical ? Math.max(0, Math.min(body.rows.length - 1, row + dr)) : Math.max(0, Math.min(limit - 1, col + dc));
  }
  if (inData) {
    // 同方向に進みながら data block の終端を探す
    while (r >= 0 && c >= 0 && r < body.rows.length && c < limit && (body.rows[r]?.[c] ?? '') !== '') {
      r += dr; c += dc;
    }
    r -= dr; c -= dc;
  } else {
    // 空 cell なら次の data cell まで進む
    while (r >= 0 && c >= 0 && r < body.rows.length && c < limit && (body.rows[r]?.[c] ?? '') === '') {
      r += dr; c += dc;
    }
    if (r < 0 || c < 0 || r >= body.rows.length || c >= limit) {
      r = Math.max(0, Math.min(body.rows.length - 1, r));
      c = Math.max(0, Math.min(limit - 1, c));
    }
  }
  return isVertical ? r : c;
}

// ── row / column ops ───────────────────────────────────

function applyPasteAtCell(
  wrapper: HTMLElement,
  startRow: number,
  startCol: number,
  pasted: SpreadsheetBody,
): void {
  const current = readBodyState(wrapper);
  const pastedRows = pasted.rows;
  const maxCols = Math.max(
    getColumnCount(current),
    startCol + Math.max(...pastedRows.map((r) => r.length)),
  );
  const targetRowEnd = startRow + pastedRows.length;
  while (current.rows.length < targetRowEnd) {
    current.rows.push(new Array(maxCols).fill(''));
  }
  for (const r of current.rows) {
    while (r.length < maxCols) r.push('');
  }
  for (let pr = 0; pr < pastedRows.length; pr++) {
    const targetRow = current.rows[startRow + pr]!;
    const srcRow = pastedRows[pr]!;
    for (let pc = 0; pc < srcRow.length; pc++) {
      targetRow[startCol + pc] = srcRow[pc]!;
    }
  }
  const focusAt = {
    row: startRow + pastedRows.length - 1,
    col: startCol + Math.max(...pastedRows.map((r) => r.length)) - 1,
  };
  rebuildGrid(wrapper, current, focusAt);
  syncGridToTextarea(wrapper);
}

function addRow(wrapper: HTMLElement): void {
  const body = readBodyState(wrapper);
  const cols = Math.max(1, getColumnCount(body));
  body.rows.push(new Array(cols).fill(''));
  rebuildGrid(wrapper, body, { row: body.rows.length - 1, col: 0 });
  syncGridToTextarea(wrapper);
}

function addColumn(wrapper: HTMLElement): void {
  const body = readBodyState(wrapper);
  for (const r of body.rows) r.push('');
  if (body.rows.length === 0) body.rows.push(['']);
  const cols = getColumnCount(body);
  rebuildGrid(wrapper, body, { row: 0, col: cols - 1 });
  syncGridToTextarea(wrapper);
}

function toggleTsvView(wrapper: HTMLElement): void {
  const currentMode = wrapper.getAttribute('data-pkc-spreadsheet-mode');
  const goingToTsv = currentMode !== 'tsv';
  if (goingToTsv) {
    syncGridToTextarea(wrapper);
    // TSV mode では JSON ではなく TSV を表示(編集しやすさ優先)
    const ta = wrapper.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (ta) {
      const body = readBodyState(wrapper);
      ta.value = serializeBodyToTsv(body);
    }
    wrapper.setAttribute('data-pkc-spreadsheet-mode', 'tsv');
  } else {
    const ta = wrapper.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (ta) {
      // TSV を parse して body 再構築(metadata は保持)
      const tsvBody = parseTsvToBody(ta.value);
      const prev = readBodyState(wrapper);
      const next: SpreadsheetBody = { ...prev, rows: tsvBody.rows };
      writeBodyState(wrapper, next);
      ta.value = serializeSpreadsheetBody(next);
      rebuildGrid(wrapper, next, { row: 0, col: 0 });
    }
    wrapper.setAttribute('data-pkc-spreadsheet-mode', 'grid');
  }
}

function toggleHeader(wrapper: HTMLElement): void {
  const body = readBodyState(wrapper);
  const next: SpreadsheetBody = { ...body, noHeader: !body.noHeader };
  rebuildGrid(wrapper, next, null);
  syncGridToTextarea(wrapper);
}

// ── Chart ops ──────────────────────────────────────────

function addChart(wrapper: HTMLElement): void {
  const body = readBodyState(wrapper);
  const cols = getColumnCount(body);
  if (cols < 2) {
    alert('グラフ作成には最低 2 列必要です。');
    return;
  }
  openChartModal(wrapper, body, cols);
}

/**
 * Chart 作成 modal(prompt() を置き換え、user direction「サボらないで」)。
 * X 軸列 / Y 軸列(複数 checkbox)/ kind(bar/line/pie radio)/ title /
 * startRow / endRow(任意)を 1 panel で指定。
 */
function openChartModal(wrapper: HTMLElement, body: SpreadsheetBody, cols: number): void {
  // header があれば label として、無ければ A B C
  const headers: string[] = [];
  for (let c = 0; c < cols; c++) {
    if (!body.noHeader && body.rows[0]?.[c]) {
      headers.push(body.rows[0][c]!);
    } else {
      headers.push(colIndexToLetter(c));
    }
  }
  const overlay = document.createElement('div');
  overlay.className = 'pkc-spreadsheet-form-overlay';
  overlay.setAttribute('data-pkc-region', 'spreadsheet-chart-modal');
  const modal = document.createElement('div');
  modal.className = 'pkc-spreadsheet-form-modal pkc-spreadsheet-chart-modal';
  modal.innerHTML = `<h3>📊 グラフ作成</h3>`;

  // kind radio:Chart.js v4 が対応する 7 種類
  const kindWrap = document.createElement('div');
  kindWrap.className = 'pkc-spreadsheet-form-row';
  const kindLabel = document.createElement('span');
  kindLabel.textContent = '種別';
  kindWrap.appendChild(kindLabel);
  const kindOptions = document.createElement('div');
  kindOptions.style.display = 'flex';
  kindOptions.style.flexWrap = 'wrap';
  kindOptions.style.gap = '0.4rem';
  for (const k of ['bar', 'line', 'pie', 'doughnut', 'scatter', 'polarArea', 'radar'] as const) {
    const l = document.createElement('label');
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = 'pkc-chart-kind';
    r.value = k;
    r.setAttribute('data-pkc-chart-kind-input', k);
    if (k === 'bar') r.checked = true;
    l.appendChild(r);
    l.appendChild(document.createTextNode(' ' + k));
    kindOptions.appendChild(l);
  }
  kindWrap.appendChild(kindOptions);
  modal.appendChild(kindWrap);

  // legend toggle
  const legendWrap = document.createElement('label');
  legendWrap.className = 'pkc-spreadsheet-form-row';
  const legendLabel = document.createElement('span');
  legendLabel.textContent = '凡例';
  const legendCb = document.createElement('input');
  legendCb.type = 'checkbox';
  legendCb.checked = true;
  legendCb.setAttribute('data-pkc-chart-legend-input', '');
  legendWrap.appendChild(legendLabel);
  legendWrap.appendChild(legendCb);
  modal.appendChild(legendWrap);

  // title input
  const titleWrap = document.createElement('label');
  titleWrap.className = 'pkc-spreadsheet-form-row';
  const titleLabel = document.createElement('span');
  titleLabel.textContent = 'タイトル';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.setAttribute('data-pkc-chart-title-input', '');
  titleWrap.appendChild(titleLabel);
  titleWrap.appendChild(titleInput);
  modal.appendChild(titleWrap);

  // X 軸列 select
  const xWrap = document.createElement('label');
  xWrap.className = 'pkc-spreadsheet-form-row';
  const xLabel = document.createElement('span');
  xLabel.textContent = 'X 軸列';
  const xSel = document.createElement('select');
  xSel.setAttribute('data-pkc-chart-xcol-input', '');
  for (let c = 0; c < cols; c++) {
    const opt = document.createElement('option');
    opt.value = String(c);
    opt.textContent = `${colIndexToLetter(c)} (${headers[c]})`;
    xSel.appendChild(opt);
  }
  xWrap.appendChild(xLabel);
  xWrap.appendChild(xSel);
  modal.appendChild(xWrap);

  // Y 軸列 checkbox 群
  const yWrap = document.createElement('div');
  yWrap.className = 'pkc-spreadsheet-form-row';
  const yLabel = document.createElement('span');
  yLabel.textContent = 'Y 軸列';
  yWrap.appendChild(yLabel);
  const yOptions = document.createElement('div');
  yOptions.style.display = 'flex';
  yOptions.style.flexWrap = 'wrap';
  yOptions.style.gap = '0.4rem';
  for (let c = 0; c < cols; c++) {
    const l = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = String(c);
    cb.setAttribute('data-pkc-chart-ycol-input', String(c));
    if (c === 1) cb.checked = true;
    l.appendChild(cb);
    l.appendChild(document.createTextNode(' ' + colIndexToLetter(c)));
    yOptions.appendChild(l);
  }
  yWrap.appendChild(yOptions);
  modal.appendChild(yWrap);

  // startRow / endRow
  const rangeWrap = document.createElement('div');
  rangeWrap.className = 'pkc-spreadsheet-form-row';
  const rangeLabel = document.createElement('span');
  rangeLabel.textContent = 'データ範囲';
  rangeWrap.appendChild(rangeLabel);
  const startInput = document.createElement('input');
  startInput.type = 'number';
  startInput.min = '0';
  startInput.value = String(body.noHeader ? 0 : 1);
  startInput.style.width = '4rem';
  startInput.setAttribute('data-pkc-chart-startrow-input', '');
  const endInput = document.createElement('input');
  endInput.type = 'number';
  endInput.min = '0';
  endInput.placeholder = '末尾';
  endInput.style.width = '4rem';
  endInput.setAttribute('data-pkc-chart-endrow-input', '');
  const rangeBox = document.createElement('div');
  rangeBox.appendChild(document.createTextNode('行 '));
  rangeBox.appendChild(startInput);
  rangeBox.appendChild(document.createTextNode(' 〜 '));
  rangeBox.appendChild(endInput);
  rangeWrap.appendChild(rangeBox);
  modal.appendChild(rangeWrap);

  // actions
  const actions = document.createElement('div');
  actions.className = 'pkc-spreadsheet-form-actions';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'pkc-btn';
  save.textContent = '作成';
  save.setAttribute('data-pkc-chart-create-action', '');
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'pkc-btn';
  cancel.textContent = 'キャンセル';
  actions.appendChild(save);
  actions.appendChild(cancel);
  modal.appendChild(actions);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  titleInput.focus();

  cancel.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.remove();
  });
  save.addEventListener('click', () => {
    const kindEl = modal.querySelector<HTMLInputElement>('input[name="pkc-chart-kind"]:checked');
    const kind = (kindEl?.value ?? 'bar') as ChartConfig['kind'];
    const title = titleInput.value;
    const xCol = parseInt(xSel.value, 10);
    const yCols: number[] = [];
    modal.querySelectorAll<HTMLInputElement>('input[data-pkc-chart-ycol-input]:checked').forEach((cb) => {
      yCols.push(parseInt(cb.value, 10));
    });
    if (yCols.length === 0) {
      alert('Y 軸列を 1 つ以上選択してください。');
      return;
    }
    const startRow = Math.max(0, parseInt(startInput.value, 10) || 0);
    const endRowRaw = endInput.value.trim();
    const endRow = endRowRaw === '' ? undefined : parseInt(endRowRaw, 10);
    const chart: ChartConfig = {
      id: `c${Date.now().toString(36)}`,
      kind,
      title,
      xCol,
      yCols,
      startRow,
      ...(endRow !== undefined ? { endRow } : {}),
      legend: legendCb.checked,
    };
    const b = readBodyState(wrapper);
    const next: SpreadsheetBody = { ...b, charts: [...(b.charts ?? []), chart] };
    writeBodyState(wrapper, next);
    rebuildChartsArea(wrapper, next);
    const ta = wrapper.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (ta) {
      ta.value = serializeSpreadsheetBody(next);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    overlay.remove();
  });
}

function removeChart(wrapper: HTMLElement, id: string): void {
  const body = readBodyState(wrapper);
  if (!body.charts) return;
  const next: SpreadsheetBody = { ...body, charts: body.charts.filter((c) => c.id !== id) };
  writeBodyState(wrapper, next);
  rebuildChartsArea(wrapper, next);
  const ta = wrapper.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
  if (ta) {
    ta.value = serializeSpreadsheetBody(next);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// ── Record form(per-row 入力) ────────────────────────

function openRecordForm(wrapper: HTMLElement): void {
  const body = readBodyState(wrapper);
  const cols = Math.max(1, getColumnCount(body));
  // header があれば label として使う、無ければ A/B/C...
  const headers: string[] = [];
  for (let c = 0; c < cols; c++) {
    if (!body.noHeader && body.rows[0]?.[c]) {
      headers.push(body.rows[0][c]!);
    } else {
      headers.push(colIndexToLetter(c));
    }
  }
  // modal
  const overlay = document.createElement('div');
  overlay.className = 'pkc-spreadsheet-form-overlay';
  overlay.setAttribute('data-pkc-region', 'spreadsheet-form');
  const modal = document.createElement('div');
  modal.className = 'pkc-spreadsheet-form-modal';
  const title = document.createElement('h3');
  title.textContent = '📝 レコード入力';
  modal.appendChild(title);
  const form = document.createElement('form');
  for (let c = 0; c < cols; c++) {
    const label = document.createElement('label');
    label.className = 'pkc-spreadsheet-form-row';
    const span = document.createElement('span');
    span.textContent = headers[c]!;
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-pkc-form-col', String(c));
    label.appendChild(span);
    label.appendChild(input);
    form.appendChild(label);
  }
  const actions = document.createElement('div');
  actions.className = 'pkc-spreadsheet-form-actions';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'pkc-btn';
  save.textContent = '行を追加';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'pkc-btn';
  cancel.textContent = 'キャンセル';
  actions.appendChild(save);
  actions.appendChild(cancel);
  form.appendChild(actions);
  modal.appendChild(form);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  // focus first input
  form.querySelector('input')?.focus();

  cancel.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  save.addEventListener('click', () => {
    const vals: string[] = [];
    for (let c = 0; c < cols; c++) {
      const inp = form.querySelector<HTMLInputElement>(`input[data-pkc-form-col="${c}"]`);
      vals.push(inp?.value ?? '');
    }
    const b = readBodyState(wrapper);
    b.rows.push(vals);
    rebuildGrid(wrapper, b, { row: b.rows.length - 1, col: 0 });
    syncGridToTextarea(wrapper);
    overlay.remove();
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') overlay.remove();
  });
}

// ── Formula help modal ─────────────────────────────────

function openFormulaHelp(wrapper: HTMLElement): void {
  const overlay = document.createElement('div');
  overlay.className = 'pkc-spreadsheet-form-overlay';
  overlay.setAttribute('data-pkc-region', 'spreadsheet-formula-help');
  const modal = document.createElement('div');
  modal.className = 'pkc-spreadsheet-form-modal pkc-spreadsheet-formula-help';
  modal.innerHTML = `
    <h3>❓ 数式 / 関数ヘルプ</h3>
    <p style="margin:0.4rem 0;font-size:0.85rem;color:var(--c-muted)">
      Cell の先頭に <code>=</code> を入力すると数式モードになります。値 / 算術 /
      cell 参照(<code>A1</code>)/ range(<code>A1:B10</code>)/ 関数が使えます。
    </p>
    <h4 style="margin:0.6rem 0 0.2rem;font-size:0.9rem">基本</h4>
    <ul style="margin:0;padding-left:1.2rem;font-size:0.85rem;line-height:1.6">
      <li><code>=1+2*3</code> → 7(算術:<code>+ - * / ^</code>、括弧 OK)</li>
      <li><code>=A1+B1</code> → A1 と B1 の合算</li>
      <li><code>=A1:A10</code> → range 指定(関数引数として使用)</li>
      <li><code>=IF(A1&gt;5,"big","small")</code> → 条件分岐</li>
      <li><code>=-A1</code> → 単項マイナス、<code>=A1&lt;B1</code> → 比較(0/1)</li>
    </ul>
    <h4 style="margin:0.6rem 0 0.2rem;font-size:0.9rem">関数</h4>
    <table style="font-size:0.82rem;border-collapse:collapse;width:100%">
      <thead><tr><th style="text-align:left;padding:0.2rem">関数</th><th style="text-align:left;padding:0.2rem">説明</th><th style="text-align:left;padding:0.2rem">例</th></tr></thead>
      <tbody>
        <tr><td style="padding:0.18rem"><code>SUM</code></td><td style="padding:0.18rem">範囲の合計</td><td style="padding:0.18rem"><code>=SUM(A1:A10)</code></td></tr>
        <tr><td style="padding:0.18rem"><code>AVG</code> / <code>AVERAGE</code></td><td style="padding:0.18rem">平均(数値 cell のみ)</td><td style="padding:0.18rem"><code>=AVG(B1:B5)</code></td></tr>
        <tr><td style="padding:0.18rem"><code>MIN</code> / <code>MAX</code></td><td style="padding:0.18rem">最小 / 最大</td><td style="padding:0.18rem"><code>=MIN(A1:C1)</code></td></tr>
        <tr><td style="padding:0.18rem"><code>COUNT</code></td><td style="padding:0.18rem">数値 cell の件数</td><td style="padding:0.18rem"><code>=COUNT(A1:A100)</code></td></tr>
        <tr><td style="padding:0.18rem"><code>IF</code></td><td style="padding:0.18rem">条件 ? then : else</td><td style="padding:0.18rem"><code>=IF(A1=0,"-",A1)</code></td></tr>
        <tr><td style="padding:0.18rem"><code>ABS</code></td><td style="padding:0.18rem">絶対値</td><td style="padding:0.18rem"><code>=ABS(-7)</code></td></tr>
        <tr><td style="padding:0.18rem"><code>ROUND</code></td><td style="padding:0.18rem">四捨五入(第 2 引数 = 桁)</td><td style="padding:0.18rem"><code>=ROUND(3.14,1)</code></td></tr>
        <tr><td style="padding:0.18rem"><code>CONCAT</code></td><td style="padding:0.18rem">文字列連結</td><td style="padding:0.18rem"><code>=CONCAT(A1,"-",B1)</code></td></tr>
        <tr><td style="padding:0.18rem"><code>LEN</code></td><td style="padding:0.18rem">文字列長</td><td style="padding:0.18rem"><code>=LEN(A1)</code></td></tr>
      </tbody>
    </table>
    <h4 style="margin:0.6rem 0 0.2rem;font-size:0.9rem">エラーコード</h4>
    <ul style="margin:0;padding-left:1.2rem;font-size:0.85rem;line-height:1.6">
      <li><code>#DIV/0!</code> ゼロ除算</li>
      <li><code>#NAME?</code> 未定義の関数名</li>
      <li><code>#REF!</code> 不正な cell 参照</li>
      <li><code>#CYCLE!</code> 循環参照</li>
      <li><code>#ERR!</code> 構文エラー(括弧不一致、想定外の文字 等)</li>
    </ul>
    <p style="margin:0.4rem 0;font-size:0.8rem;color:var(--c-muted)">
      エラー cell に hover すると tooltip で詳細理由が表示されます。
    </p>
  `;
  const actions = document.createElement('div');
  actions.className = 'pkc-spreadsheet-form-actions';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pkc-btn';
  close.textContent = '閉じる';
  actions.appendChild(close);
  modal.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  close.focus();
  close.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove(); });
  // wrapper 未使用警告抑止(将来 wrapper context を tooltip 化等で使う想定)
  void wrapper;
}

// ── Export ─────────────────────────────────────────────

function downloadFile(wrapper: HTMLElement, format: 'csv' | 'xlsx'): void {
  const body = readBodyState(wrapper);
  const evaluated = evaluateBody(body);
  const evalBody: SpreadsheetBody = { ...body, rows: evaluated };
  let blob: Blob;
  let filename: string;
  if (format === 'csv') {
    blob = new Blob([serializeBodyToCsv(evalBody)], { type: 'text/csv;charset=utf-8' });
    filename = `sheet-${Date.now()}.csv`;
  } else {
    // xlsx: zip 内 OOXML 構造
    const enc = new TextEncoder();
    const files = buildXlsxFiles(evalBody);
    const entries = files.map((f) => ({ name: f.name, data: enc.encode(f.content) }));
    blob = createZipBlob(entries);
    blob = new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    filename = `sheet-${Date.now()}.xlsx`;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

// ── Embed link copy ─────────────────────────────────────

function copyEmbedLink(wrapper: HTMLElement): void {
  const lid = wrapper.getAttribute('data-pkc-spreadsheet-lid');
  if (!lid) return;
  // user direction 2026-06-03「埋め込みが動作してない」 fix:
  // PKC2 の transclusion 構文は markdown image syntax `![alt](entry:lid)`。
  // wikilink 風 `![[entry:lid]]` は未対応で、markdown-it が image 化せず
  // literal text として描画される。entry: protocol image でないと
  // `expandTransclusions` が拾わない(markdown-render.ts:441 経路)。
  const embed = `![](entry:${lid})`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(embed).catch(() => {
      alert(`埋め込み記法をコピーできませんでした。手動でコピーしてください:\n${embed}`);
    });
    const toast = document.createElement('div');
    toast.className = 'pkc-spreadsheet-toast';
    toast.textContent = '埋め込み記法をコピーしました';
    wrapper.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
  } else {
    alert(`埋め込み記法:\n${embed}`);
  }
}

// ── Presenter export ───────────────────────────────────

/**
 * 埋め込み専用の minimal body builder。toolbar / 編集 UI を含まない
 * 純粋な閲覧表示(table + chart のみ)。transclusion + multi-window で使用。
 *
 * user direction 2026-06-03「個別 HTML レンダリングでは表示されるが、
 * 不要なボタンが表示される」 / 「チャートもレンダリングされてない」 fix:
 * renderBody がはく view toolbar(export 4 button)を embed に流し込むのを
 * やめ、ここでは table + chart-area のみを返す。chart.js init は内部で rAF
 * で defer されるので、移動先 parent に append されれば正常 init。
 */
export function renderSpreadsheetEmbedBody(entry: Entry): HTMLElement {
  if (typeof document === 'undefined') {
    const div = { tagName: 'DIV', className: 'pkc-view-body', innerHTML: '' } as unknown as HTMLElement;
    return div;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'pkc-spreadsheet-embed-body';
  wrapper.setAttribute('data-pkc-spreadsheet-lid', entry.lid);
  const body = parseSpreadsheetBody(entry.body);
  wrapper.appendChild(buildTableElement(document, body));
  if (body.charts && body.charts.length > 0) {
    const area = document.createElement('div');
    area.setAttribute('data-pkc-region', 'spreadsheet-charts');
    area.className = 'pkc-spreadsheet-charts pkc-spreadsheet-charts-embed';
    for (const ch of body.charts) {
      area.appendChild(renderChart(document, body, ch));
    }
    wrapper.appendChild(area);
  }
  return wrapper;
}

export const spreadsheetPresenter: DetailPresenter = {
  renderBody(entry: Entry): HTMLElement {
    if (typeof document === 'undefined') {
      const div = { tagName: 'DIV', className: 'pkc-view-body', innerHTML: '' } as unknown as HTMLElement;
      return div;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'pkc-view-body pkc-spreadsheet-wrapper';
    wrapper.setAttribute('data-pkc-spreadsheet-lid', entry.lid);
    // user direction 2026-06-02「エクスポート導線が編集画面に入っているのはダメ、
    // コレは閲覧側の機能」:view 用 toolbar に export + 埋込 を配置(read-only な
    // 行為なので閲覧 mode が正しい所属)。
    const viewToolbar = document.createElement('div');
    viewToolbar.className = 'pkc-spreadsheet-toolbar pkc-spreadsheet-toolbar-view';
    viewToolbar.setAttribute('data-pkc-region', 'spreadsheet-view-toolbar');
    const mkVB = (label: string, action: string, title: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pkc-btn pkc-btn-small';
      b.setAttribute('data-pkc-action', action);
      b.textContent = label;
      b.title = title;
      return b;
    };
    // user direction 2026-06-02「ODF 廃止、xlsx あるなら不要」 fix:
    // export は xlsx と CSV(見たまま)の 2 経路に集約。
    viewToolbar.appendChild(mkVB('🔗 埋込', 'spreadsheet-copy-embed', '![[entry:lid]] 埋め込み記法を clipboard へ'));
    viewToolbar.appendChild(mkVB('💾 CSV', 'spreadsheet-export-csv', 'CSV ファイルとしてダウンロード(見たまま)'));
    viewToolbar.appendChild(mkVB('💾 XLSX', 'spreadsheet-export-xlsx', 'Excel xlsx としてダウンロード(Office Open XML)'));
    wrapper.appendChild(viewToolbar);
    const body = parseSpreadsheetBody(entry.body);
    // body state を view にも書いておく(view toolbar の export action が
    // readBodyState で読めるように、edit と同じ contract)。
    writeBodyState(wrapper, body);
    wrapper.appendChild(buildTableElement(document, body));
    if (body.charts && body.charts.length > 0) {
      const area = document.createElement('div');
      area.setAttribute('data-pkc-region', 'spreadsheet-charts');
      area.className = 'pkc-spreadsheet-charts';
      for (const ch of body.charts) {
        area.appendChild(renderChart(document, body, ch));
      }
      wrapper.appendChild(area);
    }
    // view mode でも export / embed action を捕まえる click listener
    wrapper.addEventListener('click', (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const action = t.getAttribute('data-pkc-action');
      if (action === 'spreadsheet-export-csv') downloadFile(wrapper, 'csv');
      else if (action === 'spreadsheet-export-xlsx') downloadFile(wrapper, 'xlsx');
      else if (action === 'spreadsheet-copy-embed') copyEmbedLink(wrapper);
    });
    return wrapper;
  },

  renderEditorBody(entry: Entry): HTMLElement {
    if (typeof document === 'undefined') {
      const div = { tagName: 'DIV', className: 'pkc-edit-body', innerHTML: '' } as unknown as HTMLElement;
      return div;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'pkc-edit-body pkc-spreadsheet-editor';
    wrapper.setAttribute('data-pkc-spreadsheet-mode', 'grid');
    wrapper.setAttribute('data-pkc-spreadsheet-lid', entry.lid);

    // initial body
    const parsed = parseSpreadsheetBody(entry.body);
    const body = parsed.rows.length === 0 ? seedBodyIfEmpty(parsed) : parsed;
    writeBodyState(wrapper, body);

    // toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'pkc-spreadsheet-toolbar';
    const mkBtn = (label: string, action: string, title: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pkc-btn pkc-btn-small';
      b.setAttribute('data-pkc-action', action);
      b.textContent = label;
      b.title = title;
      return b;
    };
    // user direction 2026-06-02「エクスポート導線が編集画面に入っているのはダメ、
    // コレは閲覧側の機能」 fix:edit toolbar からは export を削除、view 側に移管。
    toolbar.appendChild(mkBtn('+ 行', 'spreadsheet-add-row', '行を追加(Enter で末尾 cell から自動追加)'));
    toolbar.appendChild(mkBtn('+ 列', 'spreadsheet-add-column', '列を追加'));
    toolbar.appendChild(mkBtn('📋 ヘッダー', 'spreadsheet-toggle-header', '先頭行を header として扱う/解除'));
    toolbar.appendChild(mkBtn('📊 グラフ', 'spreadsheet-add-chart', 'bar / line / pie chart を追加'));
    toolbar.appendChild(mkBtn('📝 フォーム', 'spreadsheet-open-form', '1 行を form 入力'));
    toolbar.appendChild(mkBtn('❓ 関数', 'spreadsheet-show-formula-help', '対応関数の一覧 / 使い方を表示'));
    toolbar.appendChild(mkBtn('TSV ⇄ Grid', 'spreadsheet-toggle-tsv', 'TSV 編集モードと Grid 編集モードを切替'));
    wrapper.appendChild(toolbar);

    // grid table
    const gridTable = buildGridTable(document, body);
    wrapper.appendChild(gridTable);

    // chart area
    if (body.charts && body.charts.length > 0) {
      rebuildChartsArea(wrapper, body);
    }

    // TSV / JSON textarea(常駐、`data-pkc-spreadsheet-mode` で表示切替)
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    ta.className = 'pkc-spreadsheet-tsv';
    ta.spellcheck = false;
    ta.value = serializeSpreadsheetBody(body);
    wrapper.appendChild(ta);

    wireGridEvents(wrapper);
    // formula 初期表示
    refreshFormulaDisplay(gridTable, body);

    return wrapper;
  },

  collectBody(root: HTMLElement): string {
    const wrapper = root.closest<HTMLElement>('.pkc-spreadsheet-editor') ?? root;
    if (wrapper.getAttribute('data-pkc-spreadsheet-mode') === 'grid') {
      const table = wrapper.querySelector<HTMLTableElement>('table.pkc-spreadsheet-grid');
      if (table) {
        const prev = readBodyState(wrapper);
        const body = readBodyFromGrid(table, prev);
        return serializeSpreadsheetBody(body);
      }
    }
    const ta = root.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) return serializeSpreadsheetBody({ rows: [] });
    // TSV mode:JSON か TSV か判定
    const v = ta.value;
    if (v.trim().startsWith('{')) {
      try {
        return serializeSpreadsheetBody(JSON.parse(v) as SpreadsheetBody);
      } catch {
        // fallthrough
      }
    }
    const prev = readBodyState(wrapper);
    const next: SpreadsheetBody = { ...prev, rows: parseTsvToBody(v).rows };
    return serializeSpreadsheetBody(next);
  },
};

/** test 用 helper:HTML escape を export(本 module の HTML pipeline は textContent 経由)。 */
export { escapeHtml as __testEscapeHtml };

/** test 用 export:internal helpers。 */
export const __testHelpers = {
  buildGridTable,
  readBodyFromGrid,
  addRow,
  addColumn,
  toggleTsvView,
  toggleHeader,
  focusCell,
  applyPasteAtCell,
  evaluateFormulaInBody: (formula: string, body: SpreadsheetBody): string => evaluateFormula(formula, body),
};
