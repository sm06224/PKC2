/**
 * Card excerpt builder — Slice 5.1 (2026-04-25).
 *
 * Pure helper. Produces a short plain-text snippet for the card
 * widget chrome to display under the title for the `ok` state. The
 * goal is "user can tell at a glance which entry this card points
 * to", not "render the body" — so the output is intentionally
 * lossy: markdown structure is flattened, links / images are
 * reduced to their visible text, and the result is sliced to a
 * fixed character budget.
 *
 * Spec: docs/spec/card-embed-presentation-v0.md §5.4
 *       docs/development/card-widget-ui-v0-audit.md §3 (Slice 5.1)
 *
 * Critical XSS rule:
 *
 *   The output is **plain text only**. Callers MUST set it via
 *   `textContent` — never `innerHTML`. By construction the markdown
 *   pipeline (markdown-it / asset-resolver) is **never** invoked
 *   from here, so the chain that turns `[label](javascript:...)`
 *   into a live anchor cannot be triggered through the excerpt
 *   path. This is the whole reason the helper exists as a separate
 *   module from the renderer.
 *
 * Out of scope:
 *   - thumbnail (Slice 5.2)
 *   - variant-specific layout (Slice 6)
 *   - asset-target excerpts (asset cards stay future per audit)
 *   - cross-container excerpts (skeleton card has no body to show)
 */
import type { Entry, ArchetypeId } from '@core/model/record';
import type { ParsedEntryRef } from '@features/entry-ref/entry-ref';
import { parseTodoBody } from '@features/todo/todo-body';
import { parseTextlogBody, type TextlogEntry } from '@features/textlog/textlog-body';

/** Hard ceiling on the excerpt length. Trailing ellipsis is added on overflow. */
const MAX_LEN = 160;
const ELLIPSIS = '…';

/**
 * Generate a plain-text excerpt for a resolved card target. Returns
 * `null` when there is nothing useful to show — the hydrator drops
 * the excerpt slot entirely in that case (no empty `<span>`).
 */
export function buildCardExcerpt(
  entry: Entry,
  parsed: ParsedEntryRef,
): string | null {
  // Only `ok`-state archetypes that carry text in their body need
  // excerpts. Attachments / folders / generic / opaque / system-*
  // all skip — their archetype badge + title combination is the
  // intended signal at this slice.
  switch (entry.archetype) {
    case 'text':
      return finalize(flattenMarkdown(entry.body));
    case 'textlog':
      return finalize(textlogExcerpt(entry.body, parsed));
    case 'todo':
      return finalize(todoExcerpt(entry.body));
    case 'form':
      return finalize(formExcerpt(entry.body));
    case 'attachment':
    case 'folder':
    case 'generic':
    case 'opaque':
    default:
      return excerptForOther(entry.archetype, entry.body);
  }
}

/**
 * Trim, collapse whitespace, slice, and append ellipsis. Returns
 * `null` when the cleaned source is empty so the hydrator can skip
 * the excerpt slot entirely.
 */
function finalize(raw: string): string | null {
  // Replace any control / newline run with a single space, then
  // trim. Avoids "blank lines = empty excerpt that still occupies
  // chrome space" surprises.
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return null;
  if (collapsed.length <= MAX_LEN) return collapsed;
  // Slice on grapheme-safe boundary by simply cutting at MAX_LEN -
  // 1 and appending ellipsis. Good enough for the chrome line.
  return collapsed.slice(0, MAX_LEN - 1) + ELLIPSIS;
}

/**
 * Flatten markdown source into plain text suitable for an inline
 * snippet. The transformation is deliberately destructive — we are
 * NOT trying to round-trip, we are trying to show what a human
 * would read out loud.
 */
