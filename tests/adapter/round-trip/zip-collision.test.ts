// @vitest-environment happy-dom
/**
 * P0-5 — ZIP import asset key collision detection.
 *
 * These tests craft hand-built ZIPs that contain duplicate or unsafe
 * entries (which our own exporter never produces) and assert that
 * `importContainerFromZip` detects them and emits the documented
 * warnings WITHOUT silently overwriting data.
 *
 * Spec reference (canonical):
 *   - `docs/spec/data-model.md` §11.7 (ZIP import collision policy)
 *
 * Collision policy covered:
 *   1. Same key + same content → DUPLICATE_ASSET_SAME_CONTENT (dedup)
 *   2. Same key + different content → DUPLICATE_ASSET_CONFLICT (first-wins)
 *   3. Different keys + same content → kept separately (no dedup)
 *   4. No collision → success result has no `warnings` field
 *   5. Non-ASCII key collision paths
 *   6. Path-traversal / embedded-separator keys → INVALID_ASSET_KEY (skip)
 *   7. Duplicate manifest.json → DUPLICATE_MANIFEST (first-wins)
 *   8. Duplicate container.json → DUPLICATE_CONTAINER_JSON (first-wins)
 *
 * P0-5 scope discipline:
 *   - No unrelated refactor.
 *   - No tests for text-bundle / textlog-bundle collisions (out of scope).
 *   - Existing ZIP round-trip success path MUST remain intact — verified
 *     separately by re-running tests/adapter/round-trip/zip.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  importContainerFromZip,
  createZipBytes,
  textToBytes,
  type PackageManifest,
  type ZipEntry,
  type ZipImportWarning,
} from '@adapter/platform/zip-package';
import type { Container } from '@core/model/container';

const T_META = '2026-04-13T12:00:00.000Z';

// ── helpers ──────────────────────────────────────────

function minimalContainer(overrides?: Partial<Container>): Container {
  return {
    meta: {
      container_id: 'cnt-p0-5-src',
      title: 'P0-5',
      created_at: T_META,
      updated_at: T_META,
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
    ...overrides,
  };
}

function manifestFor(c: Container, assetCount: number): PackageManifest {
  return {
    format: 'pkc2-package',
    version: 1,
    exported_at: T_META,
    source_cid: c.meta.container_id,
    entry_count: c.entries.length,
    relation_count: c.relations.length,
    revision_count: c.revisions.length,
    asset_count: assetCount,
  };
}

/**
 * Build a ZIP byte array from a pre-assembled list of entries. Writer
 * accepts duplicates; parser is what detects them. Using the real
 * writer + parser pair means the tests exercise the production
 * collision-detection path end-to-end.
 */
function buildZip(entries: ZipEntry[]): Uint8Array {
  return createZipBytes(entries);
}

function manifestZipEntry(c: Container, assetCount: number): ZipEntry {
  return {
    name: 'manifest.json',
    data: textToBytes(JSON.stringify(manifestFor(c, assetCount), null, 2)),
  };
}

function containerZipEntry(c: Container): ZipEntry {
  return {
    name: 'container.json',
    data: textToBytes(JSON.stringify({ ...c, assets: {} }, null, 2)),
  };
}

function assetZipEntry(key: string, bytes: Uint8Array): ZipEntry {
  return { name: `assets/${key}.bin`, data: bytes };
}

async function importFromBytes(bytes: Uint8Array, name = 'zip-collision.pkc2.zip') {
  const file = new File([bytes], name, { type: 'application/zip' });
  return importContainerFromZip(file);
}

const utf8 = (s: string) => textToBytes(s);

function findWarning(
  warnings: ZipImportWarning[] | undefined,
  code: ZipImportWarning['code'],
  key?: string,
): ZipImportWarning | undefined {
  if (!warnings) return undefined;
  return warnings.find((w) => w.code === code && (key === undefined || w.key === key));
}

// ════════════════════════════════════════════════════════════════════
// Case 4 — baseline: no collision → no warnings field
// ════════════════════════════════════════════════════════════════════

