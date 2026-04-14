/**
 * Pure-formatter tests for ZIP import warnings surfacing.
 *
 * This is the code-to-message layer between `ZipImportWarning[]`
 * (produced by the platform-layer importer) and the toast text the
 * user actually sees. No DOM, no dispatcher, no file I/O — strictly
 * string transformation so the tests run fast and are stable across
 * UI iteration.
 */
import { describe, it, expect } from 'vitest';
import {
  formatZipImportWarning,
  summarizeZipImportWarnings,
} from '@adapter/ui/zip-import-warnings';
import type {
  ZipImportWarning,
  ZipImportWarningCode,
} from '@adapter/platform/zip-package';

function w(
  code: ZipImportWarningCode,
  extras: Partial<ZipImportWarning> = {},
): ZipImportWarning {
  return {
    code,
    message: extras.message ?? `[raw ${code}]`,
    key: extras.key,
    kept: extras.kept ?? (code === 'INVALID_ASSET_KEY' ? null : 'first'),
  };
}

// ── formatZipImportWarning — one line per code ─────────────────

describe('formatZipImportWarning — per-code user message', () => {
  it('DUPLICATE_ASSET_SAME_CONTENT includes the key and the dedup verdict', () => {
    const out = formatZipImportWarning(w('DUPLICATE_ASSET_SAME_CONTENT', { key: 'ast-1' }));
    expect(out).toContain('"ast-1"');
    expect(out.toLowerCase()).toContain('duplicate');
    expect(out.toLowerCase()).toContain('identical');
  });

  it('DUPLICATE_ASSET_CONFLICT mentions "kept the first" so user knows who wins', () => {
    const out = formatZipImportWarning(w('DUPLICATE_ASSET_CONFLICT', { key: 'ast-2' }));
    expect(out).toContain('"ast-2"');
    expect(out.toLowerCase()).toContain('conflict');
    expect(out.toLowerCase()).toContain('first');
  });

  it('DUPLICATE_MANIFEST mentions manifest.json', () => {
    const out = formatZipImportWarning(w('DUPLICATE_MANIFEST'));
    expect(out).toContain('manifest.json');
  });

  it('DUPLICATE_CONTAINER_JSON mentions container.json', () => {
    const out = formatZipImportWarning(w('DUPLICATE_CONTAINER_JSON'));
    expect(out).toContain('container.json');
  });

  it('INVALID_ASSET_KEY quotes the key string (even if empty)', () => {
    expect(
      formatZipImportWarning(w('INVALID_ASSET_KEY', { key: '../evil' })),
    ).toContain('"../evil"');
    // An empty key should still produce readable output — quoting it
    // is what signals "this was literally empty" to the user.
    expect(
      formatZipImportWarning(w('INVALID_ASSET_KEY', { key: '' })),
    ).toContain('""');
  });

  it('gracefully handles a missing key on asset-scoped codes (robustness)', () => {
    // The platform code always provides `key` for asset warnings, but
    // we still defend against an undefined so a UI layer bug cannot
    // explode a toast call.
    const out = formatZipImportWarning(w('DUPLICATE_ASSET_SAME_CONTENT', { key: undefined }));
    expect(out).toContain('"?"');
  });
});

// ── summarizeZipImportWarnings — aggregate shape ──────────────

describe('summarizeZipImportWarnings — aggregate shape', () => {
  it('returns empty summary for an empty / nullish input', () => {
    expect(summarizeZipImportWarnings([])).toEqual({ summary: '', details: [] });
    expect(summarizeZipImportWarnings(undefined)).toEqual({ summary: '', details: [] });
    expect(summarizeZipImportWarnings(null)).toEqual({ summary: '', details: [] });
  });

  it('for exactly one warning, summary contains the per-warning text', () => {
    const s = summarizeZipImportWarnings([
      w('DUPLICATE_ASSET_CONFLICT', { key: 'k1' }),
    ]);
    expect(s.details).toHaveLength(1);
    expect(s.summary).toContain('"k1"');
    expect(s.summary.toLowerCase()).toContain('warning');
    expect(s.summary.toLowerCase()).toContain('conflict');
  });

  it('for multiple warnings, summary shows the count and defers details to console', () => {
    const s = summarizeZipImportWarnings([
      w('DUPLICATE_ASSET_CONFLICT', { key: 'k1' }),
      w('DUPLICATE_ASSET_CONFLICT', { key: 'k2' }),
      w('INVALID_ASSET_KEY', { key: 'sub/bad' }),
    ]);
    expect(s.details).toHaveLength(3);
    expect(s.summary).toContain('3 warnings');
    expect(s.summary.toLowerCase()).toContain('see console');
  });

  it('records distinct-kind count so users see how varied the warnings are', () => {
    const s = summarizeZipImportWarnings([
      w('DUPLICATE_ASSET_CONFLICT', { key: 'k1' }),
      w('DUPLICATE_ASSET_CONFLICT', { key: 'k2' }),
    ]);
    expect(s.summary).toContain('1 kind');
    const s2 = summarizeZipImportWarnings([
      w('DUPLICATE_ASSET_CONFLICT', { key: 'k1' }),
      w('INVALID_ASSET_KEY', { key: 'bad' }),
    ]);
    expect(s2.summary).toContain('2 kinds');
  });

  it('identifies the most common kind in the summary', () => {
    const s = summarizeZipImportWarnings([
      w('DUPLICATE_ASSET_CONFLICT', { key: 'k1' }),
      w('DUPLICATE_ASSET_CONFLICT', { key: 'k2' }),
      w('INVALID_ASSET_KEY', { key: 'bad' }),
    ]);
    expect(s.summary.toLowerCase()).toContain('asset key conflicts');
  });

  it('preserves input order in `details`', () => {
    const warnings = [
      w('INVALID_ASSET_KEY', { key: 'bad' }),
      w('DUPLICATE_MANIFEST'),
      w('DUPLICATE_ASSET_CONFLICT', { key: 'k1' }),
    ];
    const s = summarizeZipImportWarnings(warnings);
    expect(s.details[0]!.toLowerCase()).toContain('unsafe');
    expect(s.details[1]).toContain('manifest.json');
    expect(s.details[2]).toContain('"k1"');
  });

  it('single-warning and multi-warning summaries both contain the word "succeeded"', () => {
    // Invariant: the toast never says "failed" for a successful
    // import. This is the P0-5 surfacing contract — warnings are
    // NOT failures.
    const one = summarizeZipImportWarnings([w('DUPLICATE_MANIFEST')]);
    const many = summarizeZipImportWarnings([
      w('DUPLICATE_MANIFEST'),
      w('INVALID_ASSET_KEY', { key: 'x' }),
    ]);
    expect(one.summary.toLowerCase()).toContain('succeeded');
    expect(many.summary.toLowerCase()).toContain('succeeded');
  });
});
