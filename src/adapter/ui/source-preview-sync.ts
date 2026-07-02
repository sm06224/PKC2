/**
 * Source ↔ Preview **block-level correspondence highlight**
 * (領域 10-1, 2026-05-05 hotfix-5 で「同期スクロール」呼称を撤回).
 *
 * **What this is and isn't**:
 *
 * This module provides a *block-level* correspondence indicator:
 * given the textarea caret position, find the rendered block in the
 * preview that contains the caret's source line, mark it active,
 * and pull both panes' scroll into a comfortable position so the
 * user can see "I am editing this block; in the preview it looks
 * like this".
 *
 * It is **not** a line-level synchronized scroll. The relationship
 * between markdown source lines and rendered HTML lines is
 * fundamentally N:M (table cells wrap, headings have variable
 * heights, blank lines collapse, fences differ in font metrics from
 * surrounding paragraphs). Earlier hotfix attempts to interpolate
 * caret-row pixel position inside long blocks produced more
 * confusion than they cured. Per user direction (2026-05-05) we
 * stop pretending and stay at block granularity.
 *
 * Line-level sync, if revisited, is expected to live on top of the
 * future Intermediate Representation (領域 10-3) which can carry
 * stable inline markers across renderer paths. See
 * `docs/development/intermediate-representation-audit.md` for the
 * planned migration shape.
 *
 * **PR 1 scope** — pure DOM helpers only. UI integration (caret
 * tracking, click handlers, scroll behaviour, ⇄ toggle button,
 * debug overlay) lives in a separate PR so this layer stays
 * test-friendly and free of dispatcher / state coupling.
 *
 * **Background**:
 *
 *   PR #206(2026-04 v17 まで実装後 user 判断で paused、
 *   `docs/development/archived/pr-findings/pr-206-paused.md`)。当時の保留理由:
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
import {
  buildScrollMapping,
  mapEditorToPreview,
  mapPreviewToEditor,
  type AnchorPair,
} from './split-sync-map';
import { measureEditorLineTops } from './editor-line-metrics';

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
//   - onEditorPaneScroll(textarea, preview) — 2026-07 rebuild
//   - onPreviewPaneScroll(textarea, preview) — 2026-07 rebuild
//   - invalidateSplitSyncMap() — 2026-07 rebuild
//   - markProgrammaticCaretMove() / consumeSelectionSuppression()
//   - isSplitSyncDebugMode()
// ─────────────────────────────────────────────────────────────────

const ACTIVE_ATTR = 'data-pkc-active-source';
const SYNC_ENABLED_KEY = 'pkc2.split-sync-enabled';
const SYNC_DEBUG_KEY = 'pkc2.split-sync-debug';

/**
 * 2026-05-05 hotfix-6 user direction「ブロック同期動作自体はボタン
 * 押下時に有効化してオプトイン設計にして」.
 *
 * **Opt-in design**: the block-correspondence highlight stays OFF
 * until the user explicitly clicks the ⇄ toggle button. Once turned
 * on, the choice is persisted to localStorage so subsequent sessions
 * remember the preference. Removing the localStorage entry (or first
 * use ever) brings the user back to the off state.
 *
 * Rationale: previous default-on behaviour (with mobile-only off
 * heuristic) surprised users who weren't aware the feature existed —
 * the highlight + auto-scroll fired the moment they opened a split
 * editor. Making it opt-in keeps the editor's default behaviour
 * minimal; the ⇄ button is always present for users who want it.
 */
let syncEnabled: boolean = (() => {
  try {
    return window.localStorage?.getItem(SYNC_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
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
  // 2026-07 rebuild: reset the scroll-mapping controller on every
  // toggle so a re-enable starts from a clean slate (no stale owner /
  // echo expectation / mapping built against an old layout).
  scrollOwner = null;
  expectedEditorTop = null;
  expectedPreviewTop = null;
  syncMapCache = null;
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
        enabled
          ? 'block 対応ハイライト ON(クリックで OFF)'
          : 'block 対応ハイライト OFF(クリックで ON)',
      );
    }
  }
}

/**
 * Single-shot suppression flag for programmatic CARET moves (preview
 * click → `selectionStart` set → `selectionchange` fires → would
 * re-trigger editor→preview sync). Set just before the programmatic
 * caret move, consumed by the next `selectionchange` handler; the
 * 80 ms auto-clear guards against a stale flag when the browser
 * doesn't emit the event.
 *
 * 2026-07 rebuild note: the equivalent SCROLL suppression flags
 * (`markProgrammaticScroll` / `consumeScrollSuppression`) are GONE —
 * scroll feedback is now filtered by value-echo detection inside
 * `onEditorPaneScroll` / `onPreviewPaneScroll` (deterministic,
 * timer-free), which removes the documented 80 ms race family
 * (「逆方向 scroll が一度だけ効かない」等).
 */