describe('P0-5 — no collision baseline', () => {
  it('success result has no "warnings" field when input is clean', async () => {
    const c = minimalContainer();
    const zip = buildZip([
      manifestZipEntry(c, 1),
      containerZipEntry(c),
      assetZipEntry('alpha', utf8('alpha-bytes')),
    ]);

    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Invariant: clean inputs never carry a warnings field
    // (documented in spec §11.7 — empty-array semantics is intentionally
    // "absent", not "[]", so the field's presence itself is a signal).
    expect(r.warnings).toBeUndefined();
    expect(Object.keys(r.container.assets)).toEqual(['alpha']);
  });
});

// ════════════════════════════════════════════════════════════════════
// Case 1 — same key + same content → DUPLICATE_ASSET_SAME_CONTENT
// ════════════════════════════════════════════════════════════════════

describe('P0-5 — same key + same content', () => {
  it('emits DUPLICATE_ASSET_SAME_CONTENT and deduplicates to a single asset', async () => {
    const c = minimalContainer();
    const dup = utf8('identical-bytes');
    const zip = buildZip([
      manifestZipEntry(c, 2), // manifest claims 2, ZIP carries 2 same-key entries
      containerZipEntry(c),
      assetZipEntry('shared', dup),
      assetZipEntry('shared', dup),
    ]);

    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.warnings).toBeDefined();
    expect(r.warnings).toHaveLength(1);
    const w = findWarning(r.warnings, 'DUPLICATE_ASSET_SAME_CONTENT', 'shared');
    expect(w).toBeDefined();
    expect(w!.kept).toBe('first');

    // Single asset stored, byte-identical to the duplicated input.
    expect(Object.keys(r.container.assets)).toEqual(['shared']);
    // btoa round-trip of the same bytes must equal what we stored.
    // Use the byte comparison via atob to avoid re-encoding quirks.
    expect(atob(r.container.assets.shared!)).toBe('identical-bytes');
  });
});

// ════════════════════════════════════════════════════════════════════
// Case 2 — same key + different content → DUPLICATE_ASSET_CONFLICT
// ════════════════════════════════════════════════════════════════════

describe('P0-5 — same key + different content', () => {
  it('emits DUPLICATE_ASSET_CONFLICT and keeps the FIRST occurrence', async () => {
    const c = minimalContainer();
    const zip = buildZip([
      manifestZipEntry(c, 2),
      containerZipEntry(c),
      assetZipEntry('conflicted', utf8('FIRST-version')),
      assetZipEntry('conflicted', utf8('SECOND-version')),
    ]);

    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const w = findWarning(r.warnings, 'DUPLICATE_ASSET_CONFLICT', 'conflicted');
    expect(w).toBeDefined();
    expect(w!.kept).toBe('first');

    // First-wins: the stored bytes must match the FIRST entry.
    expect(atob(r.container.assets.conflicted!)).toBe('FIRST-version');
  });

  it('loud warning even when later entries share content with an earlier one (rare but possible)', async () => {
    // Sanity: 3 entries [A, B, A]. Key is same; 1st is A, 2nd is B
    // (conflict), 3rd is A again (same-content vs first). Spec requires
    // BOTH subsequent occurrences to be reported separately.
    const c = minimalContainer();
    const A = utf8('value-A');
    const B = utf8('value-B');
    const zip = buildZip([
      manifestZipEntry(c, 3),
      containerZipEntry(c),
      assetZipEntry('k', A),
      assetZipEntry('k', B),
      assetZipEntry('k', A),
    ]);
    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const conflict = findWarning(r.warnings, 'DUPLICATE_ASSET_CONFLICT', 'k');
    const sameContent = findWarning(r.warnings, 'DUPLICATE_ASSET_SAME_CONTENT', 'k');
    expect(conflict).toBeDefined();
    expect(sameContent).toBeDefined();
    // First-wins: stored value is A.
    expect(atob(r.container.assets.k!)).toBe('value-A');
  });
});

// ════════════════════════════════════════════════════════════════════
// Case 3 — different keys + same content → no warning, both kept
// ════════════════════════════════════════════════════════════════════

