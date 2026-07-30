/**
 * サイドバー行の窓化(L3-S4/S5、2026-07-27)── 純粋計算 + spacer 管理。
 *
 * ## 何を買うか
 *
 * DOM ノードそのものを減らす。3,000 entries で partition_alloc + blink_gc が
 * 16 → 59MB(§8-4 実測)、行 memo の溜め込みを止めた後も**画面に付いている行**
 * は全部 DOM に居る。窓化するとそこが可視ぶん + overscan だけになる。
 *
 * ⚠ `content-visibility: auto`(PR #183)が既に off-screen の layout/paint を
 * 止めているので、**窓化が上積みで買えるのは「DOM ノードのメモリ + 生成
 * コスト + memo 指紋比較 + append」だけ**。layout/paint 分の二重取りはできない。
 * 効果はその前提で読むこと。
 *
 * ## 発動条件を二重に絞る(壊れ方が静かなので)
 *
 * 窓化の事故は「例外も test failure も出ない」型になる(選択が無反応・
 * 末尾でもないのに停止・行が出ない)。だから
 *   ① 単位行高が実測できる(> 0)
 *   ② 論理行数 >= MIN_ROWS
 * を**両方**満たすときだけ発動し、片方でも欠けたら全件描画に落ちる。
 * happy-dom(高さ 0)と小 N の既存 test は**構造的に**旧経路のままになる。
 *
 * ## 単位行高は「実測」する。定数化できない
 *
 * 24.91px は既定構成の値にすぎず、モバイル 48px / `theme.scale` 1.5 で
 * 36.88px になる。さらに **`content-visibility:auto` の行は未表示だと
 * 39px という嘘の高さを返す**(scrollHeight が真値の約 1.45 倍)。
 * よって測るのは **今 viewport に入っている行の `getBoundingClientRect()`**
 * であって、`scrollHeight / 行数` ではない。
 */

/** 窓化を発動する最小の論理行数(これ未満は全件描画のほうが速い)。 */
export const SIDEBAR_VIRTUAL_MIN_ROWS = 200;

/**
 * 窓の上下に余分に描く行数。スクロール中に空白が見えないための余白で、
 * ここを削ると速いが「白い帯」が出る。行高の実測誤差の吸収も兼ねる。
 */
export const SIDEBAR_VIRTUAL_OVERSCAN = 12;

export interface WindowRange {
  /** 描画する最初の論理 index(含む)。 */
  start: number;
  /** 描画する最後の論理 index + 1(含まない)。 */
  end: number;
}

export interface WindowInput {
  scrollTop: number;
  viewportHeight: number;
  unitHeight: number;
  total: number;
  overscan?: number;
}

/**
 * 可視範囲 + overscan の論理 index 範囲を出す(純関数)。
 *
 * 端の扱い:負の scrollTop(iOS のバウンス)や、viewportHeight が 0 の
 * 瞬間(display:none 直後)でも**必ず 1 行以上**返す ── 0 行を返すと
 * 「リストが空」と区別が付かない画面になる。
 */
export function computeWindowRange(input: WindowInput): WindowRange {
  const { total } = input;
  if (total <= 0) return { start: 0, end: 0 };
  const unit = input.unitHeight > 0 ? input.unitHeight : 1;
  const overscan = input.overscan ?? SIDEBAR_VIRTUAL_OVERSCAN;
  const scrollTop = Math.max(0, input.scrollTop);
  const viewport = Math.max(0, input.viewportHeight);

  const firstVisible = Math.floor(scrollTop / unit);
  const visibleCount = Math.ceil(viewport / unit) + 1; // 端の半端行を含める
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(total, Math.max(start + 1, firstVisible + visibleCount + overscan));
  return { start, end };
}

/**
 * 単位行高を実測する。測れなければ null(= 窓化しない)。
 *
 * ⚠ `scrollHeight / 行数` で出さないこと。`content-visibility:auto` の
 * 未表示行は嘘の高さ(実測 39px vs 真値 24.91px)を返すので、**今 DOM に
 * 居る実行 li の rect** を使う。複数行あるときは最頻値ではなく
 * **中央値**(選択行の装飾差など外れ値 1 件に引きずられないため)。
 */
export function measureUnitRowHeight(list: Element | null | undefined): number | null {
  if (!list) return null;
  const rows = list.querySelectorAll<HTMLElement>('li.pkc-entry-item[data-pkc-lid]');
  if (rows.length === 0) return null;
  const heights: number[] = [];
  for (let i = 0; i < rows.length && heights.length < 9; i++) {
    const h = rows[i]!.getBoundingClientRect().height;
    if (h > 0) heights.push(h);
  }
  if (heights.length === 0) return null;
  heights.sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)]!;
}

/** 窓化を発動してよいか(単位行高が測れる かつ 行数が閾値以上)。 */
export function shouldVirtualize(unitHeight: number | null, total: number): unitHeight is number {
  return unitHeight !== null && unitHeight > 0 && total >= SIDEBAR_VIRTUAL_MIN_ROWS;
}

/** spacer は `li` で作る(UL の直下に非 li を置くと CSS の子孫規則が崩れる)。 */
function makeSpacer(doc: Document, position: 'top' | 'bottom'): HTMLElement {
  const li = doc.createElement('li');
  li.className = 'pkc-entry-spacer';
  li.setAttribute('data-pkc-spacer', position);
  li.setAttribute('aria-hidden', 'true');
  // 行として数えられない・押せない・選べないことを明示する。
  li.style.padding = '0';
  li.style.margin = '0';
  li.style.border = '0';
  li.style.pointerEvents = 'none';
  return li;
}

/**
 * 窓の外にある行ぶんの高さを spacer で埋める。
 *
 * scrollbar の長さと scrollTop の意味を「全行あるとき」と同じに保つのが目的。
 * これが無いと、窓を描き替えるたびに scroll 位置が飛ぶ。
 */
export function applySpacers(
  list: HTMLElement,
  range: WindowRange,
  unitHeight: number,
  total: number,
): void {
  const doc = list.ownerDocument;
  const topPx = Math.max(0, range.start) * unitHeight;
  const bottomPx = Math.max(0, total - range.end) * unitHeight;

  let top = list.firstElementChild as HTMLElement | null;
  if (!top || top.getAttribute('data-pkc-spacer') !== 'top') {
    top = makeSpacer(doc, 'top');
    list.insertBefore(top, list.firstChild);
  }
  top.style.height = `${topPx}px`;

  let bottom = list.lastElementChild as HTMLElement | null;
  if (!bottom || bottom.getAttribute('data-pkc-spacer') !== 'bottom') {
    bottom = makeSpacer(doc, 'bottom');
    list.appendChild(bottom);
  }
  bottom.style.height = `${bottomPx}px`;
}

/**
 * 論理 index の行が画面に入るような scrollTop を出す。
 *
 * 窓化中は「選択行の DOM を探して scrollIntoView」ができない(窓の外だと
 * 要素が存在せず、**黙って return** して「選んだのに見えない」になる)。
 * 代わりに位置を計算して scroll する。
 */
export function scrollOffsetForIndex(
  index: number,
  unitHeight: number,
  viewportHeight: number,
  currentScrollTop: number,
): number | null {
  const rowTop = index * unitHeight;
  const rowBottom = rowTop + unitHeight;
  if (rowTop < currentScrollTop) return rowTop;
  if (rowBottom > currentScrollTop + viewportHeight) {
    return Math.max(0, rowBottom - viewportHeight);
  }
  return null; // 既に見えている ── 動かさない(震え防止)
}
