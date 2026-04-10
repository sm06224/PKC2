/**
 * Clipboard helpers for the TEXT / TEXTLOG copy actions.
 *
 * Two entry points:
 *
 * - `copyPlainText(text)` — writes `text/plain` only. Used by the
 *   "Copy Markdown Source" action and by the context-menu reference
 *   string items.
 * - `copyMarkdownAndHtml(markdown, html)` — writes `text/plain`
 *   (markdown) AND `text/html` (rendered) in a single clipboard
 *   write, so pasting into a markdown-aware editor keeps the raw
 *   source while pasting into a rich-text target (email, chat,
 *   Office) lands the rendered HTML. Used by the "Copy Rendered"
 *   action.
 *
 * Both functions apply a fallback chain so the happy-dom test
 * environment — and older browsers without `navigator.clipboard` —
 * still work:
 *
 *   1. `navigator.clipboard.write([new ClipboardItem({…})])` — rich,
 *      async, best UX when both mime types are desired.
 *   2. `navigator.clipboard.writeText(text)` — plain fallback.
 *   3. `document.execCommand('copy')` via a hidden textarea — legacy
 *      fallback; synchronous; works inside happy-dom.
 *
 * The helpers are **adapter-layer only** — the features layer must
 * never import them. They return a Promise resolving to a boolean
 * describing whether the copy landed on the clipboard so the caller
 * can flash an inline confirmation on success.
 */

/**
 * Copy a single plain-text payload to the clipboard.
 *
 * Returns `true` when any path succeeded. Returns `false` when all
 * paths failed (permissions denied, no clipboard API, no execCommand
 * fallback). Never throws.
 */
export async function copyPlainText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand
    }
  }
  return legacyCopy(text);
}

/**
 * Copy a rich payload (markdown source + rendered HTML) as a single
 * clipboard write.
 *
 * Paste target selects which representation it wants:
 * - Plain text editors / markdown tools → `text/plain` (markdown
 *   source).
 * - Rich editors (Gmail, Word, Slack) → `text/html` (rendered).
 *
 * Returns `true` when any path succeeded. Falls back to plain text
 * on the markdown source if the `ClipboardItem` / `clipboard.write`
 * path is unavailable.
 */
export async function copyMarkdownAndHtml(markdown: string, html: string): Promise<boolean> {
  const ClipboardItemCtor: typeof ClipboardItem | undefined =
    typeof ClipboardItem !== 'undefined' ? ClipboardItem : undefined;

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    ClipboardItemCtor &&
    typeof Blob !== 'undefined'
  ) {
    try {
      const item = new ClipboardItemCtor({
        'text/plain': new Blob([markdown], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      });
      await navigator.clipboard.write([item]);
      return true;
    } catch {
      // fall through to plain text
    }
  }
  return copyPlainText(markdown);
}

/**
 * Legacy fallback: spawn a hidden textarea, select its contents,
 * and trigger `execCommand('copy')`.
 *
 * happy-dom does not implement `execCommand('copy')` but does not
 * throw either — it returns `undefined`. We treat any non-true
 * return value as failure so tests can still observe the attempt.
 */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  let ok = false;
  try {
    ta.select();
    ok = document.execCommand?.('copy') === true;
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(ta);
  }
  return ok;
}
