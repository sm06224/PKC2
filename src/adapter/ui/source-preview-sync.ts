/**
 * Source ↔ Preview synchronization (PR #206, 2026-04-29).
 *
 * The split editor (`pkc-text-split-editor`) shows a textarea and a
 * live-rendered preview side by side. This module wires them so:
 *
 *   1. **Editor → Preview**: as the caret moves in the textarea, the
 *      preview pane scrolls so the rendered block originating from
 *      the caret's line is visible. The active block carries
 *      `data-pkc-active-source` for CSS to apply a subtle indicator.
 *
 *   2. **Preview → Editor**: tap on a preview element with a
 *      `data-pkc-source-line` ancestor moves the caret to the start
 *      of that line in the textarea (and brings it into view).
 *
 * Anchoring relies on `data-pkc-source-line="<n>"` attributes the
 * markdown renderer (`tagSourceLines` in `features/markdown`) stamps
 * on every block-level token's rendered output. Top-level blocks —
 * paragraphs, headings, list items, code blocks, tables, blockquotes,
 * horizontal rules — all carry the attribute.
 *
 * Pure DOM helpers — no dispatcher / state coupling. The action
 * binder owns event wiring.
 */

import { getCaretViewportCoords } from './caret-position';

const ACTIVE_ATTR = 'data-pkc-active-source';
const MARKER_REGION = 'sync-marker';
const EDITOR_MARKER_REGION = 'sync-editor-marker';

/**
 * Render the floating overlay marker that visualises which preview
 * block the system currently maps the caret to. Translucent accent
 * fill + dashed accent border, hidden by default. Positioned by
 * `placeSyncMarker` whenever sync runs.
 *
 * Pure DOM — caller appends to the shell.
 */
export function renderSyncMarker(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pkc-sync-marker';
  el.setAttribute('data-pkc-region', MARKER_REGION);
  el.hidden = true;
  // pointer-events:none in CSS so taps pass through to the block.
  return el;
}

function findSyncMarker(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pkc-region="' + MARKER_REGION + '"]');
}

/**
 * Render the editor-side caret marker — a translucent accent bar
 * spanning the textarea's active line. Pairs with the preview-side
 * `pkc-sync-marker` so the user can see "you are here" on both
 * panes simultaneously.
 *
 * Hidden by default; positioned by `placeEditorCaretMarker`.
 */
export function renderEditorCaretMarker(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pkc-editor-caret-marker';
  el.setAttribute('data-pkc-region', EDITOR_MARKER_REGION);
  el.hidden = true;
  return el;
}

function findEditorCaretMarker(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pkc-region="' + EDITOR_MARKER_REGION + '"]');
}

/**
 * Position the floating marker over `target`'s bounding rect (in
 * viewport / fixed coordinates). Hides the marker when target is
 * null.
 */
export function placeSyncMarker(target: HTMLElement | null): void {
  const marker = findSyncMarker();
  if (!marker) return;
  if (!target) {
    marker.hidden = true;
    return;
  }
  const rect = target.getBoundingClientRect();
  // Hide when the target has zero geometry (display: none, detached
  // from layout) or when it has scrolled fully out of the viewport.
  // Keeping the marker visible while the active block is off-screen
  // is the "overlay left behind" bug — fixed by clipping here.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const offscreen =
    rect.width === 0
    || rect.height === 0
    || rect.bottom <= 0
    || rect.right <= 0
    || rect.top >= vh
    || rect.left >= vw;
  if (offscreen) {
    marker.hidden = true;
    return;
  }
  marker.hidden = false;
  marker.style.left = `${rect.left}px`;
  marker.style.top = `${rect.top}px`;
  marker.style.width = `${rect.width}px`;
  marker.style.height = `${rect.height}px`;
}

/**
 * Returns the source line (0-indexed) of the textarea caret. Counts
 * newlines from offset 0 to the current `selectionStart`.
 */
export function caretSourceLine(textarea: HTMLTextAreaElement): number {
  const pos = textarea.selectionStart ?? 0;
  let line = 0;
  for (let i = 0; i < pos; i++) {
    if (textarea.value.charCodeAt(i) === 10 /* \n */) line++;
  }
  return line;
}

/**
 * Find the preview element whose `data-pkc-source-line` is the
 * closest match for the given source line — preferring the latest
 * (= largest line) anchor at or before `targetLine`. Returns null
 * if no anchored element is at or before the target.
 */
export function findPreviewElementForLine(
  preview: Element,
  targetLine: number,
): HTMLElement | null {
  const anchored = preview.querySelectorAll<HTMLElement>('[data-pkc-source-line]');
  let best: HTMLElement | null = null;
  let bestLine = -1;
  for (const el of anchored) {
    const lineStr = el.getAttribute('data-pkc-source-line');
    if (lineStr === null) continue;
    const line = parseInt(lineStr, 10);
    if (!Number.isFinite(line)) continue;
    if (line <= targetLine && line > bestLine) {
      best = el;
      bestLine = line;
    }
  }
  return best;
}

