/**
 * TEXTLOG body helpers — pure functions for the textlog archetype.
 *
 * A textlog body is a JSON string containing an array of log entries,
 * each with an id, text, timestamp, and optional flags.
 *
 * No browser APIs — features layer.
 */

import { formatDate } from '../datetime/datetime-format';

export type TextlogFlag = 'important';

export interface TextlogEntry {
  id: string;
  text: string;
  createdAt: string; // ISO 8601
  flags: TextlogFlag[];
}

export interface TextlogBody {
  entries: TextlogEntry[];
}

/**
 * Parse a textlog body string into a TextlogBody.
 * Returns an empty body for invalid/empty input.
 */
export function parseTextlogBody(body: string): TextlogBody {
  if (!body) return { entries: [] };
  try {
    const parsed = JSON.parse(body);
    if (parsed && Array.isArray(parsed.entries)) {
      return {
        entries: parsed.entries.map((e: Record<string, unknown>) => ({
          id: typeof e.id === 'string' ? e.id : generateLogId(),
          text: typeof e.text === 'string' ? e.text : '',
          createdAt: typeof e.createdAt === 'string' ? e.createdAt : new Date().toISOString(),
          flags: Array.isArray(e.flags) ? e.flags.filter((f: unknown) => typeof f === 'string') : [],
        })),
      };
    }
  } catch {
    // not valid JSON
  }
  return { entries: [] };
}

/**
 * Serialize a TextlogBody to a JSON string.
 */
export function serializeTextlogBody(body: TextlogBody): string {
  return JSON.stringify(body);
}

/**
 * Append a new log entry with auto-generated id and timestamp.
 */
export function appendLogEntry(body: TextlogBody, text: string, now: Date = new Date()): TextlogBody {
  const entry: TextlogEntry = {
    id: generateLogId(),
    text,
    createdAt: now.toISOString(),
    flags: [],
  };
  return { entries: [...body.entries, entry] };
}

/**
 * Update the text of a log entry by id.
 */
export function updateLogEntry(body: TextlogBody, entryId: string, newText: string): TextlogBody {
  return {
    entries: body.entries.map((e) =>
      e.id === entryId ? { ...e, text: newText } : e,
    ),
  };
}

/**
 * Toggle a flag on a log entry.
 */
export function toggleLogFlag(body: TextlogBody, entryId: string, flag: TextlogFlag): TextlogBody {
  return {
    entries: body.entries.map((e) => {
      if (e.id !== entryId) return e;
      const has = e.flags.includes(flag);
      return {
        ...e,
        flags: has ? e.flags.filter((f) => f !== flag) : [...e.flags, flag],
      };
    }),
  };
}

/**
 * Delete a log entry by id.
 */
export function deleteLogEntry(body: TextlogBody, entryId: string): TextlogBody {
  return {
    entries: body.entries.filter((e) => e.id !== entryId),
  };
}

/**
 * Format a timestamp for display.
 * Shows date + localized weekday + HH:mm. The date portion is produced
 * by the shared `formatDate` helper so log timestamps match the rest of
 * the app's date formatting conventions.
 */
export function formatLogTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
  return `${formatDate(d)} ${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Serialize a textlog body as a single Markdown document.
 *
 * Used by the copy-to-clipboard and "open rendered viewer" paths so
 * TEXTLOG entries can be round-tripped as a plain document:
 *
 *   ## 2026/04/09 Thu 10:00
 *
 *   First log entry text (possibly markdown)
 *
 *   ## 2026/04/09 Thu 10:05 ★
 *
 *   Second log entry — important flag exposes a gold star suffix
 *   on the heading so the "important" signal survives the flattening.
 *
 * Rules (pinned by tests):
 * - Entries are emitted in **original order** (the container already
 *   keeps them in append order; we intentionally do not re-sort by
 *   timestamp, matching the on-screen view's "append-order wins"
 *   semantics established in `textlog-foundation.md`).
 * - Each entry is framed by a `## <timestamp>` heading. The heading
 *   uses `formatLogTimestamp` so copy output matches the row label
 *   visible in the UI.
 * - `important` entries get a trailing ` ★` marker on the heading so
 *   the flag is not silently lost.
 * - The body text is emitted verbatim; it may contain markdown.
 * - Entries are joined by a blank line.
 * - An empty log yields an empty string (the caller decides whether
 *   that is "nothing to copy" or a placeholder).
 */
export function serializeTextlogAsMarkdown(body: TextlogBody): string {
  if (body.entries.length === 0) return '';
  const blocks: string[] = [];
  for (const entry of body.entries) {
    const important = entry.flags.includes('important');
    const heading = important
      ? `## ${formatLogTimestamp(entry.createdAt)} ★`
      : `## ${formatLogTimestamp(entry.createdAt)}`;
    blocks.push(`${heading}\n\n${entry.text}`);
  }
  return blocks.join('\n\n');
}

let logIdCounter = 0;

function generateLogId(): string {
  logIdCounter++;
  return `log-${Date.now()}-${logIdCounter}`;
}
