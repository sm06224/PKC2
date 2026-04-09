/**
 * TEXTLOG body helpers — pure functions for the textlog archetype.
 *
 * A textlog body is a JSON string containing an array of log entries,
 * each with an id, text, timestamp, and optional flags.
 *
 * No browser APIs — features layer.
 */

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
 * Shows date + time in a compact form.
 */
export function formatLogTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let logIdCounter = 0;

function generateLogId(): string {
  logIdCounter++;
  return `log-${Date.now()}-${logIdCounter}`;
}
