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
const DEBUG_LINE_REGION = 'sync-debug-line';

/**
 * EXPERIMENTAL — sync debug overlay (PR #206 v13, 2026-05-01).
 *
 * Toggleable via `localStorage('pkc2.sync-debug') === 'true'` or
 * URL query `?pkc-sync-debug=1`. When enabled, a thin horizontal
 * line is drawn at the computed caret y (viewport coords),
 * extending across the whole viewport so it visibly intersects
 * BOTH the editor caret and the preview block top — letting the
 * user see whether the alignment math is producing matching y
 * values.
 *
 * To remove this entire feature later: delete the constants /
 * `renderSyncDebugLine` / `placeSyncDebugLine` / `isSyncDebugMode`
 * exports + their CSS rule + their renderer wiring. The rest of
 * the sync layer is untouched.
 */
function isSyncDebugMode(): boolean {
  try {
    if (window.localStorage?.getItem('pkc2.sync-debug') === 'true') return true;
  } catch {
    /* localStorage unavailable */
  }
  if (typeof window !== 'undefined' && window.location?.search) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pkc-sync-debug') === '1') return true;
  }
  return false;
}

export function renderSyncDebugLine(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pkc-sync-debug-line';
  el.setAttribute('data-pkc-region', DEBUG_LINE_REGION);
  el.hidden = true;
  return el;
}

function findSyncDebugLine(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pkc-region="' + DEBUG_LINE_REGION + '"]');
}

/**
 * Position the debug line at viewport y. Hides it when debug mode
 * is off — so flipping the localStorage flag without reload tears
 * down cleanly.
 *
 * v14: clip the line to the split editor wrapper bounds instead of
 * spanning the whole viewport. Without clipping the trace bled
 * across sidebar / meta pane / shell chrome.
 */
function placeSyncDebugLine(viewportY: number | null): void {
  const el = findSyncDebugLine();
  if (!el) return;
  if (!isSyncDebugMode() || viewportY === null) {
    el.hidden = true;
    return;
  }
  const wrapper = document.querySelector<HTMLElement>('.pkc-text-split-editor');
  if (!wrapper) {
    el.hidden = true;
    return;
  }
  const rect = wrapper.getBoundingClientRect();
  if (viewportY < rect.top || viewportY > rect.bottom) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.style.top = `${viewportY}px`;
  el.style.left = `${rect.left}px`;
  el.style.width = `${rect.width}px`;
  el.style.right = 'auto';
}

/**
 * Module-level enable flag. When false, all sync helpers
 * (`syncPreviewToCaret` / `repositionMarkers` / `placeEditorCaretMarker`)
 * become no-ops and clear any visual state. Letting the user mute
 * the overlays is useful when reading long documents where the
 * accent rectangles compete with content focus.
 *
 * Persisted via `localStorage('pkc2.sync-enabled')` so the
 * preference survives reloads. Default:
 *   - **off** on iPhone portrait (`pointer:coarse + max-width:640px`)
 *     because the markers crowd the small viewport and the user
 *     usually edits in textarea-only mode there
 *   - **on** elsewhere (desktop / iPad / large screens)
 */
let syncEnabled: boolean = (() => {
  try {
    const raw = window.localStorage?.getItem('pkc2.sync-enabled');
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    /* localStorage unavailable — fall through to media-query default. */
  }
  // Never set: default depends on screen / pointer tier.
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(pointer: coarse) and (max-width: 640px)').matches) {
      return false;
    }
  }
  return true;
})();

export function isSyncEnabled(): boolean {
  return syncEnabled;
}

/**
 * Single-shot suppression flags. When the sync layer scrolls the
 * preview programmatically, the resulting scroll event would
 * otherwise feed back into the reverse-sync handler (preview→
 * editor) and form a loop. Same for caret moves. Each flag is set
 * just before a programmatic action and consumed by the next
 * matching event handler.
 *
 * Backed by `setTimeout` so a missed event (scrollTop didn't
 * change → no scroll event) doesn't leave the flag stuck.
 */
