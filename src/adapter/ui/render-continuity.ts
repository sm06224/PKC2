/**
 * Render-time continuity helper.
 *
 * The renderer is a pure `render(state, root)` function that clears
 * `root.innerHTML` and rebuilds the DOM on every dispatch. Without
 * additional care, this destroys the user's scroll position, focus,
 * and text-caret on every state update — reported multiple times
 * as "画面最上部に飛ぶ" and "編集中にフォーカスが外れる" classes of bug.
 *
 * This module provides a *thin* capture-and-restore pair that the
 * main render loop wraps around each `render()` call. It is a
 * fallback that works everywhere; narrow, immediate preservers
 * like `preserveCenterPaneScroll` in action-binder still run for
 * the specific handlers that need rAF-timed restoration.
 *
 * What is preserved:
 *   - scrollTop of every known scrollable region (matched by
 *     `data-pkc-region` so minification can't rename the hook).
 *   - focus on any element that carries a reidentifying attribute
 *     (`data-pkc-field`, then `data-pkc-log-id`, then
 *     `data-pkc-lid`).
 *   - for `<input>` / `<textarea>` the caret (`selectionStart` /
 *     `selectionEnd`) when it can be read.
 *   - **uncommitted editor draft values** — the value (+ caret) of every
 *     text field inside the open editor (`[data-pkc-mode="edit"]`). The
 *     editor textarea holds the in-progress edit as DOM-only state until
 *     COMMIT_EDIT; a full re-render (e.g. toggling the format panel, which
 *     dispatches SYS_SYNC_CHILD_WINDOWS → `'full'` scope) rebuilds it from
 *     the *committed* `entry.body` and would otherwise discard whatever the
 *     user had typed (user report 2026-06-15「編集時の書式パネルを開くと
 *     入力していたテキストが消える」). Capturing it here — unlike the
 *     focus snapshot — does NOT require the field to be focused, because the
 *     click that triggers the re-render (the format toggle button) moves
 *     focus off the textarea before capture runs.
 *
 * What is *not* preserved:
 *   - contenteditable caret (browsers do not expose enough
 *     cross-frame state here; left to individual presenters).
 *   - arbitrary custom UI state (menus, popovers, etc.) — those
 *     are state-driven already and get rebuilt faithfully.
 *
 * Failure mode: every restore is guarded and silently no-ops when
 * the target is missing after render. The helper never throws and
 * never changes DOM beyond `scrollTop` / `focus()` /
 * `setSelectionRange`.
 */

/** Scrollable regions that deserve continuity. Order is the order
 * of capture / restore; no dependency between them.
 *
 * PR-GG (2026-05-06): added `entry-list`. The outer `pkc-sidebar`
 * `<aside>` does not actually overflow — the inner `<ul class="pkc-
 * entry-list">` is `flex:1; overflow-y:auto` and holds the user's
 * actual scroll. Capturing only `sidebar` was a silent no-op for
 * sidebar scroll preservation, manifesting as "大量のエントリで
 * クリックすると左ペインが上に戻る". */
const SCROLL_REGIONS = [
  'sidebar',
  'entry-list',
  'center-content',
  'meta',
  // PR-NN (2026-05-06): flags-inspector-body は SET_FLAG で full
  // re-render が走るため、scroll を継続させないと「設定を変更する
  // たびに勝手に上にスクロールが戻る」になる(user 修正指示2)。
  'flags-inspector-body',
] as const;

export interface RenderFocusSnapshot {
  /** `data-pkc-field` of the focused element, if any. */
  readonly field: string | null;
  /** `data-pkc-lid` of the focused element, if any. */
  readonly lid: string | null;
  /** `data-pkc-log-id` of the focused element, if any. */
  readonly logId: string | null;
  /** Selection start for `<input>` / `<textarea>`; `null` otherwise. */
  readonly caretStart: number | null;
  /** Selection end for `<input>` / `<textarea>`; `null` otherwise. */
  readonly caretEnd: number | null;
}

/**
 * One uncommitted draft field inside the open editor. Captured by value
 * (+ caret) so a full re-render that rebuilds the editor from committed
 * state does not erase in-progress typing.
 */
export interface EditorFieldSnapshot {
  /** `data-pkc-field` of the field (e.g. `title`, `body`, `textlog-entry-text`). */
  readonly field: string;
  /** `data-pkc-log-id` (textlog per-row textareas); `null` when absent. */
  readonly logId: string | null;
  /** Current value. */
  readonly value: string;
  /** Caret start, when readable. */
  readonly caretStart: number | null;
  /** Caret end, when readable. */
  readonly caretEnd: number | null;
}

export interface RenderContinuitySnapshot {
  readonly scrolls: ReadonlyArray<{ region: string; top: number }>;
  readonly focus: RenderFocusSnapshot | null;
  /** Uncommitted editor draft fields (empty when not editing). */
  readonly editorFields: ReadonlyArray<EditorFieldSnapshot>;
}

const EMPTY_SNAPSHOT: RenderContinuitySnapshot = {
  scrolls: [],
  focus: null,
  editorFields: [],
};

