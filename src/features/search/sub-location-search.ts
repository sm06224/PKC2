/**
 * Sub-location search — pure indexer for USER_REQUEST_LEDGER S-18
 * (A-4 FULL promotion, 2026-04-14).
 *
 * Role: given an entry + a query string, return the positions WITHIN
 * the entry where the query matches, attributed to an addressable
 * sub-location. The sidebar then renders one row per hit so the user
 * can click-through to the exact spot instead of being dumped at the
 * top of a long entry.
 *
 * Supported archetypes:
 *   - `text`   → hits attributed to nearest preceding heading (slug
 *                matches the renderer's `heading_open` id). If no
 *                heading precedes the match, the hit falls back to
 *                an entry-top target.
 *   - `textlog` → hits attributed to the log entry's id (matches the
 *                rendered `data-pkc-log-id` attribute).
 *   - everything else → no sub-location hits (the matcher is silent
 *                for attachment / todo / form / folder / generic /
 *                opaque; the sidebar still shows an entry-level row
 *                as it did before S-18).
 *
 * Non-goals (per spec §5):
 *   - Semantic / fuzzy / regex / query syntax
 *   - Cross-entry traversal
 *   - Search-result permalinks
 *   - Ranking beyond first-N-by-position
 *
 * Features layer — pure function, no DOM, no browser APIs.
 */

import type { Entry } from '../../core/model/record';
import { makeSlugCounter } from '../markdown/markdown-toc';
import { parseTextlogBody } from '../textlog/textlog-body';

/** A single sub-location match inside one entry. */
export interface SubLocationHit {
  /** Always the owning entry's lid. */
  entryLid: string;
  /**
   * Stable address string consumed by `adapter/ui/location-nav.ts`
   * to resolve a DOM target. Three shapes:
   *   - `heading:<slug>` (TEXT heading id)
   *   - `log:<logId>`    (TEXTLOG log entry id)
   *   - `entry:<lid>`    (fallback — scroll to the entry's top)
   */
  subId: string;
  kind: 'heading' | 'log' | 'entry';
  /**
   * Short human label for the sidebar row. For headings: the heading
   * text. For logs: the log's display timestamp (HH:MM:SS) + the
   * first ~20 chars. For `entry` fallback: the entry title.
   */
  label: string;
  /** ~80-char snippet containing the match, one-line (no newlines). */
  snippet: string;
}

/** Max hits reported per entry. Keeps the sidebar from exploding on high-frequency terms. */
const DEFAULT_MAX_PER_ENTRY = 5;

const SNIPPET_WIDTH = 80;
const LABEL_WIDTH = 40;

/**
 * Scan `entry.body` for `query` occurrences and return up to
 * `maxPerEntry` hits, each attributed to the nearest sub-location.
 *
 * Behaviour:
 *   - Empty / whitespace query → empty array (no hits).
 *   - Non-TEXT / non-TEXTLOG archetype → empty array (caller should
 *     fall back to entry-level display).
 *   - Matches in fenced code blocks are skipped (same rationale as
 *     the S-15 body mark — code-block contents aren't the typical
 *     target of prose search; keeps the sub-location list focused).
 *   - Deduplicates by sub-id: the first match inside each heading
 *     or log wins. This prevents the sidebar from listing the same
 *     "Heading A" 12 times when a frequent term repeats in it.
 */
export function findSubLocationHits(
  entry: Entry,
  query: string,
  maxPerEntry = DEFAULT_MAX_PER_ENTRY,
): SubLocationHit[] {
  const trimmed = query.trim();
  if (trimmed === '') return [];
  if (entry.archetype !== 'text' && entry.archetype !== 'textlog') return [];

  // PR #190 prefix-incremental cache. The user typically extends
  // the search one character at a time ("m" → "me" → "mee" → ...).
  // Any entry whose body does NOT contain the previous query
  // CANNOT contain a longer query (longer query has previous as
  // substring). Tracking the "no-match" set by Entry reference
  // saves the full body scan for the vast majority of entries on
  // every subsequent keystroke.
  maybeResetSubLocationCache(trimmed);
  if (lastNoMatch.has(entry)) return [];

  // PR #182 fast-path: skip the line-split / heading-regex / fence
  // detection pipeline when the body has no chance of matching.
  // PR #191: lowerBody is now precomputed once per Entry ref via
  // WeakMap; the per-keystroke `entry.body.toLowerCase()` allocation
  // disappears after the first scan of each entry.
  const analysis = getEntryAnalysis(entry);
  const lowerQuery = trimmed.toLowerCase();
  if (!analysis.lowerBody.includes(lowerQuery)) {
    lastNoMatch.add(entry);
    return [];
  }

  if (entry.archetype === 'text') {
    return findTextHits(entry, analysis as TextAnalysis, trimmed, maxPerEntry);
  }
  return findTextlogHits(entry, analysis as TextlogAnalysis, trimmed, maxPerEntry);
}

