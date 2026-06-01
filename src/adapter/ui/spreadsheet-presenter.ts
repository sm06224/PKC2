/**
 * Spreadsheet archetype presenter(Phase 2 grid editor、2026-05-29 user
 * direction「1 と 2 両方」、領域 10-4 Phase 2)。
 *
 * MVP scope (Phase 2):
 *   - renderBody: read-only `<table class="pkc-spreadsheet">`(Phase 1 と同じ)
 *   - renderEditorBody: cell-by-cell **grid editor**。
 *     - 各 cell は `contenteditable`、`data-row` / `data-col` で位置を保持
 *     - cell input event で hidden textarea(`data-pkc-field="body"`)に
 *       TSV を sync → collectBody / dirty 検知 / preview update 経路は
 *       Phase 1 と同じ contract を維持
 *     - Tab / Shift+Tab で水平 cell 移動、Enter / Shift+Enter で垂直移動
 *     - `+ Row` / `+ Column` button、`TSV ⇄ Grid` toggle button
 *   - collectBody: hidden textarea から TSV を取り出し → JSON body(変更なし)
 *
 * Phase 3 以降(別 PR):CSV import / xlsx I/O / formula sub-set。
 */

import type { Entry } from '@core/model/record';
import type { DetailPresenter } from './detail-presenter';
import {
  parseSpreadsheetBody,
  serializeSpreadsheetBody,
  parseTsvToBody,
  serializeBodyToTsv,
  getColumnCount,
  type SpreadsheetBody,
} from '@features/spreadsheet/spreadsheet-body';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * read-only HTML table を build。先頭行を `<thead>`(header)、残りを
 * `<tbody>` に分割。ragged row は短い行に空 `<td>` を補う。
 */
