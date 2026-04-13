/**
 * TEXT → TEXTLOG conversion (pure).
 *
 * Slice 5 counterpart to `features/textlog/textlog-to-text.ts`. See
 * `docs/development/textlog-text-conversion.md` §3 for the locked spec.
 *
 * Responsibilities:
 * - Segment a TEXT body into a list of log-ready strings using ONE of
 *   two explicit strategies:
 *     - `'heading'` — each ATX heading (`#` / `##` / `###`) that is
 *       not inside a fenced code block starts a new segment. The
 *       heading line itself is retained at the head of its segment
 *       (spec §3.2).
 *     - `'hr'` — a line consisting of `---` alone (outside fenced code
 *       blocks) separates segments. The separator is NOT emitted into
 *       any log body.
 * - Skip segments whose content is whitespace-only.
 * - Emit an optional "meta log" at the head pointing back at the source
 *   TEXT (spec §3.6). This keeps the new TEXTLOG self-describing and
 *   is the minimal backlink contract for v1.
 * - Produce a serialized TEXTLOG body (JSON string) suitable for
 *   `COMMIT_EDIT`, plus a preview-friendly flat list of logs so the
 *   modal can render per-log headlines without re-parsing JSON.
 *
 * Non-goals (v1, intentionally locked):
 * - Paragraph / blank-line auto split — too lossy, fires accidentally.
 * - Mixing heading and hr in one run — pick one or the other.
 * - Appending to an existing TEXTLOG — preview covers new-entry only.
 * - Round-tripping log ids back to TEXTLOG → TEXT → TEXTLOG.
 *
 * Features layer — no browser APIs. `generateLogId` is injectable so
 * tests can pin ids for snapshot comparisons.
 */

import type { Entry } from '../../core/model/record';
import type { TextlogEntry } from '../textlog/textlog-body';
import { serializeTextlogBody } from '../textlog/textlog-body';
import { generateLogId as generateUlidLogId } from '../textlog/log-id';
import { toLocalDateKey } from '../textlog/textlog-doc';

/** Split strategy. See module header. */
export type TextToTextlogSplitMode = 'heading' | 'hr';

export interface TextToTextlogOptions {
  /**
   * Segmentation rule. Defaults to `'heading'` — the more common case,
   * and the one that works without the user pre-editing the source.
   */
  splitMode?: TextToTextlogSplitMode;
  /**
   * Base timestamp for the first emitted log. Each subsequent log uses
   * `now + i ms` so the storage order is preserved even though real
   * wall-clock resolution might flatten them. Injectable for tests.
   */
  now?: Date;
  /** Log id generator. Injectable so tests can assert exact ids. */
  generateLogId?: () => string;
  /**
   * Whether to emit the `Source TEXT: [...]` meta log as the first
   * entry. Defaults to `true`. Disable when the caller wants the raw
   * segmentation (tests, programmatic append paths).
   */
  includeMetaLog?: boolean;
}

/** One log as seen by the preview UI. */
export interface TextToTextlogLogPreview {
  /** ULID matching the serialized body. */
  id: string;
  /** Verbatim log text as it will land in the TEXTLOG. */
  text: string;
  /** ISO timestamp (monotonic within the result). */
  createdAt: string;
  /** First non-empty line of `text`, trimmed + capped — preview-only. */
  headline: string;
  /** True for the auto-inserted source-backlink log. */
  isMeta: boolean;
}

export interface TextToTextlogResult {
  /** Title for the new TEXTLOG entry. */
  title: string;
  /** Serialized TEXTLOG body (JSON string) — ready for `COMMIT_EDIT`. */
  body: string;
  /**
   * Flat list of all emitted logs, in order. Drives the preview UI so
   * it never has to re-parse `body`.
   */
  logs: TextToTextlogLogPreview[];
  /** Count of content logs, excluding any meta log. */
  segmentCount: number;
  /** Effective split mode (echoed from options for UI re-use). */
  splitMode: TextToTextlogSplitMode;
}

const HEADLINE_CAP = 80;

