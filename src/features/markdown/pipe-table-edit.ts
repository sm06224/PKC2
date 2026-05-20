// GFM pipe table の contextual 編集(行の追加・削除)。pure、DOM 非依存。
// caret 位置を含む表を parse し、行を追加 / 削除して新しい value を返す。
// caret が表内に無い場合は null。spec:
// docs/development/phase-beta-group-c-format-panel-spec-2026-05.md §6.2。

export interface TableEditResult {
  value: string;
  caret: number;
}

interface ParsedTable {
  firstLine: number;
  lastLine: number;
  startOffset: number;
  endOffset: number;
  header: string[];
  align: string[];
  body: string[][];
  caretLine: number;
  caretCol: number;
}

// 行の各セルを取り出す(leading / trailing `|` を許容)。
function parseRowCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

// 区切り行(各セルが `:?-+:?`)か。
function isSeparatorRow(line: string): boolean {
  const cells = parseRowCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

// pipe table の行か(trim 後の行頭が `|`)。
function isTableRow(line: string): boolean {
  return line.trim().startsWith('|');
}

// caret offset を含む行 index。
function caretLineIndex(lines: string[], caret: number): number {
  let off = 0;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i]?.length ?? 0;
    if (caret <= off + len) return i;
    off += len + 1;
  }
  return Math.max(0, lines.length - 1);
}

// 行 index の開始 char offset。
function lineOffset(lines: string[], idx: number): number {
  let off = 0;
  for (let i = 0; i < idx; i++) off += (lines[i]?.length ?? 0) + 1;
  return off;
}

// 行内 position の列 index(caret 前の `|` 数 - 1、0 以上に clamp)。
function caretColIndex(line: string, posInLine: number): number {
  let pipes = 0;
  for (let i = 0; i < posInLine && i < line.length; i++) {
    if (line[i] === '|') pipes++;
  }
  return Math.max(0, pipes - 1);
}

// caret 位置を含む pipe table を parse する。表でなければ null。
function parseTableAt(value: string, caret: number): ParsedTable | null {
  const lines = value.split('\n');
  const caretLine = caretLineIndex(lines, caret);
  const caretText = lines[caretLine];
  if (caretText === undefined || !isTableRow(caretText)) return null;

  let first = caretLine;
  while (first > 0) {
    const prev = lines[first - 1];
    if (prev === undefined || !isTableRow(prev)) break;
    first--;
  }
  let last = caretLine;
  while (last < lines.length - 1) {
    const next = lines[last + 1];
    if (next === undefined || !isTableRow(next)) break;
    last++;
  }
  // header + separator + 0 本以上の body。separator は block の 2 行目。
  if (last - first < 1) return null;
  const headerLine = lines[first];
  const sepLine = lines[first + 1];
  if (headerLine === undefined || sepLine === undefined) return null;
  if (!isSeparatorRow(sepLine)) return null;

  const body: string[][] = [];
  for (let i = first + 2; i <= last; i++) {
    const bl = lines[i];
    if (bl !== undefined) body.push(parseRowCells(bl));
  }
  const posInLine = caret - lineOffset(lines, caretLine);
  return {
    firstLine: first,
    lastLine: last,
    startOffset: lineOffset(lines, first),
    endOffset: lineOffset(lines, last) + (lines[last]?.length ?? 0),
    header: parseRowCells(headerLine),
    align: parseRowCells(sepLine),
    body,
    caretLine,
    caretCol: caretColIndex(caretText, posInLine),
  };
}

// header / align / body を pipe table 文字列に serialize する。
function serializeTable(
  header: string[],
  align: string[],
  body: string[][],
): string {
  const row = (cells: string[]): string => `| ${cells.join(' | ')} |`;
  return [row(header), row(align), ...body.map(row)].join('\n');
}

// caret を含む body 行の index(header / separator 上なら -1)。
function caretBodyRow(t: ParsedTable): number {
  const idx = t.caretLine - t.firstLine - 2;
  return idx < 0 ? -1 : idx;
}

// parse 済 table を value に書き戻し、新 caret 位置を添えて返す。
function commitTable(
  value: string,
  t: ParsedTable,
  header: string[],
  align: string[],
  body: string[][],
  caretRowLineIdx: number,
): TableEditResult {
  const table = serializeTable(header, align, body);
  const newValue =
    value.slice(0, t.startOffset) + table + value.slice(t.endOffset);
  const tableLines = table.split('\n');
  const safeIdx = Math.min(Math.max(0, caretRowLineIdx), tableLines.length - 1);
  // 対象行の先頭セル("| " の直後)に caret を置く。
  const caret = t.startOffset + lineOffset(tableLines, safeIdx) + 2;
  return { value: newValue, caret };
}

// caret 位置を含む表で、caret 行の上 / 下に空行を追加する。
export function addTableRow(
  value: string,
  caret: number,
  where: 'above' | 'below',
): TableEditResult | null {
  const t = parseTableAt(value, caret);
  if (!t) return null;
  const newRow = t.header.map(() => '');
  const bodyRow = caretBodyRow(t);
  const insertAt =
    where === 'above'
      ? Math.max(0, bodyRow)
      : bodyRow < 0
        ? 0
        : bodyRow + 1;
  const body = [...t.body];
  body.splice(insertAt, 0, newRow);
  // 新行は header + separator の後 → table 内 line index は insertAt + 2。
  return commitTable(value, t, t.header, t.align, body, insertAt + 2);
}

// caret 位置を含む表で、caret 行(body 行のみ)を削除する。
export function deleteTableRow(
  value: string,
  caret: number,
): TableEditResult | null {
  const t = parseTableAt(value, caret);
  if (!t) return null;
  const bodyRow = caretBodyRow(t);
  // header / separator は削除不可。body が空なら何もしない。
  if (bodyRow < 0 || bodyRow >= t.body.length) return null;
  const body = [...t.body];
  body.splice(bodyRow, 1);
  return commitTable(value, t, t.header, t.align, body, 0);
}

// caret 位置を含む表で、caret 列の左 / 右に空列を追加する。
export function addTableColumn(
  value: string,
  caret: number,
  where: 'left' | 'right',
): TableEditResult | null {
  const t = parseTableAt(value, caret);
  if (!t) return null;
  const insertAt =
    where === 'left'
      ? t.caretCol
      : Math.min(t.header.length, t.caretCol + 1);
  const splice = (row: string[], cell: string): string[] => {
    const r = [...row];
    r.splice(insertAt, 0, cell);
    return r;
  };
  return commitTable(
    value,
    t,
    splice(t.header, ''),
    splice(t.align, '---'),
    t.body.map((row) => splice(row, '')),
    t.caretLine - t.firstLine,
  );
}

// caret 位置を含む表で、caret 列を削除する。最後の 1 列は削除不可。
export function deleteTableColumn(
  value: string,
  caret: number,
): TableEditResult | null {
  const t = parseTableAt(value, caret);
  if (!t) return null;
  if (t.header.length <= 1) return null;
  const col = Math.min(t.caretCol, t.header.length - 1);
  const drop = (row: string[]): string[] => row.filter((_, i) => i !== col);
  return commitTable(
    value,
    t,
    drop(t.header),
    drop(t.align),
    t.body.map(drop),
    t.caretLine - t.firstLine,
  );
}
