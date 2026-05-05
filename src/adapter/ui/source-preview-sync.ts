/**
 * Source ↔ Preview synchronization — pure DOM helpers
 * (領域 10-1 Split View 同期スクロール、2026-05-05 reform 後再実装).
 *
 * **PR 1 scope** — pure DOM helpers only. UI integration (caret
 * tracking, click handlers, scroll behaviour, ⇄ toggle button,
 * debug overlay) lives in a separate PR so this layer stays
 * test-friendly and free of dispatcher / state coupling.
 *
 * **Background**:
 *
 *   PR #206(2026-04 v17 まで実装後 user 判断で paused、
 *   `docs/development/pr-206-paused.md`)。当時の保留理由:
 *   - 描画と生成を同じものとして検証していた
 *   - ユーザー側 debug 報告導線が無かった
 *   - Playwright `locator.click()` が OS event を経ていない
 *
 *   reform-2026-05 wave で確立した doctrines:
 *   - debug-via-url-flag-protocol(`?pkc-debug=<feature>` 経路)
 *   - visual-state-parity-testing(`elementFromPoint` + real OS
 *     event + screenshot)
 *   - Phase 8 順序性(state mutation → consumer behavior change)
 *
 *   今回は v17 のコード経路を参考に、上記 doctrines を踏まえて
 *   red-first で再構築する。本書は **pure logic 部分のみ** で UI
 *   結線は PR 2 に分離。
 *
 * **API design**:
 *
 *   `caretSourceLine(textarea)` — textarea の caret offset から
 *   0-indexed source line number を返す。改行 (`\n`) を数える
 *   pure 関数。`selectionStart` が 0 のときは 0、最初の改行直後
 *   なら 1。
 *
 *   `findPreviewElementForLine(preview, targetLine)` —
 *   preview tree から `data-pkc-source-line` が `targetLine` 以下
 *   の最大 anchored 要素を返す(= caret 行をカバーする最も近い
 *   block)。一致なしなら `null`。
 *
 *   `findSourceLineForElement(el)` — clicked 要素から
 *   `data-pkc-source-line` ancestor を辿って line number を返す。
 *   非 anchored なら `null`。
 *
 *   `findSourceLineByPoint(preview, viewportY)` —
 *   non-anchored 領域(余白 / blank gap)で click された場合の
 *   fallback。viewportY 以下に top を持つ anchored 要素のうち
 *   最も近いものの line を返す。全 anchor が viewportY より下な
 *   ら、最初の anchor の line を返す(= preview top に折り返し)。
 *
 *   `caretOffsetForSourceLine(text, line)` — markdown ソースの
 *   `line` 行目の先頭 offset を返す。preview → editor 同期時に
 *   `textarea.selectionStart = caretOffsetForSourceLine(...)` と
 *   設定する。範囲外の line は text の末尾を返す。
 *
 * すべて DOM / string 純関数。dispatcher / state / 副作用なし。
 */

import { getCaretViewportCoords } from './caret-position';

// ─────────────────────────────────────────────────────────────────
// PR 2 — Sync orchestration layer (2026-05-05).
//
// Beyond the pure helpers above, the integration layer needs:
//   - syncEnabled state (toggle ON/OFF, persisted to localStorage)
//   - feedback-loop suppression flags (programmatic scroll / caret
//     events shouldn't re-trigger the opposite-direction sync)
//   - active-block highlight via [data-pkc-active-source] attr
//   - safe-scroll comfort zone (don't yank the user's scroll if
//     target is already in the viewport's middle)
//   - block-internal progress (long fence: caret depth maps to
//     proportional offset within the rendered block)
//   - debug overlay opt-in via `?pkc-debug=split-sync` URL flag
//     OR `localStorage.pkc2.split-sync-debug=true`
//
// Public surface (used by action-binder + detail-presenter):
//   - isSyncEnabled() / setSyncEnabled(flag)
//   - syncPreviewToCaret(textarea, preview)
//   - syncCaretToPreview(textarea, preview, viewportY)
//   - markProgrammaticScroll() / consumeScrollSuppression()
//   - markProgrammaticCaretMove() / consumeSelectionSuppression()
//   - isSplitSyncDebugMode()
// ─────────────────────────────────────────────────────────────────