describe('P0-5 — different keys + same content', () => {
  it('keeps both assets separately with no warning (no dedup across keys)', async () => {
    const c = minimalContainer();
    const bytes = utf8('shared-content-across-two-keys');
    const zip = buildZip([
      manifestZipEntry(c, 2),
      containerZipEntry(c),
      assetZipEntry('first-key', bytes),
      assetZipEntry('second-key', bytes),
    ]);

    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.warnings).toBeUndefined();
    expect(Object.keys(r.container.assets).sort()).toEqual(['first-key', 'second-key']);
    expect(atob(r.container.assets['first-key']!)).toBe('shared-content-across-two-keys');
    expect(atob(r.container.assets['second-key']!)).toBe('shared-content-across-two-keys');
  });
});

// ════════════════════════════════════════════════════════════════════
// Case 5 — non-ASCII key collision paths
// ════════════════════════════════════════════════════════════════════

describe('P0-5 — non-ASCII asset key collisions', () => {
  it('detects collision on a Japanese key (same-content path)', async () => {
    const c = minimalContainer();
    const dup = utf8('日本語-bytes');
    const zip = buildZip([
      manifestZipEntry(c, 2),
      containerZipEntry(c),
      assetZipEntry('日本語key', dup),
      assetZipEntry('日本語key', dup),
    ]);
    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(findWarning(r.warnings, 'DUPLICATE_ASSET_SAME_CONTENT', '日本語key')).toBeDefined();
    expect(Object.keys(r.container.assets)).toEqual(['日本語key']);
  });

  it('detects collision on a Japanese key (conflict path, first-wins)', async () => {
    const c = minimalContainer();
    const zip = buildZip([
      manifestZipEntry(c, 2),
      containerZipEntry(c),
      assetZipEntry('日本語key', utf8('one')),
      assetZipEntry('日本語key', utf8('two')),
    ]);
    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = findWarning(r.warnings, 'DUPLICATE_ASSET_CONFLICT', '日本語key');
    expect(w).toBeDefined();
    expect(atob(r.container.assets['日本語key']!)).toBe('one');
  });

  it('non-ASCII keys do NOT collide with ASCII keys even when content matches', async () => {
    const c = minimalContainer();
    const bytes = utf8('shared');
    const zip = buildZip([
      manifestZipEntry(c, 2),
      containerZipEntry(c),
      assetZipEntry('ascii', bytes),
      assetZipEntry('日本語key', bytes),
    ]);
    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toBeUndefined();
    expect(Object.keys(r.container.assets).sort()).toEqual(['ascii', '日本語key'].sort());
  });
});

// ════════════════════════════════════════════════════════════════════
// Case 6 — invalid asset keys (path traversal, separators)
// ════════════════════════════════════════════════════════════════════

describe('P0-5 — invalid asset keys', () => {
  it('skips a key that contains "/" and emits INVALID_ASSET_KEY', async () => {
    // Filename like `assets/sub/foo.bin` produces key `sub/foo` via
    // `slice('assets/'.length, -4)` — we reject any key that looks
    // like a path.
    const c = minimalContainer();
    const zip = buildZip([
      manifestZipEntry(c, 1),
      containerZipEntry(c),
      { name: 'assets/sub/foo.bin', data: utf8('nested-bytes') },
    ]);
    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = findWarning(r.warnings, 'INVALID_ASSET_KEY', 'sub/foo');
    expect(w).toBeDefined();
    expect(w!.kept).toBeNull();
    expect(Object.keys(r.container.assets)).toHaveLength(0);
  });

  it('skips a key that is "..": path-traversal segment', async () => {
    const c = minimalContainer();
    const zip = buildZip([
      manifestZipEntry(c, 1),
      containerZipEntry(c),
      // After slicing `assets/` prefix and `.bin` suffix, key = '..'.
      { name: 'assets/...bin', data: utf8('traversal-try') },
    ]);
    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = findWarning(r.warnings, 'INVALID_ASSET_KEY', '..');
    expect(w).toBeDefined();
    expect(Object.keys(r.container.assets)).toHaveLength(0);
  });

  it('skips an empty key: filename exactly "assets/.bin"', async () => {
    const c = minimalContainer();
    const zip = buildZip([
      manifestZipEntry(c, 1),
      containerZipEntry(c),
      // slice('assets/'.length, -4) on 'assets/.bin' → '' (empty key).
      { name: 'assets/.bin', data: utf8('x') },
    ]);
    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = findWarning(r.warnings, 'INVALID_ASSET_KEY', '');
    expect(w).toBeDefined();
    expect(Object.keys(r.container.assets)).toHaveLength(0);
  });

  it('valid keys alongside an invalid one: the valid one still imports', async () => {
    const c = minimalContainer();
    const zip = buildZip([
      manifestZipEntry(c, 2),
      containerZipEntry(c),
      { name: 'assets/sub/bad.bin', data: utf8('bad-bytes') }, // skipped
      { name: 'assets/good.bin', data: utf8('good-bytes') }, // kept
    ]);
    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(findWarning(r.warnings, 'INVALID_ASSET_KEY', 'sub/bad')).toBeDefined();
    expect(Object.keys(r.container.assets)).toEqual(['good']);
    expect(atob(r.container.assets.good!)).toBe('good-bytes');
  });
});

