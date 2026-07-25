/**
 * fence その場編集の行 splice(純関数)— code-edit-lite-design-2026-07 §4。
 *
 * 編集シードは **DOM ではなく entry body 原文の行 slice** から取る(rendered
 * source は preprocessor で原文と乖離しうる、設計 §1)。行番号は markdown-it
 * token.map 由来の `data-pkc-source-line` / `data-pkc-source-end`
 * (0-origin・end 排他、frontmatter strip 後基準 — caller が frontmatter
 * 行数を加算して全文基準へ換算してから渡す)。
 *
 * `body-sections.ts` の `replaceSectionText` と同型の split/join 方式
 * (改行は \r?\n split → \n join に正規化、既存前例踏襲)。
 */

export interface FenceSlice {
  /** entry body(全文)基準・0-origin の開き fence 行 index。 */
  readonly blockStart: number;
  /** 同・排他 end(閉じ fence 行の次)。 */
  readonly blockEndEx: number;
  /** fence の中身(開き / 閉じ fence 行を含まない)。 */
  readonly inner: string;
  /** 開き fence の info 文字列(`csv noheader` 等、trim 済み)。 */
  readonly info: string;
  /** 閉じ fence 行があるか(EOF 未閉鎖 fence では false)。 */
  readonly hasClosing: boolean;
}

const OPEN_RE = /^\s*(`{3,}|~{3,})\s*(.*)$/;

/**
 * body の [blockStart, blockEndEx) を fence block として解釈し、中身を
 * 切り出す。開き行が fence でない・範囲が不正なら null(caller は編集を
 * 開かず中止する — 黙って壊さない)。
 */
export function sliceFenceAt(
  body: string,
  blockStart: number,
  blockEndEx: number,
): FenceSlice | null {
  const lines = body.split(/\r?\n/);
  if (blockStart < 0 || blockEndEx > lines.length || blockEndEx <= blockStart) return null;
  const m = OPEN_RE.exec(lines[blockStart] ?? '');
  if (!m) return null;
  const marker = m[1]![0]!; // '`' or '~'
  const lastIdx = blockEndEx - 1;
  const closeRe = new RegExp(`^\\s*[${marker}]{3,}\\s*$`);
  const hasClosing = lastIdx > blockStart && closeRe.test(lines[lastIdx] ?? '');
  const innerEndEx = hasClosing ? lastIdx : blockEndEx;
  const inner = lines.slice(blockStart + 1, innerEndEx).join('\n');
  return { blockStart, blockEndEx, inner, info: (m[2] ?? '').trim(), hasClosing };
}

/**
 * fence の中身だけを newInner に差し替えた body を返す。開き / 閉じ fence
 * 行と前後は不変。editor 由来の末尾改行 1 つは正規化して落とす(閉じ
 * fence の前に空行が増殖しないように)。
 */
export function replaceFenceInner(
  body: string,
  slice: FenceSlice,
  newInner: string,
): string {
  const lines = body.split(/\r?\n/);
  const norm = newInner.endsWith('\n') ? newInner.slice(0, -1) : newInner;
  const innerEndEx = slice.hasClosing ? slice.blockEndEx - 1 : slice.blockEndEx;
  const before = lines.slice(0, slice.blockStart + 1);
  const after = lines.slice(innerEndEx);
  const mid = norm === '' ? [] : norm.split(/\r?\n/);
  return [...before, ...mid, ...after].join('\n');
}

/** body 先頭 frontmatter の行数(strip 済み行番号 → 全文行番号の換算用)。 */
export function frontmatterLineOffset(fullBody: string, strippedBody: string): number {
  const prefixLen = fullBody.length - strippedBody.length;
  let n = 0;
  for (let i = 0; i < prefixLen && i < fullBody.length; i++) {
    if (fullBody.charCodeAt(i) === 10) n++;
  }
  return n;
}
