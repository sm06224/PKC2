/**
 * Spreadsheet archetype body schema(Phase 1-4、2026-05-28〜2026-06-02)。
 *
 * Phase 4 拡張(user direction 2026-06-02、9 項目一括):
 *   - colWidths / rowHeights: Excel-like セルサイズ調整(px、optional)
 *   - charts: Chart config 配列(bar / line / pie、inline SVG)
 *   - noHeader: 先頭行を header 扱いしない明示 flag
 *   - 関数 evaluator(SUM / AVG / MIN / MAX / COUNT / IF / ABS / ROUND / 算術)
 *   - ODF .fods export / CSV export
 *
 * features/ 層は pure TypeScript、browser API 非依存。
 */

/** Chart configuration(Phase 4)。 */
export interface ChartConfig {
  id: string;
  kind: 'bar' | 'line' | 'pie';
  title: string;
  /** X 軸(label)列 index、0-indexed。 */
  xCol: number;
  /** Y 軸(value)列 index 配列、0-indexed。複数指定で multi-series。 */
  yCols: number[];
  /** data 開始 row index、0-indexed(default 1 = header skip)。 */
  startRow: number;
  /** data 終了 row exclusive、未指定なら最終行まで。 */
  endRow?: number;
}

/** Spreadsheet body の JSON 表現。 */
export interface SpreadsheetBody {
  /** 各行 = 列文字列の配列。先頭行は header として presenter が render(noHeader=true で無効)。 */
  rows: string[][];
  /** Phase 4: 列幅(px)。長さは rows の最大列数まで。未指定列は default 幅。 */
  colWidths?: number[];
  /** Phase 4: 行高(px)。長さは rows.length まで。未指定行は default 高。 */
  rowHeights?: number[];
  /** Phase 4: chart 配列(配置順に下部 render)。 */
  charts?: ChartConfig[];
  /** Phase 4: true で先頭行を header 扱いしない。 */
  noHeader?: boolean;
}

/** 空 body(0 行 0 列)。新規 entry 作成時の seed。 */
export const EMPTY_SPREADSHEET_BODY: SpreadsheetBody = {
  rows: [],
};

/** 新規 spreadsheet の default cells(5x6 = 5 列 × 6 行、全 cell 空)。
 *  user direction 2026-06-02「スプレッドシートなんだから、最初からセルが表示されるべき」 */
export const DEFAULT_NEW_SPREADSHEET_BODY: SpreadsheetBody = {
  rows: Array.from({ length: 6 }, () => Array.from({ length: 5 }, () => '')),
  noHeader: true,
};

/**
 * body 文字列を SpreadsheetBody に parse する。寛容な parse。
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
  const obj = parsed as {
    rows?: unknown;
    colWidths?: unknown;
    rowHeights?: unknown;
    charts?: unknown;
    noHeader?: unknown;
  };
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
  const out: SpreadsheetBody = { rows };
  if (Array.isArray(obj.colWidths)) {
    out.colWidths = obj.colWidths
      .map((v) => (typeof v === 'number' && v > 0 ? v : 0));
  }
  if (Array.isArray(obj.rowHeights)) {
    out.rowHeights = obj.rowHeights
      .map((v) => (typeof v === 'number' && v > 0 ? v : 0));
  }
  if (Array.isArray(obj.charts)) {
    const charts: ChartConfig[] = [];
    for (const c of obj.charts) {
      if (!c || typeof c !== 'object') continue;
      const cc = c as Partial<ChartConfig>;
      if (typeof cc.id !== 'string') continue;
      if (cc.kind !== 'bar' && cc.kind !== 'line' && cc.kind !== 'pie') continue;
      if (typeof cc.xCol !== 'number') continue;
      if (!Array.isArray(cc.yCols)) continue;
      charts.push({
        id: cc.id,
        kind: cc.kind,
        title: typeof cc.title === 'string' ? cc.title : '',
        xCol: cc.xCol,
        yCols: cc.yCols.filter((y): y is number => typeof y === 'number'),
        startRow: typeof cc.startRow === 'number' ? cc.startRow : 1,
        endRow: typeof cc.endRow === 'number' ? cc.endRow : undefined,
      });
    }
    if (charts.length > 0) out.charts = charts;
  }
  if (obj.noHeader === true) out.noHeader = true;
  return out;
}

/** SpreadsheetBody を canonical な JSON 文字列に serialize する。 */
export function serializeSpreadsheetBody(body: SpreadsheetBody): string {
  const out: Record<string, unknown> = { rows: body.rows };
  if (body.colWidths && body.colWidths.length > 0) out.colWidths = body.colWidths;
  if (body.rowHeights && body.rowHeights.length > 0) out.rowHeights = body.rowHeights;
  if (body.charts && body.charts.length > 0) out.charts = body.charts;
  if (body.noHeader) out.noHeader = true;
  return JSON.stringify(out);
}

