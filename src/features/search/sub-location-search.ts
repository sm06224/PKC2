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
  /**
   * PR #193: per-line precomputed metadata. The fence-toggle regex,
   * heading regex, and slug counter all depended only on `lines`;
   * caching them here means `findTextHits` becomes a tight
   * `lower.includes(query)` loop with no regex execution per call.
   */
  lineMeta: ReadonlyArray<LineMeta>;
}

/**
 * Per-line precomputed state used by `findTextHits`.
 *
 *   - `skip` collapses two pre-PR-193 conditions:
 *       a. fence-toggle line (`^\s{0,3}(?:\`\`\`|~~~)`) which itself
 *          never produced a hit
 *       b. lines INSIDE a fenced code block
 *     The hot-path skips `meta.skip` lines without any string check.
 *
 *   - `currentHeading` is the active heading context for hit
 *     attribution (`subId`, `label`, `kind`). Heading detection +
 *     slug-counter state both lived in the per-call line walk
 *     pre-PR-193 — now they're computed once during build.
 */
interface LineMeta {
  skip: boolean;
  currentHeading: { slug: string; text: string } | null;
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

  // PR #193: precompute per-line skip flag + heading context once.
  // Mirrors the pre-PR-193 in-loop logic exactly so hits are
  // identical: heading lines themselves are NOT marked `skip` so the
  // hit attributes to that heading; fence-toggle and fenced-content
  // lines ARE marked `skip` so they produce no hits.
  const lineMeta: LineMeta[] = [];
  const slugOf = makeSlugCounter();
  let currentHeading: { slug: string; text: string } | null = null;
  let inFence = false;
  for (const line of lines) {
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      lineMeta.push({ skip: true, currentHeading });
      continue;
    }
    if (inFence) {
      lineMeta.push({ skip: true, currentHeading });
      continue;
    }
    const headingMatch = /^ {0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (headingMatch) {
      const text = headingMatch[2]!.trim();
      if (text) currentHeading = { slug: slugOf(text), text };
    }
    lineMeta.push({ skip: false, currentHeading });
  }

  return { kind: 'text', lowerBody, lines, lowerLines, lineMeta };
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

  // PR #191 + PR #193: lines / lowerLines / lineMeta all come from
  // the WeakMap cache. The hot loop is now a pure
  // `lower.includes(query)` check + pre-resolved heading context —
  // no regex execution per call, no slug-counter state, no fence
  // bookkeeping. All of that ran once during `buildTextAnalysis`.
  const { lines, lowerLines, lineMeta } = analysis;

  for (let i = 0; i < lines.length; i++) {
    const meta = lineMeta[i]!;
    if (meta.skip) continue;

    if (!lowerLines[i]!.includes(lowerQuery)) continue;

    const currentHeading = meta.currentHeading;
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
      snippet: buildSnippet(lines[i]!, lowerQuery),
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