let suppressNextSelectionChange = false;

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
/**
 * Resolve the element that should actually receive the highlight
 * marker. CSS suppresses highlight on `<table>` / `<tr>` to avoid
 * breaking table layout, so when the natural target is one of those
 * we delegate to the surrounding `.pkc-md-block` wrapper. Used by
 * `setActive` AND by callers that need to read the highlighted
 * element's source-line back for badge labelling (so editor + preview
 * show the same L<n>).
 */
function resolveHighlightTarget(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  const tag = el.tagName;
  if (tag === 'TR' || tag === 'TABLE') {
    const wrapper = el.closest<HTMLElement>('.pkc-md-block');
    if (wrapper) return wrapper;
  }
  return el;
}

function setActive(preview: Element, el: HTMLElement | null): void {
  for (const p of preview.querySelectorAll<HTMLElement>('[' + ACTIVE_ATTR + ']')) {
    p.removeAttribute(ACTIVE_ATTR);
  }
  const target = resolveHighlightTarget(el);
  if (target) target.setAttribute(ACTIVE_ATTR, '');
}

// ─────────────────────────────────────────────────────────────────
// 2026-07 rebuild — anchor-pair piecewise-linear scroll mapping.
//
// 旧世代(2026-05-05 hotfix 群)の「ブロック高 ÷ 行数の比例割り +
// comfort band + 80ms suppression timer」は、折り返し・可変高要素で
// 即ズレし、band とタイマーが race を量産した(記録は本 file 冒頭 +
// pr-256 findings)。置き換え:
//
//   1. preview の各アンカー実測 Y × editor の同ソース行実測 Y
//      (mirror-div、editor-line-metrics)→ 単調ペア列(split-sync-map)
//   2. 双方向の連続 scroll 追従: 片方の scrollTop を写像して他方へ。
//      最後に触った pane が駆動側(owner)、追従側への programmatic
//      scroll は「期待値との一致」で無視(echo filter — タイマー不要)
//   3. caret 移動時は caret 行の写像位置を editor と同じ viewport
//      高さに整列(band 廃止 — 決定的で「一度しか飛ばない」が消える)
//
// 写像テーブルは lazy 構築 + key(本文 / 両 pane の clientWidth /
// clientHeight / scrollHeight)不一致で自動再構築。mermaid・画像の
// 後伸びは preview.scrollHeight の変化として捕捉される。連続入力中は
// 直近テーブルを使い続け、静止後に trailing rebuild(120ms)で追い付く。
// ─────────────────────────────────────────────────────────────────

interface SyncMapCache {
  value: string;
  taClientWidth: number;
  taClientHeight: number;
  taScrollHeight: number;
  pvClientWidth: number;
  pvClientHeight: number;
  pvScrollHeight: number;
  /** scrollTop-space table (endpoints = maxScroll of each pane). */
  scrollPairs: AnchorPair[];
  /** content-space table (endpoints = scrollHeight of each pane). */
  contentPairs: AnchorPair[];
}

let syncMapCache: SyncMapCache | null = null;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

/** Which pane the user last drove. Follower events never claim. */
let scrollOwner: 'editor' | 'preview' | null = null;

/**
 * Value-echo filter: after we set a follower pane's scrollTop we
 * remember the value we set (read back post-clamp). The follower's
 * next scroll event carrying that exact value (±1px) is our own echo
 * and is ignored; anything else is real user input and claims
 * ownership. Deterministic — no 80ms timers, no race.
 */
let expectedEditorTop: number | null = null;
let expectedPreviewTop: number | null = null;

let editorFollowRaf = 0;
let previewFollowRaf = 0;

/** Drop the cached mapping (call after a preview re-render). */
export function invalidateSplitSyncMap(): void {
  syncMapCache = null;
}

function collectPreviewAnchors(preview: HTMLElement): Map<number, number> {
  // First element in document order wins per source line (outermost
  // block — same tie-break as findPreviewElementForLine).
  const byLine = new Map<number, number>();
  const previewRect = preview.getBoundingClientRect();
  const base = previewRect.top + preview.clientTop - preview.scrollTop;
  for (const el of preview.querySelectorAll<HTMLElement>('[data-pkc-source-line]')) {
    const lineStr = el.getAttribute('data-pkc-source-line');
    if (lineStr === null) continue;
    const line = parseInt(lineStr, 10);
    if (!Number.isFinite(line) || byLine.has(line)) continue;
    byLine.set(line, el.getBoundingClientRect().top - base);
  }
  return byLine;
}