/**
 * Input types whose meaningful state is `checked` (or otherwise not a
 * typed-text value), so we never restore their `.value` as a "draft".
 */
const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color',
]);

/**
 * Read scroll + focus + caret state from `root` into a snapshot.
 * Safe to call repeatedly. Returns an empty snapshot if `root` is
 * not attached to a document.
 */
export function captureRenderContinuity(root: HTMLElement): RenderContinuitySnapshot {
  if (!root || !root.isConnected) return EMPTY_SNAPSHOT;

  const scrolls: Array<{ region: string; top: number }> = [];
  for (const region of SCROLL_REGIONS) {
    const el = root.querySelector<HTMLElement>(`[data-pkc-region="${region}"]`);
    if (el && el.scrollTop > 0) {
      scrolls.push({ region, top: el.scrollTop });
    }
  }

  const focus = captureFocus(root);
  const editorFields = captureEditorFields(root);
  return { scrolls, focus, editorFields };
}

/**
 * Snapshot the value + caret of every text field inside the open editor
 * (`[data-pkc-mode="edit"]`). Scoped to the editor subtree so unrelated
 * fields (sidebar search, settings inputs) are never captured. Returns
 * an empty array when no editor is open.
 */
function captureEditorFields(root: HTMLElement): EditorFieldSnapshot[] {
  const editor = root.querySelector<HTMLElement>('[data-pkc-mode="edit"]');
  if (!editor) return [];
  const out: EditorFieldSnapshot[] = [];
  const fields = editor.querySelectorAll<HTMLElement>(
    'input[data-pkc-field], textarea[data-pkc-field]',
  );
  for (const el of fields) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) continue;
    // checkbox / radio / file 等は「入力テキスト」ではない — 値復元しない。
    if (el instanceof HTMLInputElement && NON_TEXT_INPUT_TYPES.has(el.type)) continue;
    const field = el.getAttribute('data-pkc-field');
    if (!field) continue;
    let caretStart: number | null = null;
    let caretEnd: number | null = null;
    try {
      caretStart = el.selectionStart;
      caretEnd = el.selectionEnd;
    } catch {
      caretStart = null;
      caretEnd = null;
    }
    out.push({
      field,
      logId: el.getAttribute('data-pkc-log-id'),
      value: el.value,
      caretStart,
      caretEnd,
    });
  }
  return out;
}

/**
 * Apply a previously-captured snapshot against `root` after a
 * re-render. Missing targets are silently skipped.
 *
 * PR-GG (2026-05-06): the synchronous restore can clamp to
 * `maxScrollTop` when the just-rendered sidebar has many entries
 * and the browser hasn't finished layout (`scrollHeight` is still
 * being measured). Concretely the user reported "大量のエントリ
 * がある状況でクリックすると左ペインのスクロールが上に戻る" —
 * scroll snaps to 0 after a sidebar entry click. Schedule a rAF-
 * deferred re-application so once layout settles the captured
 * scrollTop wins. The double-write is cheap and idempotent: when
 * the synchronous write already landed, the rAF write is a no-op.
 */
/**
 * snapshot から 1 region の scroll 復元だけを外す(L3-S5)。
 *
 * ensure-visible が「選択行を見せるために」意図的に scroll した描画では、
 * 継続性の復元(同期 + rAF + 200ms)が**必ずそれを打ち消す**。窓化前は
 * 選択行が近く移動量も小さかったため実害が見えにくかったが、窓化すると
 * 数百行先へ飛ぶので露見する(実測: 870px を書いても 148px に戻り、
 * 選択行が永久に画面外)。
 */
export function withoutScrollRegion(
  snapshot: RenderContinuitySnapshot,
  region: string,
): RenderContinuitySnapshot {
  if (!snapshot.scrolls.some((s) => s.region === region)) return snapshot;
  return { ...snapshot, scrolls: snapshot.scrolls.filter((s) => s.region !== region) };
}

export function restoreRenderContinuity(
  root: HTMLElement,
  snapshot: RenderContinuitySnapshot,
): void {
  if (!root) return;

  applyScrollSnapshot(root, snapshot.scrolls);

  // Defer a second pass to the next animation frame so the restore
  // wins even if the first pass clamped to `maxScrollTop` because
  // layout was still in flux. Skip if rAF is unavailable (non-DOM
  // env) — the synchronous pass above is the fallback.
  const win = root.ownerDocument?.defaultView ?? null;
  const raf = win?.requestAnimationFrame;
  if (raf) {
    raf(() => {
      if (root.isConnected) applyScrollSnapshot(root, snapshot.scrolls);
    });
  }

  // PR-XX (2026-05-06): browser-specific layout settle race(特に Firefox
  // で reflow が rAF より遅延するケース)を救うための 3 段目 fallback。
  // 200ms 後に scroll を再 apply、ここで一致しないなら何かが scroll を
  // 押し除けている → user 報告の 「押し除けられている」 状況を救う。
  // 高頻度 dispatch 時に積み上がらないよう、各 region の現値が snapshot
  // と一致していたら no-op(applyScrollSnapshot 内で `!==` guard 済)。
  if (win && typeof win.setTimeout === 'function') {
    win.setTimeout(() => {
      if (root.isConnected) applyScrollSnapshot(root, snapshot.scrolls);
    }, 200);
  }

  // Editor draft values BEFORE focus, so the caret restore below (and
  // main.ts's edit-mode focus default) act on the restored text.
  restoreEditorFields(root, snapshot.editorFields);

  restoreFocus(root, snapshot.focus);
}

