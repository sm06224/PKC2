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
import { parseTextlogCsv } from '../../features/textlog/textlog-csv';
import { validateFolderGraph } from '../../features/batch-import/import-planner';
import type { PlannerFolderInfo } from '../../features/batch-import/import-planner';
import type { BatchImportPreviewEntry, BatchImportPreviewInfo } from '../../core/action/system-command';

// ── Types ────────────────────────────────────────────

/** Unified attachment shape (TEXT and TEXTLOG share the same fields). */
export type BatchAttachment = ImportedTextAttachment | ImportedAttachment;

/** Folder hierarchy info from the manifest (for structure restore). */
export interface BatchFolderInfo {
  lid: string;
  title: string;
  parentLid: string | null;
}

export interface BatchImportEntry {
  archetype: 'text' | 'textlog';
  title: string;
  body: string;
  attachments: BatchAttachment[];
  /** Original parent folder LID (references a folder in `folders`). */
  parentFolderLid?: string;
}

export interface BatchImportSuccess {
  ok: true;
  entries: BatchImportEntry[];
  /** Original filename (from the File object). */
  source: string;
  /** The batch manifest format string. */
  format: string;
  /** Folder hierarchy for structure restore (folder-export bundles only). */
  folders?: BatchFolderInfo[];
}

export interface BatchImportFailure {
  ok: false;
  error: string;
}

export type BatchImportResult = BatchImportSuccess | BatchImportFailure;

// ── Preview types ───────────────────────────────────
// BatchImportPreviewEntry and BatchImportPreviewInfo are defined in
// core/action/system-command.ts and imported above.
// Re-export for downstream consumers.
export type { BatchImportPreviewEntry, BatchImportPreviewInfo };

export type BatchImportPreviewResult =
  | { ok: true; info: BatchImportPreviewInfo }
  | { ok: false; error: string };

// ── Accepted batch formats ──────────────────────────

const ACCEPTED_FORMATS = new Set([
  'pkc2-textlogs-container-bundle',
  'pkc2-texts-container-bundle',
  'pkc2-folder-export-bundle',
  'pkc2-mixed-container-bundle',
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
 * Extract preview metadata from a batch bundle. Reads the outer
 * manifest for summary info, then peeks into each nested bundle
 * for body snippets and inner manifest metadata (deep preview).
 *
 * The nested peek is **not** a full import parse — no asset
 * re-keying, no body rewriting, no attachment construction. If a
 * nested peek fails, the summary preview still works (deep preview
 * fields are simply absent).
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
      | { archetype?: string; missing_asset_count?: number; title?: string; filename?: string; parent_folder_lid?: string }[]
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

    // Deep preview: peek into each nested bundle for body snippets
    // and inner manifest metadata. This is NOT a full import parse —
    // no asset re-keying, no body rewriting, no attachment construction.
    const nestedByName = new Map<string, Uint8Array>();
    for (const entry of outerEntries) {
      if (entry.name !== 'manifest.json') {
        nestedByName.set(entry.name, entry.data);
      }
    }
    for (let i = 0; i < manifestEntries.length; i++) {
      const me = manifestEntries[i]!;
      const pe = previewEntries.find((e) => e.index === i);
      if (!pe || !me.filename) continue;
      const nestedData = nestedByName.get(me.filename);
      if (!nestedData) continue;
      try {
        peekNestedBundle(nestedData, pe);
      } catch {
        // Peek failure is non-fatal — summary preview still works
      }
    }

    const isFolderExport = format === 'pkc2-folder-export-bundle';

    // Folder hierarchy for structure restore
    const rawFolders = manifest.folders as
      | { lid: string; title: string; parent_lid: string | null }[]
      | undefined;
    const hasFolders = isFolderExport && Array.isArray(rawFolders) && rawFolders.length > 0;
    let canRestoreFolderStructure = hasFolders;
    let malformedFolderMetadata: boolean | undefined;
    let folderGraphWarning: string | undefined;

    // Validate folder graph + entry references at preview time so UI can classify correctly.
    // Uses the same validateFolderGraph as confirm path for full classification parity.
    if (hasFolders) {
      const plannerFolders: PlannerFolderInfo[] = rawFolders!.map((f: { lid: string; title: string; parent_lid: string | null }) => ({
        lid: f.lid,
        title: f.title ?? '',
        parentLid: f.parent_lid ?? null,
      }));
      const entryRefs = manifestEntries.map((me) => ({
        parentFolderLid: me.parent_folder_lid,
      }));
      const validation = validateFolderGraph(plannerFolders, entryRefs);
      if (!validation.valid) {
        canRestoreFolderStructure = false;
        malformedFolderMetadata = true;
        folderGraphWarning = validation.warnings.join('; ');
      }
    }

    const folderCount = canRestoreFolderStructure ? rawFolders!.length : 0;

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
        canRestoreFolderStructure,
        folderCount,
        malformedFolderMetadata,
        folderGraphWarning,
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
  'pkc2-mixed-container-bundle': 'Mixed (TEXT + TEXTLOG) container bundle',
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
      | { filename: string; archetype?: string; parent_folder_lid?: string }[]
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
          parentFolderLid: me.parent_folder_lid,
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
          parentFolderLid: me.parent_folder_lid,
        });
      }
    }

    // 4. Extract folder hierarchy (folder-export bundles only)
    const rawFolders = manifest.folders as
      | { lid: string; title: string; parent_lid: string | null }[]
      | undefined;
    const folders: BatchFolderInfo[] | undefined =
      Array.isArray(rawFolders) && rawFolders.length > 0
        ? rawFolders.map((f) => ({
            lid: f.lid,
            title: f.title ?? '',
            parentLid: f.parent_lid ?? null,
          }))
        : undefined;

    return {
      ok: true,
      entries: importedEntries,
      source,
      format,
      folders,
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
    case 'pkc2-mixed-container-bundle':
      if (entry.archetype === 'text') return 'text';
      if (entry.archetype === 'textlog') return 'textlog';
      return null;
    default:
      return null;
  }
}

