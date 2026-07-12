/**
 * #902(user 要望 2026-07-12)— rendered markdown table の各形式変換。
 *
 * 「表を右クリックしたときに種々の形式でのコピーとエクスポートをサポート
 * して欲しい」。渡された <table> 要素からセル text を抽出し、TSV / CSV /
 * markdown へ変換する pure function 群(browser globals 非使用、element-in →
 * string-out。features 層 DOM 操作の既存流儀 = heading-fold と同じ)。
 *
 * 変換仕様:
 * - TSV: Excel / Sheets へそのまま貼り付け可能(タブ・改行はスペースへ潰す)
 * - CSV: RFC 4180 quoting(`",\n` を含むセルは `"` で囲み `""` エスケープ)。
 *   Excel でダブルクリックで開く用途は caller が UTF-8 BOM を付けて保存する
 * - markdown: 1 行目を header 扱い(thead が無い表も先頭行を header とする)。
 *   セル内の `|` は `\|` へエスケープ
 *
 * 抽出仕様:
 * - thead / tbody / tfoot の順で全 <tr> を走査、<th>/<td> の textContent を trim
 * - table-enhancement(#204 の sort / filter ハンドル)が th 内に挿入する
 *   button 等の UI テキストを拾わないよう、`data-pkc-*` 属性つき子孫は除外
 */

export type TableRows = string[][];

/** セル内の補助 UI(sort/filter ハンドル等)を除いた表示テキストを取る。 */
function cellText(cell: Element): string {
  const clone = cell.cloneNode(true) as Element;
  for (const chrome of Array.from(clone.querySelectorAll('[data-pkc-action], [data-pkc-region], button, input'))) {
    chrome.remove();
  }
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** <table> から行列テキストを抽出する。空表は []。 */
export function extractTableRows(table: HTMLTableElement): TableRows {
  const rows: TableRows = [];
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(tr.querySelectorAll('th, td'));
    if (cells.length === 0) continue;
    rows.push(cells.map(cellText));
  }
  return rows;
}

/** TSV(Excel / Sheets 貼り付け用)。タブ・改行はスペースへ。 */
export function rowsToTsv(rows: TableRows): string {
  return rows.map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}

/** CSV(RFC 4180)。 */
export function rowsToCsv(rows: TableRows): string {
  const esc = (c: string): string =>
    /[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

/** markdown table(先頭行を header とする)。 */
export function rowsToMarkdown(rows: TableRows): string {
  if (rows.length === 0) return '';
  const esc = (c: string): string => c.replace(/\|/g, '\\|');
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]): string[] => [...r, ...Array<string>(width - r.length).fill('')];
  const line = (r: string[]): string => `| ${pad(r).map(esc).join(' | ')} |`;
  const [head, ...body] = rows;
  const sep = `| ${Array<string>(width).fill('---').join(' | ')} |`;
  return [line(head ?? []), sep, ...body.map(line)].join('\n');
}
