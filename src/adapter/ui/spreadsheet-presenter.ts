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
  serializeBodyToFods,
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
  const W = 420;
  const H = 220;
  const PAD = 28;
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'pkc-spreadsheet-chart-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', chart.title || `${chart.kind} chart`);
  if (chart.kind === 'pie') {
    drawPie(doc, svg, W, H, labels, series[0] ?? []);
  } else if (chart.kind === 'line') {
    drawLine(doc, svg, W, H, PAD, labels, series);
  } else {
    drawBar(doc, svg, W, H, PAD, labels, series);
  }
  wrap.appendChild(svg);
  return wrap;
}

function drawBar(doc: Document, svg: SVGElement, W: number, H: number, PAD: number, labels: string[], series: number[][]): void {
  if (series.length === 0 || labels.length === 0) return;
  const allVals = series.flat();
  const max = Math.max(1, ...allVals);
  const min = Math.min(0, ...allVals);
  const range = max - min;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;
  const groupW = plotW / labels.length;
  const barW = (groupW * 0.7) / series.length;
  for (let s = 0; s < series.length; s++) {
    for (let i = 0; i < labels.length; i++) {
      const v = series[s]![i] ?? 0;
      const x = PAD + i * groupW + groupW * 0.15 + s * barW;
      const h = (v - min) / range * plotH;
      const y = H - PAD - h;
      const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(barW));
      rect.setAttribute('height', String(Math.max(0, h)));
      rect.setAttribute('fill', CHART_PALETTE[s % CHART_PALETTE.length]!);
      svg.appendChild(rect);
    }
  }
  // X axis labels
  for (let i = 0; i < labels.length; i++) {
    const t = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(PAD + i * groupW + groupW / 2));
    t.setAttribute('y', String(H - PAD + 14));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '10');
    t.setAttribute('fill', 'currentColor');
    t.textContent = labels[i] ?? '';
    svg.appendChild(t);
  }
  // baseline
  const base = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
  base.setAttribute('x1', String(PAD));
  base.setAttribute('y1', String(H - PAD));
  base.setAttribute('x2', String(W - PAD));
  base.setAttribute('y2', String(H - PAD));
  base.setAttribute('stroke', 'currentColor');
  base.setAttribute('stroke-width', '1');
  base.setAttribute('opacity', '0.4');
  svg.appendChild(base);
}

function drawLine(doc: Document, svg: SVGElement, W: number, H: number, PAD: number, labels: string[], series: number[][]): void {
  if (series.length === 0 || labels.length === 0) return;
  const allVals = series.flat();
  const max = Math.max(1, ...allVals);
  const min = Math.min(0, ...allVals);
  const range = max - min;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;
  const step = labels.length > 1 ? plotW / (labels.length - 1) : 0;
  for (let s = 0; s < series.length; s++) {
    const pts: string[] = [];
    for (let i = 0; i < labels.length; i++) {
      const v = series[s]![i] ?? 0;
      const x = PAD + i * step;
      const y = H - PAD - (v - min) / range * plotH;
      pts.push(`${x},${y}`);
    }
    const pl = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    pl.setAttribute('points', pts.join(' '));
    pl.setAttribute('fill', 'none');
    pl.setAttribute('stroke', CHART_PALETTE[s % CHART_PALETTE.length]!);
    pl.setAttribute('stroke-width', '2');
    svg.appendChild(pl);
  }
  for (let i = 0; i < labels.length; i++) {
    const t = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(PAD + i * step));
    t.setAttribute('y', String(H - PAD + 14));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '10');
    t.setAttribute('fill', 'currentColor');
    t.textContent = labels[i] ?? '';
    svg.appendChild(t);
  }
}

