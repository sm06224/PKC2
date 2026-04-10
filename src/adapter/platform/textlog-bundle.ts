/**
 * TEXTLOG CSV + assets ZIP bundle exporter.
 *
 * Builds a portable bundle for a *single* TEXTLOG entry — see
 * `docs/development/textlog-csv-zip-export.md` for the binding format
 * spec. The short version:
 *
 *   <slug>-<yyyymmdd>.textlog.zip
 *   ├── manifest.json   — metadata, asset index, missing-key report
 *   ├── textlog.csv     — one row per log entry, append order
 *   └── assets/         — referenced assets only, named <key><ext>
 *
 * Layering: this file is `adapter/platform/` because it touches
 * Blob / browser download APIs. The CSV serializer and asset-key
 * collector live in `features/textlog/textlog-csv.ts` (pure). The ZIP
 * writer is shared with `zip-package.ts` via its named exports.
 */

import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import {
  parseTextlogBody,
  serializeTextlogBody,
  type TextlogBody,
} from '../../features/textlog/textlog-body';
import {
  serializeTextlogAsCsv,
  collectTextlogAssetKeys,
  compactTextlogBodyAgainst,
  parseTextlogCsv,
} from '../../features/textlog/textlog-csv';
import {
  createZipBlob,
  createZipBytes,
  textToBytes,
  base64ToBytes,
  bytesToText,
  bytesToBase64,
  parseZip,
  triggerZipDownload,
  slugify,
  formatDateCompact,
  type ZipEntry,
} from './zip-package';
import { parseAttachmentBody } from '../ui/attachment-presenter';

// ── Types ────────────────────────────────────────────

export interface TextlogBundleManifest {
  format: 'pkc2-textlog-bundle';
  version: 1;
  exported_at: string;
  source_cid: string;
  source_lid: string;
  source_title: string;
  entry_count: number;
  asset_count: number;
  missing_asset_count: number;
  missing_asset_keys: string[];
  /** asset_key → { name, mime } for every file written under assets/. */
  assets: Record<string, { name: string; mime: string }>;
  /**
   * `true` when the bundle was produced in "compact mode" — broken
   * asset references were stripped from `text_markdown` and
   * consequently disappeared from the `asset_keys` column. See
   * `docs/development/textlog-csv-zip-export.md` §13.
   *
   * `missing_asset_keys` is still populated under compact mode as an
   * audit trail ("these references existed and were stripped"). The
   * live container is never mutated regardless of this flag.
   */
  compacted: boolean;
}

export interface TextlogBundleResult {
  blob: Blob;
  /** Raw ZIP bytes — same content as `blob` but as a Uint8Array.
   *  Available so callers that nest this bundle inside another ZIP
   *  can avoid a Blob→ArrayBuffer async round-trip. */
  zipBytes: Uint8Array;
  filename: string;
  manifest: TextlogBundleManifest;
}

export interface TextlogExportResult {
  success: boolean;
  filename: string;
  size: number;
  manifest?: TextlogBundleManifest;
  error?: string;
}

export interface TextlogExportOptions {
  /** Override the generated filename (without `.textlog.zip` suffix). */
  filename?: string;
  /** Override the download trigger — used by tests. */
  downloadFn?: (blob: Blob, filename: string) => void;
  /** Override the export timestamp — used by tests for stable output. */
  now?: Date;
  /**
   * Compact mode — see spec §13. When `true`, the bundle is built
   * from a *rewritten copy* of the textlog body in which broken
   * asset references are stripped from `text_markdown`. The live
   * entry and container are never mutated. Default: `false`.
   */
  compact?: boolean;
}

// ── Public API ────────────────────────────────────────

/**
 * Build a TEXTLOG bundle for a single entry. Pure-ish — produces a
 * Blob in memory but does not trigger any download. Useful both for
 * the export action and for tests that want to round-trip the ZIP
 * without driving the DOM.
 *
 * Throws if the entry is not a textlog (caller should guard first).
 */
