/**
 * Compute pixel coordinates of the caret inside a `<textarea>`,
 * using the mirror-div technique:
 *
 *   1. Build a hidden `<div>` whose computed font / padding / border
 *      / line-height etc. match the textarea exactly.
 *   2. Insert text up to the caret position, then a marker span.
 *   3. Read the marker's bounding rect and translate to viewport
 *      coordinates relative to the textarea.
 *
 * Returns `{ top, left, height }` in **viewport** coordinates
 * (i.e. compatible with `position: fixed` placement). `height`
 * is the line-height at the caret line so callers can position a
 * floating element *below* the caret line without overlapping it.
 *
 * Pure DOM helper — no dispatcher / state coupling. Caller manages
 * lifecycle (call on focusin / selectionchange / input / scroll).
 */
export interface CaretViewportCoords {
  /** Caret top edge in viewport coords (= getBoundingClientRect-style) */
  top: number;
  /** Caret left edge in viewport coords */
  left: number;
  /** Line height at the caret position */
  height: number;
}

/**
 * Properties to copy from the textarea's computed style to the
 * mirror div so text wraps the same way. Order matters only for
 * readability; CSS cascade is identical.
 */
const COPIED_STYLE_PROPS: readonly (keyof CSSStyleDeclaration)[] = [
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
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

export function getCaretViewportCoords(
  textarea: HTMLTextAreaElement,
  position: number = textarea.selectionStart ?? 0,
): CaretViewportCoords {
  const taRect = textarea.getBoundingClientRect();
  const computed = window.getComputedStyle(textarea);

  // Build the off-screen mirror.
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
      (computed as unknown as Record<string, string | undefined>)[prop as string];
    if (typeof value === 'string') {
      (ms as unknown as Record<string, string>)[prop as string] = value;
    }
  }

  // Mirror textarea's intrinsic content area exactly. The textarea's
  // bounding rect already accounts for borders + padding; we set
  // height to `auto` so the mirror grows with content (we measure
  // inside, not at the box edges).
  ms.height = 'auto';
  ms.overflow = 'hidden';

  // PR-2JJ v2 hotfix(2026-05-13、user 報告「長大マークダウンで caret
  // overlay がズレていく」):textarea が縦 scrollbar を出している場合、
  // content area の幅が scrollbar gutter 分(~15-17px、OS / browser 依存)
  // 狭くなる。mirror div には scrollbar が出ないので、何も補正しないと
  // **wrap 位置が 1 行ずれて caret position の累積誤差** を生む。
  //
  // `offsetWidth - clientWidth - borderLeft - borderRight` で実測 scrollbar
  // gutter を算出し、mirror の `width` を同量だけ縮めて textarea と同じ
  // 折り返し挙動にする。
  //
  // 横 scrollbar の場合(`wordWrap` を切ってる稀な textarea)は本ロジックで
  // も補正されない(content area の幅は変わらないため)。
  const borderLeftWidth = parseFloat(computed.borderLeftWidth) || 0;
  const borderRightWidth = parseFloat(computed.borderRightWidth) || 0;
  const verticalScrollbarGutter = Math.max(
    0,
    textarea.offsetWidth - textarea.clientWidth - borderLeftWidth - borderRightWidth,
  );
  if (verticalScrollbarGutter > 0) {
    const mirrorWidthPx = parseFloat(ms.width) || 0;
    if (mirrorWidthPx > 0) {
      ms.width = `${mirrorWidthPx - verticalScrollbarGutter}px`;
    }
  }

  const valueBefore = textarea.value.slice(0, position);
  // Replace the trailing newline with newline + space so an
  // end-of-text caret has measurable geometry (otherwise the marker
  // span has zero height).
  mirror.textContent = valueBefore;
  const marker = document.createElement('span');
  // Zero-width-space gives the marker a measurable line geometry
  // even when the cursor sits at end-of-line.
  marker.textContent = '​';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  document.body.removeChild(mirror);

  // Marker position relative to mirror's content origin.
  const relTop = markerRect.top - mirrorRect.top;
  const relLeft = markerRect.left - mirrorRect.left;

  // Translate to the textarea's viewport position, accounting for
  // its scroll offset (long textareas may have scrolled the caret
  // partially out of view).
  const top = taRect.top + relTop - textarea.scrollTop;
  const left = taRect.left + relLeft - textarea.scrollLeft;
  // Use computed line-height as the caret height. Fall back to
  // marker height if line-height parses to NaN.
  const lineHeightPx = parseFloat(computed.lineHeight);
  const height =
    Number.isFinite(lineHeightPx) && lineHeightPx > 0
      ? lineHeightPx
      : markerRect.height || parseFloat(computed.fontSize) || 16;

  return { top, left, height };
}
