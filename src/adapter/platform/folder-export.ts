/**
 * Folder-scoped export — bundles all TEXT and TEXTLOG entries under
 * a folder (recursively) into a single `.folder-export.zip`.
 *
 * Format spec: `docs/development/folder-scoped-export.md`.
 *
 * Re-uses the same nested ZIP pattern as the container-wide TEXT /
 * TEXTLOG exports: the outer ZIP contains individual `.text.zip` /
 * `.textlog.zip` bundles + a top-level `manifest.json`.
 *
 * Layering: `adapter/platform/` because it touches Blob / ZIP APIs.
 * The descendant-collection logic lives in `features/relation/tree.ts`.
 */

import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import { collectDescendantLids } from '../../features/relation/tree';
import { buildTextBundle } from './text-bundle';
import { buildTextlogBundle } from './textlog-bundle';
import {
  createZipBlob,
  textToBytes,
  slugify,
  formatDateCompact,
  type ZipEntry,
} from './zip-package';

// ── Types ────────────────────────────────────────────

export interface FolderExportManifestEntry {
  lid: string;
  title: string;
  archetype: 'text' | 'textlog';
  filename: string;
  body_length?: number;
  log_entry_count?: number;
  asset_count: number;
  missing_asset_count: number;
}

export interface FolderExportManifest {
  format: 'pkc2-folder-export-bundle';
  version: 1;
  exported_at: string;
  source_cid: string;
  source_folder_lid: string;
  source_folder_title: string;
  scope: 'recursive';
  text_count: number;
  textlog_count: number;
  compact: boolean;
  entries: FolderExportManifestEntry[];
}

export interface FolderExportResult {
  blob: Blob;
  filename: string;
  manifest: FolderExportManifest;
  /** Total missing asset count across all bundles. */
  totalMissingAssetCount: number;
}

// ── Public API ────────────────────────────────────────

/**
 * Build a folder-scoped export: a ZIP containing individual
 * `.text.zip` / `.textlog.zip` bundles for every TEXT / TEXTLOG
 * entry that is a descendant of the given folder, plus a top-level
 * `manifest.json`.
 *
 * Descendant collection is recursive via structural relations.
 * The folder entry itself is NOT included in the export.
 *
 * Live state is never mutated.
 */
export function buildFolderExportBundle(
  folderEntry: Entry,
  container: Container,
  options?: { now?: Date; compact?: boolean },
): FolderExportResult {
  const now = options?.now ?? new Date();
  const compact = options?.compact === true;

  // 1. Collect all descendant LIDs recursively
  const descendantLids = collectDescendantLids(container.relations, folderEntry.lid);

  // 2. Filter to TEXT / TEXTLOG entries that are descendants
  const targetEntries = container.entries.filter(
    (e) =>
      descendantLids.has(e.lid) &&
      (e.archetype === 'text' || e.archetype === 'textlog'),
  );

  // 3. Build individual bundles
  const usedFilenames = new Set<string>();
  const manifestEntries: FolderExportManifestEntry[] = [];
  const zipEntries: ZipEntry[] = [];
  let totalMissing = 0;
  let textCount = 0;
  let textlogCount = 0;

  for (const entry of targetEntries) {
    if (entry.archetype === 'text') {
      const built = buildTextBundle(entry, container, { now, compact });

      let filename = built.filename;
      if (usedFilenames.has(filename)) {
        const base = filename.replace(/\.text\.zip$/, '');
        let suffix = 2;
        while (usedFilenames.has(`${base}-${suffix}.text.zip`)) suffix++;
        filename = `${base}-${suffix}.text.zip`;
      }
      usedFilenames.add(filename);

      zipEntries.push({ name: filename, data: built.zipBytes });
      manifestEntries.push({
        lid: entry.lid,
        title: entry.title ?? '',
        archetype: 'text',
        filename,
        body_length: built.manifest.body_length,
        asset_count: built.manifest.asset_count,
        missing_asset_count: built.manifest.missing_asset_count,
      });
      totalMissing += built.manifest.missing_asset_count;
      textCount++;
    } else {
      const built = buildTextlogBundle(entry, container, { now, compact });

      let filename = built.filename;
      if (usedFilenames.has(filename)) {
        const base = filename.replace(/\.textlog\.zip$/, '');
        let suffix = 2;
        while (usedFilenames.has(`${base}-${suffix}.textlog.zip`)) suffix++;
        filename = `${base}-${suffix}.textlog.zip`;
      }
      usedFilenames.add(filename);

      zipEntries.push({ name: filename, data: built.zipBytes });
      manifestEntries.push({
        lid: entry.lid,
        title: entry.title ?? '',
        archetype: 'textlog',
        filename,
        log_entry_count: built.manifest.entry_count,
        asset_count: built.manifest.asset_count,
        missing_asset_count: built.manifest.missing_asset_count,
      });
      totalMissing += built.manifest.missing_asset_count;
      textlogCount++;
    }
  }

  // 4. Build top-level manifest
  const manifest: FolderExportManifest = {
    format: 'pkc2-folder-export-bundle',
    version: 1,
    exported_at: now.toISOString(),
    source_cid: container.meta.container_id,
    source_folder_lid: folderEntry.lid,
    source_folder_title: folderEntry.title ?? '',
    scope: 'recursive',
    text_count: textCount,
    textlog_count: textlogCount,
    compact,
    entries: manifestEntries,
  };

  zipEntries.unshift({
    name: 'manifest.json',
    data: textToBytes(JSON.stringify(manifest, null, 2)),
  });

  // 5. Create the outer ZIP
  const blob = createZipBlob(zipEntries);
  const folderSlug = slugify(folderEntry.title || folderEntry.lid);
  const date = formatDateCompact(now);
  const filename = `folder-${folderSlug}-${date}.folder-export.zip`;

  return { blob, filename, manifest, totalMissingAssetCount: totalMissing };
}