export function buildTextlogBundle(
  entry: Entry,
  container: Container,
  options?: { now?: Date; compact?: boolean },
): TextlogBundleResult {
  if (entry.archetype !== 'textlog') {
    throw new Error(`buildTextlogBundle requires a textlog entry, got ${entry.archetype}`);
  }

  const now = options?.now ?? new Date();
  const compact = options?.compact === true;
  const parsedBody = parseTextlogBody(entry.body);

  // Resolve referenced assets *against the original body* first. This
  // is important: the `missing_asset_keys` list in the manifest is
  // the audit trail of "what was referenced but unavailable", and
  // must not change based on whether compact mode rewrote them out.
  const referencedKeys = collectTextlogAssetKeys(parsedBody);
  const { assetIndex, assetEntries, missingKeys } = resolveAssets(
    referencedKeys,
    container,
  );

  // Under compact mode, build a new TextlogBody that has broken
  // references stripped. The original `parsedBody` — and, more
  // importantly, the live entry.body and container — are untouched
  // by this: `compactTextlogBodyAgainst` is a pure function that
  // returns a new object.
  const presentKeys = new Set(Object.keys(assetIndex));
  const bodyForCsv = compact
    ? compactTextlogBodyAgainst(parsedBody, presentKeys)
    : parsedBody;

  const manifest: TextlogBundleManifest = {
    format: 'pkc2-textlog-bundle',
    version: 1,
    exported_at: now.toISOString(),
    source_cid: container.meta.container_id,
    source_lid: entry.lid,
    source_title: entry.title ?? '',
    entry_count: parsedBody.entries.length,
    asset_count: Object.keys(assetIndex).length,
    missing_asset_count: missingKeys.length,
    missing_asset_keys: missingKeys,
    assets: assetIndex,
    compacted: compact,
  };

  const csv = serializeTextlogAsCsv(bodyForCsv);

  const zipEntries: ZipEntry[] = [
    { name: 'manifest.json', data: textToBytes(JSON.stringify(manifest, null, 2)) },
    { name: 'textlog.csv', data: textToBytes(csv) },
    ...assetEntries,
  ];

  const zipBytes = createZipBytes(zipEntries);
  const blob = new Blob([zipBytes as BlobPart], { type: 'application/zip' });
  const filename = buildBundleFilename(entry, now);
  return { blob, zipBytes, manifest, filename };
}

/**
 * Build the bundle and trigger a browser download. Returns a result
 * descriptor with the manifest so callers can log / surface stats.
 *
 * Errors during build are caught and returned in the result instead
 * of being thrown — keeps the action handler boring.
 */
export async function exportTextlogAsBundle(
  entry: Entry,
  container: Container,
  options?: TextlogExportOptions,
): Promise<TextlogExportResult> {
  try {
    const built = buildTextlogBundle(entry, container, {
      now: options?.now,
      compact: options?.compact,
    });
    const filename = options?.filename
      ? `${options.filename}.textlog.zip`
      : built.filename;
    const download = options?.downloadFn ?? triggerZipDownload;
    download(built.blob, filename);
    return {
      success: true,
      filename,
      size: built.blob.size,
      manifest: built.manifest,
    };
  } catch (e) {
    return {
      success: false,
      filename: '',
      size: 0,
      error: String(e),
    };
  }
}

/**
 * Build the default filename for an entry's bundle:
 * `<slug>-<yyyymmdd>.textlog.zip`. The slug uses the entry title
 * (falling back to the entry lid). The date is the export day in
 * the local timezone — same convention as `zip-package.ts`.
 */
export function buildBundleFilename(entry: Entry, now: Date = new Date()): string {
  const slug = slugify(entry.title || entry.lid);
  const date = formatDateCompact(now);
  return `${slug}-${date}.textlog.zip`;
}

// ── Container-wide export ────────────────────────

/**
 * Top-level manifest for a container-wide TEXTLOG export bundle.
 */
export interface TextlogsContainerManifest {
  format: 'pkc2-textlogs-container-bundle';
  version: 1;
  exported_at: string;
  source_cid: string;
  source_title: string;
  entry_count: number;
  compact: boolean;
  entries: {
    lid: string;
    title: string;
    filename: string;
    log_entry_count: number;
    asset_count: number;
    missing_asset_count: number;
  }[];
}

export interface TextlogsContainerResult {
  blob: Blob;
  filename: string;
  manifest: TextlogsContainerManifest;
  /** Total missing asset count across all bundles. */
  totalMissingAssetCount: number;
}

/**
 * Build a container-wide TEXTLOG export: a ZIP containing individual
 * `.textlog.zip` bundles for every textlog entry in the container,
 * plus a top-level `manifest.json`.
 *
 * Each inner bundle is produced by `buildTextlogBundle()` — the exact
 * same format as a single-entry export. The outer ZIP nests them as
 * stored byte arrays (ZIP-in-ZIP), so unzipping the outer archive
 * gives individual bundles that can be imported independently.
 *
 * Live state is never mutated.
 */
