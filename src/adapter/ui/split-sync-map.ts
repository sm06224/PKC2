/**
 * Split-editor sync — piecewise-linear scroll mapping (2026-07 rebuild).
 *
 * 旧実装(source-preview-sync.ts 2026-05-05 世代)は「caret の載る
 * ブロックを探し、ブロック高さ ÷ ソース行数の比例割りで行位置を推定し、
 * comfort band に押し込む」方式だった。比例割りは折り返し行・画像・
 * mermaid・幅で高さが変わる要素で即座に破綻し(診断 spec 記録:「画面幅に
 * よって縦幅を変えるオブジェクトがあると、あっという間に表示ずれている」)、
 * band ヒューリスティックは「一度しかジャンプしない」「wheel 後の再選択で
 * 戻らない」等の 11 hotfix を生んだ。
 *
 * 本 rebuild は VS Code / Typora と同じ **アンカー対の piecewise-linear
 * 写像** を使う:
 *
 *   - preview 側: `data-pkc-source-line` を持つ各ブロックの **実測**
 *     content-Y(getBoundingClientRect + scrollTop)
 *   - editor 側: 同じソース行の textarea 内 **実測** content-Y
 *     (mirror-div、editor-line-metrics.ts — 折り返しを正確に反映)
 *
 *   → (editorY, previewY) の単調ペア列。scrollTop 空間の両端
 *     {0,0} / {editorMax, previewMax} を付けて線形補間すれば、
 *     どちらの pane の scrollTop からも相手の scrollTop が連続・単調に
 *     決まる。行 1:1 の N:M 問題(原理不能、PR #256 findings)は
 *     回避したまま、「二つのペインが一緒に動く」同期スクロールになる。
 *
 * 本 module は **純関数のみ**(DOM なし)。DOM からのペア収集と
 * イベント結線は source-preview-sync.ts が担う。
 */

/** One correspondence point: content-space Y in each pane. */
export interface AnchorPair {
  /** Editor (textarea) content Y of the source line's top, px. */
  editorY: number;
  /** Preview content Y of the anchored block's top, px. */
  previewY: number;
}

/**
 * Sort by `editorY` and enforce STRICT monotonicity on both axes.
 *
 * Raw pairs come from nested anchored elements (list > list-item share
 * a start line), out-of-document-order rects (floats), and rounding
 * noise. A non-monotonic pair would make the interpolation locally
 * reverse direction — the scroll would "wiggle backwards" mid-wheel.
 * Policy: keep the FIRST pair at each editorY (outermost block wins,
 * matching document order), then drop any pair whose previewY does not
 * strictly increase over the last kept pair.
 */
export function buildMonotonicPairs(raw: readonly AnchorPair[]): AnchorPair[] {
  const sorted = [...raw].sort((a, b) => a.editorY - b.editorY);
  const out: AnchorPair[] = [];
  for (const p of sorted) {
    if (!Number.isFinite(p.editorY) || !Number.isFinite(p.previewY)) continue;
    const last = out[out.length - 1];
    if (last) {
      if (p.editorY <= last.editorY) continue; // same line / dup → first wins
      if (p.previewY <= last.previewY) continue; // would reverse → drop
    }
    out.push(p);
  }
  return out;
}

/**
 * Build the full scrollTop-space mapping table: monotonic anchor pairs
 * clamped to each pane's scrollable range, with exact endpoint pairs
 * `{0,0}` and `{editorMaxScroll, previewMaxScroll}` appended so both
 * extremes align (editor at very top ⇔ preview at very top; editor at
 * very bottom ⇔ preview at very bottom).
 *
 * `editorMaxScroll` / `previewMaxScroll` = `scrollHeight - clientHeight`
 * of each pane (>= 0). Interior pairs that fall outside `(0, max)` on
 * either axis are dropped — they can't be scroll targets anyway and
 * would break endpoint monotonicity.
 */
export function buildScrollMapping(
  anchors: readonly AnchorPair[],
  editorMaxScroll: number,
  previewMaxScroll: number,
): AnchorPair[] {
  const eMax = Math.max(0, editorMaxScroll);
  const pMax = Math.max(0, previewMaxScroll);
  const interior = buildMonotonicPairs(anchors).filter(
    (p) => p.editorY > 0 && p.editorY < eMax && p.previewY > 0 && p.previewY < pMax,
  );
  return buildMonotonicPairs([
    { editorY: 0, previewY: 0 },
    ...interior,
    { editorY: eMax, previewY: pMax },
  ]);
}

/**
 * Piecewise-linear interpolation over a monotonic pair table.
 * `x` is a position on the `from` axis; returns the corresponding
 * position on the `to` axis, clamped to the table's range.
 *
 * Degenerate tables (0–1 pairs, or zero-width segment) degrade to the
 * nearest endpoint — never NaN.
 */
function interpolate(
  pairs: readonly AnchorPair[],
  x: number,
  from: keyof AnchorPair,
  to: keyof AnchorPair,
): number {
  if (pairs.length === 0) return 0;
  const first = pairs[0]!;
  const last = pairs[pairs.length - 1]!;
  if (x <= first[from]) return first[to];
  if (x >= last[from]) return last[to];
  // Binary search: greatest index with pairs[i][from] <= x.
  let lo = 0;
  let hi = pairs.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pairs[mid]![from] <= x) lo = mid;
    else hi = mid;
  }
  const a = pairs[lo]!;
  const b = pairs[hi]!;
  const span = b[from] - a[from];
  if (span <= 0) return a[to];
  const t = (x - a[from]) / span;
  return a[to] + t * (b[to] - a[to]);
}

/** Editor scrollTop → preview scrollTop. */
export function mapEditorToPreview(pairs: readonly AnchorPair[], editorY: number): number {
  return interpolate(pairs, editorY, 'editorY', 'previewY');
}

/** Preview scrollTop → editor scrollTop (inverse mapping). */
export function mapPreviewToEditor(pairs: readonly AnchorPair[], previewY: number): number {
  return interpolate(pairs, previewY, 'previewY', 'editorY');
}