function buildSyncMap(
  textarea: HTMLTextAreaElement,
  preview: HTMLElement,
): SyncMapCache {
  const byLine = collectPreviewAnchors(preview);
  const lineTops = measureEditorLineTops(textarea, [...byLine.keys()]);
  const anchors: AnchorPair[] = [];
  for (const [line, previewY] of byLine) {
    const editorY = lineTops.get(line);
    if (editorY === undefined) continue;
    anchors.push({ editorY, previewY });
  }
  const taMax = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
  const pvMax = Math.max(0, preview.scrollHeight - preview.clientHeight);
  return {
    value: textarea.value,
    taClientWidth: textarea.clientWidth,
    taClientHeight: textarea.clientHeight,
    taScrollHeight: textarea.scrollHeight,
    pvClientWidth: preview.clientWidth,
    pvClientHeight: preview.clientHeight,
    pvScrollHeight: preview.scrollHeight,
    scrollPairs: buildScrollMapping(anchors, taMax, pvMax),
    contentPairs: buildScrollMapping(anchors, textarea.scrollHeight, preview.scrollHeight),
  };
}

function syncMapIsFresh(
  cache: SyncMapCache,
  textarea: HTMLTextAreaElement,
  preview: HTMLElement,
): boolean {
  return (
    cache.value === textarea.value
    && cache.taClientWidth === textarea.clientWidth
    && cache.taClientHeight === textarea.clientHeight
    && cache.taScrollHeight === textarea.scrollHeight
    && cache.pvClientWidth === preview.clientWidth
    && cache.pvClientHeight === preview.clientHeight
    && cache.pvScrollHeight === preview.scrollHeight
  );
}

/**
 * Return the current mapping, rebuilding when stale. During rapid
 * bursts (typing / inertia wheel storms) a stale table keeps serving
 * and a trailing rebuild lands 120 ms after the last miss — mapping
 * error mid-burst is bounded and self-corrects at rest.
 */
function ensureSyncMap(
  textarea: HTMLTextAreaElement,
  preview: HTMLElement,
): SyncMapCache {
  if (syncMapCache && syncMapIsFresh(syncMapCache, textarea, preview)) {
    return syncMapCache;
  }
  if (syncMapCache) {
    // Stale — serve it, schedule one trailing rebuild.
    if (rebuildTimer === null) {
      rebuildTimer = setTimeout(() => {
        rebuildTimer = null;
        syncMapCache = null; // next consumer rebuilds synchronously
      }, 120);
    }
    return syncMapCache;
  }
  syncMapCache = buildSyncMap(textarea, preview);
  return syncMapCache;
}

function setPreviewScrollTop(preview: HTMLElement, top: number): void {
  const next = Math.round(top);
  if (Math.abs(preview.scrollTop - next) <= 1) return;
  preview.scrollTop = next;
  expectedPreviewTop = preview.scrollTop; // read back post-clamp
}

function setEditorScrollTop(textarea: HTMLTextAreaElement, top: number): void {
  const next = Math.round(top);
  if (Math.abs(textarea.scrollTop - next) <= 1) return;
  textarea.scrollTop = next;
  expectedEditorTop = textarea.scrollTop;
}

/**
 * Editor pane scrolled. Echo events (from our own programmatic set)
 * are consumed silently; real user scrolls claim editor ownership and
 * drive the preview through the mapping on the next animation frame.
 */
export function onEditorPaneScroll(
  textarea: HTMLTextAreaElement,
  preview: HTMLElement,
): void {
  if (!syncEnabled) return;
  const top = textarea.scrollTop;
  if (expectedEditorTop !== null && Math.abs(top - expectedEditorTop) <= 1) {
    expectedEditorTop = null;
    return;
  }
  expectedEditorTop = null;
  scrollOwner = 'editor';
  if (previewFollowRaf) return;
  previewFollowRaf = requestAnimationFrame(() => {
    previewFollowRaf = 0;
    if (scrollOwner !== 'editor') return;
    const map = ensureSyncMap(textarea, preview);
    setPreviewScrollTop(preview, mapEditorToPreview(map.scrollPairs, textarea.scrollTop));
    updateDebugPanel(textarea, preview);
  });
}