// ── PR #191 prebuilt per-entry analysis cache ─────────────────────
//
// `findSubLocationHits` is called once per entry on every keystroke,
// and inside it `findTextHits` re-splits + re-lowercases the entire
// body. Both are pure functions of the Entry's `body` string — and
// since the reducer rebuilds the Entry reference on any body change
// (COMMIT_EDIT / QUICK_UPDATE_ENTRY), keying a cache on the Entry
// reference itself is sufficient:
//
//   - same Entry ref ⇒ body unchanged ⇒ cached splits / lower are valid
//   - new Entry ref (post-edit) ⇒ WeakMap miss ⇒ rebuild on next read
//
// WeakMap auto-collects entries that fall out of `container.entries`,
// so the cache shape never grows beyond the live container size.

interface TextAnalysis {
  kind: 'text';
  /** Body lowercased once (used by the early-exit fast path). */
  lowerBody: string;
  /** Body split into lines (`/\r?\n/`). */
  lines: ReadonlyArray<string>;
  /** Lowercased lines, parallel index to `lines`. */
  lowerLines: ReadonlyArray<string>;
}

interface TextlogAnalysis {
  kind: 'textlog';
  lowerBody: string;
  /** Pre-parsed textlog body. Cached so every keystroke skips the parse. */
  parsed: ReturnType<typeof parseTextlogBody>;
  /** Lowercased log texts, parallel index to `parsed.entries`. */
  lowerLogTexts: ReadonlyArray<string>;
}

type EntryAnalysis = TextAnalysis | TextlogAnalysis;

const analysisCache: WeakMap<Entry, EntryAnalysis> = new WeakMap();

function buildTextAnalysis(entry: Entry): TextAnalysis {
  const lines = entry.body.split(/\r?\n/);
  const lowerLines = lines.map((l) => l.toLowerCase());
  const lowerBody = lowerLines.join('\n');
  return { kind: 'text', lowerBody, lines, lowerLines };
}

function buildTextlogAnalysis(entry: Entry): TextlogAnalysis {
  const parsed = parseTextlogBody(entry.body);
  const lowerLogTexts = parsed.entries.map((l) => (l.text ?? '').toLowerCase());
  return {
    kind: 'textlog',
    lowerBody: lowerLogTexts.join('\n'),
    parsed,
    lowerLogTexts,
  };
}

function getEntryAnalysis(entry: Entry): EntryAnalysis {
  let cached = analysisCache.get(entry);
  if (!cached) {
    cached = entry.archetype === 'text'
      ? buildTextAnalysis(entry)
      : buildTextlogAnalysis(entry);
    analysisCache.set(entry, cached);
  }
  return cached;
}

// ── PR #190 prefix-incremental no-match cache ─────────────────────
//
// Invariant: `lastNoMatch.has(entry)` ⇒ `entry.body` (lowercased)
// does NOT contain `lastQueryStem` (lowercased). The cache is valid
// while subsequent queries are prefix-extensions of `lastQueryStem`
// (longer query ⇒ matches subset of shorter query's matches).
//
// WeakSet keys are Entry object references — when the reducer
// rebuilds an Entry (COMMIT_EDIT / QUICK_UPDATE_ENTRY swap the
// reference), the new instance falls out of the set automatically
// and re-validates on its first lookup. No explicit per-entry
// invalidation needed.
let lastQueryStem = '';
let lastNoMatch: WeakSet<Entry> = new WeakSet();

function maybeResetSubLocationCache(query: string): void {
  if (query === lastQueryStem) return;
  // Extension (e.g. "me" → "mee"): keep the no-match set; longer
  // queries are strictly more selective.
  if (lastQueryStem !== '' && query.startsWith(lastQueryStem)) {
    lastQueryStem = query;
    return;
  }
  // Different / shorter / first call → invalidate.
  lastQueryStem = query;
  lastNoMatch = new WeakSet();
}

/**
 * Test-only reset for the prefix-incremental no-match cache. Used
 * by tests that exercise multiple query sequences in one suite.
 */
export function __resetSubLocationHitsCacheForTest(): void {
  lastQueryStem = '';
  lastNoMatch = new WeakSet();
}

// ─────────────────────────────── TEXT ───────────────────────────────

