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
import type { Entry } from '../../core/model/record';
import { parseTextlogBody } from '../../features/textlog/textlog-body';

/**
 * Either the textarea or the text-capable input that received the
 * paste. We intentionally avoid `HTMLElement` so the type signature
 * documents the supported surfaces.
 */
export type PasteableEditor = HTMLTextAreaElement | HTMLInputElement;

const PKC_SCHEME = 'pkc://';
const PKC_FRAGMENT_MARKER = '#pkc?';

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
 *
 * `entries` (optional) lets the helper synthesize a human-readable
 * label by looking up the target entry's title / attachment name.
 * Without it we fall back to an empty label, which CommonMark
 * renders as an invisible anchor — so callers that can supply the
 * container's entries should do so.
 */
export function maybeHandleLinkPaste(
  target: PasteableEditor | null,
  rawText: string,
  currentContainerId: string,
  entries?: readonly Entry[],
): boolean {
  if (target === null) return false;
  if (typeof rawText !== 'string' || rawText === '') return false;
  if (typeof currentContainerId !== 'string' || currentContainerId === '') {
    return false;
  }

  // Trigger only on the two forms paste-conversion can demote:
  //   - Portable PKC Reference: `pkc://<cid>/...`
  //   - External Permalink:     `<base>#pkc?...`
  // Bare internal refs (`entry:` / `asset:`) the user typed by hand
  // should be left untouched — wrapping them silently surprises the
  // writer. Plain text / ordinary URLs / Office URI / obsidian /
  // vscode / mailto are out of scope by the same trigger guard.
  const isPortableReference = rawText.startsWith(PKC_SCHEME);
  const isExternalPermalink = rawText.includes(PKC_FRAGMENT_MARKER);
  if (!isPortableReference && !isExternalPermalink) return false;

  const result = convertPastedText(rawText, currentContainerId);
  if (result.type !== 'internal') return false;

  // Synthesize a label from the target entry / attachment name.
  // CommonMark requires non-empty link text for the anchor to render,
  // so `[](entry:lid)` produces an invisible link in several viewers
  // (including PKC2's own renderer when the label is empty). Mirror
  // what `copy-entry-ref` / `copy-asset-ref` do at copy time:
  // capture the title string now and embed it in the markdown link.
  // Stale labels after a later rename are acceptable — same tradeoff
  // the copy path already makes.
  const label = resolveLabel(result.target, entries);
  const inserted = `[${label}](${result.target})`;

  insertIntoEditable(target, inserted);
  return true;
}

/**
 * Look up a human-readable label for an internal reference target
 * (`entry:<lid>[#<frag>]` or `asset:<key>`). Returns the entry title
 * / attachment name with `]` and `\` escaped so the surrounding
 * `[...](...)` syntax stays intact. Falls back to `'(untitled)'`
 * when `entries` is missing or no match is found — the paste still
 * produces a visible, clickable anchor in that case.
 */
function resolveLabel(
  internalTarget: string,
  entries: readonly Entry[] | undefined,
): string {
  const fallback = '(untitled)';
  if (!entries) return fallback;

  if (internalTarget.startsWith('entry:')) {
    const rest = internalTarget.slice('entry:'.length);
    const hashIdx = rest.indexOf('#');
    const lid = hashIdx === -1 ? rest : rest.slice(0, hashIdx);
    const fragment = hashIdx === -1 ? '' : rest.slice(hashIdx + 1);
    if (!lid) return fallback;
    const hit = entries.find((e) => e.lid === lid);
    const entryTitle = hit?.title || fallback;

    // Log fragment specialisation — Phase 1 step 3 (audit G1/G2 pair).
    // When the canonical `log/<logId>` fragment points at an existing
    // TEXTLOG row, synthesise `<entry title> › <snippet>` so the
    // pasted link names the specific row rather than the whole entry.
    // Legacy fragments(`entry:<lid>#<bare-logId>` / `#day/...` /
    // heading-style `#log/<id>/<slug>` / range `#log/a..b`) fall
    // through to the entry-title label — we do not auto-normalise
    // legacy shapes here, only emit fresh canonical paste output.
    if (fragment.startsWith('log/') && hit?.archetype === 'textlog') {
      const snippet = resolveLogSnippet(hit, fragment.slice('log/'.length));
      if (snippet !== null) {
        return escapeMarkdownLabel(`${entryTitle} › ${snippet}`);
      }
      // Log row missing (deleted / unknown id) — keep target intact
      // but generalise the label so the anchor still reads cleanly.
      return escapeMarkdownLabel(`${entryTitle} › Log`);
    }

    return escapeMarkdownLabel(entryTitle);
  }

  if (internalTarget.startsWith('asset:')) {
    const key = internalTarget.slice('asset:'.length);
    if (!key) return fallback;
    for (const ent of entries) {
      if (ent.archetype !== 'attachment') continue;
      if (typeof ent.body !== 'string' || ent.body === '') continue;
      let parsed: { name?: unknown; asset_key?: unknown } | null = null;
      try {
        parsed = JSON.parse(ent.body) as {
          name?: unknown;
          asset_key?: unknown;
        };
      } catch {
        continue;
      }
      if (parsed && parsed.asset_key === key) {
        const name =
          typeof parsed.name === 'string' && parsed.name !== ''
            ? parsed.name
            : ent.title || fallback;
        return escapeMarkdownLabel(name);
      }
    }
    return fallback;
  }

  return fallback;
}

const LOG_SNIPPET_MAX = 40;

/**
 * Build a short, single-line snippet for a log row, or `null` when
 * the row cannot be located. Callers use the `null` return to fall
 * back to a generic `Log` label, so we keep this function strict
 * about what counts as "a single log row":
 *
 *   - range fragments (`log/a..b`)          → null
 *   - heading fragments (`log/<id>/<slug>`) → null
 *   - empty id                              → null
 *
 * Snippet priority: first-line of `text` trimmed + whitespace
 * collapsed, capped at 40 chars with a trailing `…`. Falls back to
 * `row.createdAt` when the row has no text at all.
 */
function resolveLogSnippet(entry: Entry, logIdPart: string): string | null {
  if (logIdPart === '' || logIdPart.includes('..') || logIdPart.includes('/')) {
    return null;
  }
  try {
    const body = parseTextlogBody(entry.body);
    const row = body.entries.find((r) => r.id === logIdPart);
    if (!row) return null;
    const text = (row.text ?? '').replace(/\s+/g, ' ').trim();
    if (text !== '') {
      return text.length > LOG_SNIPPET_MAX
        ? `${text.slice(0, LOG_SNIPPET_MAX)}…`
        : text;
    }
    return row.createdAt;
  } catch {
    return null;
  }
}

/**
 * Markdown label escape. Doubles `\`, `[`, `]` so the surrounding
 * `[...](...)` syntax is not broken by user-authored titles.
 * Mirrors the local helper in `action-binder.ts` (kept inline here
 * to avoid an adapter→adapter dependency edge).
 */
function escapeMarkdownLabel(label: string): string {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
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