/**
 * Preview pane scrolled — the symmetric direction (旧実装では no-op
 * だった「preview を動かすと editor が追従」を初めて提供する)。
 */
export function onPreviewPaneScroll(
  textarea: HTMLTextAreaElement,
  preview: HTMLElement,
): void {
  if (!syncEnabled) return;
  const top = preview.scrollTop;
  if (expectedPreviewTop !== null && Math.abs(top - expectedPreviewTop) <= 1) {
    expectedPreviewTop = null;
    return;
  }
  expectedPreviewTop = null;
  scrollOwner = 'preview';
  if (editorFollowRaf) return;
  editorFollowRaf = requestAnimationFrame(() => {
    editorFollowRaf = 0;
    if (scrollOwner !== 'preview') return;
    const map = ensureSyncMap(textarea, preview);
    setEditorScrollTop(textarea, mapPreviewToEditor(map.scrollPairs, preview.scrollTop));
    refreshEditorActiveLine(textarea);
  });
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
function updateEditorActiveLine(
  textarea: HTMLTextAreaElement,
  /**
   * 2026-05-05 hotfix-7: when the editor overlay is paired with a
   * preview active block, the caller passes the active block's
   * **start line** here so both pane labels read the same number
   * (e.g. caret on fence line 80 → overlay shows "L66" matching the
   * preview's fence wrapper L66 badge). Falls back to caret line
   * when no active block exists (orphan caret in blank line stretch).
   */
  activeBlockStartLine?: number,
): void {
  const wrapper = textarea.closest<HTMLElement>('.pkc-text-split-editor');
  if (!wrapper) return;
  const overlay = wrapper.querySelector<HTMLElement>('.pkc-editor-active-line');
  if (!overlay) return;
  if (!syncEnabled) {
    overlay.style.display = 'none';
    return;
  }
  const caretLine = caretSourceLine(textarea);
  // Use the block's start line as the badge label when provided so
  // editor + preview show the same L<n>.
  const labelLine = activeBlockStartLine ?? caretLine;
  // Real caret position via mirror-div measurement.
  const caret = getCaretViewportCoords(textarea);
  const taRect = textarea.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  // Visible region of the textarea (inside border, content + padding):
  // `clientTop` is the border width, `clientHeight` is padding + content.
  const visibleTop = taRect.top + textarea.clientTop;
  const visibleBottom = visibleTop + textarea.clientHeight;
  const caretTop = caret.top;
  const caretBottom = caretTop + caret.height;
  // 2026-05-05 hotfix-4: previous logic clamped the overlay to the
  // textarea's edge when the caret was scrolled out of view. The
  // result was an overlay glued to the top edge but pointing nowhere
  // — "視覚効果が意味のないもの" per user feedback. Now we HIDE the
  // overlay outright when the caret is outside the visible region.
  // The user can then unambiguously read: overlay visible = caret on
  // screen, overlay missing = caret scrolled out of view.
  if (caretBottom <= visibleTop || caretTop >= visibleBottom) {
    overlay.style.display = 'none';
    return;
  }
  overlay.style.display = 'block';
  overlay.style.top = `${caretTop - wrapperRect.top}px`;
  overlay.style.left = `${taRect.left + textarea.clientLeft - wrapperRect.left}px`;
  overlay.style.width = `${textarea.clientWidth}px`;
  overlay.style.height = `${caret.height}px`;
  overlay.setAttribute('data-pkc-active-line', String(labelLine));
}

/**
 * On-screen debug overlay (only when `?pkc-debug=split-sync` URL
 * flag is on). Shows real-time caret line / preview active line /
 * scroll positions / suppression flag state in a fixed top-right
 * panel so the user can capture exactly what's wrong during a
 * scroll glitch — invaluable when the symptom doesn't reproduce in
 * the test harness.
 *
 * Lazy-creates the panel on first call. No-op when the flag is off.
 */
let debugPanelEl: HTMLElement | null = null;
function ensureDebugPanel(): HTMLElement | null {
  if (!isSplitSyncDebugMode()) return null;
  if (debugPanelEl && document.body.contains(debugPanelEl)) return debugPanelEl;
  const panel = document.createElement('div');
  panel.id = 'pkc-split-sync-debug-panel';
  panel.style.cssText = [
    'position:fixed',
    'top:8px',
    'right:8px',
    'z-index:9999',
    'background:rgba(0,0,0,0.8)',
    'color:#0f0',
    'font:11px/1.4 monospace',
    'padding:6px 8px',
    'border-radius:4px',
    'pointer-events:none',
    'white-space:pre',
    'max-width:360px',
  ].join(';');
  document.body.appendChild(panel);
  debugPanelEl = panel;
  return panel;
}

function updateDebugPanel(textarea: HTMLTextAreaElement, preview?: Element): void {
  const panel = ensureDebugPanel();
  if (!panel) return;
  const line = caretSourceLine(textarea);
  const caret = getCaretViewportCoords(textarea);
  const taRect = textarea.getBoundingClientRect();
  const visibleTop = taRect.top + textarea.clientTop;
  const visibleBottom = visibleTop + textarea.clientHeight;
  const caretInView =
    caret.top >= visibleTop && caret.top + caret.height <= visibleBottom;
  let activePreviewLine: string = '-';
  let previewScrollTop: string = '-';
  if (preview instanceof HTMLElement) {
    const active = preview.querySelector<HTMLElement>('[data-pkc-active-source]');
    activePreviewLine =
      active?.getAttribute('data-pkc-source-line') ?? '(none)';
    previewScrollTop = String(preview.scrollTop);
  }
  panel.textContent = [
    `[split-sync debug @ ${new Date().toLocaleTimeString()}]`,
    `caret line: ${line}`,
    `caret top:  ${caret.top.toFixed(0)} (in view: ${caretInView ? 'YES' : 'NO'})`,
    `ta scroll:  ${textarea.scrollTop}`,
    `preview line: ${activePreviewLine}`,
    `preview scroll: ${previewScrollTop}`,
    `sync enabled: ${syncEnabled}`,
    `owner: ${scrollOwner ?? '(none)'}`,
    `map pairs: ${syncMapCache ? syncMapCache.scrollPairs.length : '(not built)'}`,
    `expect ta/pv: ${expectedEditorTop ?? '-'} / ${expectedPreviewTop ?? '-'}`,
    `suppress sel: ${suppressNextSelectionChange}`,
  ].join('\n');
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
  // 2026-05-05 hotfix-7 follow-up: lookup the current active preview
  // block and pass its start line so the editor overlay's L<n> badge
  // stays in sync with the preview's L<n> across textarea natural
  // scroll. Without this, wheel-scrolling the editor reset the badge
  // to caret-line-number and re-broke the L number unification.
  const wrapper = textarea.closest<HTMLElement>('.pkc-text-split-editor');
  const preview = wrapper?.querySelector<HTMLElement>(
    '[data-pkc-region="text-edit-preview"]',
  );
  let activeStart: number | undefined;
  if (preview) {
    const active = preview.querySelector<HTMLElement>('[data-pkc-active-source]');
    const startStr = active?.getAttribute('data-pkc-source-line');
    if (startStr !== null && startStr !== undefined) {
      const parsed = parseInt(startStr, 10);
      if (Number.isFinite(parsed)) activeStart = parsed;
    }
  }
  updateEditorActiveLine(textarea, activeStart);
  // Debug panel mirrors the same state — refresh on every textarea
  // scroll so the diagnostic flag captures even non-caret-moving
  // events.
  updateDebugPanel(textarea, preview ?? undefined);
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
    updateDebugPanel(textarea, preview);
    return;
  }
  // 2026-05-05 hotfix-5 user direction: when we highlight a block,
  // the editor's caret-row overlay must also be on screen — otherwise
  // the highlight refers to a position the user can't see, and the
  // visual correspondence breaks. Auto-scroll the editor first so the
  // caret is in view, THEN compute / paint the overlay + preview.
  ensureCaretVisibleInEditor(textarea);
  const line = caretSourceLine(textarea);
  const rawTarget = findPreviewElementForLine(preview, line);
  if (!rawTarget) {
    updateEditorActiveLine(textarea);
    setActive(preview, null);
    updateDebugPanel(textarea, preview);
    return;
  }
  // 2026-05-05 hotfix-7: badge label uses the **highlight target**'s
  // source-line (same element that actually shows the L<n> badge in
  // the preview), so editor overlay + preview badge render identical
  // numbers even when the highlight is delegated (e.g. <tr> → wrapper).
  const highlightTarget = resolveHighlightTarget(rawTarget);
  const labelStart = highlightTarget?.getAttribute('data-pkc-source-line');
  const labelLine = labelStart !== null && labelStart !== undefined
    ? parseInt(labelStart, 10)
    : line;
  updateEditorActiveLine(textarea, Number.isFinite(labelLine) ? labelLine : line);
  setActive(preview, rawTarget);
  if (preview instanceof HTMLElement) {
    // 2026-07 rebuild: caret alignment via the content-space mapping.
    // caret の content-Y を写像し、editor 側で caret が居るのと同じ
    // viewport 高さに preview 側の対応位置を置く。決定的(band 無し)
    // なので「一度しかジャンプしない」「飛んだり飛ばなかったり」が
    // 構造的に起きない。caret 移動は user の editor 操作 = editor が
    // 駆動側。
    scrollOwner = 'editor';
    const map = ensureSyncMap(textarea, preview);
    const caret = getCaretViewportCoords(textarea);
    const taRect = textarea.getBoundingClientRect();
    const viewportOffset = caret.top - (taRect.top + textarea.clientTop);
    const caretContentY = viewportOffset + textarea.scrollTop;
    const mappedContentY = mapEditorToPreview(map.contentPairs, caretContentY);
    const pvMax = Math.max(0, preview.scrollHeight - preview.clientHeight);
    const target = Math.min(pvMax, Math.max(0, mappedContentY - viewportOffset));
    setPreviewScrollTop(preview, target);
  }
  updateDebugPanel(textarea, preview);
}

