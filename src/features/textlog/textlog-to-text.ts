/**
 * TEXTLOG → TEXT conversion (pure).
 *
 * Implements the Slice 4 pipeline from
 * `docs/development/textlog-text-conversion.md` §2:
 *
 * - Input:  one TEXTLOG entry + an arbitrary subset of its log ids.
 * - Output: a `{ title, body }` pair representing the new TEXT entry
 *   that would be created. Caller is responsible for dispatching
 *   `CREATE_ENTRY` + `COMMIT_EDIT` to persist it — this module
 *   touches no DOM and no dispatcher.
 *
 * Design decisions locked by spec:
 * - Selected logs are emitted in **chronological ascending** order,
 *   regardless of the viewer's current `order` (live viewer is desc).
 * - Logs are grouped into day sections keyed on local-time
 *   `yyyy-mm-dd` via `toLocalDateKey()` (shared with `textlog-doc`).
 * - A log whose `text` is empty / whitespace-only is skipped — no
 *   `###` heading, no backlink. This matches the viewer's behavior of
 *   not rendering empty rows.
 * - Each log emits a `[↩ source log](entry:<lid>#log/<id>)` backlink
 *   at its tail so the generated TEXT remains addressable back to
 *   its origin (spec §2.6 decision (A)).
 * - Title format is fixed to `<src title> — log extract <yyyy-mm-dd>`
 *   where the date is the extraction date (local TZ). This is
 *   deterministic given `now`.
 *
 * Non-goals:
 * - Does NOT mutate the source TEXTLOG. Conversion is read-only.
 * - Does NOT preserve `flags` (`important`) — viewer-only metadata.
 * - Does NOT attempt to keep log ids stable across round-trips
 *   (TEXTLOG → TEXT → TEXTLOG will produce fresh ids).
 *
 * Features layer — no browser APIs.
 */

import type { Entry } from '../../core/model/record';
import { parseTextlogBody, type TextlogEntry } from './textlog-body';
import { toLocalDateKey } from './textlog-doc';
import { slugifyHeading } from '../markdown/markdown-toc';

/** Result of a conversion attempt. */
export interface TextlogToTextResult {
  /** Title for the new TEXT entry. */
  title: string;
  /** Markdown body for the new TEXT entry. */
  body: string;
  /** Number of logs that contributed to the output (post-skip). */
  emittedCount: number;
  /** Number of logs that were skipped because they were empty. */
  skippedEmptyCount: number;
}

export interface TextlogToTextOptions {
  /**
   * Extraction timestamp. Used for the title suffix and for the
   * blockquote metadata. Defaults to `new Date()`. Injectable for
   * deterministic tests.
   */
  now?: Date;
}

/**
 * Convert a subset of a TEXTLOG's logs to a new TEXT body + title.
 *
 * `selectedLogIds` is treated as a set — order is ignored (the
 * function imposes chronological asc). Ids that do not match any log
 * in the source are silently ignored; this keeps the call site simple
 * when the user's selection is a strict subset of the viewer's DOM.
 *
 * Non-textlog `source` or an empty resolved selection both yield a
 * body with only the header/blockquote and zero day sections. Callers
 * (preview UI) should treat `emittedCount === 0` as "nothing to
 * commit" and disable the confirm button accordingly.
 */
export function textlogToText(
  source: Entry,
  selectedLogIds: ReadonlyArray<string> | ReadonlySet<string>,
  options: TextlogToTextOptions = {},
): TextlogToTextResult {
  const now = options.now ?? new Date();
  const selection = selectedLogIds instanceof Set
    ? selectedLogIds
    : new Set(selectedLogIds);

  const parsed = source.archetype === 'textlog'
    ? parseTextlogBody(source.body)
    : { entries: [] };

  // Storage order is the append order; asc sort within a day is
  // inherited from that order. For cross-day sort we use the
  // dateKey (ISO yyyy-mm-dd is lexicographically sortable) and
  // fall back to createdAt for stability within pathological
  // out-of-order data (e.g. rows whose createdAt was hand-edited
  // to a past time).
  const chosen: TextlogEntry[] = parsed.entries.filter((e) => selection.has(e.id));
  chosen.sort((a, b) => {
    const ka = toLocalDateKey(a.createdAt);
    const kb = toLocalDateKey(b.createdAt);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });

  let skippedEmptyCount = 0;
  const buckets = new Map<string, TextlogEntry[]>();
  for (const e of chosen) {
    if (!e.text.trim()) {
      skippedEmptyCount += 1;
      continue;
    }
    const key = toLocalDateKey(e.createdAt);
    const list = buckets.get(key) ?? [];
    list.push(e);
    buckets.set(key, list);
  }

  const emittedCount = [...buckets.values()].reduce((n, xs) => n + xs.length, 0);

  // Build body.
  const srcTitle = source.title || '(untitled)';
  const extractedAtIso = now.toISOString();
  const extractionDateKey = toLocalDateKey(extractedAtIso);
  const title = `${srcTitle} — log extract ${extractionDateKey}`;

  const lines: string[] = [];
  lines.push(`# ${srcTitle} (log extract)`);
  lines.push('');
  lines.push(`> Source: [${srcTitle}](entry:${source.lid})`);
  lines.push(`> Extracted: ${extractedAtIso}`);
  if (emittedCount === 0) {
    lines.push(`> Logs: 0 entries`);
  } else {
    const firstKey = [...buckets.keys()].sort()[0]!;
    const lastKey = [...buckets.keys()].sort().slice(-1)[0]!;
    const range = firstKey === lastKey ? firstKey : `${firstKey} to ${lastKey}`;
    const noun = emittedCount === 1 ? 'entry' : 'entries';
    lines.push(`> Logs: ${emittedCount} ${noun} from ${range}`);
  }
  lines.push('');

  const orderedKeys = [...buckets.keys()].sort();
  for (const key of orderedKeys) {
    const dayLabel = key === '' ? 'Undated' : key;
    lines.push(`## ${dayLabel}`);
    lines.push('');
    for (const log of buckets.get(key)!) {
      const time = formatLocalTime(log.createdAt);
      const slug = logSlug(log.text);
      lines.push(`### ${time} — ${slug}`);
      lines.push('');
      // Body is emitted verbatim. We do not reflow, do not strip
      // trailing whitespace, and do not require the log author to
      // have used markdown — plain text renders fine under
      // renderMarkdown since the log heading is a separate line.
      lines.push(log.text.replace(/\s+$/u, ''));
      lines.push('');
      lines.push(`[↩ source log](entry:${source.lid}#log/${log.id})`);
      lines.push('');
    }
  }

  return {
    title,
    body: lines.join('\n').replace(/\n+$/u, '\n'),
    emittedCount,
    skippedEmptyCount,
  };
}

/** `HH:mm:ss` in local time; falls back to the raw iso on parse failure. */
function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Build a short human slug from the first non-empty line of a log.
 *
 * Caps at 40 characters after slugification so the `###` heading
 * stays readable. Falls back to `log` when the body has no
 * slug-eligible characters (e.g. pure punctuation).
 */
function logSlug(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  // 40-char source cap first, THEN slugify. Slugifying the full body
  // and truncating the result would risk chopping inside a
  // grapheme. Truncating source chars first + slugify avoids that.
  const capped = firstLine.trim().slice(0, 40);
  const slug = slugifyHeading(capped);
  return slug || 'log';
}
