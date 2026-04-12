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

import type { TextlogBody, TextlogEntry, TextlogFlag } from './textlog-body';

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
 * Produce a new `TextlogBody` with broken asset references stripped
 * from every entry's `text` field — "compact mode" from the export
 * spec (§13 of `docs/development/textlog-csv-zip-export.md`).
 *
 * A reference is **broken** when its asset key is NOT in the
 * `presentKeys` set. Broken references are rewritten as follows:
 *
 *   - `![alt](asset:<missing>)`  → `alt`
 *   - `[label](asset:<missing>)` → `label`
 *
 * References whose key IS in `presentKeys` are left untouched. This
 * is intentional — compact mode only removes references that would
 * render as broken placeholders; it never touches valid references.
 *
 * The function is **pure**: the input `body` and its entries are
 * not mutated. A new `TextlogBody` with new `entries` is returned,
 * so it is safe to use on live state — the caller can compact a
 * snapshot without any risk of the live container drifting.
 *
 * Non-`asset:` URLs (plain https links, etc.) are never touched.
 */
export function compactTextlogBodyAgainst(
  body: TextlogBody,
  presentKeys: ReadonlySet<string>,
): TextlogBody {
  return {
    entries: body.entries.map((entry) => ({
      ...entry,
      text: stripBrokenAssetRefs(entry.text ?? '', presentKeys),
    })),
  };
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

/**
 * Parse a TEXTLOG CSV document back into a `TextlogBody`.
 *
 * This is the inverse of `serializeTextlogAsCsv` and is used by the
 * textlog bundle re-importer (Issue H, see
 * `docs/development/textlog-csv-zip-export.md` §14). The parser is
 * pure — no browser APIs — so it lives next to the serializer.
 *
 * Behaviour pinned by tests:
 *
 * - **Source of truth is `text_markdown`** (column index 4). The
 *   `text_plain` column is *deliberately discarded* — see spec
 *   §14.6. The plain column is a derived, lossy view; trusting it
 *   would silently lose markdown.
 * - **Append order is preserved verbatim.** Rows come out in the
 *   same order they appear in the CSV. The parser never re-sorts by
 *   `timestamp_iso`; this matches the serializer's "append order
 *   wins" rule (see `serializeTextlogAsCsv`).
 * - **Header row is required and validated by name.** Column order
 *   in the body is keyed off the header so additional / reordered
 *   columns degrade gracefully (unknown columns are ignored).
 * - **Empty body** — a CSV that contains only the header row produces
 *   `{ entries: [] }` (a valid empty textlog).
 * - **Bad rows** — rows whose `log_id` is empty are *skipped*, not
 *   thrown on. Re-import is best-effort: a single corrupted row
 *   should not lose the rest of the log. The caller can detect this
 *   by comparing `body.entries.length` against the row count.
 * - **RFC 4180** quoting: handles `"…"`, doubled `""` for embedded
 *   quotes, embedded newlines (`\n` / `\r\n`) inside quoted fields,
 *   and CRLF or bare LF record separators interchangeably.
 *
 * Throws on:
 * - Empty input.
 * - Missing required columns (`log_id`, `timestamp_iso`,
 *   `text_markdown`). The other columns are recoverable.
 *
 * Errors are thrown as plain `Error`. Callers — typically the
 * adapter-layer importer — wrap them into `{ ok: false, error }`
 * results so the dispatcher only sees structured failures.
 */
export function parseTextlogCsv(csv: string): TextlogBody {
  if (!csv || csv.length === 0) {
    throw new Error('CSV is empty');
  }

  const rows = parseCsvRows(csv);
  if (rows.length === 0) {
    throw new Error('CSV has no rows');
  }

  const header = rows[0]!;
  const idxId = header.indexOf('log_id');
  const idxIso = header.indexOf('timestamp_iso');
  const idxImportant = header.indexOf('important');
  const idxMarkdown = header.indexOf('text_markdown');
  if (idxId < 0 || idxIso < 0 || idxMarkdown < 0) {
    throw new Error('CSV header missing required columns (log_id / timestamp_iso / text_markdown)');
  }

  const entries: TextlogEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    // Tolerate sparse rows — `csvFieldAt` returns '' for out-of-range
    // indices so the parser does not crash on a short row that the
    // CSV writer did not produce.
    const id = csvFieldAt(row, idxId);
    if (!id) continue; // skip unidentified rows — see jsdoc
    const iso = csvFieldAt(row, idxIso);
    const text = csvFieldAt(row, idxMarkdown);
    const importantRaw = idxImportant >= 0 ? csvFieldAt(row, idxImportant) : '';
    const flags: TextlogFlag[] =
      importantRaw.toLowerCase() === 'true' ? ['important'] : [];
    entries.push({ id, text, createdAt: iso, flags });
  }

  return { entries };
}

// ── internals ────────────────────────

function csvFieldAt(row: string[], i: number): string {
  return i >= 0 && i < row.length ? (row[i] ?? '') : '';
}

/**
 * Parse a CSV document into rows of fields. RFC-4180-compatible:
 * - `"…"` quoted fields, doubled `""` for an embedded quote
 * - embedded `\n` / `\r\n` inside a quoted field is preserved
 * - CRLF or bare LF as the record separator
 *
 * Used internally by `parseTextlogCsv`. Kept private — the textlog
 * domain is the only consumer right now and a generic CSV parser is
 * a future-needs-driven helper, not something to expose pre-emptively.
 */
function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\r' && csv[i + 1] === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
  }
  // Trailing field / row without a final separator.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function serializeRow(entry: TextlogEntry): string {
  const id = entry.id ?? '';
  const iso = entry.createdAt ?? '';
  // `timestamp_display` is kept in the schema for backward-compatibility
  // with consumers that read the named column, but it now emits the raw
  // ISO value so export fidelity is preserved end-to-end. See
  // `docs/development/textlog-readability-hardening.md` §4.
  const display = iso;
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
 * Rewrite a single entry's text, replacing `![alt](asset:<missing>)`
 * and `[label](asset:<missing>)` with their alt / label text when
 * `<missing>` is NOT in `presentKeys`. References whose key IS in
 * `presentKeys` are left untouched, and any non-`asset:` URLs are
 * ignored entirely.
 *
 * Pure — returns a new string.
 */
function stripBrokenAssetRefs(
  text: string,
  presentKeys: ReadonlySet<string>,
): string {
  if (!text) return '';
  // Unified image-or-link regex. `(!?)` captures the optional bang so
  // we can tell the two forms apart, `([^\]]*)` captures alt / label,
  // and `([^\s)"]+)` captures the asset key. The optional title match
  // `(?:\s+"[^"]*")?` mirrors the collector so the two stay in sync
  // on edge cases.
  const re = /(!?)\[([^\]]*)\]\(asset:([^\s)"]+)(?:\s+"[^"]*")?\)/g;
  return text.replace(re, (match, _bang: string, label: string, key: string) => {
    // Keep valid (present) references as-is — compact mode only
    // strips broken ones.
    if (presentKeys.has(key)) return match;
    // Strip the whole construct down to the alt / label text. This
    // matches the `stripMarkdownForCsvPlain` flattening rule, which
    // keeps the two paths visually consistent.
    return label;
  });
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
