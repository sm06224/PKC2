/**
 * center pane のブロック窓化 ── **純粋計算部分**(C3-a、2026-07-28)。
 *
 * ## サイドバー窓化(L3-S5)との決定的な違い
 *
 * サイドバーは**行高が一様**(既定構成で中央値 24.91px)だったので、
 * `unitHeight × index` で任意の行の位置が出せた。**本文のブロックは一様ではない**
 * ── 段落と 20 行の表で桁が違う。よって本モジュールは
 *
 *   「単位高 × 個数」ではなく **ブロックごとの高さ表 + 累積オフセット**
 *
 * を持つ。未測定のブロックは推定値で埋め、可視化された時点で実測に差し替える。
 *
 * ## なぜ窓化するのか(実測)
 *
 * 120KB の本文 → 生 HTML 1,544KB / **21,416 要素**、`innerHTML` に **1,291ms**。
 * 一部だけ入れると要素数に**線形**:
 *
 * | 挿入量 | 要素 | innerHTML |
 * |---|---|---|
 * | 10% | 2,131 | **128 ms** |
 * | 25% | 5,267 | 339 ms |
 * | 50% | 10,531 | 613 ms |
 * | 100% | 21,416 | 1,291 ms |
 *
 * `content-visibility: auto` を足すだけでは layout/paint しか飛ばず、
 * **DOM 構築(この 1,291ms の主因)は消えない**。だからスペーサー方式を採る。
 *
 * ## 🔴 高さを測るときの罠
 *
 * `content-visibility: auto` の**未表示要素は嘘の高さを返す**
 * (サイドバーで実測: 39px vs 真値 24.91px)。よって測ってよいのは
 * **いま viewport に入っているブロックだけ**である。
 * `measureVisibleBlockHeights()` はその制約を型と実装の両方で表現している。
 *
 * ## 推定値に中央値を使う理由
 *
 * 平均だと**表 1 個**のような外れ値に引きずられ、未測定ブロックの推定が
 * 大きくなりすぎてスクロールバーが嘘をつく。中央値なら「よくあるブロック」に寄る。
 */

/** これ未満のブロック数では窓化しない(全部出したほうが速い)。 */
export const CENTER_BLOCK_MIN_BLOCKS = 40;

/**
 * 窓の上下に余分に出すブロック数。
 * サイドバー(12 行)より小さいのは、1 ブロックが行より遥かに重いため。
 */
export const CENTER_BLOCK_OVERSCAN = 4;

/**
 * 1 度も測っていないときの推定高(px)。
 * 段落 2〜3 行ぶんの控えめな値 ── 大きすぎると scrollHeight が膨らんで
 * 「スクロールしても終わらない」に見える。
 */
export const CENTER_BLOCK_DEFAULT_ESTIMATE = 48;

export interface BlockMetrics {
  /** ブロック数(論理値。DOM に何個居るかとは無関係)。 */
  readonly count: number;
  /** 各ブロックの実測高(px)。未測定は null。 */
  readonly heights: readonly (number | null)[];
  /** 未測定ブロックに使う推定高。実測の中央値、無ければ既定値。 */
  readonly estimate: number;
  /**
   * 畳んだ見出しの中に隠れているブロック(C3-d)。**高さ 0 として扱う**。
   *
   * これが無いと、user が `<details>` を畳んだ瞬間に「累積オフセットは
   * 全ブロックぶんあるのに画面は縮んでいる」状態になり、窓の index と
   * 画面が食い違う ── 例外も test failure も出ない壊れ方をする。
   */
  readonly hidden: ReadonlySet<number>;
}

/** 全ブロック未測定の状態を作る。 */
export function makeBlockMetrics(count: number): BlockMetrics {
  return {
    count: Math.max(0, count),
    heights: new Array<number | null>(Math.max(0, count)).fill(null),
    estimate: CENTER_BLOCK_DEFAULT_ESTIMATE,
    hidden: new Set<number>(),
  };
}

/** 中央値(空なら null)。外れ値 1 個に引きずられないため平均は使わない。 */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/**
 * 実測値を取り込んだ新しい metrics を返す(純関数)。
 *
 * 推定高は**取り込み後の全実測**から引き直す ── 測るほど推定が実態に寄り、
 * スクロールバーの嘘が減っていく。
 */
export function withMeasured(
  metrics: BlockMetrics,
  measured: ReadonlyMap<number, number>,
): BlockMetrics {
  if (measured.size === 0) return metrics;
  const heights = [...metrics.heights];
  for (const [index, height] of measured) {
    if (index < 0 || index >= heights.length) continue;
    // 0 以下は「測れていない」と同義。嘘を取り込まない。
    if (!(height > 0)) continue;
    heights[index] = height;
  }
  const known = heights.filter((h): h is number => h !== null);
  return {
    count: metrics.count,
    heights,
    estimate: median(known) ?? CENTER_BLOCK_DEFAULT_ESTIMATE,
    hidden: metrics.hidden,
  };
}

/** 幅が変わった等で全部測り直すとき。件数と畳み状態は保つ。 */
export function invalidateMeasurements(metrics: BlockMetrics): BlockMetrics {
  return { ...makeBlockMetrics(metrics.count), hidden: metrics.hidden };
}

/** index のブロックの高さ(畳まれていれば 0、実測が無ければ推定)。 */
export function heightOf(metrics: BlockMetrics, index: number): number {
  if (metrics.hidden.has(index)) return 0;
  return metrics.heights[index] ?? metrics.estimate;
}

/**
 * 累積オフセット。長さは `count + 1` で、`offsets[i]` = ブロック i の上端、
 * `offsets[count]` = 全体の高さ。
 */