export function buildTextlogsContainerBundle(
  container: Container,
  options?: { now?: Date; compact?: boolean },
): TextlogsContainerResult {
  const now = options?.now ?? new Date();
  const compact = options?.compact === true;

  const textlogEntries = container.entries.filter((e) => e.archetype === 'textlog');

  // Track filenames for dedup
  const usedFilenames = new Set<string>();
  const manifestEntries: TextlogsContainerManifest['entries'] = [];
  const zipEntries: ZipEntry[] = [];
  let totalMissing = 0;

  for (const entry of textlogEntries) {
    const built = buildTextlogBundle(entry, container, { now, compact });

    // Deduplicate filenames with -2, -3, ... suffixes
    let filename = built.filename;
    if (usedFilenames.has(filename)) {
      const base = filename.replace(/\.textlog\.zip$/, '');
      let suffix = 2;
      while (usedFilenames.has(`${base}-${suffix}.textlog.zip`)) suffix++;
      filename = `${base}-${suffix}.textlog.zip`;
    }
    usedFilenames.add(filename);

    // Get the inner bundle as raw bytes for nesting in the outer ZIP.
    // We rebuild the ZIP from the same entries that buildTextlogBundle
    // used, via createZipBytes, to avoid a Blob→ArrayBuffer async
    // round-trip (FileReaderSync is Web Workers-only).
    const innerBytes = built.zipBytes;

    zipEntries.push({ name: filename, data: innerBytes });
    manifestEntries.push({
      lid: entry.lid,
      title: entry.title ?? '',
      filename,
      log_entry_count: built.manifest.entry_count,
      asset_count: built.manifest.asset_count,
      missing_asset_count: built.manifest.missing_asset_count,
    });
    totalMissing += built.manifest.missing_asset_count;
  }

  const manifest: TextlogsContainerManifest = {
    format: 'pkc2-textlogs-container-bundle',
    version: 1,
    exported_at: now.toISOString(),
    source_cid: container.meta.container_id,
    source_title: container.meta.title ?? '',
    entry_count: textlogEntries.length,
    compact,
    entries: manifestEntries,
  };

  zipEntries.unshift({
    name: 'manifest.json',
    data: textToBytes(JSON.stringify(manifest, null, 2)),
  });

  const blob = createZipBlob(zipEntries);
  const containerSlug = slugify(container.meta.title || container.meta.container_id);
  const date = formatDateCompact(now);
  const filename = `textlogs-${containerSlug}-${date}.textlogs.zip`;

  return { blob, filename, manifest, totalMissingAssetCount: totalMissing };
}

// ── Import (Issue H) ────────────────────────

/**
 * One imported attachment, ready to be dispatched as its own entry.
 *
 * The importer never calls the dispatcher directly (see
 * `TextlogImportSuccess` rationale). Instead it returns one of these
 * per asset and lets the caller emit a `CREATE_ENTRY` +
 * `COMMIT_EDIT` pair per entry. The shape mirrors what
 * `processFileAttachment` (drag-drop path) builds, so the imported
 * attachments are indistinguishable from drag-dropped ones once
 * inside the container.
 */
export interface ImportedAttachment {
  /** Display name — used as the attachment entry title and inside the body. */
  name: string;
  /** MIME type from `manifest.assets[oldKey].mime`. */
  mime: string;
  /** Decoded byte length of the binary, if it was carried in the manifest. */
  size?: number;
  /** Newly minted asset key. The textlog body already references this key. */
  assetKey: string;
  /** Base64-encoded binary, ready for `COMMIT_EDIT.assets`. */
  data: string;
}

/**
 * Result shape for `importTextlogBundle` /
 * `importTextlogBundleFromBuffer`.
 *
 * The successful path returns the *raw materials* needed to add a
 * new textlog entry **plus** N attachment entries to the live
 * container — but it never dispatches. The caller (typically
 * `main.ts`'s file-picker handler) is the one that knows about the
 * dispatcher and is responsible for emitting the
 * `CREATE_ENTRY` + `COMMIT_EDIT` pairs.
 *
 * Why split it this way: the import path is purely additive (spec
 * §14) and threading a dispatcher down into `adapter/platform/`
 * would cross a layer boundary for zero gain. Returning the raw
 * materials keeps the platform layer pure and mirrors the existing
 * `importContainerFromZip` shape.
 */
