/**
 * Container-wide / folder-scoped batch import.
 *
 * Reads a batch bundle ZIP (produced by container-wide TEXT export,
 * container-wide TEXTLOG export, or folder-scoped export) and
 * extracts each nested `.text.zip` / `.textlog.zip` via the
 * existing single-entry importers.
 *
 * Format spec: `docs/development/container-wide-batch-import.md`.
 *
 * Key properties:
 * - **Always-additive**: never replaces/merges existing entries
 * - **Failure-atomic**: any parse/validation error → `{ ok: false }`,
 *   dispatch 0 entries
 * - **Delegates to single-entry importers**: no new parse logic
 * - **Does not touch the dispatcher**: returns raw materials only
 */

import {
  parseZip,
  bytesToText,
  type ZipEntry,
} from './zip-package';
import { importTextBundleFromBuffer, type ImportedTextAttachment } from './text-bundle';
import { importTextlogBundleFromBuffer, type ImportedAttachment } from './textlog-bundle';

// ── Types ────────────────────────────────────────────

/** Unified attachment shape (TEXT and TEXTLOG share the same fields). */
export type BatchAttachment = ImportedTextAttachment | ImportedAttachment;

export interface BatchImportEntry {
  archetype: 'text' | 'textlog';
  title: string;
  body: string;
  attachments: BatchAttachment[];
}

export interface BatchImportSuccess {
  ok: true;
  entries: BatchImportEntry[];
  /** Original filename (from the File object). */
  source: string;
  /** The batch manifest format string. */
  format: string;
}

export interface BatchImportFailure {
  ok: false;
  error: string;
}

export type BatchImportResult = BatchImportSuccess | BatchImportFailure;

// ── Preview types ───────────────────────────────────

/** Per-entry metadata from the batch bundle manifest. */
export interface BatchImportPreviewEntry {
  index: number;
  title: string;
  archetype: 'text' | 'textlog';
}

/** Lightweight metadata extracted from the manifest only (no nested parse). */
export interface BatchImportPreviewInfo {
  format: string;
  /** Human-readable format label. */
  formatLabel: string;
  textCount: number;
  textlogCount: number;
  totalEntries: number;
  compacted: boolean;
  /** Total missing asset count across all entries. */
  missingAssetCount: number;
  isFolderExport: boolean;
  sourceFolderTitle: string | null;
  source: string;
  /** Per-entry metadata (title + archetype). */
  entries: BatchImportPreviewEntry[];
  /** Indices of entries selected for import (default: all). */
  selectedIndices: number[];
}

export type BatchImportPreviewResult =
  | { ok: true; info: BatchImportPreviewInfo }
  | { ok: false; error: string };

// ── Accepted batch formats ──────────────────────────

const ACCEPTED_FORMATS = new Set([
  'pkc2-textlogs-container-bundle',
  'pkc2-texts-container-bundle',
  'pkc2-folder-export-bundle',
]);

// ── Public API ────────────────────────────────────────

/**
 * Import a batch bundle from a `File` (file picker output).
 */
export async function importBatchBundle(file: File): Promise<BatchImportResult> {
  try {
    const buf = await file.arrayBuffer();
    return importBatchBundleFromBuffer(buf, file.name);
  } catch (e) {
    return { ok: false, error: `Batch import failed: ${String(e)}` };
  }
}

/**
 * Extract lightweight preview metadata from a batch bundle.
 * Reads only the manifest.json — does NOT parse nested bundles.
 * Used by the preview UI to show import summary before the user confirms.
 */
export function previewBatchBundleFromBuffer(
  buffer: ArrayBuffer,
  source = 'buffer',
): BatchImportPreviewResult {
  try {
    const bytes = new Uint8Array(buffer);
    let outerEntries: ZipEntry[];
    try {
      outerEntries = parseZip(bytes);
    } catch (e) {
      return { ok: false, error: `Invalid ZIP: ${String(e)}` };
    }

    const manifestEntry = outerEntries.find((e) => e.name === 'manifest.json');
    if (!manifestEntry) {
      return { ok: false, error: 'Missing manifest.json in batch bundle' };
    }

    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(bytesToText(manifestEntry.data)) as Record<string, unknown>;
    } catch (e) {
      return { ok: false, error: `Invalid manifest.json: ${String(e)}` };
    }

    const format = manifest.format as string | undefined;
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      return { ok: false, error: `Unsupported batch format: "${String(format)}"` };
    }
    if (manifest.version !== 1) {
      return { ok: false, error: `Unsupported batch version: ${String(manifest.version)}` };
    }

    const manifestEntries = manifest.entries as
      | { archetype?: string; missing_asset_count?: number; title?: string; filename?: string }[]
      | undefined;
    if (!Array.isArray(manifestEntries)) {
      return { ok: false, error: 'Missing or invalid entries array in manifest' };
    }

    // Count archetypes and build per-entry metadata
    let textCount = 0;
    let textlogCount = 0;
    let missingAssetCount = 0;
    const previewEntries: BatchImportPreviewEntry[] = [];
    for (let i = 0; i < manifestEntries.length; i++) {
      const me = manifestEntries[i]!;
      const arch = resolveArchetype(format, me);
      if (arch === 'text') textCount++;
      else if (arch === 'textlog') textlogCount++;
      missingAssetCount += (me.missing_asset_count ?? 0);
      if (arch) {
        previewEntries.push({
          index: i,
          title: me.title ?? me.filename ?? `Entry ${i + 1}`,
          archetype: arch,
        });
      }
    }

    const isFolderExport = format === 'pkc2-folder-export-bundle';

    return {
      ok: true,
      info: {
        format,
        formatLabel: FORMAT_LABELS[format] ?? format,
        textCount,
        textlogCount,
        totalEntries: manifestEntries.length,
        compacted: manifest.compact === true,
        missingAssetCount,
        isFolderExport,
        sourceFolderTitle: isFolderExport
          ? (manifest.source_folder_title as string | null) ?? null
          : null,
        source,
        entries: previewEntries,
        selectedIndices: previewEntries.map((e) => e.index),
      },
    };
  } catch (e) {
    return { ok: false, error: `Preview failed: ${String(e)}` };
  }
}

