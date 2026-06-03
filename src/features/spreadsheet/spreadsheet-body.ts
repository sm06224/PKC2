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

/** Chart configuration(Phase 4 + 2026-06-03 extended kinds)。 */
export type ChartKind = 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter' | 'polarArea' | 'radar';

export interface ChartConfig {
  id: string;
  kind: ChartKind;
  title: string;
  /** X 軸(label)列 index、0-indexed。 */
  xCol: number;
  /** Y 軸(value)列 index 配列、0-indexed。複数指定で multi-series。 */
  yCols: number[];
  /** data 開始 row index、0-indexed(default 1 = header skip)。 */
  startRow: number;
  /** data 終了 row exclusive、未指定なら最終行まで。 */
  endRow?: number;
  /** 凡例表示(default true)。 */
  legend?: boolean;
  /** 行 / 列 をフィルタする expression(将来用、未実装)。 */
  filter?: string;
}

/** 列ごとのデータ書式(2026-06-03、user direction「基本的なデータ型と見せ方には対応」)。
 *  Excel 流儀。number/currency/percent/date/text の 5 種、precision で小数桁、
 *  currency で通貨コード(ISO 4217 例「JPY」「USD」)、dateFormat で日付幅。
 */
export interface ColumnFormat {
  /** 0-indexed column。 */
  col: number;
  type: 'number' | 'currency' | 'percent' | 'date' | 'text';
  /** number/currency/percent の小数桁。未指定 = 0(integer)。 */
  precision?: number;
  /** currency 専用、ISO 4217 通貨コード。未指定 = 'JPY'。 */
  currency?: string;
  /** date 専用、`short` / `medium` / `long`(Intl.DateTimeFormat dateStyle)。未指定 = 'short'。 */
  dateFormat?: 'short' | 'medium' | 'long';
  /** 桁区切り(number/currency)、default true。 */
  useGrouping?: boolean;
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
  /** Phase 4(2026-06-03):列ごとのデータ書式。 */
  columnFormats?: ColumnFormat[];
}

/**
 * 列 index から format を引く。未指定なら null。
 */
export function findColumnFormat(body: SpreadsheetBody, col: number): ColumnFormat | null {
  if (!body.columnFormats) return null;
  return body.columnFormats.find((f) => f.col === col) ?? null;
}

/**
 * cell value を column format に従って表示用文字列に整形。
 * 数値文字列は parse、それ以外はそのまま返す。date は ISO-like string を parse。
 * locale 引数で `Intl.NumberFormat` / `Intl.DateTimeFormat` の locale を切替。
 */
