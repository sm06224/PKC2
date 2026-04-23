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
 * of capture / restore; no dependency between them. */
const SCROLL_REGIONS = ['sidebar', 'center-content', 'meta'] as const;

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

export interface RenderContinuitySnapshot {
  readonly scrolls: ReadonlyArray<{ region: string; top: number }>;
  readonly focus: RenderFocusSnapshot | null;
}

const EMPTY_SNAPSHOT: RenderContinuitySnapshot = {
  scrolls: [],
  focus: null,
};

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
  return { scrolls, focus };
}

/**
 * Apply a previously-captured snapshot against `root` after a
 * re-render. Missing targets are silently skipped.
 */
export function restoreRenderContinuity(
  root: HTMLElement,
  snapshot: RenderContinuitySnapshot,
): void {
  if (!root) return;

  for (const { region, top } of snapshot.scrolls) {
    const el = root.querySelector<HTMLElement>(`[data-pkc-region="${region}"]`);
    if (el) el.scrollTop = top;
  }

  restoreFocus(root, snapshot.focus);
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