/** Max chars for a TEXT body snippet. */
const BODY_SNIPPET_LIMIT = 200;
/** Max log entries to include in TEXTLOG snippets. */
const LOG_SNIPPET_COUNT = 3;
/** Max chars per individual log snippet line. */
const LOG_LINE_LIMIT = 80;

/**
 * Peek into a nested bundle ZIP to extract lightweight deep preview
 * data. Mutates `previewEntry` in place to add optional fields.
 *
 * This is NOT a full import parse — no asset re-keying, no body
 * rewriting, no attachment entry construction. It reads only the
 * inner `manifest.json` and the first bytes of `body.md` /
 * `textlog.csv`.
 *
 * Throws on ZIP parse failure — caller wraps in try/catch and
 * treats failure as non-fatal (deep preview fields stay absent).
 */
function peekNestedBundle(nestedData: Uint8Array, previewEntry: BatchImportPreviewEntry): void {
  const innerEntries = parseZip(nestedData);

  // Read inner manifest
  const manifestFile = innerEntries.find((e) => e.name === 'manifest.json');
  if (!manifestFile) return;
  let innerManifest: Record<string, unknown>;
  try {
    innerManifest = JSON.parse(bytesToText(manifestFile.data)) as Record<string, unknown>;
  } catch {
    return;
  }

  previewEntry.assetCount = typeof innerManifest.asset_count === 'number'
    ? innerManifest.asset_count : undefined;
  previewEntry.missingAssetCount = typeof innerManifest.missing_asset_count === 'number'
    ? innerManifest.missing_asset_count : undefined;

  if (previewEntry.archetype === 'text') {
    // TEXT: body_length from manifest + body.md snippet
    previewEntry.bodyLength = typeof innerManifest.body_length === 'number'
      ? innerManifest.body_length : undefined;
    const bodyFile = innerEntries.find((e) => e.name === 'body.md');
    if (bodyFile) {
      const fullBody = bytesToText(bodyFile.data);
      previewEntry.bodySnippet = fullBody.length > BODY_SNIPPET_LIMIT
        ? fullBody.slice(0, BODY_SNIPPET_LIMIT) + '…'
        : fullBody;
    }
  } else if (previewEntry.archetype === 'textlog') {
    // TEXTLOG: entry_count from manifest + first N log entries' text
    previewEntry.logEntryCount = typeof innerManifest.entry_count === 'number'
      ? innerManifest.entry_count : undefined;
    const csvFile = innerEntries.find((e) => e.name === 'textlog.csv');
    if (csvFile) {
      try {
        const parsed = parseTextlogCsv(bytesToText(csvFile.data));
        const snippets: string[] = [];
        for (let j = 0; j < Math.min(LOG_SNIPPET_COUNT, parsed.entries.length); j++) {
          const text = parsed.entries[j]!.text ?? '';
          snippets.push(
            text.length > LOG_LINE_LIMIT
              ? text.slice(0, LOG_LINE_LIMIT) + '…'
              : text,
          );
        }
        previewEntry.logSnippets = snippets;
      } catch {
        // CSV parse failure — non-fatal for preview
      }
    }
  }
}
