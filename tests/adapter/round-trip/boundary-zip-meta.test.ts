// @vitest-environment happy-dom
/**
 * Boundary case A3: ZIP import `meta.updated_at` progression.
 *
 * P0-2b scope — OBSERVATION ONLY. The spec currently records the
 * behavior as "`updated_at` is advanced to import time" (data-model
 * §11.4, §12.3 ZIP row, §16.4). These tests pin the exact semantics
 * the current implementation exhibits, so the documentation gap
 * (`>=` vs `>` vs "overwrite regardless") is made visible.
 *
 * Spec references:
 *   - `docs/spec/data-model.md` §11.4 (import-time overwrite of updated_at)
 *   - `docs/spec/data-model.md` §12.3 ZIP row (updated_at advances)
 *   - `docs/spec/data-model.md` §16.4 (ambiguity flagged for P0-2)
 *
 * ⚠️ Finding recorded in the P0-2b report:
 *   The current implementation OVERWRITES `meta.updated_at` with the
 *   import timestamp unconditionally. If the source's `updated_at`
 *   was in the future relative to the import clock, the imported
 *   value will be SMALLER — i.e. time appears to go backwards. The
 *   spec's "時刻に進む" phrasing is imprecise; the true semantic is
 *   "replace with import time, regardless of source value". P0-2c
 *   must decide whether to tighten the impl to `max(source, now)`
 *   or to reword the spec to match.
 */
import { describe, it, expect } from 'vitest';
import {
  exportContainerAsZip,
  importContainerFromZip,
} from '@adapter/platform/zip-package';
import { makeMixedFixture } from './_helpers';

async function exportAndImport(
  container = makeMixedFixture(),
) {
  let captured: { blob: Blob; filename: string } | null = null;
  const exp = await exportContainerAsZip(container, {
    downloadFn: (blob, filename) => {
      captured = { blob, filename };
    },
  });
  expect(exp.success).toBe(true);
  if (!captured) throw new Error('export did not invoke downloadFn');
  const { blob, filename } = captured as { blob: Blob; filename: string };
  const file = new File([blob], filename, { type: blob.type });
  return importContainerFromZip(file);
}

describe('P0-2b A3: ZIP — meta.updated_at progression from a past source', () => {
  it('current behavior: imported updated_at > source updated_at when source is in the past', async () => {
    const source = makeMixedFixture();
    // Fixture default: 2026-04-13T12:00:00.000Z.
    // By the time the test runs, Date.now() is guaranteed to be later
    // than the fixture constant (tests are executed "now").
    const before = Date.now();
    const result = await exportAndImport(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const importedMs = Date.parse(result.container.meta.updated_at);
    const sourceMs = Date.parse(source.meta.updated_at);

    expect(importedMs).toBeGreaterThan(sourceMs);
    expect(importedMs).toBeGreaterThanOrEqual(before);
  });
});

describe('P0-2b A3: ZIP — meta.updated_at observation when source is in the future', () => {
  it('current behavior: imported updated_at is NOT preserved — it is overwritten with import time', async () => {
    // Construct a source whose updated_at is far in the future.
    const future = new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000) // +10 years
      .toISOString();
    const base = makeMixedFixture();
    const sourceFuture = {
      ...base,
      meta: { ...base.meta, updated_at: future },
    };

    const result = await exportAndImport(sourceFuture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // OBSERVATION: the imported value is strictly LESS than the
    // source's future timestamp because the importer overwrites it
    // with `new Date().toISOString()` unconditionally. This is NOT
    // promoted to a guarantee — it is the observed reality that the
    // spec needs to either match or override.
    const importedMs = Date.parse(result.container.meta.updated_at);
    const sourceMs = Date.parse(sourceFuture.meta.updated_at);

    expect(importedMs).toBeLessThan(sourceMs);
    // And it sits near the current wall clock (import time).
    expect(importedMs).toBeLessThanOrEqual(Date.now());
  });

  it('current behavior: source updated_at does NOT appear anywhere in the imported container', async () => {
    const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const base = makeMixedFixture();
    const sourceFuture = {
      ...base,
      meta: { ...base.meta, updated_at: future },
    };

    const result = await exportAndImport(sourceFuture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Only the manifest's exported_at is tied to export time; the
    // imported container's updated_at is tied to import time. Neither
    // echoes the source's future value — the information is lost.
    expect(result.container.meta.updated_at).not.toBe(future);
    expect(result.manifest.exported_at).not.toBe(future);
  });
});

describe('P0-2b A3: ZIP — created_at is preserved (control observation)', () => {
  it('current behavior: created_at survives regardless of value', async () => {
    // By contrast with updated_at, created_at should pass through.
    // If this test ever fails, the boundary affects MORE than just
    // updated_at and the finding needs widening.
    const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const base = makeMixedFixture();
    const sourceFuture = {
      ...base,
      meta: { ...base.meta, created_at: future, updated_at: future },
    };

    const result = await exportAndImport(sourceFuture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.container.meta.created_at).toBe(future);
    // updated_at is still overwritten (confirms the asymmetry).
    expect(result.container.meta.updated_at).not.toBe(future);
  });
});
