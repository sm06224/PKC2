/**
 * Table of Contents extraction — pure helper for TEXT / TEXTLOG bodies.
 *
 * Features layer — no browser APIs. Extracts h1–h3 headings from markdown
 * source and produces a flat list of `{ level, text, slug, logId? }` tuples.
 *
 * The `slug` is the same value that `renderMarkdown()` stamps onto the
 * rendered heading element's `id` attribute, so clicking a TOC entry can
 * find its scroll target via `document.getElementById(slug)` (scoped to
 * the log row for TEXTLOG so cross-log-entry slug collisions are
 * disambiguated by the log container).
 *
 * See `docs/development/table-of-contents-right-pane.md`.
 */
import type { Entry } from '../../core/model/record';
import { parseTextlogBody } from '../textlog/textlog-body';

export type TocLevel = 1 | 2 | 3;

export interface TocHeading {
  level: TocLevel;
  text: string;
  slug: string;
  /** Present for TEXTLOG so the click handler can scope scroll to the owning log row. */
  logId?: string;
}

/**
 * Slugify a heading text into a URL-/id-friendly token.
 *
 * Lower-cases, strips punctuation except `-` and word characters, and
 * collapses whitespace to `-`. Returns `''` when the input has no slug-
 * worthy characters (caller is expected to fall back to `'heading'`).
 */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Create a slug generator that tracks collisions within a single render.
 *
 * Reuse the returned function across every heading in one document so
 * duplicates get `heading`, `heading-1`, `heading-2`, … suffixes.
 */
export function makeSlugCounter(): (text: string) => string {
  const counter = new Map<string, number>();
  return (text: string) => {
    const base = slugifyHeading(text) || 'heading';
    const n = counter.get(base) ?? 0;
    counter.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}

/**
 * Extract h1–h3 headings from a raw markdown string.
 *
 * Intentionally ignores fenced code blocks (``` … ```) so `# inside code`
 * doesn't show up in the TOC. Does NOT descend into inline markdown —
 * the heading text is returned as-written (trailing `#`s stripped per
 * ATX closing-hash syntax), so **bold** inside a heading will still be
 * visible in the TOC as `**bold**` rather than re-rendered HTML. That
 * is deliberate: TOC is plain text.
 */
export function extractHeadingsFromMarkdown(markdown: string): TocHeading[] {
  if (!markdown) return [];
  const headings: TocHeading[] = [];
  const slugOf = makeSlugCounter();
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  for (const line of lines) {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^ {0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const level = m[1]!.length as TocLevel;
    const text = m[2]!.trim();
    if (!text) continue;
    headings.push({ level, text, slug: slugOf(text) });
  }
  return headings;
}

/**
 * Extract a flat TOC for an entry.
 *
 *   TEXT     → headings from `entry.body`.
 *   TEXTLOG  → headings concatenated across every log entry, each tagged
 *              with its owning `logId` so the click handler can scope the
 *              scroll target to the correct `[data-pkc-log-id]` row.
 *   other    → empty.
 *
 * Slug counters are reset per-log-entry for TEXTLOG so the emitted ids
 * match the renderer (which renders each log entry independently and
 * therefore has its own slug-collision scope).
 */
export function extractTocFromEntry(entry: Entry): TocHeading[] {
  if (entry.archetype === 'text' || entry.archetype === 'generic') {
    return extractHeadingsFromMarkdown(entry.body);
  }
  if (entry.archetype === 'textlog') {
    const body = parseTextlogBody(entry.body);
    const out: TocHeading[] = [];
    for (const log of body.entries) {
      const headings = extractHeadingsFromMarkdown(log.text);
      for (const h of headings) {
        out.push({ ...h, logId: log.id });
      }
    }
    return out;
  }
  return [];
}