/**
 * Auto-scroll the textarea so the caret row is in view. Called by
 * `syncPreviewToCaret` (= every caret-driven sync) so the overlay
 * never refers to a row the user can't see.
 *
 * No-op when the caret is already visible. Pads the destination by
 * `lineHeight` so the caret lands inside the visible area, not glued
 * to the edge. Marks the resulting scroll as programmatic so the
 * editor scroll listener doesn't bounce a redundant overlay update.
 *
 * NOT called from `refreshEditorActiveLine` (= textarea natural
 * scroll) — that path is the user actively scrolling, and forcing
 * the caret back into view would fight their input.
 */
/**
 * Scroll the editor's textarea so the caret row is visible — narrow
 * "in-view → no-op, out-of-view → minimum scroll" semantics. Used
 * only for the editor side: the user is actively typing or clicking,
 * so we should NOT yank the editor scroll while the caret is in view.
 */
function ensureCaretVisibleInEditor(textarea: HTMLTextAreaElement): void {
  const caret = getCaretViewportCoords(textarea);
  const rect = { top: caret.top, bottom: caret.top + caret.height };
  const padding = caret.height; // one extra line of breathing room
  const taRect = textarea.getBoundingClientRect();
  const visTop = taRect.top + textarea.clientTop;
  const visBottom = visTop + textarea.clientHeight;
  const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
  // "in view → no-op, out of view → minimum-amount scroll" (hotfix-6
  // contract 維持)。programmatic set は setEditorScrollTop 経由なので
  // echo filter が editor scroll listener への跳ね返りを吸収する。
  if (rect.top < visTop + padding) {
    const delta = (visTop + padding) - rect.top;
    setEditorScrollTop(textarea, Math.max(0, textarea.scrollTop - delta));
    return;
  }
  if (rect.bottom > visBottom - padding) {
    const delta = rect.bottom - (visBottom - padding);
    setEditorScrollTop(textarea, Math.min(maxScroll, textarea.scrollTop + delta));
  }
}