export interface TextlogImportSuccess {
  ok: true;
  /** The textlog entry to create after the attachments are in place. */
  textlog: { title: string; body: string };
  /** One per asset present in `assets/`. Order matches manifest order. */
  attachments: ImportedAttachment[];
  /**
   * Number of bundle entries (rows) that were imported. Equals
   * `parseTextlogCsv(textlog.csv).entries.length` minus skipped rows.
   */
  entryCount: number;
  /**
   * Diagnostic copy of the source manifest, for caller logging /
   * console output. NOT used by the reducer.
   */
  sourceManifest: TextlogBundleManifest;
  /** Original filename (only set when imported from a `File`). */
  source: string;
}

export interface TextlogImportFailure {
  ok: false;
  /** Human-readable error string. Safe to surface via `SYS_ERROR`. */
  error: string;
}

export type TextlogImportResult = TextlogImportSuccess | TextlogImportFailure;

/**
 * Import a TEXTLOG bundle from a `File` (the file picker output).
 *
 * - Validates `manifest.format === 'pkc2-textlog-bundle'` and
 *   `manifest.version === 1` (spec §14.1).
 * - Parses `textlog.csv` with `text_markdown` as the source of
 *   truth (spec §14.6) — `text_plain` and `asset_keys` are
 *   discarded; the latter is re-derived from `text_markdown`.
 * - **Always** re-keys every imported asset (spec §14.4) and
 *   rewrites every `![…](asset:<old>)` / `[…](asset:<old>)`
 *   reference in the imported `text_markdown` accordingly.
 * - Failure-atomic: any error → `{ ok: false, error }` and the
 *   caller never dispatches anything.
 *
 * The returned object is the raw material for **N + 1** entries:
 * one `CREATE_ENTRY` + `COMMIT_EDIT` pair per imported attachment,
 * followed by one for the textlog itself. The function does not
 * call the dispatcher — see `TextlogImportSuccess` for why.
 */
export async function importTextlogBundle(file: File): Promise<TextlogImportResult> {
  try {
    const buf = await file.arrayBuffer();
    return importTextlogBundleFromBuffer(buf, file.name);
  } catch (e) {
    return { ok: false, error: `Textlog import failed: ${String(e)}` };
  }
}

/**
 * Variant of `importTextlogBundle` that takes a raw `ArrayBuffer`
 * directly. Used by tests so they can build a bundle in memory and
 * round-trip it without going through a `File` constructor.
 *
 * Behaviour is identical to `importTextlogBundle`. Both paths
 * funnel into the same parser / re-keyer / result-builder, so any
 * future change only needs to land in one place.
 */