/**
 * TSV 形式の文字列を SpreadsheetBody に変換する。
 */
export function parseTsvToBody(tsv: string): SpreadsheetBody {
  const text = tsv.replace(/\r\n?/g, '\n');
  if (text === '') return { rows: [] };
  const lines = text.split('\n');
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

/** column 数(全 row 最大、ragged row 対応)。 */
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

// ── CSV import / export ─────────────────────────────────

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

export function parseCsvToBody(csv: string): SpreadsheetBody {
  const text = csv.replace(/\r\n?/g, '\n');
  if (text === '') return { rows: [] };
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
  while (rows.length > 0 && rows[rows.length - 1]!.length === 1 && rows[rows.length - 1]![0] === '') {
    rows.pop();
  }
  return { rows };
}

export function serializeBodyToCsv(body: SpreadsheetBody): string {
  return body.rows
    .map((r) => r.map((c) => csvEscapeField(c)).join(','))
    .join('\n');
}

function csvEscapeField(field: string): string {
  if (field === '') return '';
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function detectPasteAsSpreadsheet(text: string): SpreadsheetBody | null {
  if (!text) return null;
  const normalized = text.replace(/\r\n?/g, '\n');
  const hasNewline = normalized.includes('\n');
  const hasTab = normalized.includes('\t');
  const hasComma = normalized.includes(',');
  if (!hasNewline && !hasTab) return null;
  if (hasTab) return parseTsvToBody(normalized);
  if (hasComma) return parseCsvToBody(normalized);
  const lines = normalized.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return { rows: lines.map((l) => [l]) };
}

// ── Phase 4: Cell reference / formula evaluator ─────────

/**
 * Column letter(`A`, `B`, ... `Z`, `AA`, `AB`, ...)を 0-indexed column に変換。
 * 不正入力は -1。
 */
export function colLetterToIndex(s: string): number {
  if (!s || !/^[A-Z]+$/.test(s)) return -1;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
}

/** 0-indexed column を Excel-style column letter に変換。 */
export function colIndexToLetter(n: number): string {
  if (n < 0) return '';
  let s = '';
  let x = n;
  while (x >= 0) {
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26) - 1;
  }
  return s;
}

/** `A1` 形式の cell 参照を {row, col}(0-indexed)に変換。不正なら null。 */
export function parseCellRef(ref: string): { row: number; col: number } | null {
  const m = /^([A-Z]+)([0-9]+)$/.exec(ref.trim());
  if (!m) return null;
  const col = colLetterToIndex(m[1]!);
  const row = parseInt(m[2]!, 10) - 1;
  if (col < 0 || row < 0) return null;
  return { row, col };
}

/** raw cell 値が formula(`=` 始まり)か。 */
export function isFormula(cell: string): boolean {
  return cell.startsWith('=');
}

/**
 * formula を評価。body 全体を渡し、cell 参照 / range / 関数 / 算術を eval。
 * 循環参照は短絡(深さ制限)、エラーは `#ERR!` 文字列を返す。
 */
export function evaluateFormula(
  formula: string,
  body: SpreadsheetBody,
  visiting: Set<string> = new Set(),
  depth: number = 0,
): string {
  if (depth > 32) return '#CYCLE!';
  const src = formula.startsWith('=') ? formula.slice(1) : formula;
  try {
    const tokens = tokenize(src);
    const parser = new Parser(tokens);
    const ast = parser.parseExpr();
    const v = evalNode(ast, body, visiting, depth);
    return formatValue(v);
  } catch {
    return '#ERR!';
  }
}

type FormulaValue = number | string | boolean;

interface Node {
  kind: 'num' | 'str' | 'ref' | 'range' | 'call' | 'bin' | 'unary';
  // num
  num?: number;
  // str
  str?: string;
  // ref
  ref?: { row: number; col: number };
  // range
  range?: { row1: number; col1: number; row2: number; col2: number };
  // call
  fn?: string;
  args?: Node[];
  // bin
  op?: string;
  left?: Node;
  right?: Node;
  // unary
  operand?: Node;
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' }
  | { t: 'colon' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i++;
      continue;
    }
    if (ch === '(') { tokens.push({ t: 'lp' }); i++; continue; }
    if (ch === ')') { tokens.push({ t: 'rp' }); i++; continue; }
    if (ch === ',') { tokens.push({ t: 'comma' }); i++; continue; }
    if (ch === ':') { tokens.push({ t: 'colon' }); i++; continue; }
    if (ch === '"') {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '"') {
        s += src[i];
        i++;
      }
      i++;
      tokens.push({ t: 'str', v: s });
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let s = '';
      while (i < src.length && /[0-9.]/.test(src[i]!)) {
        s += src[i];
        i++;
      }
      tokens.push({ t: 'num', v: parseFloat(s) });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let s = '';
      // identifier は letters のみ(数字は混ぜない)── `A1` を id `A` + num `1`
      // に切って parsePrimary 側で cell ref として組み立てる。`SUM` 等の関数名
      // は letters のみで一致するため衝突なし。`_` は将来用に許容。
      while (i < src.length && /[A-Za-z_]/.test(src[i]!)) {
        s += src[i];
        i++;
      }
      tokens.push({ t: 'id', v: s });
      continue;
    }
    // operators: + - * / ^ < > = <= >= <>
    if ('+-*/^'.includes(ch)) {
      tokens.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    if (ch === '<' || ch === '>' || ch === '=' || ch === '!') {
      const next = src[i + 1];
      if (ch === '<' && next === '=') { tokens.push({ t: 'op', v: '<=' }); i += 2; continue; }
      if (ch === '>' && next === '=') { tokens.push({ t: 'op', v: '>=' }); i += 2; continue; }
      if (ch === '<' && next === '>') { tokens.push({ t: 'op', v: '<>' }); i += 2; continue; }
      tokens.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    // unknown char
    throw new Error('unknown token: ' + ch);
  }
  return tokens;
}

class Parser {
  pos = 0;
  constructor(public tokens: Token[]) {}
  peek(): Token | undefined { return this.tokens[this.pos]; }
  consume(): Token { return this.tokens[this.pos++]!; }
  match(t: string, v?: string): boolean {
    const cur = this.peek();
    if (!cur || cur.t !== t) return false;
    if (v !== undefined && (cur as { v?: string }).v !== v) return false;
    return true;
  }
  // expr = comparison
  parseExpr(): Node { return this.parseComparison(); }
  parseComparison(): Node {
    let left = this.parseAddSub();
    while (this.match('op')) {
      const op = (this.peek() as { v: string }).v;
      if (op === '<' || op === '>' || op === '=' || op === '<=' || op === '>=' || op === '<>') {
        this.consume();
        const right = this.parseAddSub();
        left = { kind: 'bin', op, left, right };
      } else {
        break;
      }
    }
    return left;
  }
  parseAddSub(): Node {
    let left = this.parseMulDiv();
    while (this.match('op')) {
      const op = (this.peek() as { v: string }).v;
      if (op === '+' || op === '-') {
        this.consume();
        const right = this.parseMulDiv();
        left = { kind: 'bin', op, left, right };
      } else {
        break;
      }
    }
    return left;
  }
  parseMulDiv(): Node {
    let left = this.parsePow();
    while (this.match('op')) {
      const op = (this.peek() as { v: string }).v;
      if (op === '*' || op === '/') {
        this.consume();
        const right = this.parsePow();
        left = { kind: 'bin', op, left, right };
      } else {
        break;
      }
    }
    return left;
  }
  parsePow(): Node {
    const left = this.parseUnary();
    if (this.match('op', '^')) {
      this.consume();
      const right = this.parsePow();
      return { kind: 'bin', op: '^', left, right };
    }
    return left;
  }
  parseUnary(): Node {
    if (this.match('op', '-')) {
      this.consume();
      const operand = this.parseUnary();
      return { kind: 'unary', op: '-', operand };
    }
    if (this.match('op', '+')) {
      this.consume();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }
  parsePrimary(): Node {
    const tok = this.peek();
    if (!tok) throw new Error('unexpected end');
    if (tok.t === 'num') {
      this.consume();
      return { kind: 'num', num: tok.v };
    }
    if (tok.t === 'str') {
      this.consume();
      return { kind: 'str', str: tok.v };
    }
    if (tok.t === 'lp') {
      this.consume();
      const inner = this.parseExpr();
      if (!this.match('rp')) throw new Error('expected )');
      this.consume();
      return inner;
    }
    if (tok.t === 'id') {
      // 関数 / cell 参照 / range
      this.consume();
      const next = this.peek();
      if (next && next.t === 'lp') {
        // 関数 call
        this.consume();
        const args: Node[] = [];
        if (!this.match('rp')) {
          args.push(this.parseExpr());
          while (this.match('comma')) {
            this.consume();
            args.push(this.parseExpr());
          }
        }
        if (!this.match('rp')) throw new Error('expected )');
        this.consume();
        return { kind: 'call', fn: tok.v.toUpperCase(), args };
      }
      // cell ref 形式(`A1`)— id token は `A1` 全体を捕まえないので、
      // 数字部分を後置 num として直接 consume する。
      // tokenize は `A` を id、`1` を num に切るが、ここでは
      // `A` 単体は cell ref に展開できない。実際 tokenizer は
      // `A1` の `A` を id にして `1` を num にする。
      // → 直後が num token なら ref / range として解釈。
      if (next && next.t === 'num') {
        const numTok = this.consume() as { t: 'num'; v: number };
        const rowNum = numTok.v;
        const refStr = `${tok.v.toUpperCase()}${rowNum}`;
        const cell = parseCellRef(refStr);
        if (!cell) throw new Error('bad ref ' + refStr);
        // range?
        if (this.match('colon')) {
          this.consume();
          const end = this.peek();
          if (!end || end.t !== 'id') throw new Error('bad range');
          this.consume();
          const endNum = this.peek();
          if (!endNum || endNum.t !== 'num') throw new Error('bad range');
          this.consume();
          const endRef = parseCellRef(`${(end as { v: string }).v.toUpperCase()}${(endNum as { v: number }).v}`);
          if (!endRef) throw new Error('bad range end');
          return {
            kind: 'range',
            range: {
              row1: Math.min(cell.row, endRef.row),
              col1: Math.min(cell.col, endRef.col),
              row2: Math.max(cell.row, endRef.row),
              col2: Math.max(cell.col, endRef.col),
            },
          };
        }
        return { kind: 'ref', ref: cell };
      }
      // identifier だけ(bare name)→ 文字列扱い(TRUE/FALSE は特殊)
      if (tok.v.toUpperCase() === 'TRUE') return { kind: 'num', num: 1 };
      if (tok.v.toUpperCase() === 'FALSE') return { kind: 'num', num: 0 };
      return { kind: 'str', str: tok.v };
    }
    throw new Error('unexpected token');
  }
}

function evalNode(
  node: Node,
  body: SpreadsheetBody,
  visiting: Set<string>,
  depth: number,
): FormulaValue {
  switch (node.kind) {
    case 'num': return node.num!;
    case 'str': return node.str!;
    case 'ref': {
      const { row, col } = node.ref!;
      return readCellValue(row, col, body, visiting, depth);
    }
    case 'range': {
      // range をそのまま値として扱うのは関数呼び出し時のみ。値文脈では
      // 左上 cell の値で代用(Excel と同じ implicit intersection 簡略版)。
      const r = node.range!;
      return readCellValue(r.row1, r.col1, body, visiting, depth);
    }
    case 'unary': {
      const v = evalNode(node.operand!, body, visiting, depth);
      const n = toNum(v);
      return node.op === '-' ? -n : n;
    }
    case 'bin': {
      const l = evalNode(node.left!, body, visiting, depth);
      const r = evalNode(node.right!, body, visiting, depth);
      switch (node.op) {
        case '+': return toNum(l) + toNum(r);
        case '-': return toNum(l) - toNum(r);
        case '*': return toNum(l) * toNum(r);
        case '/': {
          const d = toNum(r);
          if (d === 0) throw new Error('div by zero');
          return toNum(l) / d;
        }
        case '^': return Math.pow(toNum(l), toNum(r));
        case '<': return toNum(l) < toNum(r) ? 1 : 0;
        case '>': return toNum(l) > toNum(r) ? 1 : 0;
        case '<=': return toNum(l) <= toNum(r) ? 1 : 0;
        case '>=': return toNum(l) >= toNum(r) ? 1 : 0;
        case '=': return l === r || toNum(l) === toNum(r) ? 1 : 0;
        case '<>': return l !== r && toNum(l) !== toNum(r) ? 1 : 0;
      }
      throw new Error('bad op');
    }
    case 'call': {
      return evalCall(node.fn!, node.args!, body, visiting, depth);
    }
  }
}

function readCellValue(
  row: number,
  col: number,
  body: SpreadsheetBody,
  visiting: Set<string>,
  depth: number,
): FormulaValue {
  const key = `${row},${col}`;
  if (visiting.has(key)) throw new Error('cycle');
  const raw = body.rows[row]?.[col] ?? '';
  // 空 cell は空文字列で表現(数値文脈では toNum で 0 化、COUNT 等の
  // 数値判定では「数値でない」 として扱う ── Excel 流儀)。
  if (raw === '') return '';
  if (isFormula(raw)) {
    visiting.add(key);
    const result = evaluateFormula(raw, body, visiting, depth + 1);
    visiting.delete(key);
    const asNum = parseFloat(result);
    if (!Number.isNaN(asNum) && /^-?[0-9.]+$/.test(result)) return asNum;
    return result;
  }
  const n = parseFloat(raw);
  if (!Number.isNaN(n) && /^-?[0-9.]+$/.test(raw.trim())) return n;
  return raw;
}

function expandRangeValues(
  arg: Node,
  body: SpreadsheetBody,
  visiting: Set<string>,
  depth: number,
): FormulaValue[] {
  if (arg.kind === 'range') {
    const r = arg.range!;
    const out: FormulaValue[] = [];
    for (let row = r.row1; row <= r.row2; row++) {
      for (let col = r.col1; col <= r.col2; col++) {
        out.push(readCellValue(row, col, body, visiting, depth));
      }
    }
    return out;
  }
  return [evalNode(arg, body, visiting, depth)];
}

function evalCall(
  fn: string,
  args: Node[],
  body: SpreadsheetBody,
  visiting: Set<string>,
  depth: number,
): FormulaValue {
  const collect = (): FormulaValue[] => {
    const vals: FormulaValue[] = [];
    for (const a of args) {
      vals.push(...expandRangeValues(a, body, visiting, depth));
    }
    return vals;
  };
  switch (fn) {
    case 'SUM': {
      let s = 0;
      for (const v of collect()) s += toNum(v);
      return s;
    }
    case 'AVG':
    case 'AVERAGE': {
      const vs = collect().filter((v) => typeof v === 'number' || /^-?[0-9.]+$/.test(String(v).trim()));
      if (vs.length === 0) return 0;
      let s = 0;
      for (const v of vs) s += toNum(v);
      return s / vs.length;
    }
    case 'MIN': {
      const vs = collect().map(toNum);
      if (vs.length === 0) return 0;
      return Math.min(...vs);
    }
    case 'MAX': {
      const vs = collect().map(toNum);
      if (vs.length === 0) return 0;
      return Math.max(...vs);
    }
    case 'COUNT': {
      let c = 0;
      for (const v of collect()) {
        if (typeof v === 'number' || /^-?[0-9.]+$/.test(String(v).trim())) c++;
      }
      return c;
    }
    case 'IF': {
      const cond = toNum(evalNode(args[0]!, body, visiting, depth));
      return cond !== 0
        ? evalNode(args[1]!, body, visiting, depth)
        : (args[2] ? evalNode(args[2], body, visiting, depth) : 0);
    }
    case 'ABS': return Math.abs(toNum(evalNode(args[0]!, body, visiting, depth)));
    case 'ROUND': {
      const v = toNum(evalNode(args[0]!, body, visiting, depth));
      const d = args[1] ? toNum(evalNode(args[1], body, visiting, depth)) : 0;
      const m = Math.pow(10, d);
      return Math.round(v * m) / m;
    }
    case 'CONCAT':
    case 'CONCATENATE': {
      let s = '';
      for (const v of collect()) s += String(v);
      return s;
    }
    case 'LEN':
      return String(evalNode(args[0]!, body, visiting, depth)).length;
  }
  throw new Error('unknown function ' + fn);
}

function toNum(v: FormulaValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

function formatValue(v: FormulaValue): string {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '#NUM!';
    // 整数なら整数表記、それ以外は小数 12 桁まで丸める
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 1e12) / 1e12);
  }
  return String(v);
}