/**
 * Preview → Editor sync. Take a click coordinate inside the
 * preview, find the source line of the clicked block (or fallback
 * via point lookup), and place the textarea caret at the start of
 * that line.
 *
 * 2026-05-05 hotfix-6: editor-side scroll is delegated to
 * `ensureCaretVisibleInEditor` so both sync directions share the
 * same "in view → no-op, out of view → minimum-amount scroll"
 * contract (per user direction). Previous implementation always
 * tried to land the caret at 35% from the top, which yanked the
 * editor scroll even when the caret was already visible.
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
  ensureCaretVisibleInEditor(textarea);
  // 2026-05-05 hotfix-7: derive badge label from the HIGHLIGHTED
  // element (same as syncPreviewToCaret) so editor + preview show
  // the same L<n> after delegation (e.g. <tr> → wrapper).
  const anchored = clickedEl.closest<HTMLElement>('[data-pkc-source-line]');
  const highlightTarget = resolveHighlightTarget(anchored);
  const labelStr = highlightTarget?.getAttribute('data-pkc-source-line');
  const labelLine = labelStr !== null && labelStr !== undefined
    ? parseInt(labelStr, 10)
    : NaN;
  updateEditorActiveLine(
    textarea,
    Number.isFinite(labelLine) ? labelLine : line,
  );
  setActive(preview, anchored);
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
