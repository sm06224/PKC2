/**
 * TEXT markdown + assets ZIP bundle — sister format to
 * `textlog-bundle.ts`. Format spec is pinned in
 * `docs/development/completed/text-markdown-zip-export.md`. The short version:
 *
 *   <slug>-<yyyymmdd>.text.zip
 *   ├── manifest.json   — metadata, asset index, missing-key report
 *   ├── body.md         — the markdown body, verbatim
 *   └── assets/         — referenced assets only, named <key><ext>
 *
 * Layering: this file is `adapter/platform/` because it touches
 * Blob / browser download APIs. The markdown helpers live in
 * `features/text/text-markdown.ts` (pure). The ZIP writer /
 * extension chooser are shared with `textlog-bundle.ts` through
 * `zip-package.ts`.
 */

import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import {
  collectMarkdownAssetKeys,
  compactMarkdownAgainst,
} from '../../features/text/text-markdown';
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
import { chooseExtension } from './textlog-bundle';

// ── Types ────────────────────────────────────────────

export interface TextBundleManifest {
  format: 'pkc2-text-bundle';
  version: 1;
  exported_at: string;
  source_cid: string;
  source_lid: string;
  source_title: string;
  body_length: number;
  asset_count: number;
  missing_asset_count: number;
  missing_asset_keys: string[];
  /** asset_key → { name, mime } for every file written under assets/. */
  assets: Record<string, { name: string; mime: string }>;
  /**
   * `true` when the bundle was produced in "compact mode" — broken
   * asset references were stripped from `body.md`. The live container
   * is never mutated regardless of this flag. See spec §6.
   */
  compacted: boolean;
}

export interface TextBundleResult {
  blob: Blob;
  /** Raw ZIP bytes — same content as `blob` but as a Uint8Array.
   *  Available so callers that nest this bundle inside another ZIP
   *  can avoid a Blob→ArrayBuffer async round-trip. */
  zipBytes: Uint8Array;
  filename: string;
  manifest: TextBundleManifest;
}

export interface TextExportResult {
  success: boolean;
  filename: string;
  size: number;
  manifest?: TextBundleManifest;
  error?: string;
}

export interface TextExportOptions {
  /** Override the generated filename (without `.text.zip` suffix). */
  filename?: string;
  /** Override the download trigger — used by tests. */
  downloadFn?: (blob: Blob, filename: string) => void;
  /** Override the export timestamp — used by tests for stable output. */
  now?: Date;
  /**
   * Compact mode — see spec §6. When `true`, the bundle is built
   * from a rewritten copy of the body in which broken asset
   * references are stripped. The live entry and container are
   * never mutated. Default: `false`.
   */
  compact?: boolean;
}

// ── Public API (export) ─────────────────────────────

/**
 * Build a `.text.zip` bundle for a single text entry. Produces a
 * Blob in memory but does not trigger any download — so the same
 * function drives both the action handler and the round-trip tests.
 *
 * Throws if the entry is not a text archetype (caller should guard).
 */
export function buildTextBundle(
  entry: Entry,
  container: Container,
  options?: { now?: Date; compact?: boolean },
): TextBundleResult {
  if (entry.archetype !== 'text') {
    throw new Error(`buildTextBundle requires a text entry, got ${entry.archetype}`);
  }

  const now = options?.now ?? new Date();
  const compact = options?.compact === true;
  const body = entry.body ?? '';

  // Resolve referenced assets against the ORIGINAL body first. The
  // `missing_asset_keys` list in the manifest is the audit trail of
  // "what was referenced but unavailable"; it must not change when
  // compact mode rewrites them out of the body.
  const referencedKeys = collectMarkdownAssetKeys(body);
  const { assetIndex, assetEntries, missingKeys } = resolveAssets(
    referencedKeys,
    container,
  );

  // Under compact mode, rewrite a snapshot of the body. The live
  // entry.body and container are never touched.
  const presentKeys = new Set(Object.keys(assetIndex));
  const bodyForZip = compact
    ? compactMarkdownAgainst(body, presentKeys)
    : body;

  const manifest: TextBundleManifest = {
    format: 'pkc2-text-bundle',
    version: 1,
    exported_at: now.toISOString(),
    source_cid: container.meta.container_id,
    source_lid: entry.lid,
    source_title: entry.title ?? '',
    body_length: bodyForZip.length,
    asset_count: Object.keys(assetIndex).length,
    missing_asset_count: missingKeys.length,
    missing_asset_keys: missingKeys,
    assets: assetIndex,
    compacted: compact,
  };

  const zipEntries: ZipEntry[] = [
    { name: 'manifest.json', data: textToBytes(JSON.stringify(manifest, null, 2)) },
    { name: 'body.md', data: textToBytes(bodyForZip) },
    ...assetEntries,
  ];

  const zipBytes = createZipBytes(zipEntries);
  const blob = new Blob([zipBytes as BlobPart], { type: 'application/zip' });
  const filename = buildTextBundleFilename(entry, now);
  return { blob, zipBytes, manifest, filename };
}