const ACTIVE_ATTR = 'data-pkc-active-source';
const SYNC_ENABLED_KEY = 'pkc2.split-sync-enabled';
const SYNC_DEBUG_KEY = 'pkc2.split-sync-debug';

/**
 * Default-on for desktop / wide tablets, default-off for portrait
 * mobile (the small viewport doesn't have room for both panes
 * comfortably + iPhone keyboard pushes the editor out of view).
 */
function defaultSyncEnabled(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  if (window.matchMedia('(pointer: coarse) and (max-width: 640px)').matches) {
    return false;
  }
  return true;
}

let syncEnabled: boolean = (() => {
  try {
    const raw = window.localStorage?.getItem(SYNC_ENABLED_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    /* localStorage unavailable */
  }
  return defaultSyncEnabled();
})();

export function isSyncEnabled(): boolean {
  return syncEnabled;
}

export function setSyncEnabled(enabled: boolean): void {
  syncEnabled = enabled;
  try {
    window.localStorage?.setItem(SYNC_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    /* localStorage unavailable */
  }
  if (!enabled) {
    // Tear down all visual indicators when sync is turned off so the
    // disabled state looks fully clean.
    if (typeof document !== 'undefined') {
      for (const el of document.querySelectorAll('[' + ACTIVE_ATTR + ']')) {
        el.removeAttribute(ACTIVE_ATTR);
      }
      for (const el of document.querySelectorAll<HTMLElement>(
        '.pkc-editor-active-line',
      )) {
        el.style.display = 'none';
      }
    }
  }
  // Reflect on every toggle button.
  if (typeof document !== 'undefined') {
    for (const btn of document.querySelectorAll<HTMLElement>(
      '[data-pkc-action="toggle-source-preview-sync"]',
    )) {
      btn.setAttribute('data-pkc-sync-state', enabled ? 'on' : 'off');
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      btn.setAttribute(
        'title',
        enabled ? '同期 ON(クリックで OFF)' : '同期 OFF(クリックで ON)',
      );
    }
  }
}

/**
 * Single-shot suppression flags. When the sync layer scrolls the
 * preview programmatically or moves the caret, the resulting event
 * would otherwise feed back into the reverse-sync handler and form
 * a loop. Each flag is set just before the programmatic action and
 * consumed by the next matching event handler.
 */
let suppressNextScrollEvent = false;
let suppressNextSelectionChange = false;

export function markProgrammaticScroll(): void {
  suppressNextScrollEvent = true;
  setTimeout(() => {
    suppressNextScrollEvent = false;
  }, 80);
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
  setTimeout(() => {
    suppressNextSelectionChange = false;
  }, 80);
}
export function consumeSelectionSuppression(): boolean {
  if (suppressNextSelectionChange) {
    suppressNextSelectionChange = false;
    return true;
  }
  return false;
}

/**
 * Mark `el` as the active source anchor and clear the previous
 * active marker (if any) within `preview`. CSS uses
 * `[data-pkc-active-source]` to apply a subtle border / background
 * tint.
 */
function setActive(preview: Element, el: HTMLElement | null): void {
  for (const p of preview.querySelectorAll<HTMLElement>('[' + ACTIVE_ATTR + ']')) {
    p.removeAttribute(ACTIVE_ATTR);
  }
  if (el) el.setAttribute(ACTIVE_ATTR, '');
}

/**
 * Safe-scroll: only scroll when target is outside the comfort zone
 * (middle 50% of the pane). Lands target at ~35% from the top —
 * high enough to read context, not glued to the edge.
 */
function safeScrollPane(scrollContainer: HTMLElement, targetY: number): void {
  const paneH = scrollContainer.clientHeight;
  const safeTop = scrollContainer.scrollTop + paneH * 0.25;
  const safeBottom = scrollContainer.scrollTop + paneH * 0.75;
  if (targetY >= safeTop && targetY <= safeBottom) return;
  const max = scrollContainer.scrollHeight - paneH;
  const desired = Math.max(0, Math.min(max, targetY - paneH * 0.35));
  markProgrammaticScroll();
  scrollContainer.scrollTop = desired;
}

/**
 * Compute target Y (in pane scroll-space) for a caret line within an
 * anchored block whose source range is `[start, end]` (inclusive).
 *
 * Two regimes:
 * - **Block fits in viewport**: target the block's vertical centre
 *   so the whole block stays comfortably in view as the caret moves
 *   within it (avoids jitter from re-scrolling for every caret tick).
 * - **Block overflows viewport** (long fence, big CSV table, deep
 *   nested list): target the **rendered centre of the caret-row**
 *   inside the block, computed as `blockTop + (lineIndex + 0.5) *
 *   (blockHeight / lineCount)`. This is the fix for the PR #206 trap
 *   and the 2026-05-05 user report: with proportional offset alone,
 *   when the block was much taller than the viewport, the caret-row
 *   could end up at any random spot on screen — including off-screen
 *   above the viewport top.
 *
 * For `.pkc-md-block` wrappers (fence / table chrome with copy /
 * expand buttons + padding), the inner `<pre>` / `<table>` rect is
 * used so the alignment lands on user-visible content, not the
 * wrapper's padded outer edge.
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
  // Inclusive line count: a single-line block has lineCount=1.
  const lineCount = Math.max(1, end - start + 1);
  const lineIndex = Math.max(0, Math.min(lineCount - 1, caretLine - start));
  const containerRect = scrollContainer.getBoundingClientRect();
  let measureRect = block.getBoundingClientRect();
  if (block.classList.contains('pkc-md-block')) {
    const inner = block.querySelector<HTMLElement>('pre, table');
    if (inner) measureRect = inner.getBoundingClientRect();
  }
  const blockTopInScroll =
    scrollContainer.scrollTop + (measureRect.top - containerRect.top);
  const paneH = scrollContainer.clientHeight;
  if (measureRect.height <= paneH) {
    // Whole block fits — aim for its centre.
    return blockTopInScroll + measureRect.height * 0.5;
  }
  // Block too tall — locate the caret-row centre within the block.
  // `linePxHeight` is an approximation; markdown-it doesn't guarantee
  // 1:1 source line ↔ rendered line, but for fences / lists / tables
  // each source line maps to roughly one rendered row.
  const linePxHeight = measureRect.height / lineCount;
  return blockTopInScroll + (lineIndex + 0.5) * linePxHeight;
}

/**
 * Update the editor-side current-line overlay so the user has a
 * visual anchor on the caret's row — symmetric to the preview's
 * `[data-pkc-active-source]` highlight.
 *
 * **2026-05-05 hotfix-3**: the previous implementation computed Y as
 * `caretLine * lineHeight - textarea.scrollTop` and ignored the
 * textarea's own padding-top / border-top. The Playwright spec
 * passed only because the test computed expectedTop with the same
 * incomplete formula — classic illusory pass.
 *
 * Now we use `getCaretViewportCoords()` (the same mirror-div
 * technique used elsewhere in the adapter, e.g. the snippet sheet)
 * to obtain the **real** caret pixel position, which automatically
 * accounts for padding, border, line-wrap, font metrics. The
 * overlay's top is then aligned to that exact Y, in wrapper
 * coordinates, and clamped so it never bleeds outside the textarea's
 * visible area.
 *
 * The overlay also serves as a parity landmark for Playwright —
 * comparing its Y to the preview's `[data-pkc-active-source]` Y
 * exposes "caret went to source line N but the preview shows block
 * at line M" misalignments visually.
 */
function updateEditorActiveLine(textarea: HTMLTextAreaElement): void {
  const wrapper = textarea.closest<HTMLElement>('.pkc-text-split-editor');
  if (!wrapper) return;
  const overlay = wrapper.querySelector<HTMLElement>('.pkc-editor-active-line');
  if (!overlay) return;
  if (!syncEnabled) {
    overlay.style.display = 'none';
    return;
  }
  const line = caretSourceLine(textarea);
  // Real caret position via mirror-div measurement.
  const caret = getCaretViewportCoords(textarea);
  const taRect = textarea.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  // Visible region of the textarea (inside border, content + padding):
  // `clientTop` is the border width, `clientHeight` is padding + content.
  const visibleTop = taRect.top + textarea.clientTop;
  const visibleBottom = visibleTop + textarea.clientHeight;
  // Caret top in viewport coords from getCaretViewportCoords.
  let caretTop = caret.top;
  // If the caret is scrolled out of the visible area, clamp the
  // overlay to the closest edge so it doesn't bleed outside.
  if (caretTop < visibleTop) caretTop = visibleTop;
  if (caretTop + caret.height > visibleBottom) {
    caretTop = visibleBottom - caret.height;
  }
  // Translate to wrapper-relative coords for absolute positioning.
  overlay.style.display = 'block';
  overlay.style.top = `${caretTop - wrapperRect.top}px`;
  overlay.style.left = `${taRect.left + textarea.clientLeft - wrapperRect.left}px`;
  overlay.style.width = `${textarea.clientWidth}px`;
  overlay.style.height = `${caret.height}px`;
  overlay.setAttribute('data-pkc-active-line', String(line));
}

/**
 * Update only the editor-side current-line overlay without touching
 * the preview. Used by `handleEditorScroll` so that natural textarea
 * scrolls (touchpad / wheel) re-position the overlay but do NOT
 * trigger `safeScrollPane` on the preview — that would race with
 * the user's continued wheel input.
 *
 * 2026-05-05 hotfix-3: previously `handleEditorScroll` called
 * `syncPreviewToCaret`, which set `markProgrammaticScroll()` even
 * when the caret hadn't moved. Mac touchpad inertia scrolls fire
 * many wheel events in rapid succession; the cumulative side-
 * effects of repeatedly calling `syncPreviewToCaret` during a
 * single wheel gesture are a possible cause of the user-reported
 * "first reverse swipe is swallowed" symptom (Playwright doesn't
 * reproduce it, so this is a conservative defensive fix).
 */
export function refreshEditorActiveLine(textarea: HTMLTextAreaElement): void {
  updateEditorActiveLine(textarea);
}

/**
 * Editor → Preview sync. Find the preview element matching the
 * caret's source line, mark it active, and scroll if needed.
 * Also updates the editor's current-line overlay for visual parity.
 * No-op when sync is disabled or the preview has no anchors.
 */
export function syncPreviewToCaret(
  textarea: HTMLTextAreaElement,
  preview: Element,
): void {
  if (!syncEnabled) {
    updateEditorActiveLine(textarea);
    return;
  }
  updateEditorActiveLine(textarea);
  const line = caretSourceLine(textarea);
  const target = findPreviewElementForLine(preview, line);
  if (!target) {
    setActive(preview, null);
    return;
  }
  setActive(preview, target);
  if (preview instanceof HTMLElement) {
    const targetY = blockTargetY(preview, target, line);
    safeScrollPane(preview, targetY);
  }
}

/**
 * Preview → Editor sync. Take a click coordinate inside the
 * preview, find the source line of the clicked block (or fallback
 * via point lookup), and place the textarea caret at the start of
 * that line. The textarea is scrolled so the caret is visible.
 */
export function syncCaretToPreview(
  textarea: HTMLTextAreaElement,
  preview: Element,
  clickedEl: Element,
  viewportY: number,
): boolean {
  if (!syncEnabled) return false;
  let line = findSourceLineForElement(clickedEl);
  if (line === null) {
    line = findSourceLineByPoint(preview, viewportY);
  }
  if (line === null) return false;
  const offset = caretOffsetForSourceLine(textarea.value, line);
  markProgrammaticCaretMove();
  textarea.focus({ preventScroll: true });
  textarea.selectionStart = offset;
  textarea.selectionEnd = offset;
  // Scroll textarea so caret is visible (browser handles via blur+focus).
  // Best-effort: set scrollTop based on line index × line height.
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 18;
  const desiredScrollTop = Math.max(
    0,
    line * lineHeight - textarea.clientHeight * 0.35,
  );
  if (Math.abs(textarea.scrollTop - desiredScrollTop) > lineHeight) {
    textarea.scrollTop = desiredScrollTop;
  }
  setActive(preview, clickedEl.closest<HTMLElement>('[data-pkc-source-line]'));
  return true;
}

/**
 * Debug overlay opt-in. URL flag `?pkc-debug=split-sync` (canonical,
 * per debug-via-url-flag-protocol.md) or legacy localStorage key
 * `pkc2.split-sync-debug=true`. When ON, the sync layer attaches
 * extra DOM markers + a small floating panel showing the computed
 * caret line / target block / progress.
 */
export function isSplitSyncDebugMode(): boolean {
  try {
    if (window.localStorage?.getItem(SYNC_DEBUG_KEY) === 'true') return true;
  } catch {
    /* localStorage unavailable */
  }
  if (typeof window !== 'undefined' && window.location?.search) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('pkc-debug') === 'split-sync') return true;
    if (params.get('pkc-split-sync-debug') === '1') return true;
  }
  return false;
}