function findTextHits(
  entry: Entry,
  analysis: TextAnalysis,
  query: string,
  maxPerEntry: number,
): SubLocationHit[] {
  const lowerQuery = query.toLowerCase();
  const hits: SubLocationHit[] = [];
  const seen = new Set<string>();

  // PR #191: lines + lowerLines come from the WeakMap cache — same
  // values across every keystroke for an unchanged Entry.
  const { lines, lowerLines } = analysis;
  const slugOf = makeSlugCounter();
  let currentHeading: { slug: string; text: string } | null = null;
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lower = lowerLines[i]!;
    // Fenced code block toggle (matches extractHeadingsFromMarkdown).
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Heading detection drives the "current section" context. Use the
    // same regex as the TOC extractor so slugs stay aligned with the
    // renderer's `id=` emission.
    const headingMatch = /^ {0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (headingMatch) {
      const text = headingMatch[2]!.trim();
      if (text) {
        currentHeading = { slug: slugOf(text), text };
      }
      // Heading lines don't count as their own hit — if the user
      // searches for text that appears in a heading, we surface it
      // as a hit attributed to THAT heading, which still works
      // because the regex below runs on the same line.
    }

    // Check match on this line. PR #191: lowerLine is precomputed.
    if (!lower.includes(lowerQuery)) continue;

    const subId = currentHeading
      ? `heading:${currentHeading.slug}`
      : `entry:${entry.lid}`;
    if (seen.has(subId)) continue;
    seen.add(subId);

    const label = currentHeading
      ? truncate(currentHeading.text, LABEL_WIDTH)
      : truncate(entry.title || '(untitled)', LABEL_WIDTH);
    const kind: SubLocationHit['kind'] = currentHeading ? 'heading' : 'entry';
    hits.push({
      entryLid: entry.lid,
      subId,
      kind,
      label,
      snippet: buildSnippet(line, lowerQuery),
    });
    if (hits.length >= maxPerEntry) break;
  }
  return hits;
}

// ─────────────────────────────── TEXTLOG ────────────────────────────

function findTextlogHits(
  entry: Entry,
  analysis: TextlogAnalysis,
  query: string,
  maxPerEntry: number,
): SubLocationHit[] {
  const lowerQuery = query.toLowerCase();
  const hits: SubLocationHit[] = [];
  const seen = new Set<string>();

  // PR #191: parsed body + lowercased log texts come from the
  // WeakMap cache — `parseTextlogBody` runs once per Entry ref.
  const { parsed, lowerLogTexts } = analysis;
  for (let i = 0; i < parsed.entries.length; i++) {
    const log = parsed.entries[i]!;
    if (!log.text) continue;
    if (!lowerLogTexts[i]!.includes(lowerQuery)) continue;
    const subId = `log:${log.id}`;
    if (seen.has(subId)) continue;
    seen.add(subId);

    hits.push({
      entryLid: entry.lid,
      subId,
      kind: 'log',
      label: buildLogLabel(log.createdAt, log.text),
      snippet: buildSnippet(firstLine(log.text), lowerQuery),
    });
    if (hits.length >= maxPerEntry) break;
  }
  return hits;
}

// ─────────────────────────────── helpers ────────────────────────────

function firstLine(s: string): string {
  const idx = s.indexOf('\n');
  return idx === -1 ? s : s.slice(0, idx);
}

function truncate(s: string, max: number): string {
  const trimmed = s.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + '…';
}

/**
 * Build a ~80-char snippet centred around the first match in `line`.
 * Newlines are collapsed to spaces so the sidebar stays single-line.
 */
function buildSnippet(line: string, lowerQuery: string): string {
  const collapsed = line.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= SNIPPET_WIDTH) return collapsed;
  const lower = collapsed.toLowerCase();
  const matchIdx = lower.indexOf(lowerQuery);
  if (matchIdx < 0) return truncate(collapsed, SNIPPET_WIDTH);
  // Center a window of SNIPPET_WIDTH around the match.
  const half = Math.floor((SNIPPET_WIDTH - lowerQuery.length) / 2);
  let start = Math.max(0, matchIdx - half);
  let end = start + SNIPPET_WIDTH;
  if (end > collapsed.length) {
    end = collapsed.length;
    start = Math.max(0, end - SNIPPET_WIDTH);
  }
  const prefix = start > 0 ? '…' : '';
  const suffix = end < collapsed.length ? '…' : '';
  return prefix + collapsed.slice(start, end) + suffix;
}

/**
 * TEXTLOG row label: HH:MM:SS · first-content-preview.
 * Falls back to the ISO string if we can't parse HH:MM:SS out of it.
 */
function buildLogLabel(createdAt: string, text: string): string {
  const t = hhmmssFromIso(createdAt);
  const head = truncate(firstLine(text), LABEL_WIDTH - (t.length + 3));
  return `${t} · ${head}`;
}

function hhmmssFromIso(iso: string): string {
  // ISO 8601 `YYYY-MM-DDTHH:MM:SS(.sss)?(Z|±HH:MM)?`
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(iso);
  return m ? m[1]! : iso;
}