let suppressNextScrollEvent = false;
let suppressNextSelectionChange = false;

export function markProgrammaticScroll(): void {
  suppressNextScrollEvent = true;
  setTimeout(() => { suppressNextScrollEvent = false; }, 80);
}
export function consumeScrollSuppression(): boolean {
  if (suppressNextScrollEvent) {
    suppressNextScrollEvent = false;
    return true;
  }
  return false;
}
export function markProgrammaticCaretMove(): void {
  suppressNextSelectionChange = true;
  setTimeout(() => { suppressNextSelectionChange = false; }, 80);
}
export function consumeSelectionSuppression(): boolean {
  if (suppressNextSelectionChange) {
    suppressNextSelectionChange = false;
    return true;
  }
  return false;
}

export function setSyncEnabled(enabled: boolean): void {
  syncEnabled = enabled;
  try {
    window.localStorage?.setItem('pkc2.sync-enabled', enabled ? 'true' : 'false');
  } catch {
    /* localStorage unavailable (private mode / SSR) — in-memory only. */
  }
  if (!enabled) {
    // Tear down all visual state so disabled sync looks fully off.
    const marker = findSyncMarker();
    if (marker) marker.hidden = true;
    const editorMarker = findEditorCaretMarker();
    if (editorMarker) editorMarker.hidden = true;
    for (const el of document.querySelectorAll('[' + ACTIVE_ATTR + ']')) {
      el.removeAttribute(ACTIVE_ATTR);
    }
  }
  // Reflect new state on every toggle button (active style).
  for (const btn of document.querySelectorAll<HTMLElement>(
    '[data-pkc-action="toggle-source-preview-sync"]',
  )) {
    btn.setAttribute('data-pkc-sync-state', enabled ? 'on' : 'off');
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    btn.setAttribute('title', enabled ? '同期 ON(クリックで OFF)' : '同期 OFF(クリックで ON)');
  }
}

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
  // v14: clip the marker to the preview pane's bounds so it never
  // bleeds above / below the rendered area when the active block
  // is partially scrolled out of preview's visible region.
  const previewPane = target.closest<HTMLElement>(
    '[data-pkc-region="text-edit-preview"]',
  );
  let top = rect.top;
  let bottom = rect.bottom;
  let left = rect.left;
  let right = rect.right;
  if (previewPane) {
    const paneRect = previewPane.getBoundingClientRect();
    top = Math.max(top, paneRect.top);
    bottom = Math.min(bottom, paneRect.bottom);
    left = Math.max(left, paneRect.left);
    right = Math.min(right, paneRect.right);
  }
  if (bottom <= top || right <= left) {
    marker.hidden = true;
    return;
  }
  marker.hidden = false;
  marker.style.left = `${left}px`;
  marker.style.top = `${top}px`;
  marker.style.width = `${right - left}px`;
  marker.style.height = `${bottom - top}px`;
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
 * Safe scroll within a single pane (PR #206 v12, ChatGPT 提案 §11).
 *
 * Avoids the snap-to-edge UX of `scrollIntoView({block:'nearest'})`
 * by treating the middle 25-75% of the pane as the "comfortable
 * zone". When the target Y is already inside the comfortable zone,
 * don't scroll at all (= preserves user's free-scroll attempts).
 * When outside, scroll so the target lands at ~35% from the top —
 * a balance between "high enough to read context" and "not glued
 * to the edge".
 *
 * `targetY` is in scroll-space coordinates (= container.scrollTop
 * frame), not viewport.
 */
function safeScrollPane(scrollContainer: HTMLElement, targetY: number): void {
  const paneH = scrollContainer.clientHeight;
  const safeTop = scrollContainer.scrollTop + paneH * 0.25;
  const safeBottom = scrollContainer.scrollTop + paneH * 0.75;
  if (targetY >= safeTop && targetY <= safeBottom) return;
  const max = scrollContainer.scrollHeight - paneH;
  const desired = Math.max(0, Math.min(max, targetY - paneH * 0.35));
  scrollContainer.scrollTop = desired;
}

