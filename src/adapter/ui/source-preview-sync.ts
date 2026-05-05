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
