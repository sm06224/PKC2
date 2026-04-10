/**
 * TEXTLOG CSV serializer — pure features-layer helpers.
 *
 * Flattens a `TextlogBody` into a portable CSV string and extracts the
 * set of asset keys referenced across all log rows. No browser APIs —
 * all Blob / download logic lives in `adapter/platform/textlog-bundle.ts`.
 *
 * Format contract is frozen in
 * `docs/development/textlog-csv-zip-export.md`. The short version:
 *
 *   log_id, timestamp_iso, timestamp_display, important,
 *   text_markdown, text_plain, asset_keys
 *
 * - UTF-8, CRLF line terminators (RFC 4180).
 * - Every field is quoted; internal `"` is doubled to `""`.
 * - Embedded newlines inside `text_markdown` / `text_plain` are
 *   preserved verbatim inside the quotes (RFC-4180-legal).
 * - Row order is **append order** — the serializer never re-sorts by
 *   `timestamp_iso`, matching the textlog-foundation invariant.
 */

import type { TextlogBody, TextlogEntry } from './textlog-body';
import { formatLogTimestamp } from './textlog-body';

export const TEXTLOG_CSV_HEADER = [
  'log_id',
  'timestamp_iso',
  'timestamp_display',
  'important',
  'text_markdown',
  'text_plain',
  'asset_keys',
] as const;

/**
 * Serialize a `TextlogBody` into a CSV document.
 *
 * Always emits the header row, even when `body.entries` is empty (the
 * consumer still needs the schema to understand the file). Append
 * order is preserved — entries are emitted in the same order they
 * appear in `body.entries`.
 */
export function serializeTextlogAsCsv(body: TextlogBody): string {
  const lines: string[] = [];
  lines.push(TEXTLOG_CSV_HEADER.map(csvField).join(','));
  for (const entry of body.entries) {
    lines.push(serializeRow(entry));
  }
  // RFC 4180 line terminator.
  return lines.join('\r\n');
}

/**
 * Collect the deduplicated, first-occurrence-ordered list of asset
 * keys referenced across all log rows. Recognises both `![alt](asset:k)`
 * (image embed) and `[label](asset:k)` (non-image chip) forms.
 *
 * Order is **strict source position order** within each row, with
 * rows processed in append order — i.e. exactly the order a reader
 * scanning the textlog top-to-bottom would encounter the references.
 */
export function collectTextlogAssetKeys(body: TextlogBody): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of body.entries) {
    for (const key of orderedAssetKeysForEntry(entry)) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/**
 * Strip the common markdown metacharacters from a string to produce a
 * human-readable plain-text fallback column. This is *not* a
 * full-fidelity markdown-to-text renderer — it is a best-effort
 * flattening so the `text_plain` column is readable in Excel without
 * forcing the consumer to parse markdown.
 *
 * Rules (in order):
 *  1. `![alt](asset:key)` / `![alt](any-url)` → `alt`
 *  2. `[label](asset:key)` / `[label](any-url)` → `label`
 *  3. Backtick code spans: `` `code` `` → `code`
 *  4. Bold / italic markers `**`, `__`, `*`, `_` → removed (only when
 *     they bracket a word).
 *  5. Heading markers `^#+\s` → removed.
 *  6. Blockquote markers `^>\s` → removed.
 *  7. Unordered list markers `^[-*+]\s` → removed.
 *  8. Leading / trailing whitespace per-line trimmed.
 *  9. Collapsed consecutive blank lines to a single blank line.
 */
export function stripMarkdownForCsvPlain(text: string): string {
  if (!text) return '';
  let out = text;
  // Images: ![alt](url) → alt   (ensure this runs before plain links)
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt: string) => alt);
  // Links: [label](url) → label
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, (_m, label: string) => label);
  // Inline code: `…` → …
  out = out.replace(/`([^`]*)`/g, (_m, code: string) => code);
  // Bold / italic markers. Order matters: ** / __ before * / _ so that
  // the longer marker is consumed first and does not leave a stray `*`.
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/\*([^*\n]+)\*/g, '$1');
  out = out.replace(/_([^_\n]+)_/g, '$1');
  // Headings, blockquotes, list markers at the start of a line.
  out = out
    .split('\n')
    .map((line) => line
      .replace(/^\s*#+\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/\s+$/, ''),
    )
    .join('\n');
  // Collapse runs of >= 2 blank lines to a single blank line.
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

// ── internals ────────────────────────

function serializeRow(entry: TextlogEntry): string {
  const id = entry.id ?? '';
  const iso = entry.createdAt ?? '';
  const display = iso ? formatLogTimestamp(iso) : '';
  const important = entry.flags.includes('important') ? 'true' : 'false';
  const textMarkdown = entry.text ?? '';
  const textPlain = stripMarkdownForCsvPlain(textMarkdown);
  const assetKeys = orderedAssetKeysForEntry(entry).join(';');
  return [
    csvField(id),
    csvField(iso),
    csvField(display),
    csvField(important),
    csvField(textMarkdown),
    csvField(textPlain),
    csvField(assetKeys),
  ].join(',');
}

/**
 * First-occurrence-ordered, deduplicated asset keys for a single
 * entry, in **source position order** (left-to-right). The shared
 * `extractAssetReferences` runs the image-form regex pass before the
 * link-form pass, which interleaves wrong when a row mixes both
 * forms (`![a](asset:k1) [b](asset:k2) ![c](asset:k3)` would emit
 * `k1, k3, k2`). The CSV column spec promises strict source order,
 * so we walk the text once with a unified regex.
 */
function orderedAssetKeysForEntry(entry: TextlogEntry): string[] {
  const text = entry.text ?? '';
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  // Single pass — `(!?)` accepts both `![alt](asset:k)` (image) and
  // `[label](asset:k)` (link). The optional `(?:\s+"…")?` consumes a
  // markdown title so it doesn't end up in the captured key.
  const re = /(!?)\[[^\]]*\]\(asset:([^\s)"]+)(?:\s+"[^"]*")?\)/g;
  for (const m of text.matchAll(re)) {
    const key = m[2];
    if (typeof key === 'string' && key.length > 0 && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/**
 * Wrap a value in double-quotes and double any internal quote
 * characters. Embedded newlines are preserved verbatim — RFC 4180
 * allows them inside quoted fields.
 */
function csvField(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}