/**
 * Build the bundle and trigger a browser download. Mirrors
 * `exportTextlogAsBundle` — errors during build are caught and
 * returned in the result rather than thrown, so the action handler
 * stays boring.
 */
export async function exportTextAsBundle(
  entry: Entry,
  container: Container,
  options?: TextExportOptions,
): Promise<TextExportResult> {
  try {
    const built = buildTextBundle(entry, container, {
      now: options?.now,
      compact: options?.compact,
    });
    const filename = options?.filename
      ? `${options.filename}.text.zip`
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
 * `<slug>-<yyyymmdd>.text.zip`. Uses entry title (falling back to
 * entry lid) for the slug and the export day for the date — same
 * convention as the TEXTLOG bundle.
 */
export function buildTextBundleFilename(entry: Entry, now: Date = new Date()): string {
  const slug = slugify(entry.title || entry.lid);
  const date = formatDateCompact(now);
  return `${slug}-${date}.text.zip`;
}

// ── Container-wide export ────────────────────────

/**
 * Top-level manifest for a container-wide TEXT export bundle.
 */
export interface TextsContainerManifest {
  format: 'pkc2-texts-container-bundle';
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
    body_length: number;
    asset_count: number;
    missing_asset_count: number;
  }[];
}

export interface TextsContainerResult {
  blob: Blob;
  filename: string;
  manifest: TextsContainerManifest;
  /** Total missing asset count across all bundles. */
  totalMissingAssetCount: number;
}

/**
 * Build a container-wide TEXT export: a ZIP containing individual
 * `.text.zip` bundles for every text entry in the container,
 * plus a top-level `manifest.json`.
 *
 * Each inner bundle is produced by `buildTextBundle()` — the exact
 * same format as a single-entry export. The outer ZIP nests them as
 * stored byte arrays (ZIP-in-ZIP), so unzipping the outer archive
 * gives individual bundles that can be imported independently.
 *
 * Live state is never mutated.
 */
export function buildTextsContainerBundle(
  container: Container,
  options?: { now?: Date; compact?: boolean },
): TextsContainerResult {
  const now = options?.now ?? new Date();
  const compact = options?.compact === true;

  const textEntries = container.entries.filter((e) => e.archetype === 'text');

  // Track filenames for dedup
  const usedFilenames = new Set<string>();
  const manifestEntries: TextsContainerManifest['entries'] = [];
  const zipEntries: ZipEntry[] = [];
  let totalMissing = 0;

  for (const entry of textEntries) {
    const built = buildTextBundle(entry, container, { now, compact });

    // Deduplicate filenames with -2, -3, ... suffixes
    let filename = built.filename;
    if (usedFilenames.has(filename)) {
      const base = filename.replace(/\.text\.zip$/, '');
      let suffix = 2;
      while (usedFilenames.has(`${base}-${suffix}.text.zip`)) suffix++;
      filename = `${base}-${suffix}.text.zip`;
    }
    usedFilenames.add(filename);

    const innerBytes = built.zipBytes;

    zipEntries.push({ name: filename, data: innerBytes });
    manifestEntries.push({
      lid: entry.lid,
      title: entry.title ?? '',
      filename,
      body_length: built.manifest.body_length,
      asset_count: built.manifest.asset_count,
      missing_asset_count: built.manifest.missing_asset_count,
    });
    totalMissing += built.manifest.missing_asset_count;
  }

  const manifest: TextsContainerManifest = {
    format: 'pkc2-texts-container-bundle',
    version: 1,
    exported_at: now.toISOString(),
    source_cid: container.meta.container_id,
    source_title: container.meta.title ?? '',
    entry_count: textEntries.length,
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
  const filename = `texts-${containerSlug}-${date}.texts.zip`;

  return { blob, filename, manifest, totalMissingAssetCount: totalMissing };
}

// ── Import ─────────────────────────────────────────

/**
 * One imported attachment, ready to be dispatched as its own entry.
 *
 * The importer never calls the dispatcher directly. Instead it
 * returns one of these per asset and lets the caller emit a
 * `CREATE_ENTRY` + `COMMIT_EDIT` pair per entry. Shape mirrors the
 * TEXTLOG bundle importer's `ImportedAttachment` (intentionally
 * duplicated — see spec §11: no premature unification until
 * container-wide batch import lands).
 */
export interface ImportedTextAttachment {
  /** Display name — used as the attachment entry title and inside the body. */
  name: string;
  /** MIME type from `manifest.assets[oldKey].mime`. */
  mime: string;
  /** Decoded byte length of the binary. */
  size?: number;
  /** Newly minted asset key. The imported body already references this key. */
  assetKey: string;
  /** Base64-encoded binary, ready for `COMMIT_EDIT.assets`. */
  data: string;
}

export interface TextImportSuccess {
  ok: true;
  /** The text entry to create after the attachments are in place. */
  text: { title: string; body: string };
  /** One per asset present in `assets/`. Order matches manifest order. */
  attachments: ImportedTextAttachment[];
  /**
   * Diagnostic copy of the source manifest, for caller logging /
   * console output. NOT used by the reducer.
   */
  sourceManifest: TextBundleManifest;
  /** Original filename (only set when imported from a `File`). */
  source: string;
}

export interface TextImportFailure {
  ok: false;
  /** Human-readable error string. Safe to surface via `SYS_ERROR`. */
  error: string;
}

export type TextImportResult = TextImportSuccess | TextImportFailure;

/**
 * Import a `.text.zip` bundle from a `File` (file picker output).
 *
 * - Validates `manifest.format === 'pkc2-text-bundle'` and
 *   `manifest.version === 1` (spec §7.1).
 * - Reads `body.md` verbatim as the source of truth (spec §4).
 * - **Always** re-keys every imported asset (spec §7.3) and
 *   rewrites every `![…](asset:<old>)` / `[…](asset:<old>)`
 *   reference in the imported body accordingly.
 * - Failure-atomic (spec §7.7): any error → `{ ok: false, error }`
 *   and the caller never dispatches anything.
 *
 * The returned object is the raw material for **N + 1** entries:
 * one `CREATE_ENTRY` + `COMMIT_EDIT` pair per imported attachment,
 * followed by one for the text entry itself.
 */
export async function importTextBundle(file: File): Promise<TextImportResult> {
  try {
    const buf = await file.arrayBuffer();
    return importTextBundleFromBuffer(buf, file.name);
  } catch (e) {
    return { ok: false, error: `Text import failed: ${String(e)}` };
  }
}

/**
 * Variant of `importTextBundle` that takes a raw `ArrayBuffer`
 * directly. Used by tests so they can build a bundle in memory and
 * round-trip it without going through a `File` constructor.
 */
export function importTextBundleFromBuffer(
  buffer: ArrayBuffer,
  source = 'buffer',
): TextImportResult {
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
      return { ok: false, error: 'Missing manifest.json in text bundle' };
    }
    let parsedManifest: Partial<TextBundleManifest>;
    try {
      parsedManifest = JSON.parse(bytesToText(manifestEntry.data)) as Partial<TextBundleManifest>;
    } catch (e) {
      return { ok: false, error: `Invalid manifest.json: ${String(e)}` };
    }

    // 2. Validate format / version. Strict — any other value is
    // rejected up front so the dispatcher never sees a partial bundle.
    if (parsedManifest.format !== 'pkc2-text-bundle') {
      return {
        ok: false,
        error: `Invalid format: expected "pkc2-text-bundle", got "${String(parsedManifest.format)}"`,
      };
    }
    if (parsedManifest.version !== 1) {
      return {
        ok: false,
        error: `Unsupported text bundle version: ${String(parsedManifest.version)}`,
      };
    }

    // 3. Locate body.md — required.
    const bodyEntry = entries.find((e) => e.name === 'body.md');
    if (!bodyEntry) {
      return { ok: false, error: 'Missing body.md in text bundle' };
    }
    const rawBody = bytesToText(bodyEntry.data);

    // 4. Build the imported attachment list. Always re-key (spec
    // §7.3): we never assume the source keys are collision-free
    // against the target container.
    const sourceAssetIndex = parsedManifest.assets ?? {};
    const keyMap: Record<string, string> = {};
    const attachments: ImportedTextAttachment[] = [];
    let collisionCounter = 0;
    for (const oldKey of Object.keys(sourceAssetIndex)) {
      const fileEntry = entries.find(
        (e) => e.name.startsWith('assets/') && stripAssetExtension(e.name.slice('assets/'.length)) === oldKey,
      );
      if (!fileEntry) {
        // Manifest claims an asset that has no file — treat as
        // missing. Don't add it to keyMap so the body's references
        // to it stay unchanged (spec §7.3 half-broken handling).
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

    // 5. Rewrite every present-key reference inside the body. Missing
    // keys (NOT in keyMap) are deliberately left as-is so the imported
    // text still surfaces the broken-reference signal exactly like
    // the source did (spec §7.6).
    const rewrittenBody = rewriteAssetReferences(rawBody, keyMap);

    // 6. Resolve the title (spec §7.5).
    const title = (parsedManifest.source_title ?? '').trim() || 'Imported text';

    return {
      ok: true,
      text: { title, body: rewrittenBody },
      attachments,
      sourceManifest: parsedManifest as TextBundleManifest,
      source,
    };
  } catch (e) {
    // Last-resort guard: any unexpected throw becomes a failure
    // result, never a partial dispatch.
    return { ok: false, error: `Text import failed: ${String(e)}` };
  }
}

// ── internals ──────────────────────────────────────

interface ResolvedAssets {
  assetIndex: Record<string, { name: string; mime: string }>;
  assetEntries: ZipEntry[];
  missingKeys: string[];
}

/**
 * Walk the referenced asset keys, look each up against the container's
 * attachment entries + asset pool, and produce both the manifest index
 * and the in-ZIP file entries. Behaviour mirrors
 * `textlog-bundle.ts::resolveAssets` — a key is "resolved" iff an
 * attachment entry with that `asset_key` exists AND the binary data
 * is present in `container.assets`. Half-present keys (one side only)
 * are recorded as missing.
 */
function resolveAssets(referencedKeys: string[], container: Container): ResolvedAssets {
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
 * Strip a known asset extension off an `assets/<key><.ext>` filename
 * to recover the bare asset key. Same regex as the TEXTLOG importer —
 * they must stay in sync because the two formats share
 * `chooseExtension` for writing.
 */
function stripAssetExtension(filename: string): string {
  const m = /^([A-Za-z0-9_-]+)\.[A-Za-z0-9]{1,8}$/.exec(filename);
  if (m) return m[1]!;
  return filename;
}

/**
 * Generate a fresh asset key for an imported attachment. Matches the
 * `att-<ts>-<salt><rand>` shape that `processFileAttachment` uses for
 * drag-dropped files, so downstream consumers that special-case that
 * prefix continue to work.
 */
function generateImportAssetKey(salt: number): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `att-${ts}-${salt}${rand}`;
}

/**
 * Rewrite every `![alt](asset:<old>)` / `[label](asset:<old>)`
 * reference whose `<old>` key appears in `keyMap`, replacing the
 * key with `keyMap[old]`. References whose key is NOT in `keyMap`
 * are left untouched — those represent missing assets (spec §7.6)
 * which are preserved verbatim.
 *
 * Mirrors the equivalent in `textlog-bundle.ts`, including the
 * optional markdown title `(?:\s+"…")?` group so the two paths
 * stay in sync on edge cases.
 *
 * Pure — returns a new string.
 */
function rewriteAssetReferences(text: string, keyMap: Record<string, string>): string {
  if (!text) return '';
  const re = /(!?)\[([^\]]*)\]\(asset:([^\s)"]+)((?:\s+"[^"]*")?)\)/g;
  return text.replace(re, (match, bang: string, label: string, oldKey: string, title: string) => {
    const newKey = keyMap[oldKey];
    if (!newKey) return match;
    return `${bang}[${label}](asset:${newKey}${title})`;
  });
}
