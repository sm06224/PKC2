/**
 * Link Paste Handler — adapter wiring for the PKC permalink intake.
 *
 * When a user pastes a `pkc://<container_id>/...` URL into a body
 * editor, this helper:
 *
 *   1. Asks the features-layer `convertPastedText` whether the raw
 *      text resolves to an internal reference (same container) or
 *      passes through as external (cross-container, malformed,
 *      ordinary URL, plain text).
 *   2. On internal resolution AND when the source was a permalink,
 *      wraps the result as `[](entry:<lid>)` / `[](asset:<key>)`
 *      and inserts it into the textarea / input under the caret,
 *      replacing any selected range.
 *   3. Reports back to the caller whether it handled the paste so
 *      the caller can `preventDefault()` only when something was
 *      written.
 *
 * Spec: `docs/spec/pkc-link-unification-v0.md` §6.1 (link
 * presentation), §7 (paste conversion). The empty `[]` label is
 * intentional and matches §6.1 — the renderer fills it in from the
 * target entry's title at display time.
 *
 * Scope deliberately narrow:
 *   - `<textarea>` and text-capable `<input>` only
 *   - permalink → internal demotion is the *only* trigger; bare
 *     `entry:` / `asset:` paste-throughs are NOT wrapped (the user
 *     typed the internal form on purpose, we should leave it alone)
 *   - ordinary URLs / plain text / cross-container permalinks fall
 *     through to the browser's default paste so existing UX stays
 *     byte-for-byte identical
 *
 * Adapter layer: imports from features (`convertPastedText`) and
 * touches the DOM, but contains no state-machine wiring beyond the
 * `currentContainerId` that the caller passes in.
 */

import { convertPastedText } from '../../features/link/paste-conversion';

/**
 * Either the textarea or the text-capable input that received the
 * paste. We intentionally avoid `HTMLElement` so the type signature
 * documents the supported surfaces.
 */
export type PasteableEditor = HTMLTextAreaElement | HTMLInputElement;

const PKC_SCHEME = 'pkc://';

/**
 * Try to convert a pasted PKC permalink into an internal markdown
 * link and insert it into `target`. Returns `true` when the helper
 * handled the paste (caller should `preventDefault`); `false` means
 * the browser default paste should proceed.
 *
 * `currentContainerId` is the active container's `meta.container_id`.
 * An empty string opts out of all conversion as a bootstrap-safety
 * measure — we never want to demote a permalink before the host
 * app knows its own identity.
 */
export function maybeHandleLinkPaste(
  target: PasteableEditor | null,
  rawText: string,
  currentContainerId: string,
): boolean {
  if (target === null) return false;
  if (typeof rawText !== 'string' || rawText === '') return false;
  if (typeof currentContainerId !== 'string' || currentContainerId === '') {
    return false;
  }

  // Only `pkc://` permalinks trigger the wrapping. Bare internal
  // refs (`entry:` / `asset:`) the user typed by hand should be
  // left untouched even though `convertPastedText` would classify
  // them as internal — wrapping them silently surprises the writer.
  if (!rawText.startsWith(PKC_SCHEME)) return false;

  const result = convertPastedText(rawText, currentContainerId);
  if (result.type !== 'internal') return false;

  // §6.1: empty label is filled in by the renderer at display time
  // from the target entry's title; we do not synthesise a label here.
  const inserted = `[](${result.target})`;

  insertIntoEditable(target, inserted);
  return true;
}

/**
 * Splice `text` into `target` at the caret / selection. Prefers
 * `execCommand('insertText')` so the browser's native undo stack
 * stays intact and the synthetic paste integrates with downstream
 * `input` listeners (dirty tracking, edit preview debounce, etc).
 *
 * Falls back to a manual splice + synthetic `input` event when
 * `execCommand` is unavailable (older browsers, headless test
 * environments, sandboxed iframes).
 */
function insertIntoEditable(target: PasteableEditor, text: string): void {
  if (
    typeof document !== 'undefined' &&
    typeof document.execCommand === 'function'
  ) {
    // execCommand requires the element to own focus; otherwise the
    // command silently no-ops and we'd lose the inserted text.
    target.focus();
    if (document.execCommand('insertText', false, text)) return;
  }

  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  target.value = target.value.slice(0, start) + text + target.value.slice(end);
  const pos = start + text.length;
  // setSelectionRange can throw on a few <input type=…> variants
  // (number / email). Keep this single guard so a future intake
  // surface that hands us such an input doesn't break the paste.
  try {
    target.setSelectionRange(pos, pos);
  } catch {
    /* unsupported input type — caret stays where the browser put it */
  }
  target.dispatchEvent(new Event('input', { bubbles: true }));
}
