// @vitest-environment happy-dom
/**
 * Round-trip route: ZIP (Portable Package, .pkc2.zip)
 *
 * Success path: a mixed-content Container is exported as a ZIP package,
 * then re-imported. Per spec §11.4 the imported container is assigned
 * a NEW cid and `meta.updated_at` is advanced to import time.
 * Everything else (entries, relations, revisions, assets) must be
 * logically equivalent to the source.
 *
 * Spec references (canonical):
 *   - `docs/spec/data-model.md` §11 (ZIP Export contract)
 *   - `docs/spec/data-model.md` §11.4 (import: new cid, updated_at advanced)
 *   - `docs/spec/data-model.md` §11.5 (information lost: source_cid)
 *   - `docs/spec/data-model.md` §12.3 (round-trip table, row "ZIP")
 *
 * Equivalence rule for this route:
 *   - meta.container_id:  REGENERATED (new cid) — strip before compare
 *   - meta.updated_at:    advanced to import time — strip before compare
 *   - meta.created_at:    preserved
 *   - meta.title:         preserved
 *   - meta.schema_version: preserved
 *   - meta.sandbox_policy: preserved
 *   - entries:            preserved
 *   - relations:          preserved
 *   - revisions:          preserved (array maintained, §11.4)
 *   - assets:             preserved (raw binary in .bin → base64 after import)
 *
 * Observed behavior notes (not yet hard contract — record only):
 *   - Each asset is written as `assets/<key>.bin` and the new cid does
 *     NOT affect asset keys (they remain the same strings).
 *   - The manifest retains `source_cid` (audit trail, §11.1) even
 *     though the container's cid is regenerated.
 */
import { describe, it, expect } from 'vitest';
import {
  exportContainerAsZip,
  importContainerFromZip,
} from '@adapter/platform/zip-package';
import {
  makeMixedFixture,
  canonicalEqual,
  omitContainerFields,
} from './_helpers';

/**
 * Capture the ZIP Blob produced by the export pipeline instead of
 * letting it reach the download trigger. Returns the Blob ready to be
 * re-imported via `importContainerFromZip`.
 */
async function exportZipAndCaptureBlob(
  container = makeMixedFixture(),
): Promise<{ blob: Blob; filename: string }> {
  let captured: { blob: Blob; filename: string } | null = null;
  const result = await exportContainerAsZip(container, {
    downloadFn: (blob, filename) => {
      captured = { blob, filename };
    },
  });
  expect(result.success).toBe(true);
  expect(captured).not.toBeNull();
  if (!captured) throw new Error('ZIP export did not call downloadFn');
  return captured;
}

/** Wrap a Blob in a File so `importContainerFromZip(file)` can read it. */
function blobToFile(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type });
}

describe('Round-trip: ZIP (.pkc2.zip)', () => {
  it('preserves everything except cid and meta.updated_at', async () => {
    const source = makeMixedFixture();

    const { blob, filename } = await exportZipAndCaptureBlob(source);
    const file = blobToFile(blob, filename);
    const result = await importContainerFromZip(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const imported = result.container;

    // §11.4: new cid. The spec says it WILL differ; assert this.
    expect(imported.meta.container_id).not.toBe(source.meta.container_id);
    expect(typeof imported.meta.container_id).toBe('string');
    expect(imported.meta.container_id.length).toBeGreaterThan(0);

    // §11.4: updated_at advanced to import time. Must be >= source.
    expect(imported.meta.updated_at >= source.meta.updated_at).toBe(true);

    // §11.4: everything else is logically equivalent.
    const sourceStripped = omitContainerFields(source, {
      cid: true,
      metaUpdatedAt: true,
    });
    const importedStripped = omitContainerFields(imported, {
      cid: true,
      metaUpdatedAt: true,
    });
    expect(canonicalEqual(sourceStripped, importedStripped)).toBe(true);

    // Spot check: assets preserved byte-for-byte after base64 → bin → base64.
    expect(imported.assets['ast-icon']).toBe(source.assets['ast-icon']);
    expect(imported.assets['ast-pdf']).toBe(source.assets['ast-pdf']);

    // §11.1: manifest retains source_cid as audit trail.
    expect(result.manifest.source_cid).toBe(source.meta.container_id);
    expect(result.manifest.format).toBe('pkc2-package');
    expect(result.manifest.version).toBe(1);
  });

  it('repeated ZIP round-trip keeps logical shape but changes cid each pass', async () => {
    // Each pass re-generates cid (spec §11.4). The shape MINUS cid +
    // updated_at must remain stable across passes.
    const source = makeMixedFixture();

    const { blob: b1, filename: f1 } = await exportZipAndCaptureBlob(source);
    const r1 = await importContainerFromZip(blobToFile(b1, f1));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const { blob: b2, filename: f2 } = await exportZipAndCaptureBlob(r1.container);
    const r2 = await importContainerFromZip(blobToFile(b2, f2));
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    // New cid each pass.
    expect(r1.container.meta.container_id).not.toBe(source.meta.container_id);
    expect(r2.container.meta.container_id).not.toBe(r1.container.meta.container_id);

    // Logical shape invariant across passes.
    expect(canonicalEqual(
      omitContainerFields(r1.container, { cid: true, metaUpdatedAt: true }),
      omitContainerFields(r2.container, { cid: true, metaUpdatedAt: true }),
    )).toBe(true);
  });

  it('manifest entry / relation / revision / asset counts match source', async () => {
    // §11.2 manifest fields. The success path should report exact
    // counts even though cid is regenerated on import.
    const source = makeMixedFixture();

    const { blob, filename } = await exportZipAndCaptureBlob(source);
    const file = blobToFile(blob, filename);
    const result = await importContainerFromZip(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const m = result.manifest;
    expect(m.entry_count).toBe(source.entries.length);
    expect(m.relation_count).toBe(source.relations.length);
    expect(m.revision_count).toBe(source.revisions.length);
    expect(m.asset_count).toBe(Object.keys(source.assets).length);
  });
});