/**
 * Compute the target Y (in pane scroll-space) for a caret line N
 * within an anchored block whose source range is [start, end].
 *
 * Block-internal progress: the caret's relative position within
 * the source range becomes the relative position within the
 * rendered block's height. This makes long fences / lists / quotes
 * track the caret's actual depth instead of glueing to the block
 * top — the main complaint about pre-v12 sync.
 */
function blockTargetY(
  scrollContainer: HTMLElement,
  block: HTMLElement,
  caretLine: number,
): number {
  const startStr = block.getAttribute('data-pkc-source-line');
  const endStr = block.getAttribute('data-pkc-source-end') ?? startStr;
  const start = startStr !== null ? parseInt(startStr, 10) : 0;
  const end = endStr !== null ? parseInt(endStr, 10) : start;
  const range = Math.max(1, end - start);
  const progress = Math.max(0, Math.min(1, (caretLine - start) / range));
  const containerRect = scrollContainer.getBoundingClientRect();
  // v13: when the anchor is a `.pkc-md-block` wrapper (fence / table
  // outer chrome with copy / expand buttons + padding), use the
  // INNER `<pre>` / `<table>` rect for height & top so the caret
  // alignment lands on the user-visible content, not the wrapper's
  // padded outer edge. Other anchors (`<p>`, `<h1>`, `<li>`,
  // `<blockquote>`, `<hr>`, fence per-line `<span>`) have no inner
  // chrome layer so we use them directly.
  let measureRect = block.getBoundingClientRect();
  if (block.classList.contains('pkc-md-block')) {
    const inner = block.querySelector<HTMLElement>('pre, table');
    if (inner) measureRect = inner.getBoundingClientRect();
  }
  const blockTopInScroll =
    scrollContainer.scrollTop + (measureRect.top - containerRect.top);
  return blockTopInScroll + measureRect.height * progress;
}

/**
 * Sync the preview pane to the textarea caret: find the preview
 * element matching the caret's source line, scroll it so its top
 * edge aligns with the caret line, and mark it as active. No-op
 * if the preview has no anchored elements (e.g. plain-text
 * fallback render path).
 */
export function syncPreviewToCaret(
  textarea: HTMLTextAreaElement,
  preview: Element,
): void {
  if (!syncEnabled) return;
  const line = caretSourceLine(textarea);
  const target = findPreviewElementForLine(preview, line);
  if (!target) {
    setActive(preview, null);
    placeSyncMarker(null);
    placeSyncDebugLine(null);
    return;
  }
  setActive(preview, target);
  // EXPERIMENTAL debug viz: trace line at caret y across the
  // whole viewport, so user can see whether the editor caret y
  // and preview block top end up at the same horizontal sweep.
  if (document.activeElement === textarea) {
    placeSyncDebugLine(getCaretViewportCoords(textarea).top);
  }
  // PR #206 v12: scroll preview only when needed (target outside
  // comfortable zone), and use block-internal progress so tall
  // blocks track the caret's depth, not just glue to the top.
  if (preview instanceof HTMLElement) {
    const targetY = blockTargetY(preview, target, line);
    safeScrollPane(preview, targetY);
  }
  // Place the floating overlay AFTER scrolling so the marker's
  // bounding rect reflects the post-scroll position.
  placeSyncMarker(target);
}

/**
 * Re-place the floating markers without triggering scroll. Called
 * on scroll / resize so the overlay tracks its anchor element
 * without fighting the user's own scrolling.
 */
