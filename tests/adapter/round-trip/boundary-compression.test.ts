// @vitest-environment happy-dom
/**
 * Boundary case A1: HTML Full with / without CompressionStream.
 *
 * P0-2b scope — OBSERVATION ONLY. No production code is modified.
 * Findings are recorded in the test names and comments; any spec gap
 * is flagged via "current behavior" labelling.
 *
 * Spec references:
 *   - `docs/spec/data-model.md` §7.3 (asset value encoding per context)
 *   - `docs/spec/data-model.md` §10.3 (ExportMeta.asset_encoding values)
 *   - `docs/spec/data-model.md` §16.4 ("export_meta 欠落の古い HTML …")
 *
 * Guaranteed contract (spec §10.3):
 *   - `asset_encoding: 'gzip+base64'` when CompressionStream is supported
 *   - `asset_encoding: 'base64'` as fallback when unsupported
 *   - Decompressor switches on this field
 *
 * What we are observing:
 *   1. Current runtime (Node 18+) DOES support CompressionStream — the
 *      happy path therefore exercises the compressed branch by default.
 *   2. When CompressionStream is stubbed to `undefined`, the exporter
 *      must fall back to `'base64'` and the importer must still
 *      reconstruct identical asset bytes.
 *
 * Notes recorded for P0-2c:
 *   - The stub approach leaves DecompressionStream undefined too. The
 *     import side's `decompressAssets` short-circuits when encoding is
 *     `'base64'` (never calls DecompressionStream), so this is a valid
 *     simulation of the unsupported environment.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildExportHtml } from '@adapter/platform/exporter';
import { importFromHtml } from '@adapter/platform/importer';
import { isCompressionSupported } from '@adapter/platform/compression';
import { makeMixedFixture, setupShellDom } from './_helpers';

beforeEach(() => {
  setupShellDom();
});

describe('P0-2b A1: HTML Full — CompressionStream present', () => {
  it('current behavior: Node 18+ runtime reports compression supported', () => {
    // Sanity assertion — when it ever changes, every test below needs
    // to be re-evaluated.
    expect(isCompressionSupported()).toBe(true);
  });

  it('current behavior: pkc-data carries asset_encoding="gzip+base64"', async () => {
    // Exercise the real compressed path end-to-end.
    const source = makeMixedFixture();

    const html = await buildExportHtml(source, 'full', 'editable');

    // Reach into the serialized HTML to inspect export_meta directly.
    // We do NOT rely on importer to surface asset_encoding — the
    // importer only exposes `exportMode` / `exportMutability` on its
    // result shape (data-model §10.5).
    const match = html.match(/<script id="pkc-data"[^>]*>([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]!);
    expect(parsed.export_meta.asset_encoding).toBe('gzip+base64');

    // And the round-trip still returns identical asset bytes.
    const result = await importFromHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.container.assets['ast-icon']).toBe(source.assets['ast-icon']);
    expect(result.container.assets['ast-pdf']).toBe(source.assets['ast-pdf']);
  });
});

describe('P0-2b A1: HTML Full — CompressionStream absent (fallback path)', () => {
  // Stub CompressionStream / DecompressionStream so the feature
  // detection in compression.ts returns false. This is the only
  // non-test-local mutation and it is fully reverted in afterEach.
  beforeEach(() => {
    vi.stubGlobal('CompressionStream', undefined);
    vi.stubGlobal('DecompressionStream', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('current behavior: isCompressionSupported() returns false under the stub', () => {
    expect(isCompressionSupported()).toBe(false);
  });

  it('current behavior: fallback writes asset_encoding="base64"', async () => {
    const source = makeMixedFixture();
    const html = await buildExportHtml(source, 'full', 'editable');

    const match = html.match(/<script id="pkc-data"[^>]*>([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]!);
    expect(parsed.export_meta.asset_encoding).toBe('base64');
  });

  it('current behavior: fallback round-trip preserves assets byte-for-byte', async () => {
    const source = makeMixedFixture();
    const html = await buildExportHtml(source, 'full', 'editable');

    const result = await importFromHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Even without gzip, the assets must still be identical.
    expect(result.container.assets['ast-icon']).toBe(source.assets['ast-icon']);
    expect(result.container.assets['ast-pdf']).toBe(source.assets['ast-pdf']);
  });
});

describe('P0-2b A1: HTML Full — cross-environment interop', () => {
  // Produced-with-compression → imported-without-compression must still
  // work, because the importer reads `asset_encoding` from export_meta
  // and only runs DecompressionStream when the encoding requests it.
  // Observe current behavior; do NOT promote to a hard contract.

  it('current behavior: compressed artifact imported on unsupported runtime recovers when DecompressionStream IS available', async () => {
    // Produce with compression ON.
    const source = makeMixedFixture();
    const html = await buildExportHtml(source, 'full', 'editable');

    // ... then simulate "import in another window that has
    // DecompressionStream". We leave the globals intact here (this
    // test runs without the stub) to capture the baseline — the
    // asymmetric direction (compressed bytes on a runtime WITHOUT
    // DecompressionStream) is a P0-2c target because the current
    // fallback simply returns compressed bytes as-is, which is
    // data loss.
    const result = await importFromHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.container.assets['ast-icon']).toBe(source.assets['ast-icon']);
  });

  it('current behavior: base64-encoded artifact imports fine on compression-capable runtime', async () => {
    // Produce with compression OFF.
    vi.stubGlobal('CompressionStream', undefined);
    vi.stubGlobal('DecompressionStream', undefined);
    const source = makeMixedFixture();
    const html = await buildExportHtml(source, 'full', 'editable');
    vi.unstubAllGlobals();

    // Import with compression capability restored. Importer sees
    // `asset_encoding: 'base64'` and short-circuits decompression.
    const result = await importFromHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.container.assets['ast-icon']).toBe(source.assets['ast-icon']);
    expect(result.container.assets['ast-pdf']).toBe(source.assets['ast-pdf']);
  });
});