export function formatCellValue(value: string, fmt: ColumnFormat | null, locale?: string): string {
  if (!fmt || fmt.type === 'text' || value === '') return value;
  const trimmed = value.trim();
  if (fmt.type === 'number' || fmt.type === 'currency' || fmt.type === 'percent') {
    const n = parseFloat(trimmed);
    if (Number.isNaN(n)) return value;
    const precision = fmt.precision ?? 0;
    const useGrouping = fmt.useGrouping !== false;
    if (fmt.type === 'currency') {
      const currency = fmt.currency ?? 'JPY';
      try {
        return new Intl.NumberFormat(locale, {
          style: 'currency', currency,
          minimumFractionDigits: precision, maximumFractionDigits: precision,
          useGrouping,
        }).format(n);
      } catch { /* invalid currency fallback */ }
    }
    if (fmt.type === 'percent') {
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: precision, maximumFractionDigits: precision,
        useGrouping,
      }).format(n);
    }
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: precision, maximumFractionDigits: precision,
      useGrouping,
    }).format(n);
  }
  if (fmt.type === 'date') {
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat(locale, { dateStyle: fmt.dateFormat ?? 'short' }).format(d);
  }
  return value;
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
      const validKinds: ReadonlyArray<string> = ['bar', 'line', 'pie', 'doughnut', 'scatter', 'polarArea', 'radar'];
      if (typeof cc.kind !== 'string' || !validKinds.includes(cc.kind)) continue;
      if (typeof cc.xCol !== 'number') continue;
      if (!Array.isArray(cc.yCols)) continue;
      charts.push({
        id: cc.id,
        kind: cc.kind as ChartKind,
        title: typeof cc.title === 'string' ? cc.title : '',
        xCol: cc.xCol,
        yCols: cc.yCols.filter((y): y is number => typeof y === 'number'),
        startRow: typeof cc.startRow === 'number' ? cc.startRow : 1,
        endRow: typeof cc.endRow === 'number' ? cc.endRow : undefined,
        legend: typeof cc.legend === 'boolean' ? cc.legend : undefined,
        filter: typeof cc.filter === 'string' ? cc.filter : undefined,
      });
    }
    if (charts.length > 0) out.charts = charts;
  }
  if (obj.noHeader === true) out.noHeader = true;
  if (Array.isArray((obj as { columnFormats?: unknown }).columnFormats)) {
    const formats: ColumnFormat[] = [];
    const validTypes: ReadonlyArray<string> = ['number', 'currency', 'percent', 'date', 'text'];
    for (const f of (obj as { columnFormats: unknown[] }).columnFormats) {
      if (!f || typeof f !== 'object') continue;
      const ff = f as Partial<ColumnFormat>;
      if (typeof ff.col !== 'number') continue;
      if (typeof ff.type !== 'string' || !validTypes.includes(ff.type)) continue;
      formats.push({
        col: ff.col,
        type: ff.type as ColumnFormat['type'],
        ...(typeof ff.precision === 'number' ? { precision: ff.precision } : {}),
        ...(typeof ff.currency === 'string' ? { currency: ff.currency } : {}),
        ...(typeof ff.dateFormat === 'string' ? { dateFormat: ff.dateFormat as 'short' | 'medium' | 'long' } : {}),
        ...(typeof ff.useGrouping === 'boolean' ? { useGrouping: ff.useGrouping } : {}),
      });
    }
    if (formats.length > 0) out.columnFormats = formats;
  }
  return out;
}