/**
 * Returns the 0-indexed source line of the textarea caret. Counts
 * newlines (`\n`) from offset 0 to the current `selectionStart`.
 *
 * Examples:
 *   value="abc",       caret=0 → 0
 *   value="abc",       caret=3 → 0
 *   value="abc\ndef",  caret=4 → 1
 *   value="a\nb\nc",   caret=5 → 2
 */
export function caretSourceLine(textarea: HTMLTextAreaElement): number {
  const pos = textarea.selectionStart ?? 0;
  let line = 0;
  for (let i = 0; i < pos; i++) {
    // 10 = '\n'. Faster than charAt comparison; textarea values are
    // typically UTF-16 strings so charCodeAt(i) is safe.
    if (textarea.value.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Find the preview element whose `data-pkc-source-line` is the
 * closest match for the given source line — preferring the latest
 * anchor at or before `targetLine`. Returns null when no anchor
 * sits at or before the target (= caret is in a region with no
 * preview, e.g. the document is empty).
 *
 * Tie-breaking: the FIRST element in document order wins on equal
 * line. This matters for nested anchored elements (e.g. a list
 * item inside a list — both `bullet_list_open` and `list_item_open`
 * may share a starting line; the outer list wins because it
 * appears first in the DOM).
 */
export function findPreviewElementForLine(
  preview: Element,
  targetLine: number,
): HTMLElement | null {
  const anchored = preview.querySelectorAll<HTMLElement>(
    '[data-pkc-source-line]',
  );
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
 * ancestor (or self) carrying `data-pkc-source-line`. Returns null
 * when no anchored ancestor exists (e.g. text inside a paragraph
 * that itself carries the anchor — the paragraph wins; text node's
 * own `closest` would still find the paragraph).
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
 * Pick a source line based on a viewport Y coordinate inside
 * `preview`. Fallback for clicks that land on non-anchored regions
 * (preview padding, the blank gap between blocks, the bottom
 * empty space).
 *
 * Algorithm:
 *   1. Among all anchored elements, pick the one whose top is
 *      closest to but not below `viewportY` — i.e. the last block
 *      the user has scrolled past.
 *   2. If no anchor is at-or-above `viewportY` (= click is above
 *      the first block), fall back to the FIRST anchor in document
 *      order. This collapses "click at preview top" to the first
 *      source line.
 *   3. Returns null when the preview has no anchored elements at
 *      all (e.g. the markdown source was empty).
 */
export function findSourceLineByPoint(
  preview: Element,
  viewportY: number,
): number | null {
  const anchored = preview.querySelectorAll<HTMLElement>(
    '[data-pkc-source-line]',
  );
  if (anchored.length === 0) return null;
  let best: HTMLElement | null = null;
  let bestTop = -Infinity;
  for (const el of anchored) {
    const r = el.getBoundingClientRect();
    if (r.top <= viewportY && r.top > bestTop) {
      best = el;
      bestTop = r.top;
    }
  }
  if (!best) best = anchored[0] ?? null;
  if (!best) return null;
  const lineStr = best.getAttribute('data-pkc-source-line');
  if (lineStr === null) return null;
  const line = parseInt(lineStr, 10);
  return Number.isFinite(line) ? line : null;
}

/**
 * Compute the offset (= `selectionStart` value) of the start of
 * source line `line` (0-indexed) within `text`.
 *
 * Used by preview→editor sync: clicking on a preview block whose
 * `data-pkc-source-line="N"` should jump the caret to the start
 * of line N in the textarea.
 *
 * Returns:
 *   - `0` when `line === 0`
 *   - the offset right after the (line-1)-th newline when `line` is
 *     within range
 *   - `text.length` when `line` exceeds the number of lines
 *     (degrades gracefully — places caret at end of text)
 */
export function caretOffsetForSourceLine(text: string, line: number): number {
  if (line <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      seen++;
      if (seen === line) {
        return i + 1;
      }
    }
  }
  // line exceeds the source's newline count — caret at end.
  return text.length;
}