function drawPie(doc: Document, svg: SVGElement, W: number, H: number, labels: string[], values: number[]): void {
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) / 2 - 20;
  const total = values.reduce((a, b) => a + Math.abs(b), 0);
  if (total === 0) return;
  let angle = -Math.PI / 2;
  for (let i = 0; i < values.length; i++) {
    const v = Math.abs(values[i] ?? 0);
    const a2 = angle + (v / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const large = (a2 - angle) > Math.PI ? 1 : 0;
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`);
    path.setAttribute('fill', CHART_PALETTE[i % CHART_PALETTE.length]!);
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '1');
    svg.appendChild(path);
    // label outside slice
    const mid = (angle + a2) / 2;
    const lx = cx + (r + 12) * Math.cos(mid);
    const ly = cy + (r + 12) * Math.sin(mid);
    const t = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', String(lx));
    t.setAttribute('y', String(ly));
    t.setAttribute('text-anchor', mid > Math.PI / 2 || mid < -Math.PI / 2 ? 'end' : 'start');
    t.setAttribute('font-size', '10');
    t.setAttribute('fill', 'currentColor');
    t.textContent = labels[i] ?? '';
    svg.appendChild(t);
    angle = a2;
  }
}

// ── Phase 4 grid editor helpers ────────────────────────

function readBodyFromGrid(table: HTMLTableElement, prevBody?: SpreadsheetBody): SpreadsheetBody {
  const rows: string[][] = [];
  const trs = table.querySelectorAll<HTMLTableRowElement>('tr[data-row]');
  for (const tr of Array.from(trs)) {
    const cells = tr.querySelectorAll<HTMLElement>('[data-col][contenteditable]');
    const rowVals: string[] = [];
    for (const c of Array.from(cells)) {
      // user direction 2026-06-02「関数入力でエラーになっても入力状態は保持すべき」 fix:
      // **focus 中の cell は textContent を採用**(user 編集中の text が真実)。
      // 非 focus 状態の formula cell は data-pkc-raw(評価値 vs raw 切替時の raw 保持)。
      const isFocused = document.activeElement === c;
      if (isFocused) {
        rowVals.push(c.textContent ?? '');
      } else {
        const raw = c.getAttribute('data-pkc-raw');
        rowVals.push(raw !== null ? raw : (c.textContent ?? ''));
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
  // 1) cell input → hidden textarea sync
  wrapper.addEventListener('input', (e: Event) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    if (t.getAttribute('data-col') === null) return;
    syncGridToTextarea(wrapper);
  });

  // 2) focus / blur で formula raw / evaluated 切替 + 選択状態更新
  wrapper.addEventListener('focusin', (e: FocusEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    const raw = t.getAttribute('data-pkc-raw');
    if (raw !== null && t.textContent !== raw) t.textContent = raw;
    // 選択を anchor + active = この cell に。
    const row = parseInt(t.getAttribute('data-row') ?? '0', 10);
    const col = parseInt(t.getAttribute('data-col') ?? '0', 10);
    setSelection(wrapper, row, col, row, col);
  });
  wrapper.addEventListener('focusout', (e: FocusEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    syncGridToTextarea(wrapper);
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
      case 'spreadsheet-export-fods':
        downloadFile(wrapper, 'fods');
        break;
      case 'spreadsheet-export-xlsx':
        downloadFile(wrapper, 'xlsx');
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

  // kind radio
  const kindWrap = document.createElement('div');
  kindWrap.className = 'pkc-spreadsheet-form-row';
  const kindLabel = document.createElement('span');
  kindLabel.textContent = '種別';
  kindWrap.appendChild(kindLabel);
  const kindOptions = document.createElement('div');
  for (const k of ['bar', 'line', 'pie'] as const) {
    const l = document.createElement('label');
    l.style.marginRight = '0.6rem';
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

// ── Export ─────────────────────────────────────────────

function downloadFile(wrapper: HTMLElement, format: 'csv' | 'fods' | 'xlsx'): void {
  const body = readBodyState(wrapper);
  const evaluated = evaluateBody(body);
  const evalBody: SpreadsheetBody = { ...body, rows: evaluated };
  let blob: Blob;
  let filename: string;
  if (format === 'csv') {
    blob = new Blob([serializeBodyToCsv(evalBody)], { type: 'text/csv;charset=utf-8' });
    filename = `sheet-${Date.now()}.csv`;
  } else if (format === 'fods') {
    blob = new Blob([serializeBodyToFods(evalBody)], {
      type: 'application/vnd.oasis.opendocument.spreadsheet-flat-xml',
    });
    filename = `sheet-${Date.now()}.fods`;
  } else {
    // xlsx: zip 内 OOXML 構造
    const enc = new TextEncoder();
    const files = buildXlsxFiles(evalBody);
    const entries = files.map((f) => ({ name: f.name, data: enc.encode(f.content) }));
    blob = createZipBlob(entries);
    // mime を xlsx 専用に上書き(createZipBlob は generic zip mime)
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
  const embed = `![[entry:${lid}]]`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(embed).catch(() => {
      // fallback: show as alert
      alert(`埋め込み記法をコピーできませんでした。手動でコピーしてください:\n${embed}`);
    });
    // toast 風 hint
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
    viewToolbar.appendChild(mkVB('🔗 埋込', 'spreadsheet-copy-embed', '![[entry:lid]] 埋め込み記法を clipboard へ'));
    viewToolbar.appendChild(mkVB('💾 CSV', 'spreadsheet-export-csv', 'CSV ファイルとしてダウンロード'));
    viewToolbar.appendChild(mkVB('💾 ODF', 'spreadsheet-export-fods', 'ODF Flat XML (.fods) としてダウンロード(LibreOffice 互換)'));
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
      else if (action === 'spreadsheet-export-fods') downloadFile(wrapper, 'fods');
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
