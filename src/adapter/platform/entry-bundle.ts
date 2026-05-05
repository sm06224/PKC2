/**
 * Generic per-entry bundle (領域 10-6 ζ'' Phase 4).
 *
 * Used by folder-export.ts to ship attachment / todo / form / generic
 * archetypes inside a `pkc2-folder-export-bundle` ZIP. Text and
 * textlog have their own bundles (text-bundle.ts, textlog-bundle.ts);
 * this module covers everything else.
 *
 * Output shape inside the inner ZIP:
 *   manifest.json   — { format, version, archetype, lid, title,
 *                       asset_count, missing_asset_count }
 *   entry.json      — Entry verbatim
 *   assets/<key>    — raw base64 bytes for any referenced asset
 *
 * Reachability scan reuses asset-scan.ts so the bundled assets exactly
 * match what the entry refers to (no orphans, no leakage).
 */

import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import { collectReferencedAssetKeys } from '../../features/asset/asset-scan';
import { createZipBytes, textToBytes, slugify, type ZipEntry } from './zip-package';

/** Build the asset-key set this entry references, in isolation. */
function refsForEntry(entry: Entry): Set<string> {
  // Wrap the entry in a minimal Container shape and reuse the scanner
  // so the logic stays in one place.
  const synthetic: Container = {
    meta: {
      container_id: 'synthetic',
      schema_version: 1,
      title: '',
      created_at: '1970-01-01T00:00:00Z',
      updated_at: '1970-01-01T00:00:00Z',
    },
    entries: [entry],
    relations: [],
    revisions: [],
    assets: {},
  } as unknown as Container;
  return collectReferencedAssetKeys(synthetic);
}

export interface EntryBundleManifest {
  format: 'pkc2-entry-bundle';
  version: 1;
  archetype: string;
  lid: string;
  title: string;
  asset_count: number;
  missing_asset_count: number;
}

export interface EntryBundleResult {
  filename: string;
  zipBytes: Uint8Array;
  manifest: EntryBundleManifest;
}

export function buildEntryBundle(entry: Entry, container: Container): EntryBundleResult {
  const referenced = refsForEntry(entry);
  const zipEntries: ZipEntry[] = [];

  let missing = 0;
  let included = 0;
  for (const key of referenced) {
    const bytes = container.assets[key];
    if (typeof bytes !== 'string' || bytes.length === 0) {
      missing += 1;
      continue;
    }
    zipEntries.push({ name: `assets/${key}`, data: textToBytes(bytes) });
    included += 1;
  }

  const manifest: EntryBundleManifest = {
    format: 'pkc2-entry-bundle',
    version: 1,
    archetype: entry.archetype,
    lid: entry.lid,
    title: entry.title ?? '',
    asset_count: included,
    missing_asset_count: missing,
  };

  zipEntries.unshift({
    name: 'entry.json',
    data: textToBytes(JSON.stringify(entry, null, 2)),
  });
  zipEntries.unshift({
    name: 'manifest.json',
    data: textToBytes(JSON.stringify(manifest, null, 2)),
  });

  const filename = `${entry.archetype}-${slugify(entry.title || entry.lid)}-${entry.lid}.entry.zip`;
  return {
    filename,
    zipBytes: createZipBytes(zipEntries),
    manifest,
  };
}