const FORMAT_LABELS: Record<string, string> = {
  'pkc2-texts-container-bundle': 'TEXT container bundle',
  'pkc2-textlogs-container-bundle': 'TEXTLOG container bundle',
  'pkc2-folder-export-bundle': 'Folder export bundle',
};

/**
 * Import a batch bundle from a raw `ArrayBuffer`. Used by tests
 * so they can round-trip without going through a `File` constructor.
 *
 * Failure-atomic: any error → `{ ok: false, error }` and zero
 * dispatch material is returned.
 */
export function importBatchBundleFromBuffer(
  buffer: ArrayBuffer,
  source = 'buffer',
): BatchImportResult {
  try {
    const bytes = new Uint8Array(buffer);
    let outerEntries: ZipEntry[];
    try {
      outerEntries = parseZip(bytes);
    } catch (e) {
      return { ok: false, error: `Invalid ZIP: ${String(e)}` };
    }

    // 1. Read and validate manifest
    const manifestEntry = outerEntries.find((e) => e.name === 'manifest.json');
    if (!manifestEntry) {
      return { ok: false, error: 'Missing manifest.json in batch bundle' };
    }

    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(bytesToText(manifestEntry.data)) as Record<string, unknown>;
    } catch (e) {
      return { ok: false, error: `Invalid manifest.json: ${String(e)}` };
    }

    const format = manifest.format as string | undefined;
    if (!format || !ACCEPTED_FORMATS.has(format)) {
      return {
        ok: false,
        error: `Unsupported batch format: "${String(format)}"`,
      };
    }
    if (manifest.version !== 1) {
      return {
        ok: false,
        error: `Unsupported batch version: ${String(manifest.version)}`,
      };
    }

    // 2. Extract the entries list from the manifest
    const manifestEntries = manifest.entries as
      | { filename: string; archetype?: string }[]
      | undefined;
    if (!Array.isArray(manifestEntries)) {
      return { ok: false, error: 'Missing or invalid entries array in manifest' };
    }

    // Build a lookup map for nested ZIP files
    const nestedByName = new Map<string, Uint8Array>();
    for (const entry of outerEntries) {
      if (entry.name !== 'manifest.json') {
        nestedByName.set(entry.name, entry.data);
      }
    }

    // 3. Process each nested bundle
    const importedEntries: BatchImportEntry[] = [];

    for (const me of manifestEntries) {
      const nestedData = nestedByName.get(me.filename);
      if (!nestedData) {
        return {
          ok: false,
          error: `Nested bundle "${me.filename}" listed in manifest but missing from ZIP`,
        };
      }

      // Determine archetype from format or manifest entry
      const archetype = resolveArchetype(format, me);
      if (!archetype) {
        return {
          ok: false,
          error: `Cannot determine archetype for "${me.filename}" in format "${format}"`,
        };
      }

      // Slice to get a proper ArrayBuffer (Uint8Array.buffer is ArrayBufferLike)
      const nestedBuf = nestedData.buffer.slice(
        nestedData.byteOffset,
        nestedData.byteOffset + nestedData.byteLength,
      ) as ArrayBuffer;

      if (archetype === 'text') {
        const result = importTextBundleFromBuffer(nestedBuf, me.filename);
        if (!result.ok) {
          return {
            ok: false,
            error: `Failed to parse nested text bundle "${me.filename}": ${result.error}`,
          };
        }
        importedEntries.push({
          archetype: 'text',
          title: result.text.title,
          body: result.text.body,
          attachments: result.attachments,
        });
      } else {
        const result = importTextlogBundleFromBuffer(nestedBuf, me.filename);
        if (!result.ok) {
          return {
            ok: false,
            error: `Failed to parse nested textlog bundle "${me.filename}": ${result.error}`,
          };
        }
        importedEntries.push({
          archetype: 'textlog',
          title: result.textlog.title,
          body: result.textlog.body,
          attachments: result.attachments,
        });
      }
    }

    return {
      ok: true,
      entries: importedEntries,
      source,
      format,
    };
  } catch (e) {
    return { ok: false, error: `Batch import failed: ${String(e)}` };
  }
}

// ── internals ────────────────────────────────────────

/**
 * Determine the archetype for a nested bundle based on the outer
 * format and per-entry manifest data.
 *
 * - `pkc2-textlogs-container-bundle` → always 'textlog'
 * - `pkc2-texts-container-bundle` → always 'text'
 * - `pkc2-folder-export-bundle` → from `entry.archetype`
 */
function resolveArchetype(
  format: string,
  entry: { archetype?: string },
): 'text' | 'textlog' | null {
  switch (format) {
    case 'pkc2-textlogs-container-bundle':
      return 'textlog';
    case 'pkc2-texts-container-bundle':
      return 'text';
    case 'pkc2-folder-export-bundle':
      if (entry.archetype === 'text') return 'text';
      if (entry.archetype === 'textlog') return 'textlog';
      return null;
    default:
      return null;
  }
}