/**
 * Convert a TEXT entry into a new TEXTLOG's body + title, per v1
 * spec. Non-TEXT sources yield zero segments (and thus a body with
 * only the meta log, when enabled). Callers should gate on
 * `segmentCount === 0` for disabling the confirm button.
 */
export function textToTextlog(
  source: Entry,
  options: TextToTextlogOptions = {},
): TextToTextlogResult {
  const splitMode: TextToTextlogSplitMode = options.splitMode ?? 'heading';
  const now = options.now ?? new Date();
  const genId = options.generateLogId ?? generateUlidLogId;
  const includeMeta = options.includeMetaLog ?? true;

  const body = source.archetype === 'text' ? (source.body ?? '') : '';
  const segments = splitMode === 'heading'
    ? splitByHeading(body)
    : splitByHorizontalRule(body);

  // Trim trailing blank lines / whitespace off each segment; drop
  // segments that end up empty. Leading content before the first
  // heading/hr is a valid segment (tested). The heading line itself is
  // retained for `'heading'` mode, so a heading-only source still
  // emits a log with just the heading.
  const nonEmpty = segments
    .map(trimBlock)
    .filter((s) => s.length > 0);

  const logs: TextlogEntry[] = [];
  const previews: TextToTextlogLogPreview[] = [];

  let tsOffset = 0;
  const pushLog = (text: string, isMeta: boolean): void => {
    const id = genId();
    const createdAt = new Date(now.getTime() + tsOffset).toISOString();
    tsOffset += 1;
    logs.push({ id, text, createdAt, flags: [] });
    previews.push({ id, text, createdAt, headline: makeHeadline(text), isMeta });
  };

  if (includeMeta) {
    pushLog(buildMetaLogText(source, now), true);
  }
  for (const seg of nonEmpty) {
    pushLog(seg, false);
  }

  const srcTitle = source.title || '(untitled)';
  const dateKey = toLocalDateKey(now.toISOString());
  const title = `${srcTitle} — log import ${dateKey}`;

  return {
    title,
    body: serializeTextlogBody({ entries: logs }),
    logs: previews,
    segmentCount: nonEmpty.length,
    splitMode,
  };
}

// ── Segmentation ──────────────────────────────────────────

/**
 * Split on ATX headings (`#` / `##` / `###`). A heading line both
 * terminates the previous segment AND starts the next — the heading
 * itself lives inside the new segment. Headings inside fenced code
 * blocks are ignored. `####` and deeper are treated as body content so
 * users can still author deeper subsections within a chunk.
 */
function splitByHeading(body: string): string[] {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (isFenceLine(line)) {
      inFence = !inFence;
      current.push(line);
      continue;
    }
    if (!inFence && /^ {0,3}#{1,3}\s+\S/.test(line)) {
      if (current.length > 0) {
        out.push(current.join('\n'));
      }
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) out.push(current.join('\n'));
  return out;
}

/**
 * Split on standalone `---` horizontal-rule lines. The separator is
 * dropped from the output. Fenced code blocks are respected so `---`
 * inside a YAML code fence is not treated as a split marker.
 */
function splitByHorizontalRule(body: string): string[] {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (isFenceLine(line)) {
      inFence = !inFence;
      current.push(line);
      continue;
    }
    if (!inFence && /^\s*---\s*$/.test(line)) {
      out.push(current.join('\n'));
      current = [];
      continue;
    }
    current.push(line);
  }
  out.push(current.join('\n'));
  return out;
}

function isFenceLine(line: string): boolean {
  return /^\s{0,3}(?:```|~~~)/.test(line);
}

function trimBlock(s: string): string {
  // Drop surrounding blank lines but keep inner structure.
  return s.replace(/^\s*\n/, '').replace(/\s+$/u, '');
}

function makeHeadline(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const trimmed = first.trim();
  if (trimmed.length <= HEADLINE_CAP) return trimmed;
  return trimmed.slice(0, HEADLINE_CAP - 1) + '…';
}

function buildMetaLogText(source: Entry, now: Date): string {
  const srcTitle = source.title || '(untitled)';
  return [
    `Source TEXT: [${srcTitle}](entry:${source.lid})`,
    `Converted: ${now.toISOString()}`,
  ].join('\n');
}