function flattenMarkdown(src: string): string {
  if (!src) return '';
  let s = src;
  // Drop fenced code blocks wholesale — their content is rarely a
  // useful snippet and they often contain noise (CSV, JSON, etc.).
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/~~~[\s\S]*?~~~/g, ' ');
  // Drop scriptable HTML containers including their contents BEFORE
  // the generic tag-strip below — otherwise we would keep the text
  // `alert(1)` from inside a `<script>` block. Treating these
  // containers as opaque is the safest behaviour for an excerpt
  // surface even though `markdown-it` is configured `html: false`
  // upstream; user-pasted bodies can still contain literal tags.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  // Drop card placeholders BEFORE link reduction so the inner
  // `[card](target)` doesn't get mistaken for an ordinary link.
  s = s.replace(/@\[card(?::[a-z]+)?\]\((?:[^()]|\([^)]*\))*\)/g, ' ');
  // Drop image embeds entirely — `![alt](url)` becomes empty so
  // adjacent text isn't polluted by the alt string. The pattern
  // supports one level of paren nesting in the URL so things like
  // `(asset:k)` followed by a stray `)` still parse cleanly.
  s = s.replace(/!\[[^\]]*\]\((?:[^()]|\([^)]*\))*\)/g, ' ');
  // Reduce link text to its label — `[label](url)` → `label`.
  // Empty-label links (`[](url)`) collapse to a single space so we
  // don't silently render the URL. The same nested-paren regex
  // matches link targets like `javascript:alert(1)` cleanly.
  s = s.replace(
    /\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g,
    (_m, label) => (label as string) || ' ',
  );
  // Strip inline code backticks (preserve the inner text).
  s = s.replace(/`([^`]*)`/g, '$1');
  // Strip emphasis / strong / strike marks but keep the inner text.
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/_([^_]+)_/g, '$1');
  s = s.replace(/~~([^~]+)~~/g, '$1');
  // Strip line-leading markers — heading hashes, list bullets,
  // ordered-list numbers, blockquote chevrons. Done per-line so a
  // mid-line `>` (e.g. inside a quoted phrase) survives.
  s = s
    .split('\n')
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s{0,3}>\s?/, '')
      .replace(/^\s{0,3}[-*+]\s+/, '')
      .replace(/^\s{0,3}\d+\.\s+/, ''))
    .join(' ');
  // Strip remaining stray HTML tags — if a body included a literal
  // `<div>` etc. we don't want it in the snippet.
  s = s.replace(/<[^>]+>/g, ' ');
  return s;
}

function textlogExcerpt(body: string, parsed: ParsedEntryRef): string {
  const tl = parseTextlogBody(body);
  if (tl.entries.length === 0) return '';
  const pick = pickTextlogEntry(tl.entries, parsed);
  if (!pick) return '';
  return flattenMarkdown(pick.text);
}

/**
 * Pick which log entry feeds the excerpt for a textlog card.
 *
 *   `entry:<lid>`                 → most recent log (last in array,
 *                                   matches the live viewer's
 *                                   "newest at top" order)
 *   `entry:<lid>#log/<id>`        → the named log
 *   `entry:<lid>#day/<yyyy-mm-dd>` → first log on that day
 *   `entry:<lid>#log/.../<slug>`   (heading) → owning log
 *   `range` / `legacy`            → first log of the from / legacy id
 *
 * Returns `null` when nothing matches — the excerpt slot stays
 * empty rather than guessing.
 */
function pickTextlogEntry(
  logs: readonly TextlogEntry[],
  parsed: ParsedEntryRef,
): TextlogEntry | null {
  switch (parsed.kind) {
    case 'entry':
      return logs[logs.length - 1] ?? null;
    case 'log':
      return logs.find((l) => l.id === parsed.logId) ?? null;
    case 'day': {
      // dateKey is YYYY-MM-DD. createdAt is ISO; first 10 chars are
      // the same calendar slice we want. UTC-based is fine for the
      // excerpt — exact timezone alignment is not the point here.
      return logs.find((l) => l.createdAt.slice(0, 10) === parsed.dateKey) ?? null;
    }
    case 'range':
      return logs.find((l) => l.id === parsed.fromId) ?? null;
    case 'heading':
    case 'legacy':
      return logs.find((l) => l.id === parsed.logId) ?? null;
    case 'invalid':
      return null;
  }
}

function todoExcerpt(body: string): string {
  const todo = parseTodoBody(body);
  // The status / date / archived flags are already shown by the
  // archetype badge layer; the description is the only piece that
  // carries new information into the excerpt slot.
  return flattenMarkdown(todo.description ?? '');
}

function formExcerpt(body: string): string {
  // Form bodies are JSON. Walking the schema is overkill for a
  // snippet — we just lift the first plain-string value we see, in
  // declaration order, so users get *something* recognisable.
  if (!body) return '';
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === 'object') {
      for (const value of Object.values(parsed as Record<string, unknown>)) {
        if (typeof value === 'string' && value.trim().length > 0) {
          return value;
        }
      }
    }
  } catch {
    // Malformed JSON — fall through to empty.
  }
  return '';
}

/**
 * Default branch for archetypes that do NOT use prose excerpts:
 *   - attachment: filename + size belong on a future Slice 5.2
 *     thumbnail row, not here
 *   - folder: descendant counts need a container walk; excerpt is
 *     a body-only signal at Slice 5.1, so we treat folder
 *     descriptions as plain markdown like TEXT (still useful when
 *     the folder has a written description, otherwise null)
 *   - generic / opaque: explicit no-preview archetypes
 *   - system-*: hidden entries, do not surface in cards
 */
function excerptForOther(
  archetype: ArchetypeId,
  body: string,
): string | null {
  if (archetype === 'folder') return finalize(flattenMarkdown(body));
  return null;
}
