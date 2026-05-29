/**
 * Spreadsheet archetype presenter(Phase 1、2026-05-28 user direction #4
 * 領域 10-4)。
 *
 * MVP scope:
 *   - renderBody: read-only `<table class="pkc-spreadsheet">`、1 行目を `<thead>`
 *     として扱う。空 body は placeholder。
 *   - renderEditorBody: TSV(tab-separated)を `<textarea>` で編集する 1 枚 UI。
 *     grid UI(cell-by-cell click → input)は Phase 2 以降。
 *   - collectBody: textarea から TSV を取り出し → `parseTsvToBody` → JSON
 *     serialize して body 文字列に戻す(round-trip 完備)。
 *
 * Phase 1 後の予定:
 *   - Phase 2: cell-by-cell grid editor、column resize、row insert
 *   - Phase 3: CSV import、xlsx I/O、formula sub-set(SUM 等)
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
    const hint = document.createElement('p');
    hint.className = 'pkc-spreadsheet-edit-hint';
    hint.textContent = 'タブ区切り(TSV)形式で編集 ── 1 行目が見出し、改行で行を追加。';
    wrapper.appendChild(hint);
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-pkc-field', 'body');
    textarea.className = 'pkc-spreadsheet-tsv';
    textarea.spellcheck = false;
    textarea.value = serializeBodyToTsv(parseSpreadsheetBody(entry.body));
    wrapper.appendChild(textarea);
    return wrapper;
  },

  collectBody(root: HTMLElement): string {
    const ta = root.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) return serializeSpreadsheetBody({ rows: [] });
    const body = parseTsvToBody(ta.value);
    return serializeSpreadsheetBody(body);
  },
};

/**
 * test 用 helper:HTML escape を export(各 cell の安全 render が破られて
 * いないか smoke check に使う、本 module の HTML pipeline は textContent
 * 経由のため XSS risk 無し)。
 */
export { escapeHtml as __testEscapeHtml };
