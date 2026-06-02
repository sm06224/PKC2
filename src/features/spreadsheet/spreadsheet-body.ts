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

// ── Phase 3 CSV / TSV import helpers(user direction 2026-05-29) ──

/**
 * CSV 1 行を field 配列に parse(RFC 4180 サブセット):
 *   - `,` 区切り
 *   - `"..."` で囲まれた field は内部 `,` / 改行 / `""` (エスケープ済 `"`)を許容
 *   - 囲み無しの field は trim せず literal
 *
 * 引数 `line` は 1 logical row 全体(quote 内改行が含まれる場合あり)。
 */
function parseCsvLineFields(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else if (ch === '"' && cur === '') {
        inQuote = true;
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields;
}

/**
 * CSV text を SpreadsheetBody に変換する(RFC 4180 サブセット)。
 * - CRLF / LF / CR を LF に正規化
 * - `"..."` で囲まれた field 内の改行を保持(1 cell 内複数行)
 * - 空文字列 → 空 body
 */
export function parseCsvToBody(csv: string): SpreadsheetBody {
  const text = csv.replace(/\r\n?/g, '\n');
  if (text === '') return { rows: [] };
  // logical row への分割:quote 中の改行は join、quote 外の改行は row 切替
  const rows: string[][] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') {
        cur += '""';
        i++;
        continue;
      }
      inQuote = !inQuote;
      cur += ch;
    } else if (ch === '\n' && !inQuote) {
      rows.push(parseCsvLineFields(cur));
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || rows.length === 0) {
    rows.push(parseCsvLineFields(cur));
  }
  // 末尾の空 row 1 件だけ trim(改行終端の標準形)
  while (rows.length > 0 && rows[rows.length - 1]!.length === 1 && rows[rows.length - 1]![0] === '') {
    rows.pop();
  }
  return { rows };
}

/** SpreadsheetBody を CSV 文字列に変換(RFC 4180 サブセット、cell 内 `,` / 改行 / `"` を quote)。 */
export function serializeBodyToCsv(body: SpreadsheetBody): string {
  return body.rows
    .map((r) => r.map((c) => csvEscapeField(c)).join(','))
    .join('\n');
}

function csvEscapeField(field: string): string {
  if (field === '') return '';
  // `,` `"` `\n` `\r` を含む field は quote + 内 `"` を `""` にエスケープ
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * 「貼付テキスト」から spreadsheet 内容を auto-detect:
 *   - 改行を含み tab を含む → TSV
 *   - 改行を含み comma を含む → CSV
 *   - 改行のみ → 1 列の複数行
 *   - 単一 cell(改行 / tab / comma なし)→ null(default paste 経路へ)
 *
 * 結果 SpreadsheetBody は呼出側が focus cell 位置から流し込む。
 */
export function detectPasteAsSpreadsheet(text: string): SpreadsheetBody | null {
  if (!text) return null;
  const normalized = text.replace(/\r\n?/g, '\n');
  const hasNewline = normalized.includes('\n');
  const hasTab = normalized.includes('\t');
  const hasComma = normalized.includes(',');
  if (!hasNewline && !hasTab) return null; // 単一値はそのまま貼付
  if (hasTab) return parseTsvToBody(normalized);
  if (hasComma) return parseCsvToBody(normalized);
  // 改行のみ → 1 列の複数行
  const lines = normalized.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return { rows: lines.map((l) => [l]) };
}
