/**
 * Spreadsheet archetype body schema(Phase 1、2026-05-28 user direction #4
 * 領域 10-4)。
 *
 * MVP scope:
 *   - body は JSON `{ rows: string[][] }`(各 cell は string、formula なし)
 *   - 1 行目を header として扱う(presenter 側 `<thead>` 化、本層は data 不変)
 *   - empty cell = ''、null は許容しない(parse 時に '' 正規化)
 *
 * features/ 層は pure TypeScript、browser API 非依存(core ← features の
 * 規律)。CSV / TSV 入出力は Phase 2、xlsx は Phase 3 で別 module。
 */

/** Spreadsheet body の JSON 表現。 */
export interface SpreadsheetBody {
  /** 各行 = 列文字列の配列。先頭行は header として presenter が render。 */
  rows: string[][];
}

/** 空 body(0 行 0 列)。新規 entry 作成時の seed。 */
export const EMPTY_SPREADSHEET_BODY: SpreadsheetBody = {
  rows: [],
};

/**
 * body 文字列を SpreadsheetBody に parse する。
 *
 * 寛容な parse:
 *   - 空文字列 → 空 body
 *   - 不正な JSON → 空 body(silent fallback、上位 layer で warn 推奨)
 *   - rows が array でない → 空 body
 *   - cell が string 以外 → String() で coerce
 */
export function parseSpreadsheetBody(body: string): SpreadsheetBody {
  if (!body || body.trim() === '') return { rows: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { rows: [] };
  }
  if (!parsed || typeof parsed !== 'object') return { rows: [] };
  const obj = parsed as { rows?: unknown };
  if (!Array.isArray(obj.rows)) return { rows: [] };
  const rows: string[][] = [];
  for (const r of obj.rows) {
    if (!Array.isArray(r)) continue;
    const row: string[] = [];
    for (const c of r) {
      row.push(c === null || c === undefined ? '' : String(c));
    }
    rows.push(row);
  }
  return { rows };
}

/** SpreadsheetBody を canonical な JSON 文字列に serialize する。 */
export function serializeSpreadsheetBody(body: SpreadsheetBody): string {
  return JSON.stringify({ rows: body.rows });
}

/**
 * TSV(tab-separated values)形式の文字列を SpreadsheetBody に変換する。
 * editor で扱う「人間が編集しやすい」 中間表現。改行 `\n` で行分け、
 * tab `\t` で列分け。trailing 空行は trim。CR は除去。
 */
export function parseTsvToBody(tsv: string): SpreadsheetBody {
  const text = tsv.replace(/\r\n?/g, '\n');
  if (text === '') return { rows: [] };
  const lines = text.split('\n');
  // trailing 空行 1 件だけ trim(末尾 newline 経路の標準形)
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const rows: string[][] = [];
  for (const line of lines) {
    rows.push(line.split('\t'));
  }
  return { rows };
}

/** SpreadsheetBody を TSV 文字列に変換する。 */
export function serializeBodyToTsv(body: SpreadsheetBody): string {
  return body.rows.map((r) => r.join('\t')).join('\n');
}

/**
 * column 数を取得する(全 row の最大列数、ragged row 対応)。
 */
export function getColumnCount(body: SpreadsheetBody): number {
  let max = 0;
  for (const r of body.rows) {
    if (r.length > max) max = r.length;
  }
  return max;
}

/** 行数。 */
export function getRowCount(body: SpreadsheetBody): number {
  return body.rows.length;
}
