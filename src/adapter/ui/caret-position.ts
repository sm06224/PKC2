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

/**
 * Per-textarea caret position cache.
 *
 * The mirror-div technique requires `appendChild → measure →
 * removeChild` on `document.body` for every call. During scroll
 * events on Chrome (especially Mac with momentum scrolling), this
 * causes a layout thrash that interferes with the scroll inertia
 * — the user reports "scroll up then immediately down bounces
 * back".
 *
 * Cache strategy:
 *   - Cache hit when textarea identity, text value, and caret
 *     position are all unchanged (= caret hasn't moved or text
 *     hasn't changed since last computation).
 *   - On hit, return current viewport coords by combining cached
 *     textarea-relative offsets with the current bounding rect +
 *     scroll offset (cheap arithmetic, no DOM mutation).
 *   - On miss (caret moved / text edited / first call), run the
 *     full mirror-div computation and refresh the cache.
 */
interface CaretCache {
  textarea: HTMLTextAreaElement;
  value: string;
  position: number;
  /** Caret offset from textarea's top edge (= mirror-relative relTop) */
  relTop: number;
  /** Caret offset from textarea's left edge */
  relLeft: number;
  height: number;
}

let caretCache: CaretCache | null = null;

/**
 * Invalidate the cache. Call when the textarea's value changes
 * outside the normal `selectionchange` / `input` flow (e.g. during
 * teardown).
 */
export function invalidateCaretCache(): void {
  caretCache = null;
}

export function getCaretViewportCoords(
  textarea: HTMLTextAreaElement,
  position: number = textarea.selectionStart ?? 0,
): CaretViewportCoords {
  // Cache hit fast path: caret position + text content unchanged
  // since last call → reuse cached textarea-relative offsets and
  // recompute viewport coords from current bounding rect + scroll
  // offset. Skips the mirror-div thrash that interferes with
  // Chrome's scroll inertia on Mac.
  if (
    caretCache
    && caretCache.textarea === textarea
    && caretCache.value === textarea.value
    && caretCache.position === position
  ) {
    const taRect = textarea.getBoundingClientRect();
    return {
      top: taRect.top + caretCache.relTop - textarea.scrollTop,
      left: taRect.left + caretCache.relLeft - textarea.scrollLeft,
      height: caretCache.height,
    };
  }

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

  // Refresh cache: store textarea-relative offsets so subsequent
  // scroll-only calls can return without rebuilding the mirror.
  caretCache = {
    textarea,
    value: textarea.value,
    position,
    relTop,
    relLeft,
    height,
  };

  return { top, left, height };
}