/** 全 cell を評価して 2D 値 grid を返す(view mode 用)。formula は評価値、それ以外は raw。 */
export function evaluateBody(body: SpreadsheetBody): string[][] {
  const out: string[][] = [];
  for (let r = 0; r < body.rows.length; r++) {
    const row: string[] = [];
    const src = body.rows[r]!;
    for (let c = 0; c < src.length; c++) {
      const raw = src[c]!;
      row.push(isFormula(raw) ? evaluateFormula(raw, body) : raw);
    }
    out.push(row);
  }
  return out;
}

// ── ODF .fods export(flat XML、zip 不要) ────────────────

/**
 * SpreadsheetBody を ODF Flat XML(.fods)文字列に変換。
 * `application/vnd.oasis.opendocument.spreadsheet-flat-xml` 形式。
 * LibreOffice / OpenOffice で開ける。Excel は直接非対応(LibreOffice 経由)。
 */
export function serializeBodyToFods(body: SpreadsheetBody, sheetName: string = 'Sheet1'): string {
  const evaluated = evaluateBody(body);
  const xmlEscape = (s: string): string =>
    s.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  const cols = getColumnCount(body);
  const cells: string[] = [];
  for (const r of evaluated) {
    cells.push('<table:table-row>');
    for (let c = 0; c < cols; c++) {
      const v = r[c] ?? '';
      const isNum = /^-?[0-9.]+$/.test(v.trim()) && v.trim() !== '';
      if (isNum) {
        cells.push(`<table:table-cell office:value-type="float" office:value="${xmlEscape(v.trim())}"><text:p>${xmlEscape(v)}</text:p></table:table-cell>`);
      } else {
        cells.push(`<table:table-cell office:value-type="string"><text:p>${xmlEscape(v)}</text:p></table:table-cell>`);
      }
    }
    cells.push('</table:table-row>');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.2"
  office:mimetype="application/vnd.oasis.opendocument.spreadsheet">
<office:body>
<office:spreadsheet>
<table:table table:name="${xmlEscape(sheetName)}">
${cells.join('\n')}
</table:table>
</office:spreadsheet>
</office:body>
</office:document>`;
}
