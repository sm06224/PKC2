// @vitest-environment happy-dom
/**
 * Round-trip route: HTML Light
 *
 * Success path: a mixed-content Container is exported as HTML Light
 * (mode='light', mutability='editable'). Assets are intentionally
 * stripped — §10.3: Light mode sets `container.assets = {}` and omits
 * `asset_encoding` from export_meta. On re-import, the container is
 * logically equivalent to the source EXCEPT for assets (now empty).
 *
 * Spec references (canonical):
 *   - `docs/spec/data-model.md` §10 (HTML Export contract)
 *   - `docs/spec/data-model.md` §10.3 (Light mode rule: assets = {}, no asset_encoding)
 *   - `docs/spec/data-model.md` §12.3 (round-trip table, row "HTML Light")
 *   - `docs/spec/body-formats.md` §13.2 (Light keeps body references intact)
 *   - `docs/spec/body-formats.md` §9.3 (missing asset rendering — not exercised here)
 *
 * Equivalence rule for this route:
 *   - meta / entries / relations / revisions: preserved
 *   - assets: REPLACED with `{}` (lossy by design)
 *   - asset references in bodies remain verbatim (spec §13.2) —
 *     they will render as "missing asset" at display time, not in the
 *     data model.
 *
 * Observed behavior notes (not yet hard contract — record only):
 *   - `export_meta.asset_encoding` is absent in Light (per spec §10.3).
 *   - `exportMutability` is returned as 'editable'.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildExportHtml } from '@adapter/platform/exporter';
import { importFromHtml } from '@adapter/platform/importer';
import {
  makeMixedFixture,
  setupShellDom,
  canonicalEqual,
  omitContainerFields,
} from './_helpers';

beforeEach(() => {
  setupShellDom();
});

describe('Round-trip: HTML Light (mode=light, editable)', () => {
  it('preserves everything except assets, which become {}', async () => {
    const source = makeMixedFixture();

    const html = await buildExportHtml(source, 'light', 'editable');
    const result = await importFromHtml(html, 'round-trip-html-light');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.exportMode).toBe('light');
    expect(result.exportMutability).toBe('editable');

    const imported = result.container;

    // §10.3: assets are stripped in Light mode.
    expect(imported.assets).toEqual({});

    // §12.3 Light row: everything else is logically equivalent.
    // Use the helper to strip `assets` from both sides.
    const sourceSansAssets = omitContainerFields(source, { assets: true });
    const importedSansAssets = omitContainerFields(imported, { assets: true });
    expect(canonicalEqual(sourceSansAssets, importedSansAssets)).toBe(true);

    // §13.2: asset references in bodies are kept verbatim (they will
    // render as missing at display time — not our concern here).
    const readme = imported.entries.find((e) => e.lid === 'e-readme');
    expect(readme).toBeDefined();
    expect(readme!.body).toContain('asset:ast-icon');
    expect(readme!.body).toContain('asset:ast-pdf');
  });

  it('readonly Light round-trips and surfaces mutability=readonly', async () => {
    // Separate from the editable happy path because readonly is a
    // different governance flag that flows through export_meta.
    const source = makeMixedFixture();

    const html = await buildExportHtml(source, 'light', 'readonly');
    const result = await importFromHtml(html, 'round-trip-html-light-readonly');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exportMode).toBe('light');
    expect(result.exportMutability).toBe('readonly');
    expect(result.container.assets).toEqual({});
  });

  it('repeated Light round-trip is a fixed point (assets stay empty)', async () => {
    // Guards against a bug where the second pass would try to compress
    // the empty assets record or accidentally reintroduce fields.
    const source = makeMixedFixture();

    const html1 = await buildExportHtml(source, 'light', 'editable');
    const r1 = await importFromHtml(html1, 'light-pass-1');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    const html2 = await buildExportHtml(r1.container, 'light', 'editable');
    const r2 = await importFromHtml(html2, 'light-pass-2');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    expect(r2.container.assets).toEqual({});
    expect(canonicalEqual(
      omitContainerFields(r1.container, { assets: true }),
      omitContainerFields(r2.container, { assets: true }),
    )).toBe(true);
  });
});