export function importTextlogBundleFromBuffer(
  buffer: ArrayBuffer,
  source = 'buffer',
): TextlogImportResult {
  try {
    const bytes = new Uint8Array(buffer);
    let entries: ZipEntry[];
    try {
      entries = parseZip(bytes);
    } catch (e) {
      return { ok: false, error: `Invalid ZIP: ${String(e)}` };
    }

    // 1. Locate manifest.json — required.
    const manifestEntry = entries.find((e) => e.name === 'manifest.json');
    if (!manifestEntry) {
      return { ok: false, error: 'Missing manifest.json in textlog bundle' };
    }
    let parsedManifest: Partial<TextlogBundleManifest>;
    try {
      parsedManifest = JSON.parse(bytesToText(manifestEntry.data)) as Partial<TextlogBundleManifest>;
    } catch (e) {
      return { ok: false, error: `Invalid manifest.json: ${String(e)}` };
    }

    // 2. Validate format / version. Anything else is rejected up
    // front so the dispatcher never sees a partial bundle.
    if (parsedManifest.format !== 'pkc2-textlog-bundle') {
      return {
        ok: false,
        error: `Invalid format: expected "pkc2-textlog-bundle", got "${String(parsedManifest.format)}"`,
      };
    }
    if (parsedManifest.version !== 1) {
      return {
        ok: false,
        error: `Unsupported textlog bundle version: ${String(parsedManifest.version)}`,
      };
    }

    // 3. Locate textlog.csv — required.
    const csvEntry = entries.find((e) => e.name === 'textlog.csv');
    if (!csvEntry) {
      return { ok: false, error: 'Missing textlog.csv in textlog bundle' };
    }

    // 4. Parse the CSV. `parseTextlogCsv` throws on header / shape
    // failures; we wrap to keep the failure-atomic guarantee (§14.7).
    let parsedBody: TextlogBody;
    try {
      parsedBody = parseTextlogCsv(bytesToText(csvEntry.data));
    } catch (e) {
      return { ok: false, error: `Invalid textlog.csv: ${String(e)}` };
    }

    // 5. Build the imported attachment list. Always re-key (spec
    // §14.4): we never assume the source's keys are collision-free
    // against the target container.
    const sourceAssetIndex = parsedManifest.assets ?? {};
    const keyMap: Record<string, string> = {};
    const attachments: ImportedAttachment[] = [];
    let collisionCounter = 0;
    for (const oldKey of Object.keys(sourceAssetIndex)) {
      // Find the matching binary file inside `assets/<oldKey>.<ext>`.
      const fileEntry = entries.find(
        (e) => e.name.startsWith('assets/') && stripAssetExtension(e.name.slice('assets/'.length)) === oldKey,
      );
      if (!fileEntry) {
        // Manifest claims an asset that has no file — treat as
        // missing. Don't add it to keyMap so the body's references
        // to it stay unchanged (spec §14.3).
        continue;
      }
      const meta = sourceAssetIndex[oldKey];
      if (!meta) continue;
      const newKey = generateImportAssetKey(collisionCounter++);
      keyMap[oldKey] = newKey;
      attachments.push({
        name: meta.name,
        mime: meta.mime,
        size: fileEntry.data.byteLength,
        assetKey: newKey,
        data: bytesToBase64(fileEntry.data),
      });
    }

    // 6. Rewrite every present-key reference inside text_markdown.
    // Missing keys (those NOT in keyMap) are deliberately left as-is
    // so the imported textlog still surfaces the broken-reference
    // signal exactly like the source did.
    const rewrittenBody: TextlogBody = {
      entries: parsedBody.entries.map((entry) => ({
        ...entry,
        text: rewriteAssetReferences(entry.text ?? '', keyMap),
      })),
    };

    // 7. Resolve the title. Spec §14.5: prefer source_title, fall
    // back to a fixed string. Trim to avoid leaking trailing
    // whitespace from a manifest that was hand-edited.
    const title = (parsedManifest.source_title ?? '').trim() || 'Imported textlog';

    return {
      ok: true,
      textlog: { title, body: serializeTextlogBody(rewrittenBody) },
      attachments,
      entryCount: rewrittenBody.entries.length,
      sourceManifest: parsedManifest as TextlogBundleManifest,
      source,
    };
  } catch (e) {
    // Last-resort guard: any unexpected throw becomes a failure
    // result, never a partial dispatch.
    return { ok: false, error: `Textlog import failed: ${String(e)}` };
  }
}

// ── internals ────────────────────────────────────────

interface ResolvedAssets {
  assetIndex: Record<string, { name: string; mime: string }>;
  assetEntries: ZipEntry[];
  missingKeys: string[];
}

/**
 * Walk the referenced asset keys, look each up against the container's
 * attachment entries + asset pool, and produce both the manifest index
 * and the in-ZIP file entries.
 *
 * - A key whose attachment entry exists AND whose binary data is
 *   present in `container.assets[key]` is **resolved**: it gets a
 *   manifest entry and a ZIP file entry.
 * - A key with no matching attachment entry, or whose binary data is
 *   absent (light-export-stripped, deleted, etc.), is **missing**:
 *   listed in `missingKeys`, no ZIP entry.
 *
 * Order: results are stable in the order the keys were referenced
 * (first occurrence wins, matches `collectTextlogAssetKeys`).
 */