/** SpreadsheetBody を canonical な JSON 文字列に serialize する。 */
export function serializeSpreadsheetBody(body: SpreadsheetBody): string {
  const out: Record<string, unknown> = { rows: body.rows };
  if (body.colWidths && body.colWidths.length > 0) out.colWidths = body.colWidths;
  if (body.rowHeights && body.rowHeights.length > 0) out.rowHeights = body.rowHeights;
  if (body.charts && body.charts.length > 0) out.charts = body.charts;
  if (body.noHeader) out.noHeader = true;
  if (body.columnFormats && body.columnFormats.length > 0) out.columnFormats = body.columnFormats;
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
 * Formula 評価コンテキスト。1 回の `evaluateBody` 呼出で memo / visiting
 * を共有し、cell 間の重複評価を排除する(performance 対策、user direction
 * 2026-06-02「パフォーマンスに不安があるなら解決して!」)。
 *
 * memo:`row,col` → 評価値。同一 cell が複数 formula から参照されても 1 回。
 * visiting:現在評価中の cell。循環参照 detection。
 */
interface FormulaCtx {
  memo: Map<string, FormulaValue>;
  visiting: Set<string>;
  depth: number;
}

function newCtx(): FormulaCtx {
  return { memo: new Map(), visiting: new Set(), depth: 0 };
}

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

/** Formula evaluation の詳細結果(value + 必要なら error 種別 + 人間可読 reason)。 */
export interface FormulaResult {
  /** 評価結果文字列(エラーコードも文字列で返す ── `#ERR!` 等)。 */
  value: string;
  /** エラー時のみセット ── Excel 流のコード(`#NAME?` / `#DIV/0!` / `#REF!` / `#CYCLE!` / `#NUM!` / `#ERR!`)。 */
  errorCode?: string;
  /** エラー時のみセット ── 人間可読の理由(tooltip 表示用)。 */
  errorReason?: string;
}

/** 内部例外:評価エラー種別 + reason を構造化して throw → catch 側で FormulaResult に整形。 */
class FormulaError extends Error {
  constructor(public code: string, public reason: string) {
    super(`${code} ${reason}`);
  }
}

/**
 * formula を詳細結果付きで評価。エラー時は code + 人間可読 reason を返す。
 * UI 側で tooltip に reason を出して「何のエラーか分からない」 問題を解消。
 */
export function evaluateFormulaDetail(
  formula: string,
  body: SpreadsheetBody,
  ctx: FormulaCtx = newCtx(),
): FormulaResult {
  if (ctx.depth > 64) {
    return { value: '#CYCLE!', errorCode: '#CYCLE!', errorReason: '循環参照(64 段超え):cell が自身を間接参照しています。' };
  }
  const src = formula.startsWith('=') ? formula.slice(1) : formula;
  try {
    const tokens = tokenize(src);
    const parser = new Parser(tokens);
    const ast = parser.parseExpr();
    const v = evalNode(ast, body, ctx);
    return { value: formatValue(v) };
  } catch (e) {
    if (e instanceof FormulaError) {
      return { value: e.code, errorCode: e.code, errorReason: e.reason };
    }
    if (e instanceof Error) {
      // 構造化されていない error は #ERR! + 原文 reason
      return { value: '#ERR!', errorCode: '#ERR!', errorReason: e.message };
    }
    return { value: '#ERR!', errorCode: '#ERR!', errorReason: '不明なエラー' };
  }
}

/** 後方互換 ── 文字列のみ返す。詳細が必要なら `evaluateFormulaDetail` を使う。 */
export function evaluateFormula(
  formula: string,
  body: SpreadsheetBody,
  ctx: FormulaCtx = newCtx(),
): string {
  return evaluateFormulaDetail(formula, body, ctx).value;
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
    throw new FormulaError('#ERR!', `想定外の文字 \`${ch}\` を含んでいます`);
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
    if (!tok) throw new FormulaError('#ERR!', '数式が途中で終わっています(末尾に値か式が必要)');
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
      if (!this.match('rp')) throw new FormulaError('#ERR!', '`)` が見つかりません(括弧が閉じていない)');
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
        if (!this.match('rp')) throw new FormulaError('#ERR!', `関数 ${tok.v.toUpperCase()} の \`)\` が見つかりません`);
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
        if (!cell) throw new FormulaError('#REF!', `不正な cell 参照 \`${refStr}\``);
        // range?
        if (this.match('colon')) {
          this.consume();
          const end = this.peek();
          if (!end || end.t !== 'id') throw new FormulaError('#REF!', 'range 終端の列文字が必要(例 `A1:B10`)');
          this.consume();
          const endNum = this.peek();
          if (!endNum || endNum.t !== 'num') throw new FormulaError('#REF!', 'range 終端の行番号が必要(例 `A1:B10`)');
          this.consume();
          const endRef = parseCellRef(`${(end as { v: string }).v.toUpperCase()}${(endNum as { v: number }).v}`);
          if (!endRef) throw new FormulaError('#REF!', 'range 終端の cell 参照が不正');
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
    throw new FormulaError('#ERR!', '想定外のトークン(数値・文字列・cell 参照・関数のいずれかが必要)');
  }
}

function evalNode(node: Node, body: SpreadsheetBody, ctx: FormulaCtx): FormulaValue {
  switch (node.kind) {
    case 'num': return node.num!;
    case 'str': return node.str!;
    case 'ref': {
      const { row, col } = node.ref!;
      return readCellValue(row, col, body, ctx);
    }
    case 'range': {
      // 値文脈での range は左上 cell の値で代用(Excel implicit intersection 簡略)。
      const r = node.range!;
      return readCellValue(r.row1, r.col1, body, ctx);
    }
    case 'unary': {
      const v = evalNode(node.operand!, body, ctx);
      const n = toNum(v);
      return node.op === '-' ? -n : n;
    }
    case 'bin': {
      const l = evalNode(node.left!, body, ctx);
      const r = evalNode(node.right!, body, ctx);
      switch (node.op) {
        case '+': return toNum(l) + toNum(r);
        case '-': return toNum(l) - toNum(r);
        case '*': return toNum(l) * toNum(r);
        case '/': {
          const d = toNum(r);
          if (d === 0) throw new FormulaError('#DIV/0!', 'ゼロでの除算');
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
      throw new FormulaError('#ERR!', `不明な演算子 ${node.op}`);
    }
    case 'call': {
      return evalCall(node.fn!, node.args!, body, ctx);
    }
  }
}

function readCellValue(row: number, col: number, body: SpreadsheetBody, ctx: FormulaCtx): FormulaValue {
  const key = `${row},${col}`;
  if (ctx.memo.has(key)) return ctx.memo.get(key)!;
  if (ctx.visiting.has(key)) {
    throw new FormulaError('#CYCLE!', `${colIndexToLetter(col)}${row + 1} が自身を参照しています`);
  }
  const raw = body.rows[row]?.[col] ?? '';
  if (raw === '') {
    ctx.memo.set(key, '');
    return '';
  }
  let result: FormulaValue;
  if (isFormula(raw)) {
    ctx.visiting.add(key);
    ctx.depth++;
    const resStr = evaluateFormula(raw, body, ctx);
    ctx.depth--;
    ctx.visiting.delete(key);
    const asNum = parseFloat(resStr);
    result = (!Number.isNaN(asNum) && /^-?[0-9.]+$/.test(resStr)) ? asNum : resStr;
  } else {
    const n = parseFloat(raw);
    result = (!Number.isNaN(n) && /^-?[0-9.]+$/.test(raw.trim())) ? n : raw;
  }
  ctx.memo.set(key, result);
  return result;
}

function expandRangeValues(arg: Node, body: SpreadsheetBody, ctx: FormulaCtx): FormulaValue[] {
  if (arg.kind === 'range') {
    const r = arg.range!;
    const out: FormulaValue[] = [];
    for (let row = r.row1; row <= r.row2; row++) {
      for (let col = r.col1; col <= r.col2; col++) {
        out.push(readCellValue(row, col, body, ctx));
      }
    }
    return out;
  }
  return [evalNode(arg, body, ctx)];
}

function evalCall(fn: string, args: Node[], body: SpreadsheetBody, ctx: FormulaCtx): FormulaValue {
  const collect = (): FormulaValue[] => {
    const vals: FormulaValue[] = [];
    for (const a of args) {
      vals.push(...expandRangeValues(a, body, ctx));
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
      const cond = toNum(evalNode(args[0]!, body, ctx));
      return cond !== 0
        ? evalNode(args[1]!, body, ctx)
        : (args[2] ? evalNode(args[2], body, ctx) : 0);
    }
    case 'ABS': return Math.abs(toNum(evalNode(args[0]!, body, ctx)));
    case 'ROUND': {
      const v = toNum(evalNode(args[0]!, body, ctx));
      const d = args[1] ? toNum(evalNode(args[1], body, ctx)) : 0;
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
      return String(evalNode(args[0]!, body, ctx)).length;
  }
  throw new FormulaError('#NAME?', `関数 ${fn} は未定義です(対応:SUM / AVG / MIN / MAX / COUNT / IF / ABS / ROUND / CONCAT / LEN)`);
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

/**
 * 全 cell を評価して 2D 値 grid を返す(view mode 用)。formula は評価値、
 * それ以外は raw。**単一 ctx を共有して memo 効かせる**(一度評価した
 * cell は全 cell 走査内で再計算しない、N×M で N+M+formula 数オーダー)。
 */
export function evaluateBody(body: SpreadsheetBody): string[][] {
  const ctx = newCtx();
  const out: string[][] = [];
  for (let r = 0; r < body.rows.length; r++) {
    const row: string[] = [];
    const src = body.rows[r]!;
    for (let c = 0; c < src.length; c++) {
      const raw = src[c]!;
      if (!isFormula(raw)) {
        row.push(raw);
        continue;
      }
      // memo 経由で既評価なら format-only
      const key = `${r},${c}`;
      const cached = ctx.memo.get(key);
      if (cached !== undefined) {
        row.push(formatValue(cached));
        continue;
      }
      const evaluated = evaluateFormula(raw, body, ctx);
      // 評価結果を memo に逆 propagate(以後の cell が参照したら hit)
      const asNum = parseFloat(evaluated);
      if (!Number.isNaN(asNum) && /^-?[0-9.]+$/.test(evaluated)) {
        ctx.memo.set(key, asNum);
      } else {
        ctx.memo.set(key, evaluated);
      }
      row.push(evaluated);
    }
    out.push(row);
  }
  return out;
}

/**
 * Chart filter expression を評価して row を残すか判定する。
 * 構文:`{col letter}{op}{value}`(例 `B>10`、`A=foo`、`C<>0`)。op = `>` `<` `>=` `<=` `=` `<>`。
 * 不正 expr は filter なし扱い(全 row 採用)。
 * user direction 2026-06-03「フィルターや凡例も弱い」 fix の filter 実装。
 */
export function evalChartFilter(filter: string | undefined, row: ReadonlyArray<string>): boolean {
  if (!filter || filter.trim() === '') return true;
  const m = /^\s*([A-Z]+)\s*(<=|>=|<>|<|>|=)\s*(.+?)\s*$/.exec(filter);
  if (!m) return true;
  const colIdx = colLetterToIndex(m[1]!);
  if (colIdx < 0 || colIdx >= row.length) return true;
  const op = m[2]!;
  const rhs = m[3]!;
  // RHS が operator 文字で始まる場合は malformed(`B>>10` 等)→ fallback
  if (/^[<>=]/.test(rhs)) return true;
  const lhs = row[colIdx] ?? '';
  // 両方数値なら数値比較、それ以外は文字列比較。
  const ln = parseFloat(lhs);
  const rn = parseFloat(rhs);
  const isNumeric = !Number.isNaN(ln) && !Number.isNaN(rn) && /^-?[0-9.]+$/.test(lhs.trim()) && /^-?[0-9.]+$/.test(rhs.trim());
  if (isNumeric) {
    switch (op) {
      case '>': return ln > rn;
      case '<': return ln < rn;
      case '>=': return ln >= rn;
      case '<=': return ln <= rn;
      case '=': return ln === rn;
      case '<>': return ln !== rn;
    }
  }
  switch (op) {
    case '=': return lhs === rhs;
    case '<>': return lhs !== rhs;
    case '>': return lhs > rhs;
    case '<': return lhs < rhs;
    case '>=': return lhs >= rhs;
    case '<=': return lhs <= rhs;
  }
  return true;
}

// ── xlsx export(Office Open XML、最小 zip 構造)─────────

/** xlsx ファイル内に格納する file entry(name + content)。 */
export interface XlsxFile {
  name: string;
  content: string;
}

/**
 * SpreadsheetBody から xlsx zip のためのファイル群を build する。
 * 呼出側で `createZipBytes` / `createZipBlob` に渡して xlsx ファイルを生成。
 *
 * 最小構成(Excel が開ける範囲):
 *   - [Content_Types].xml
 *   - _rels/.rels
 *   - xl/workbook.xml
 *   - xl/_rels/workbook.xml.rels
 *   - xl/worksheets/sheet1.xml
 *
 * sharedStrings / styles は省略(inline string で済む、Excel が default style 適用)。
 * formula は評価値を出力(user direction「見たままを csv で落としたい」 と同方針、
 * formula 自体は <f> tag で添えるオプションを今後追加可能)。
 */
/**
 * user direction 2026-06-03「xlsx にもグラフ出力すべき」 fix:
 * OOXML chart は xl/charts/chartN.xml(chart 定義)+ xl/drawings/drawingN.xml
 * (sheet 上の anchor)+ sheet.xml への `<drawing>` element + 各 rels file +
 * `[Content_Types].xml` の Override 拡張で構成。本実装は bar/line/pie/doughnut
 * の 4 種 chart kind を OOXML 化(scatter/polarArea/radar は Chart.js 固有
 * representation で OOXML 直対応難、bar 系に fallback)。
 *
 * 構造(本 PR、chart 1 個の場合):
 *   - [Content_Types].xml ─ chart + drawing Override 追加
 *   - _rels/.rels
 *   - xl/workbook.xml + xl/_rels/workbook.xml.rels
 *   - xl/worksheets/sheet1.xml(末尾に `<drawing r:id="rId1"/>` 追加)
 *   - xl/worksheets/_rels/sheet1.xml.rels(drawing への rel)
 *   - xl/drawings/drawing1.xml(anchor 定義)
 *   - xl/drawings/_rels/drawing1.xml.rels(chart への rel)
 *   - xl/charts/chart1.xml(chart 定義)
 */
function xlsxEscape(s: string): string {
  return s.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildChartXml(chart: ChartConfig, evaluated: string[][], sheetName: string): string {
  const start = Math.max(0, chart.startRow);
  const end = chart.endRow ?? evaluated.length;
  const dataStart = start + 1; // xlsx 1-indexed
  const dataEnd = Math.min(end, evaluated.length);
  // X 軸 cell range
  const xColLetter = colIndexToLetter(chart.xCol);
  const xRange = `${xlsxEscape(sheetName)}!$${xColLetter}$${dataStart}:$${xColLetter}$${dataEnd}`;
  // OOXML chart kind 対応:scatter/radar/polarArea は bar に fallback(警告は出さず silent)
  const chartElement = (() => {
    switch (chart.kind) {
      case 'line': return { tag: 'c:lineChart', wrap: '<c:grouping val="standard"/>' };
      case 'pie': return { tag: 'c:pieChart', wrap: '' };
      case 'doughnut': return { tag: 'c:doughnutChart', wrap: '<c:firstSliceAng val="0"/><c:holeSize val="50"/>' };
      default: return { tag: 'c:barChart', wrap: '<c:barDir val="col"/><c:grouping val="clustered"/>' };
    }
  })();
  const isCircular = chart.kind === 'pie' || chart.kind === 'doughnut';
  const seriesXml = chart.yCols.map((yc, idx) => {
    const yColLetter = colIndexToLetter(yc);
    const yRange = `${xlsxEscape(sheetName)}!$${yColLetter}$${dataStart}:$${yColLetter}$${dataEnd}`;
    return `<c:ser>
      <c:idx val="${idx}"/>
      <c:order val="${idx}"/>
      <c:tx><c:v>${xlsxEscape(colIndexToLetter(yc))}</c:v></c:tx>
      <c:cat><c:strRef><c:f>${xRange}</c:f></c:strRef></c:cat>
      <c:val><c:numRef><c:f>${yRange}</c:f></c:numRef></c:val>
    </c:ser>`;
  }).join('');
  const chartInner = `${chartElement.wrap}${seriesXml}${isCircular ? '' : `<c:axId val="1"/><c:axId val="2"/>`}`;
  const tag = chartElement.tag; // 例 'c:barChart'
  const plotArea = isCircular
    ? `<c:plotArea><c:layout/><${tag}>${chartInner}</${tag}></c:plotArea>`
    : `<c:plotArea><c:layout/><${tag}>${chartInner}</${tag}><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx></c:plotArea>`;
  const titleXml = chart.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${xlsxEscape(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
    : '';
  const legendXml = chart.legend !== false
    ? `<c:legend><c:legendPos val="r"/></c:legend>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    ${titleXml}
    ${plotArea}
    ${legendXml}
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function buildDrawingXml(charts: ReadonlyArray<ChartConfig>): string {
  // 各 chart を sheet 上に anchor(縦に並べる、各 chart は col 1 - col 8、
  // row offset 16 ずつ)。
  const anchors = charts.map((_, idx) => {
    const fromRow = idx * 16;
    const toRow = fromRow + 15;
    return `<xdr:twoCellAnchor>
      <xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
      <xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
      <xdr:graphicFrame macro="">
        <xdr:nvGraphicFramePr>
          <xdr:cNvPr id="${idx + 2}" name="Chart ${idx + 1}"/>
          <xdr:cNvGraphicFramePr/>
        </xdr:nvGraphicFramePr>
        <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
        <xdr:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
            <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${idx + 1}"/>
          </a:graphicData>
        </xdr:graphic>
      </xdr:graphicFrame>
      <xdr:clientData/>
    </xdr:twoCellAnchor>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${anchors}
</xdr:wsDr>`;
}

export function buildXlsxFiles(body: SpreadsheetBody, sheetName: string = 'Sheet1'): XlsxFile[] {
  const evaluated = evaluateBody(body);
  const cols = getColumnCount(body);
  const charts = body.charts ?? [];

  // sheet rows
  const sheetRows: string[] = [];
  for (let r = 0; r < evaluated.length; r++) {
    const cells: string[] = [];
    for (let c = 0; c < cols; c++) {
      const v = evaluated[r]?.[c] ?? '';
      if (v === '') continue;
      const ref = `${colIndexToLetter(c)}${r + 1}`;
      const isNum = /^-?[0-9.]+$/.test(v.trim()) && v.trim() !== '';
      if (isNum) {
        cells.push(`<c r="${ref}"><v>${xlsxEscape(v.trim())}</v></c>`);
      } else {
        cells.push(`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xlsxEscape(v)}</t></is></c>`);
      }
    }
    sheetRows.push(`<row r="${r + 1}">${cells.join('')}</row>`);
  }

  // Sheet XML(chart 有り無しで `<drawing>` element 切替)
  const drawingRef = charts.length > 0 ? '<drawing r:id="rId1"/>' : '';
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetData>
${sheetRows.join('\n')}
</sheetData>
${drawingRef}
</worksheet>`;

  // Content_Types
  const chartOverrides = charts.map((_, i) =>
    `<Override PartName="/xl/charts/chart${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`).join('\n');
  const drawingOverride = charts.length > 0
    ? `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
    : '';
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
${drawingOverride}
${chartOverrides}
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xlsxEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const files: XlsxFile[] = [
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRels },
    { name: 'xl/worksheets/sheet1.xml', content: sheet },
  ];

  if (charts.length > 0) {
    // sheet → drawing rel
    files.push({
      name: 'xl/worksheets/_rels/sheet1.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`,
    });
    // drawing.xml
    files.push({
      name: 'xl/drawings/drawing1.xml',
      content: buildDrawingXml(charts),
    });
    // drawing → chart rels
    const drawingRels = charts.map((_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`).join('\n');
    files.push({
      name: 'xl/drawings/_rels/drawing1.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${drawingRels}
</Relationships>`,
    });
    // 各 chartN.xml
    for (let i = 0; i < charts.length; i++) {
      files.push({
        name: `xl/charts/chart${i + 1}.xml`,
        content: buildChartXml(charts[i]!, evaluated, sheetName),
      });
    }
  }

  return files;
}

// user direction 2026-06-02「ODF 廃止、xlsx あれば不要」 ── ODF .fods export
// 完全撤去。export は CSV + XLSX の 2 経路に集約。
