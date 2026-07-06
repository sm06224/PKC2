/**
 * Measure the REAL pixel Y of given source lines inside a textarea,
 * wrap-aware, via the mirror-div technique (same style-copy contract
 * as caret-position.ts).
 *
 * なぜ必要か(2026-07 split-sync rebuild):旧同期は「行番号 × 行高」
 * や「ブロック高 ÷ 行数」の比例近似で editor 側の行位置を推定していた。
 * textarea は soft-wrap するので長い行は複数の視覚行を占め、近似は
 * 折り返しのたびに累積誤差を生む — 記録された主要故障モード(行ズレ)
 * の editor 側半分。mirror div に同じ折り返し条件で本文を流し込み、
 * アンカー行の先頭に zero-width marker を置いて実測すれば、誤差は
 * サブピクセルに落ちる。
 *
 * 計測は「写像テーブル再構築時」のみ(スクロール毎ではない)。本文 +
 * 各アンカー行 marker の 1 mirror を作り、1 layout pass で全行を読む。
 */

/** Style properties copied to the mirror so wrapping matches exactly. */
const COPIED_STYLE_PROPS: readonly string[] = [
  'boxSizing',
  'width',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'whiteSpace',
  'wordWrap',
  'overflowWrap',
];

/**
 * Return a map `sourceLine → content-space Y` (px from the top of the
 * textarea's scrollable content, i.e. directly comparable to
 * `textarea.scrollTop`) for each requested 0-indexed line.
 *
 * Lines outside the text's range are clamped to the end-of-text Y.
 * Returns an empty map when the document is not available (SSR guard).
 */
export function measureEditorLineTops(
  textarea: HTMLTextAreaElement,
  lines: readonly number[],
): Map<number, number> {
  const result = new Map<number, number>();
  if (lines.length === 0 || typeof document === 'undefined') return result;

  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  const ms = mirror.style;
  ms.position = 'absolute';
  ms.visibility = 'hidden';
  ms.top = '0';
  ms.left = '-9999px';
  ms.whiteSpace = 'pre-wrap';
  ms.wordWrap = 'break-word';
  for (const prop of COPIED_STYLE_PROPS) {
    const value =
      (computed as unknown as Record<string, string | undefined>)[prop];
    if (typeof value === 'string') {
      (ms as unknown as Record<string, string>)[prop] = value;
    }
  }
  ms.height = 'auto';
  ms.overflow = 'hidden';

  // Vertical-scrollbar gutter correction — identical rationale to
  // caret-position.ts (PR-2JJ v2): the textarea's content area is
  // narrower by the scrollbar width, the mirror has no scrollbar, and
  // an uncorrected mirror wraps long lines one column later, producing
  // cumulative Y drift.
  const borderLeftWidth = parseFloat(computed.borderLeftWidth) || 0;
  const borderRightWidth = parseFloat(computed.borderRightWidth) || 0;
  const gutter = Math.max(
    0,
    textarea.offsetWidth - textarea.clientWidth - borderLeftWidth - borderRightWidth,
  );
  if (gutter > 0) {
    const w = parseFloat(ms.width) || 0;
    if (w > 0) ms.width = `${w - gutter}px`;
  }

  // Build content: text runs interleaved with zero-width markers at the
  // start of each requested line. A ZWSP-only inline span does not
  // affect wrapping but has measurable line geometry.
  const wanted = new Set<number>();
  for (const l of lines) if (l >= 0 && Number.isFinite(l)) wanted.add(Math.floor(l));
  const srcLines = textarea.value.split('\n');
  const markers = new Map<number, HTMLSpanElement>();
  const frag = document.createDocumentFragment();
  for (let i = 0; i < srcLines.length; i++) {
    if (wanted.has(i)) {
      const marker = document.createElement('span');
      marker.textContent = '​';
      markers.set(i, marker);
      frag.appendChild(marker);
    }
    frag.appendChild(
      document.createTextNode(i < srcLines.length - 1 ? `${srcLines[i]}\n` : srcLines[i] ?? ''),
    );
  }
  mirror.appendChild(frag);

  document.body.appendChild(mirror);
  const mirrorRect = mirror.getBoundingClientRect();
  const mirrorTop = mirrorRect.top + (parseFloat(computed.borderTopWidth) || 0);
  let lastY = 0;
  for (const [line, marker] of markers) {
    const r = marker.getBoundingClientRect();
    const y = r.top - mirrorTop;
    result.set(line, y);
    if (y > lastY) lastY = y;
  }
  // Clamp out-of-range requests to the measured end.
  for (const l of wanted) {
    if (!result.has(l)) result.set(l, lastY);
  }
  document.body.removeChild(mirror);
  return result;
}