/**
 * Read the source-line of an element by walking up to the closest
 * ancestor (or self) with `data-pkc-source-line`. Returns null if
 * there's no anchored ancestor (e.g. text inside a paragraph that
 * itself carries the anchor).
 */
export function findSourceLineForElement(el: Element): number | null {
  const anchored = el.closest<HTMLElement>('[data-pkc-source-line]');
  if (!anchored) return null;
  const lineStr = anchored.getAttribute('data-pkc-source-line');
  if (lineStr === null) return null;
  const line = parseInt(lineStr, 10);
  return Number.isFinite(line) ? line : null;
}

/**
 * Mark `el` as the active source anchor and clear the previous
 * active marker (if any) within `preview`. CSS uses
 * `[data-pkc-active-source]` to apply a subtle border / background
 * tint.
 */
function setActive(preview: Element, el: HTMLElement | null): void {
  const prev = preview.querySelectorAll<HTMLElement>('[' + ACTIVE_ATTR + ']');
  for (const p of prev) p.removeAttribute(ACTIVE_ATTR);
  if (el) el.setAttribute(ACTIVE_ATTR, '');
}

/**
 * Sync the preview pane to the textarea caret: find the preview
 * element matching the caret's source line, scroll it into view,
 * and mark it as active. No-op if the preview has no anchored
 * elements (e.g. plain-text fallback render path).
 */
export function syncPreviewToCaret(
  textarea: HTMLTextAreaElement,
  preview: Element,
): void {
  const line = caretSourceLine(textarea);
  const target = findPreviewElementForLine(preview, line);
  if (!target) {
    setActive(preview, null);
    placeSyncMarker(null);
    return;
  }
  setActive(preview, target);
  target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  // Place the floating overlay AFTER scrollIntoView so the marker's
  // bounding rect reflects the post-scroll position.
  placeSyncMarker(target);
}

/**
 * Sync the textarea caret to a preview element click: move the
 * caret to the START of the corresponding source line and bring it
 * into view. Returns true if the caret was moved, false if the
 * element has no anchored line (caller can decide whether to fall
 * through to default click handling, e.g. anchor navigation).
 */
export function syncCaretToPreview(
  textarea: HTMLTextAreaElement,
  el: Element,
): boolean {
  const line = findSourceLineForElement(el);
  if (line === null) return false;
  const offset = lineNumberToOffset(textarea.value, line);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = offset;
  // Scroll the textarea so the caret is visible. Modern browsers
  // do this automatically when focusing + setting selection range,
  // but `scrollIntoView` is a defensive belt-and-braces.
  return true;
}

/**
 * Position the editor-side caret marker over the textarea's active
 * line. Uses `getCaretViewportCoords` (mirror-div technique) for
 * accurate per-line vertical positioning even when the textarea
 * has wrapped lines or scrolled internally.
 *
 * Hides the marker when the caret line is scrolled out of the
 * textarea's visible region (clipped by the textarea's bounding
 * rect — overflow on the textarea would have hidden the line
 * itself anyway).
 */
export function placeEditorCaretMarker(
  textarea: HTMLTextAreaElement | null,
): void {
  const marker = findEditorCaretMarker();
  if (!marker) return;
  if (!textarea || document.activeElement !== textarea) {
    marker.hidden = true;
    return;
  }
  const taRect = textarea.getBoundingClientRect();
  if (taRect.width === 0 || taRect.height === 0) {
    marker.hidden = true;
    return;
  }
  const coords = getCaretViewportCoords(textarea);
  // Clip the marker to the textarea's visible region. When the
  // caret has scrolled out of the textarea's viewport, the bar
  // would otherwise hover over the wrong content.
  const top = Math.max(coords.top, taRect.top);
  const bottom = Math.min(coords.top + coords.height, taRect.bottom);
  if (bottom <= top) {
    marker.hidden = true;
    return;
  }
  marker.hidden = false;
  marker.style.left = `${taRect.left}px`;
  marker.style.top = `${top}px`;
  marker.style.width = `${taRect.width}px`;
  marker.style.height = `${bottom - top}px`;
}

/**
 * Convert a 0-indexed line number to a character offset (start of
 * that line). Clamps to `value.length` when the line is past the
 * end (return last line's offset).
 */
function lineNumberToOffset(value: string, line: number): number {
  if (line <= 0) return 0;
  let i = 0;
  let remaining = line;
  while (i < value.length && remaining > 0) {
    if (value.charCodeAt(i) === 10) remaining--;
    i++;
  }
  return i;
}