export function repositionMarkers(
  textarea: HTMLTextAreaElement | null,
  preview: Element | null,
): void {
  if (!syncEnabled) return;
  if (preview && textarea) {
    const line = caretSourceLine(textarea);
    const target = findPreviewElementForLine(preview, line);
    placeSyncMarker(target);
  } else {
    placeSyncMarker(null);
  }
  placeEditorCaretMarker(textarea);
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
  // Mark programmatic so the resulting selectionchange doesn't feed
  // back into the editor→preview sync (which would scroll preview
  // to align, fighting the user's preview scroll).
  markProgrammaticCaretMove();
  textarea.selectionStart = textarea.selectionEnd = offset;
  // v14: also scroll the textarea internally so the targeted line
  // is visible. browsers don't always auto-scroll on programmatic
  // selectionStart change.
  scrollTextareaToCaret(textarea);
  // v15: manually update both markers. The suppression flag above
  // skips the selectionchange handler, but the user still expects
  // the floating overlays to reflect the new caret/active block.
  placeEditorCaretMarker(textarea);
  const previewPane = el.closest<HTMLElement>(
    '[data-pkc-region="text-edit-preview"]',
  );
  if (previewPane) {
    const target = findPreviewElementForLine(previewPane, line);
    if (target) {
      setActive(previewPane, target);
      placeSyncMarker(target);
    }
  }
  return true;
}

/**
 * Scroll the textarea internally so the current caret line is
 * comfortably visible (~35% from the top, matches preview pane's
 * safe-scroll behaviour).
 */
function scrollTextareaToCaret(textarea: HTMLTextAreaElement): void {
  const taRect = textarea.getBoundingClientRect();
  if (taRect.height === 0) return;
  const coords = getCaretViewportCoords(textarea);
  // The line's content position inside the textarea (independent
  // of current scroll): caretY_viewport - taRect.top + scrollTop.
  const lineContentY = coords.top - taRect.top + textarea.scrollTop;
  const desiredScrollTop = Math.max(0, lineContentY - taRect.height * 0.35);
  textarea.scrollTop = desiredScrollTop;
}

/**
 * Find the topmost anchored block visible in a scrollable preview
 * pane. Returns its source line, or null when no anchor is in view.
 *
 * Strategy: scan the anchored block list and pick the first whose
 * top is within the preview's visible area, with a small tolerance
 * for blocks whose top is slightly above the visible top (still
 * "in view" if the bulk of the block is visible).
 */
export function findVisibleLineInPreview(preview: Element): number | null {
  const previewRect = preview.getBoundingClientRect();
  const anchored = preview.querySelectorAll<HTMLElement>('[data-pkc-source-line]');
  if (anchored.length === 0) return null;
  let lastBeforeView: HTMLElement | null = null;
  for (const el of anchored) {
    const r = el.getBoundingClientRect();
    if (r.bottom < previewRect.top) {
      // Entirely above the visible area — keep tracking as fallback.
      lastBeforeView = el;
      continue;
    }
    // First element whose bottom reaches the visible area.
    const lineStr = el.getAttribute('data-pkc-source-line');
    if (lineStr === null) continue;
    const line = parseInt(lineStr, 10);
    return Number.isFinite(line) ? line : null;
  }
  // Every anchored element is above the visible area — return the
  // last one's line as the "current section".
  if (lastBeforeView) {
    const lineStr = lastBeforeView.getAttribute('data-pkc-source-line');
    if (lineStr !== null) {
      const line = parseInt(lineStr, 10);
      return Number.isFinite(line) ? line : null;
    }
  }
  return null;
}

/**
 * Reverse sync: move the textarea caret to follow the topmost
 * visible block in the preview. Called when the user scrolls the
 * preview pane manually (not when our own sync caused the scroll).
 *
 * Does NOT scroll or focus the textarea. The caret silently moves
 * to the matching source line so when the user clicks back to the
 * editor or starts typing, they're in the right place. The editor
 * caret marker reflects the new position via the next `placeEditor
 * CaretMarker` call.
 */
export function syncCaretToPreviewScroll(
  textarea: HTMLTextAreaElement,
  preview: Element,
): void {
  if (!syncEnabled) return;
  const line = findVisibleLineInPreview(preview);
  if (line === null) return;
  const offset = lineNumberToOffset(textarea.value, line);
  if (textarea.selectionStart === offset && textarea.selectionEnd === offset) return;
  markProgrammaticCaretMove();
  textarea.selectionStart = textarea.selectionEnd = offset;
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
  if (!syncEnabled) return;
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