// ════════════════════════════════════════════════════════════════════
// Cases 7 + 8 — duplicate manifest.json / container.json
// ════════════════════════════════════════════════════════════════════

describe('P0-5 — duplicate manifest.json', () => {
  it('emits DUPLICATE_MANIFEST and uses the first occurrence', async () => {
    const c = minimalContainer();
    const firstManifest = manifestZipEntry(c, 0);
    // Second manifest claims a different source_cid so we can confirm
    // which one won.
    const secondManifestRaw: PackageManifest = {
      ...manifestFor(c, 0),
      source_cid: 'DIFFERENT-SRC-CID',
    };
    const secondManifest: ZipEntry = {
      name: 'manifest.json',
      data: textToBytes(JSON.stringify(secondManifestRaw, null, 2)),
    };
    const zip = buildZip([firstManifest, secondManifest, containerZipEntry(c)]);

    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(findWarning(r.warnings, 'DUPLICATE_MANIFEST')).toBeDefined();
    // First-wins: manifest.source_cid is the ORIGINAL, not DIFFERENT-SRC-CID.
    expect(r.manifest.source_cid).toBe(c.meta.container_id);
  });
});

describe('P0-5 — duplicate container.json', () => {
  it('emits DUPLICATE_CONTAINER_JSON and uses the first occurrence', async () => {
    const c1 = minimalContainer({ meta: { ...minimalContainer().meta, title: 'first' } });
    const c2 = minimalContainer({ meta: { ...minimalContainer().meta, title: 'second' } });
    const zip = buildZip([
      manifestZipEntry(c1, 0),
      containerZipEntry(c1),
      containerZipEntry(c2),
    ]);
    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(findWarning(r.warnings, 'DUPLICATE_CONTAINER_JSON')).toBeDefined();
    // First-wins: title is 'first'.
    expect(r.container.meta.title).toBe('first');
  });
});

// ════════════════════════════════════════════════════════════════════
// Sanity — clean ZIP still round-trips unchanged after the refactor.
// (This is a belt-and-suspenders check against regression, NOT
//  duplicating tests/adapter/round-trip/zip.test.ts.)
// ════════════════════════════════════════════════════════════════════

describe('P0-5 — success path remains unaffected', () => {
  it('a clean multi-asset ZIP imports with no warnings field and all assets intact', async () => {
    const c = minimalContainer();
    const zip = buildZip([
      manifestZipEntry(c, 3),
      containerZipEntry(c),
      assetZipEntry('a1', utf8('one')),
      assetZipEntry('a2', utf8('two')),
      assetZipEntry('a3', utf8('three')),
    ]);
    const r = await importFromBytes(zip);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toBeUndefined();
    expect(atob(r.container.assets.a1!)).toBe('one');
    expect(atob(r.container.assets.a2!)).toBe('two');
    expect(atob(r.container.assets.a3!)).toBe('three');
  });
});
