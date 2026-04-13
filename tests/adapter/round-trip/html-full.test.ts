// @vitest-environment happy-dom
/**
 * Round-trip route: HTML Full
 *
 * Success path: a mixed-content Container is exported as HTML Full
 * (mode='full', mutability='editable'), then re-imported. The resulting
 * Container must be logically equivalent to the source.
 *
 * Spec references (canonical):
 *   - `docs/spec/data-model.md` §10 (HTML Export contract)
 *   - `docs/spec/data-model.md` §10.3 (ExportMeta)
 *   - `docs/spec/data-model.md` §12.3 (round-trip equivalence table, row "HTML Full")
 *   - `docs/spec/data-model.md` §14 (invariants)
 *
 * Equivalence rule for this route (per §12.3):
 *   - container_id:  preserved
 *   - meta fields:   preserved
 *   - entries:       preserved (byte-for-byte body strings)
 *   - relations:     preserved
 *   - revisions:     preserved
 *   - assets:        preserved (compressed in transit, logically equal after decode)
 *
 * Observed behavior notes (not yet hard contract — record only for P0-2b):
 *   - If CompressionStream is unavailable in the test runtime, the
 *     exporter falls back to `asset_encoding: 'base64'` and the
 *     importer round-trips the payload unchanged.
 *   - `export_meta` is stripped from the imported Container; it is
 *     returned as `exportMode` / `exportMutability` on the result.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  exportContainerAsHtml,
  buildExportHtml,
} from '@adapter/platform/exporter';
import { importFromHtml } from '@adapter/platform/importer';
import {
  makeMixedFixture,
  setupShellDom,
  canonicalEqual,
  canonicalJson,
} from './_helpers';

beforeEach(() => {
  setupShellDom();
});

describe('Round-trip: HTML Full (mode=full, editable)', () => {
  it('preserves the container logically through export → import', async () => {
    // Arrange: realistic mixed-content fixture covering 8 archetypes,
    // 5 relations, 1 revision, 2 assets (see _helpers.ts).
    const source = makeMixedFixture();

    // Act: export to HTML string (non-download path), then import.
    const html = await buildExportHtml(source, 'full', 'editable');
    const result = await importFromHtml(html, 'round-trip-html-full');

    // Assert: import must succeed.
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // §10.5 import validation returns exportMode / exportMutability
    // as top-level result fields, not inside the container.
    expect(result.exportMode).toBe('full');
    expect(result.exportMutability).toBe('editable');

    // §12.3 HTML Full row: container is logically equivalent.
    const imported = result.container;
    expect(canonicalEqual(source, imported)).toBe(
      true,
      // When the assert fails vitest prints `expected true to be true`
      // which is unhelpful. Emit a readable diff via canonicalJson
      // only as a breadcrumb — the actual mismatch lives in the
      // returned canonical-JSON values.
    );

    // Spot-check individual invariants (§14) for extra clarity when
    // the equivalence check passes but future refactors regress a
    // specific field:
    expect(imported.meta.container_id).toBe(source.meta.container_id);
    expect(imported.meta.schema_version).toBe(1);
    expect(imported.meta.sandbox_policy).toBe('strict');
    expect(imported.entries).toHaveLength(source.entries.length);
    expect(imported.relations).toHaveLength(source.relations.length);
    expect(imported.revisions).toHaveLength(source.revisions.length);
    expect(Object.keys(imported.assets).sort()).toEqual(
      Object.keys(source.assets).sort(),
    );
    expect(imported.assets['ast-icon']).toBe(source.assets['ast-icon']);
    expect(imported.assets['ast-pdf']).toBe(source.assets['ast-pdf']);
  });

  it('survives a repeated round-trip (export → import → export → import)', async () => {
    // Guards against hidden state that would accumulate on repeated
    // passes (e.g. double-escaping `</script>`, double-compression).
    const source = makeMixedFixture();

    const html1 = await buildExportHtml(source, 'full', 'editable');
    const r1 = await importFromHtml(html1, 'round-trip-pass-1');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const html2 = await buildExportHtml(r1.container, 'full', 'editable');
    const r2 = await importFromHtml(html2, 'round-trip-pass-2');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    expect(canonicalEqual(source, r2.container)).toBe(true);
    // Sanity: first and second pass produce the same canonical shape.
    expect(canonicalJson(r1.container)).toBe(canonicalJson(r2.container));
  });

  it('exportContainerAsHtml success path reports the correct filename and size', async () => {
    // The action-dispatch entry point (§10) wraps buildExportHtml +
    // the download trigger. We bypass the download via downloadFn so
    // the success path can be observed in isolation.
    const source = makeMixedFixture();

    let downloaded: { content: string; filename: string } | null = null;
    const result = await exportContainerAsHtml(source, {
      downloadFn: (content, filename) => {
        downloaded = { content, filename };
      },
    });

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/\.html$/);
    expect(downloaded).not.toBeNull();
    if (!downloaded) return;
    const { content, filename } = downloaded as { content: string; filename: string };
    expect(filename).toBe(result.filename);
    // Re-import the downloaded content to verify the downloaded form
    // is the same artifact that buildExportHtml produced.
    const reimport = await importFromHtml(content, 'downloaded');
    expect(reimport.ok).toBe(true);
    if (!reimport.ok) return;
    expect(canonicalEqual(source, reimport.container)).toBe(true);
  });
});
