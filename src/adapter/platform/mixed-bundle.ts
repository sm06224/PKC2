/**
 * Mixed container-wide export — bundles all TEXT and TEXTLOG entries
 * in a container into a single `.mixed.zip`.
 *
 * Format spec: `docs/development/completed/mixed-container-export.md`.
 *
 * Re-uses the same nested ZIP pattern as folder-export: the outer
 * ZIP contains individual `.text.zip` / `.textlog.zip` bundles
 * plus a top-level `manifest.json`. The only difference from
 * folder-export is scope: this bundles the *entire* container
 * instead of a single folder's descendants.
 *
 * Layering: `adapter/platform/` because it touches Blob / ZIP APIs.
 */

import type { Container } from '../../core/model/container';
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

export interface MixedContainerManifestEntry {
  lid: string;
  title: string;
  archetype: 'text' | 'textlog';
  filename: string;
  body_length?: number;
  log_entry_count?: number;
  asset_count: number;
  missing_asset_count: number;
}

export interface MixedContainerManifest {
  format: 'pkc2-mixed-container-bundle';
  version: 1;
  exported_at: string;
  source_cid: string;
  source_title: string;
  text_count: number;
  textlog_count: number;
  compact: boolean;
  entries: MixedContainerManifestEntry[];
}

export interface MixedContainerResult {
  blob: Blob;
  filename: string;
  manifest: MixedContainerManifest;
  /** Total missing asset count across all bundles. */
  totalMissingAssetCount: number;
}

// ── Public API ────────────────────────────────────────

/**
 * Build a container-wide mixed export: a ZIP containing individual
 * `.text.zip` / `.textlog.zip` bundles for every TEXT and TEXTLOG
 * entry in the container, plus a top-level `manifest.json`.
 *
 * Each inner bundle is produced by `buildTextBundle()` or
 * `buildTextlogBundle()` — the exact same format as a single-entry
 * export. The outer ZIP nests them as stored byte arrays (ZIP-in-ZIP),
 * so unzipping the outer archive gives individual bundles that can
 * be imported independently.
 *
 * Live state is never mutated.
 */
export function buildMixedContainerBundle(
  container: Container,
  options?: { now?: Date; compact?: boolean },
): MixedContainerResult {
  const now = options?.now ?? new Date();
  const compact = options?.compact === true;

  // Filter to TEXT + TEXTLOG entries only
  const targetEntries = container.entries.filter(
    (e) => e.archetype === 'text' || e.archetype === 'textlog',
  );

  const usedFilenames = new Set<string>();
  const manifestEntries: MixedContainerManifestEntry[] = [];
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

  // Build top-level manifest
  const manifest: MixedContainerManifest = {
    format: 'pkc2-mixed-container-bundle',
    version: 1,
    exported_at: now.toISOString(),
    source_cid: container.meta.container_id,
    source_title: container.meta.title ?? '',
    text_count: textCount,
    textlog_count: textlogCount,
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
  const filename = `mixed-${containerSlug}-${date}.mixed.zip`;

  return { blob, filename, manifest, totalMissingAssetCount: totalMissing };
}