function resolveAssets(referencedKeys: string[], container: Container): ResolvedAssets {
  // Build a key → { name, mime } map by walking attachment entries.
  // Cheap; the textlog bundle is a one-shot operation and the entry
  // count is bounded by the user's container size.
  const attachmentByKey = new Map<string, { name: string; mime: string }>();
  for (const e of container.entries) {
    if (e.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(e.body);
    if (att.asset_key && att.mime) {
      attachmentByKey.set(att.asset_key, {
        name: att.name || att.asset_key,
        mime: att.mime,
      });
    }
  }

  const assetIndex: Record<string, { name: string; mime: string }> = {};
  const assetEntries: ZipEntry[] = [];
  const missingKeys: string[] = [];

  for (const key of referencedKeys) {
    const meta = attachmentByKey.get(key);
    const data = container.assets?.[key];
    if (!meta || !data) {
      missingKeys.push(key);
      continue;
    }
    const ext = chooseExtension(meta.name, meta.mime);
    const filename = `assets/${key}${ext}`;
    assetIndex[key] = { name: meta.name, mime: meta.mime };
    assetEntries.push({ name: filename, data: base64ToBytes(data) });
  }

  return { assetIndex, assetEntries, missingKeys };
}

/**
 * Choose a filename extension for an asset, in priority order:
 *
 *   1. The extension from the attachment's original `name`, if it has
 *      one (e.g. `budget.xlsx` → `.xlsx`). Preserves the original
 *      suffix for tools that key off it.
 *   2. A MIME-derived extension from a fixed allowlist (`image/png`
 *      → `.png`, `application/pdf` → `.pdf`, etc.).
 *   3. `.bin` as a final fallback so we never produce an extensionless
 *      name.
 */
export function chooseExtension(name: string, mime: string): string {
  // 1. Extension from the original filename (must contain a dot and at
  // least one character on each side, and the extension itself is
  // restricted to safe filename characters).
  if (name) {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
    if (m) return `.${m[1]!.toLowerCase()}`;
  }
  // 2. Allowlisted MIME → extension table. Kept narrow on purpose;
  // unknown MIMEs fall through to `.bin` rather than attempting to
  // guess from a potentially adversarial string.
  const fromMime = MIME_EXTENSION[mime.toLowerCase()];
  if (fromMime) return fromMime;
  return '.bin';
}

const MIME_EXTENSION: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/html': '.html',
  'text/markdown': '.md',
  'text/csv': '.csv',
  'application/json': '.json',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/x-tar': '.tar',
  'application/gzip': '.gz',
  'application/x-7z-compressed': '.7z',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.weba',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

/**
 * Strip a known asset extension off an `assets/<key><.ext>` filename
 * to recover the bare asset key. Knows the same allowlist of
 * extensions that `chooseExtension` writes, plus a generic
 * `.<a-z0-9>{1,8}` fallback for `.bin` and any future addition.
 *
 * Used by the importer to match a manifest key against the actual
 * file inside `assets/`. The export side guarantees the key portion
 * of the filename equals the manifest key, so this is just an
 * extension stripper, not a fuzzy match.
 */
function stripAssetExtension(filename: string): string {
  // Greedy match against `<key><.ext>`. The allowed key character
  // set matches `ast-{ts}-{rand}` and is broad enough that any
  // legitimate asset key composes correctly.
  const m = /^([A-Za-z0-9_-]+)\.[A-Za-z0-9]{1,8}$/.exec(filename);
  if (m) return m[1]!;
  return filename;
}

/**
 * Generate a fresh asset key for an imported attachment. The shape
 * matches the `att-{ts}-{rand}` form `processFileAttachment` uses
 * for drag-dropped files, so any downstream consumer that special-
 * cases that prefix continues to work.
 *
 * The `salt` argument lets us produce N distinct keys from a single
 * `Date.now()` tick — important when the bundle has many assets and
 * `Math.random` happens to collide on the first few characters.
 */
function generateImportAssetKey(salt: number): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `att-${ts}-${salt}${rand}`;
}

/**
 * Rewrite every `![alt](asset:<old>)` / `[label](asset:<old>)`
 * reference whose `<old>` key appears in `keyMap`, replacing the
 * key with `keyMap[old]`. References whose key is **not** in
 * `keyMap` are left untouched — those represent the missing assets
 * recorded in `manifest.missing_asset_keys`, which spec §14.3 says
 * we preserve verbatim.
 *
 * The regex mirrors `stripBrokenAssetRefs` and the asset collector
 * in `textlog-csv.ts`, including the optional title (`"…"`) match,
 * so all three stay in sync on edge cases.
 *
 * Pure — returns a new string.
 */
function rewriteAssetReferences(text: string, keyMap: Record<string, string>): string {
  if (!text) return '';
  const re = /(!?)\[([^\]]*)\]\(asset:([^\s)"]+)((?:\s+"[^"]*")?)\)/g;
  return text.replace(re, (match, bang: string, label: string, oldKey: string, title: string) => {
    const newKey = keyMap[oldKey];
    if (!newKey) return match; // missing key — preserve verbatim
    return `${bang}[${label}](asset:${newKey}${title})`;
  });
}

/**
 * Re-exported for tests / callers that want to inspect the parsed
 * body before building the bundle. The bundle builder calls this
 * internally; importing it from here saves the caller from having
 * to know about the `features/textlog` layer.
 */
export type { TextlogBody };