export function cumulativeOffsets(metrics: BlockMetrics): number[] {
  const offsets = new Array<number>(metrics.count + 1);
  offsets[0] = 0;
  for (let i = 0; i < metrics.count; i += 1) {
    offsets[i + 1] = offsets[i]! + heightOf(metrics, i);
  }
  return offsets;
}

/** 全ブロックの高さの合計(= spacer 込みの scrollHeight の目標値)。 */
export function totalHeight(metrics: BlockMetrics): number {
  return cumulativeOffsets(metrics)[metrics.count] ?? 0;
}

/** `offsets` の中で `y` を含むブロックの index(二分探索)。 */
function blockIndexAt(offsets: readonly number[], y: number): number {
  let lo = 0;
  let hi = offsets.length - 2; // 最後は番兵
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid]! <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface BlockWindowInput {
  readonly metrics: BlockMetrics;
  readonly scrollTop: number;
  readonly viewportHeight: number;
  readonly overscan?: number;
}

export interface BlockWindowRange {
  /** 描画する最初のブロック index(含む)。 */
  readonly start: number;
  /** 描画する最後のブロック index + 1(含まない)。 */
  readonly end: number;
}

/**
 * 可視範囲 + overscan のブロック index 範囲(純関数)。
 *
 * 端の扱いはサイドバーと同じ規律 ── 負の scrollTop(iOS のバウンス)や
 * viewportHeight が 0 の瞬間(display:none 直後)でも**必ず 1 個以上**返す。
 * 0 個を返すと「本文が空」と区別が付かない画面になる。
 */
export function computeBlockWindow(input: BlockWindowInput): BlockWindowRange {
  const { metrics } = input;
  if (metrics.count <= 0) return { start: 0, end: 0 };

  const overscan = input.overscan ?? CENTER_BLOCK_OVERSCAN;
  const scrollTop = Math.max(0, input.scrollTop);
  const viewport = Math.max(0, input.viewportHeight);
  const offsets = cumulativeOffsets(metrics);

  const firstVisible = blockIndexAt(offsets, scrollTop);
  const lastVisible = blockIndexAt(offsets, scrollTop + viewport);

  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(metrics.count, Math.max(start + 1, lastVisible + 1 + overscan));
  return { start, end };
}

/** 窓化を発動してよいか(ブロック数が閾値以上)。 */
export function shouldWindowBlocks(count: number): boolean {
  return count >= CENTER_BLOCK_MIN_BLOCKS;
}

/**
 * 指定ブロックが画面に入る scrollTop(既に見えていれば null = 動かさない)。
 *
 * サイドバーの `scrollOffsetForIndex` と同じ役割。窓化中は
 * 「その要素を探して scrollIntoView」が使えない(DOM に居ないことがある)ので
 * 位置を計算する。
 */
export function scrollOffsetForBlock(
  metrics: BlockMetrics,
  index: number,
  viewportHeight: number,
  currentScrollTop: number,
): number | null {
  if (index < 0 || index >= metrics.count) return null;
  const offsets = cumulativeOffsets(metrics);
  const top = offsets[index]!;
  const bottom = offsets[index + 1]!;
  if (top < currentScrollTop) return top;
  if (bottom > currentScrollTop + viewportHeight) {
    return Math.max(0, bottom - viewportHeight);
  }
  return null; // 既に見えている ── 動かさない(震え防止)
}

/**
 * ブロックが見出しなら 1〜6、そうでなければ 0(C3-d、2026-07-28)。
 *
 * ブロック HTML の**先頭タグ**だけを見る。本文中に出てくる `<h2>`
 * (表の中など)を拾わないよう、必ず先頭に錨を打つ。
 */
export function headingLevelOfBlock(html: string): number {
  const m = /^\s*<h([1-6])[\s>]/i.exec(html);
  return m ? Number(m[1]) : 0;
}

/**
 * ブロック配列の見出し構造(C3-d)。
 *
 * `applyHeadingFold` は「次の同レベル以上の見出しまで」を 1 セクションにする。
 * **同じ判定をブロック配列の上でやる** ── ここがズレると、畳んだセクションと
 * 隠すブロックが食い違い、窓の index と画面が静かに食い違う
 * (サイドバー窓化の `flattenDisplayTree` と同じ規律)。
 */
export interface BlockOutline {
  /** 各ブロックの見出しレベル(0 = 見出しでない)。 */
  readonly levels: readonly number[];
}

export function computeBlockOutline(blocks: readonly string[]): BlockOutline {
  return { levels: blocks.map(headingLevelOfBlock) };
}

/**
 * 畳まれた見出し(block index の集合)から、**隠れるブロック**を出す。
 *
 * 見出し自身は隠れない(`<summary>` として残る)。入れ子の見出しは、
 * 外側が畳まれていれば一緒に隠れる。
 */
export function hiddenBlocks(
  outline: BlockOutline,
  collapsed: ReadonlySet<number>,
): Set<number> {
  const hidden = new Set<number>();
  const { levels } = outline;
  for (const head of collapsed) {
    const level = levels[head] ?? 0;
    if (level === 0) continue; // 見出しでない index は無視(壊れた入力)
    for (let i = head + 1; i < levels.length; i += 1) {
      const l = levels[i]!;
      if (l > 0 && l <= level) break; // 同レベル以上の見出し = セクションの終わり
      hidden.add(i);
    }
  }
  return hidden;
}

/** 隠れているブロックを差し替えた metrics(高さは保持 ── 開いたら戻る)。 */
export function withHidden(
  metrics: BlockMetrics,
  hidden: ReadonlySet<number>,
): BlockMetrics {
  return { ...metrics, hidden };
}