/**
 * Write captured editor draft values (+ caret) back into the freshly
 * rendered editor. No-op when the editor is gone (left edit mode) or a
 * field cannot be re-found — same silent-skip contract as the rest of
 * continuity. Matches fields by `data-pkc-field` + `data-pkc-log-id`
 * (the latter disambiguates textlog per-row textareas).
 */
function restoreEditorFields(
  root: HTMLElement,
  fields: ReadonlyArray<EditorFieldSnapshot>,
): void {
  if (fields.length === 0) return;
  const editor = root.querySelector<HTMLElement>('[data-pkc-mode="edit"]');
  if (!editor) return;
  for (const f of fields) {
    const el = findEditorField(editor, f);
    if (!el) continue;
    if (el.value !== f.value) el.value = f.value;
    if (f.caretStart !== null) {
      try {
        el.setSelectionRange(f.caretStart, f.caretEnd ?? f.caretStart);
      } catch {
        /* input types without selection support — value restore already won */
      }
    }
  }
}

/** Re-find a captured editor field by `data-pkc-field` (+ `data-pkc-log-id`). */
function findEditorField(
  editor: HTMLElement,
  f: EditorFieldSnapshot,
): HTMLInputElement | HTMLTextAreaElement | null {
  const selector =
    `input[data-pkc-field="${escapeAttributeValue(f.field)}"],` +
    `textarea[data-pkc-field="${escapeAttributeValue(f.field)}"]`;
  const candidates = editor.querySelectorAll<HTMLElement>(selector);
  for (const el of candidates) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) continue;
    // null === null (field has no log id) or equal string (same textlog row).
    if (el.getAttribute('data-pkc-log-id') === f.logId) return el;
  }
  return null;
}

function applyScrollSnapshot(
  root: HTMLElement,
  scrolls: ReadonlyArray<{ region: string; top: number }>,
): void {
  for (const { region, top } of scrolls) {
    const el = root.querySelector<HTMLElement>(`[data-pkc-region="${region}"]`);
    if (el && el.scrollTop !== top) el.scrollTop = top;
  }
}

function captureFocus(root: HTMLElement): RenderFocusSnapshot | null {
  const active = root.ownerDocument?.activeElement ?? null;
  if (!(active instanceof HTMLElement)) return null;
  if (!root.contains(active)) return null;

  const field = active.getAttribute('data-pkc-field');
  const lid = active.getAttribute('data-pkc-lid');
  const logId = active.getAttribute('data-pkc-log-id');

  // If no re-identification key is present the element is either a
  // button we just clicked (focus there is noise) or something we
  // can't address post-render — bail out so we don't yank focus.
  if (!field && !lid && !logId) return null;

  let caretStart: number | null = null;
  let caretEnd: number | null = null;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    // `selectionStart` / `selectionEnd` throw on input types without
    // selection support (e.g. type=number). Wrapping the read in
    // try/catch keeps the snapshot path side-effect-free.
    try {
      caretStart = active.selectionStart;
      caretEnd = active.selectionEnd;
    } catch {
      caretStart = null;
      caretEnd = null;
    }
  }

  return { field, lid, logId, caretStart, caretEnd };
}

function restoreFocus(root: HTMLElement, focus: RenderFocusSnapshot | null): void {
  if (!focus) return;

  let target: HTMLElement | null = null;
  if (focus.field) {
    target = root.querySelector<HTMLElement>(
      `[data-pkc-field="${escapeAttributeValue(focus.field)}"]`,
    );
  }
  if (!target && focus.logId) {
    target = root.querySelector<HTMLElement>(
      `[data-pkc-log-id="${escapeAttributeValue(focus.logId)}"]`,
    );
  }
  if (!target && focus.lid) {
    target = root.querySelector<HTMLElement>(
      `[data-pkc-lid="${escapeAttributeValue(focus.lid)}"]`,
    );
  }
  if (!target) return;

  target.focus();

  if (
    focus.caretStart !== null
    && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  ) {
    try {
      target.setSelectionRange(focus.caretStart, focus.caretEnd ?? focus.caretStart);
    } catch {
      /* input types without selection support (e.g. type=number)
       * throw from setSelectionRange; focus itself succeeded, so
       * swallow. */
    }
  }
}

/** Escape a user-supplied attribute value for safe use inside a
 * CSS attribute-equality selector. Handles the two characters that
 * would otherwise break a `[attr="..."]` selector: `\` and `"`. */
function escapeAttributeValue(v: string): string {
  return v.replace(/[\\"]/g, '\\$&');
}