function buildTableElement(doc: Document, body: SpreadsheetBody): HTMLTableElement {
  const table = doc.createElement('table');
  table.className = 'pkc-spreadsheet pkc-md-rendered';
  table.setAttribute('data-pkc-region', 'spreadsheet-table');
  const cols = getColumnCount(body);
  if (cols === 0 || body.rows.length === 0) {
    table.innerHTML = '<caption class="pkc-spreadsheet-empty">(空のスプレッドシート)</caption>';
    return table;
  }
  const [header, ...dataRows] = body.rows;
  if (header) {
    const thead = doc.createElement('thead');
    const tr = doc.createElement('tr');
    for (let i = 0; i < cols; i++) {
      const th = doc.createElement('th');
      th.textContent = header[i] ?? '';
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);
  }
  if (dataRows.length > 0) {
    const tbody = doc.createElement('tbody');
    for (const r of dataRows) {
      const tr = doc.createElement('tr');
      for (let i = 0; i < cols; i++) {
        const td = doc.createElement('td');
        td.textContent = r[i] ?? '';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
  }
  return table;
}

// ── Phase 2 grid editor helpers ─────────────────────────

/**
 * grid DOM から SpreadsheetBody を build。各 row の `<tr>` から data-row 順、
 * 各 cell の `[contenteditable][data-col]` から data-col 順に取り出す。
 */
function readBodyFromGrid(table: HTMLTableElement): SpreadsheetBody {
  const rows: string[][] = [];
  const trs = table.querySelectorAll<HTMLTableRowElement>('tr[data-row]');
  for (const tr of Array.from(trs)) {
    const cells = tr.querySelectorAll<HTMLElement>('[data-col][contenteditable]');
    const rowVals: string[] = [];
    for (const c of Array.from(cells)) {
      rowVals.push(c.textContent ?? '');
    }
    rows.push(rowVals);
  }
  return { rows };
}

/** grid 内 hidden textarea に TSV を sync + input event を発火(dirty 経路)。 */
function syncGridToTextarea(wrapper: HTMLElement): void {
  const table = wrapper.querySelector<HTMLTableElement>('table.pkc-spreadsheet-grid');
  const ta = wrapper.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
  if (!table || !ta) return;
  const body = readBodyFromGrid(table);
  ta.value = serializeBodyToTsv(body);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 指定 row/col の cell を focus。範囲外なら最寄り(clamp)。 */
function focusCell(wrapper: HTMLElement, row: number, col: number): boolean {
  const cell = wrapper.querySelector<HTMLElement>(
    `[contenteditable][data-row="${row}"][data-col="${col}"]`,
  );
  if (!cell) return false;
  cell.focus();
  // contenteditable のキャレットを末尾に
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

/** grid を再 render(row 追加 / column 追加後に呼ぶ)。focus 位置を保持。 */
function rebuildGrid(wrapper: HTMLElement, body: SpreadsheetBody, focusAt: { row: number; col: number } | null): void {
  const oldTable = wrapper.querySelector<HTMLTableElement>('table.pkc-spreadsheet-grid');
  if (!oldTable) return;
  const newTable = buildGridTable(document, body);
  oldTable.replaceWith(newTable);
  if (focusAt) {
    focusCell(wrapper, focusAt.row, focusAt.col);
  }
}

/** grid editor 用 `<table>` を build。各 cell は contenteditable。 */
function buildGridTable(doc: Document, body: SpreadsheetBody): HTMLTableElement {
  const table = doc.createElement('table');
  table.className = 'pkc-spreadsheet pkc-spreadsheet-grid';
  table.setAttribute('data-pkc-region', 'spreadsheet-grid');
  const cols = Math.max(1, getColumnCount(body));
  const rows = body.rows.length === 0 ? [['']] : body.rows;
  // header 行(rows[0])は thead 内に、それ以降は tbody
  const [header, ...dataRows] = rows;
  if (header) {
    const thead = doc.createElement('thead');
    const tr = doc.createElement('tr');
    tr.setAttribute('data-row', '0');
    for (let c = 0; c < cols; c++) {
      const th = doc.createElement('th');
      th.contentEditable = 'true';
      th.setAttribute('data-row', '0');
      th.setAttribute('data-col', String(c));
      th.textContent = header[c] ?? '';
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);
  }
  if (dataRows.length > 0) {
    const tbody = doc.createElement('tbody');
    for (let r = 0; r < dataRows.length; r++) {
      const tr = doc.createElement('tr');
      const rowIdx = r + 1; // 0 は header
      tr.setAttribute('data-row', String(rowIdx));
      for (let c = 0; c < cols; c++) {
        const td = doc.createElement('td');
        td.contentEditable = 'true';
        td.setAttribute('data-row', String(rowIdx));
        td.setAttribute('data-col', String(c));
        td.textContent = dataRows[r]?.[c] ?? '';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
  }
  return table;
}

/** wrapper element に grid editor 用の event listener を attach。 */
function wireGridEvents(wrapper: HTMLElement): void {
  // 1) cell input → hidden textarea sync
  wrapper.addEventListener('input', (e: Event) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    if (t.getAttribute('data-col') === null) return;
    syncGridToTextarea(wrapper);
  });

  // 2) Tab / Shift+Tab で水平 cell 移動、Enter / Shift+Enter で垂直
  wrapper.addEventListener('keydown', (e: KeyboardEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (!t.hasAttribute('contenteditable')) return;
    const rowAttr = t.getAttribute('data-row');
    const colAttr = t.getAttribute('data-col');
    if (rowAttr === null || colAttr === null) return;
    const row = parseInt(rowAttr, 10);
    const col = parseInt(colAttr, 10);
    if (e.key === 'Tab') {
      e.preventDefault();
      const nextCol = e.shiftKey ? col - 1 : col + 1;
      if (!focusCell(wrapper, row, nextCol)) {
        // 行末を超えたら次行先頭 / 行頭を超えたら前行末尾(spreadsheet 標準挙動)
        if (e.shiftKey && col === 0 && row > 0) {
          // 前行末尾(=現 grid 最大列の前列)
          const cols = getColumnCount(readBodyFromGrid(wrapper.querySelector('table.pkc-spreadsheet-grid')!));
          focusCell(wrapper, row - 1, Math.max(0, cols - 1));
        } else if (!e.shiftKey) {
          // 次行先頭(無ければ新規 row 追加して focus)
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
      // contenteditable 中 1 行 cell では ArrowDown が暴れないよう次行へ
      const cell = t;
      // selection が末尾 line にある時のみ移動(複数行 cell は将来用)
      if (cell.textContent && cell.textContent.includes('\n')) return; // 複数行内は default に任せる
      e.preventDefault();
      focusCell(wrapper, row + 1, col);
      return;
    }
    if (e.key === 'ArrowUp' && !e.altKey && !e.shiftKey) {
      const cell = t;
      if (cell.textContent && cell.textContent.includes('\n')) return;
      e.preventDefault();
      focusCell(wrapper, row - 1, col);
      return;
    }
  });

  // 3) toolbar buttons(+ Row / + Column / TSV toggle)
  wrapper.addEventListener('click', (e: MouseEvent) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const action = t.getAttribute('data-pkc-action');
    if (action === 'spreadsheet-add-row') {
      addRow(wrapper);
      // 新規 row 先頭に focus
      const body = readBodyFromGrid(wrapper.querySelector('table.pkc-spreadsheet-grid')!);
      focusCell(wrapper, body.rows.length - 1, 0);
    } else if (action === 'spreadsheet-add-column') {
      addColumn(wrapper);
    } else if (action === 'spreadsheet-toggle-tsv') {
      toggleTsvView(wrapper);
    }
  });
}

function addRow(wrapper: HTMLElement): void {
  const table = wrapper.querySelector<HTMLTableElement>('table.pkc-spreadsheet-grid');
  if (!table) return;
  const body = readBodyFromGrid(table);
  const cols = Math.max(1, getColumnCount(body));
  body.rows.push(new Array(cols).fill(''));
  rebuildGrid(wrapper, body, { row: body.rows.length - 1, col: 0 });
  syncGridToTextarea(wrapper);
}

function addColumn(wrapper: HTMLElement): void {
  const table = wrapper.querySelector<HTMLTableElement>('table.pkc-spreadsheet-grid');
  if (!table) return;
  const body = readBodyFromGrid(table);
  for (const r of body.rows) r.push('');
  if (body.rows.length === 0) body.rows.push(['']);
  const cols = getColumnCount(body);
  rebuildGrid(wrapper, body, { row: 0, col: cols - 1 });
  syncGridToTextarea(wrapper);
}

/** Grid view ↔ TSV textarea view の表示切替(2 つを mutually-exclusive で hide)。 */
function toggleTsvView(wrapper: HTMLElement): void {
  const currentMode = wrapper.getAttribute('data-pkc-spreadsheet-mode');
  const goingToTsv = currentMode !== 'tsv';
  if (goingToTsv) {
    // Grid → TSV:現在の grid 内容を textarea に sync(textarea は単一信頼源化)
    syncGridToTextarea(wrapper);
    wrapper.setAttribute('data-pkc-spreadsheet-mode', 'tsv');
  } else {
    // TSV → Grid:textarea 編集内容を grid に反映(grid を単一信頼源化)
    const ta = wrapper.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (ta) {
      const body = parseTsvToBody(ta.value);
      rebuildGrid(wrapper, body, { row: 0, col: 0 });
    }
    wrapper.setAttribute('data-pkc-spreadsheet-mode', 'grid');
  }
}

export const spreadsheetPresenter: DetailPresenter = {
  renderBody(entry: Entry): HTMLElement {
    if (typeof document === 'undefined') {
      // SSR / test 環境では noop wrapper を返す(layered safe)
      const div = { tagName: 'DIV', className: 'pkc-view-body', innerHTML: '' } as unknown as HTMLElement;
      return div;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'pkc-view-body pkc-spreadsheet-wrapper';
    const body = parseSpreadsheetBody(entry.body);
    wrapper.appendChild(buildTableElement(document, body));
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
    toolbar.appendChild(mkBtn('+ 行', 'spreadsheet-add-row', '行を追加(Enter で末尾 cell から自動追加)'));
    toolbar.appendChild(mkBtn('+ 列', 'spreadsheet-add-column', '列を追加'));
    toolbar.appendChild(mkBtn('TSV ⇄ Grid', 'spreadsheet-toggle-tsv', 'TSV 編集モードと Grid 編集モードを切替'));
    wrapper.appendChild(toolbar);

    // grid table
    const body = parseSpreadsheetBody(entry.body);
    const seed = body.rows.length === 0 ? { rows: [['', '']] } : body; // 空時に 2 cell 提示
    const gridTable = buildGridTable(document, seed);
    wrapper.appendChild(gridTable);

    // TSV textarea(常駐、`data-pkc-spreadsheet-mode` で表示切替)
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    ta.className = 'pkc-spreadsheet-tsv';
    ta.spellcheck = false;
    ta.value = serializeBodyToTsv(seed);
    wrapper.appendChild(ta);

    // event wire
    wireGridEvents(wrapper);

    return wrapper;
  },

  collectBody(root: HTMLElement): string {
    // grid mode の場合、最新 grid DOM を hidden textarea に sync してから読む。
    // textarea 直編集の TSV mode はそのまま読む。
    const wrapper = root.closest<HTMLElement>('.pkc-spreadsheet-editor') ?? root;
    if (wrapper.getAttribute('data-pkc-spreadsheet-mode') === 'grid') {
      const table = wrapper.querySelector<HTMLTableElement>('table.pkc-spreadsheet-grid');
      if (table) {
        const body = readBodyFromGrid(table);
        return serializeSpreadsheetBody(body);
      }
    }
    const ta = root.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) return serializeSpreadsheetBody({ rows: [] });
    return serializeSpreadsheetBody(parseTsvToBody(ta.value));
  },
};

/** test 用 helper:HTML escape を export(本 module の HTML pipeline は
 *  textContent 経由のため XSS risk 無し、smoke check 目的)。 */
export { escapeHtml as __testEscapeHtml };

/** test 用 export:internal helpers を unit test から呼べるよう一部公開。 */
export const __testHelpers = {
  buildGridTable,
  readBodyFromGrid,
  addRow,
  addColumn,
  toggleTsvView,
  focusCell,
};
