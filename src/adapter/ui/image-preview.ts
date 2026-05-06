/**
 * Image preview (PR-N simplification, 2026-05-06).
 *
 * User direction:
 * > 画像表示した時に等倍にすると画面外にはみ出すし、スクロールも
 * > できない。というか、これ、ブラウザ標準の画像ビューわ使えばよく
 * > ない?
 *
 * 旧:Document PiP / `window.open` で fallback、独自 toolbar / 等倍 /
 * fit ボタン / pinch-zoom touch handlers / Copy link。~430 行。
 *
 * 新:**browser native の画像表示に丸投げ**(`window.open(dataUrl,
 * '_blank')`)。ブラウザの標準 image viewer は:
 *   - 等倍 click でフルサイズ + scrollbar を OS 流儀で出す
 *   - iPhone Safari は pinch zoom を native で許可
 *   - Save / 画像をコピー / 別タブで保存 等の OS context menu が使える
 *
 * 旧 toolbar(等倍ボタン / fit ボタン / プリセット / Copy link)は撤去。
 * Copy link は entry detail meta pane の 🔗 Copy permalink で同等機能を
 * 達成できるため、image preview 側の Copy link button は不要。
 *
 * `renderImagePreviewModal` は renderer.ts が import している no-op
 * placeholder のため shape だけ維持(<div hidden>)。後続 cleanup PR で
 * 完全削除予定。
 */

export interface ImagePreviewSource {
  /** Data URL or remote URL of the image. */
  src: string;
  /** Display alt + label for the image. */
  label: string;
  /** Optional pkc:// or https:// permalink. Currently unused — kept in
   *  the type so existing call-sites don't break. */
  permalink?: string;
}

/**
 * Open the image in a new browser tab using the browser's native image
 * viewer. Pop-up blocking falls back to the same `window.open` call but
 * with `_blank` target which most browsers honor for user-initiated
 * actions(click handler in action-binder).
 */
export async function openImagePreview(source: ImagePreviewSource): Promise<void> {
  // For data: URLs, we directly open them. Modern browsers display
  // images natively at full size with scroll + pinch-zoom support.
  // The viewer behavior (1:1 default, click-to-zoom, save context menu)
  // is OS-managed and matches user mental model of "this is an image".
  const opened = window.open(source.src, '_blank', 'noopener');
  if (!opened) {
    // Pop-up blocked. Surface a non-disruptive console warn; the user
    // can right-click → "Open image in new tab" via the existing entry
    // detail surface as fallback.
    console.warn('[image-preview] popup blocked; user should allow popups for PKC2');
  }
}

/** No-op kept for action-binder API surface compat. */
export function closeImagePreview(): void {
  /* native browser tab — user closes it via the OS. */
}

/** No-op stub kept for renderer.ts compat — modal removed in PR-B / N. */
export function renderImagePreviewModal(): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.hidden = true;
  placeholder.setAttribute('data-pkc-region', 'image-preview-noop');
  return placeholder;
}
