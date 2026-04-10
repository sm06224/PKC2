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
  type TextlogBody,
} from '../../features/textlog/textlog-body';
import {
  serializeTextlogAsCsv,
  collectTextlogAssetKeys,
} from '../../features/textlog/textlog-csv';
import {
  createZipBlob,
  textToBytes,
  base64ToBytes,
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
}

export interface TextlogBundleResult {
  blob: Blob;
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
  options?: { now?: Date },
): TextlogBundleResult {
  if (entry.archetype !== 'textlog') {
    throw new Error(`buildTextlogBundle requires a textlog entry, got ${entry.archetype}`);
  }

  const now = options?.now ?? new Date();
  const body = parseTextlogBody(entry.body);

  // Resolve referenced assets, partitioning into "present" vs "missing".
  const referencedKeys = collectTextlogAssetKeys(body);
  const { assetIndex, assetEntries, missingKeys } = resolveAssets(
    referencedKeys,
    container,
  );

  const manifest: TextlogBundleManifest = {
    format: 'pkc2-textlog-bundle',
    version: 1,
    exported_at: now.toISOString(),
    source_cid: container.meta.container_id,
    source_lid: entry.lid,
    source_title: entry.title ?? '',
    entry_count: body.entries.length,
    asset_count: Object.keys(assetIndex).length,
    missing_asset_count: missingKeys.length,
    missing_asset_keys: missingKeys,
    assets: assetIndex,
  };

  const csv = serializeTextlogAsCsv(body);

  const zipEntries: ZipEntry[] = [
    { name: 'manifest.json', data: textToBytes(JSON.stringify(manifest, null, 2)) },
    { name: 'textlog.csv', data: textToBytes(csv) },
    ...assetEntries,
  ];

  const blob = createZipBlob(zipEntries);
  const filename = buildBundleFilename(entry, now);
  return { blob, manifest, filename };
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
    const built = buildTextlogBundle(entry, container, { now: options?.now });
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
 * Re-exported for tests / callers that want to inspect the parsed
 * body before building the bundle. The bundle builder calls this
 * internally; importing it from here saves the caller from having
 * to know about the `features/textlog` layer.
 */
export type { TextlogBody };
