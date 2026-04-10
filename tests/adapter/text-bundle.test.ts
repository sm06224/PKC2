// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import {
  buildTextBundle,
  exportTextAsBundle,
  buildTextBundleFilename,
  importTextBundleFromBuffer,
  buildTextsContainerBundle,
  type TextBundleManifest,
  type TextsContainerManifest,
} from '@adapter/platform/text-bundle';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-04-09T10:00:00.000Z';

// ── helpers ────────────────────────

function makeContainer(overrides?: Partial<Container>): Container {
  return {
    meta: {
      container_id: 'cnt-test-text-001',
      title: 'Test Container',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
    ...overrides,
  };
}

function makeTextEntry(lid: string, title: string, body: string): Entry {
  return {
    lid,
    title,
    body,
    archetype: 'text',
    created_at: T,
    updated_at: T,
  };
}

function makeAttachmentEntry(lid: string, name: string, mime: string, key: string): Entry {
  return {
    lid,
    title: name,
    body: JSON.stringify({ name, mime, asset_key: key }),
    archetype: 'attachment',
    created_at: T,
    updated_at: T,
  };
}

/**
 * Parse the bundle blob into a map of entry name → byte payload. Same
 * technique as `textlog-bundle.test.ts::readZipEntries` — we don't
 * want to rely on the platform's own `parseZip` as a test oracle.
 */
async function readZipEntries(blob: Blob): Promise<Map<string, Uint8Array>> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('EOCD not found');
  const total = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  let p = cdOffset;
  for (let i = 0; i < total; i++) {
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const localNameLen = view.getUint16(localOff + 26, true);
    const localExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    out.set(name, buf.slice(dataStart, dataStart + compressed));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readManifest(blob: Blob): Promise<TextBundleManifest> {
  const entries = await readZipEntries(blob);
  const m = entries.get('manifest.json');
  if (!m) throw new Error('manifest.json missing from bundle');
  return JSON.parse(new TextDecoder().decode(m)) as TextBundleManifest;
}

async function readBody(blob: Blob): Promise<string> {
  const entries = await readZipEntries(blob);
  const b = entries.get('body.md');
  if (!b) throw new Error('body.md missing from bundle');
  return new TextDecoder().decode(b);
}

// Byte-level substring search — safer than decoding the whole ZIP
// as text (binary framing bytes may decode to replacement chars,
// which desynchronizes String.indexOf's UTF-16 index from the byte
// offset required by Uint8Array.set).
function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

// ── core build path ────────────────────────

describe('buildTextBundle', () => {
  it('produces a Blob, a manifest, and a default filename', () => {
    const entry = makeTextEntry('e1', 'My Note', 'Hello **world**');
    const container = makeContainer({ entries: [entry] });
    const built = buildTextBundle(entry, container, { now: new Date('2026-04-10T00:00:00Z') });
    expect(built.blob).toBeInstanceOf(Blob);
    expect(built.blob.size).toBeGreaterThan(0);
    expect(built.manifest.format).toBe('pkc2-text-bundle');
    expect(built.manifest.version).toBe(1);
    expect(built.filename).toMatch(/\.text\.zip$/);
  });

  it('throws when called with a non-text entry', () => {
    const entry: Entry = {
      lid: 'e1',
      title: 'Not a text',
      body: '{"entries":[]}',
      archetype: 'textlog',
      created_at: T,
      updated_at: T,
    };
    const container = makeContainer({ entries: [entry] });
    expect(() => buildTextBundle(entry, container)).toThrow(/text/);
  });

  it('writes manifest.json + body.md + assets/ at the bundle root', async () => {
    const entry = makeTextEntry('e1', 'Note', 'See ![chart](asset:ast-001) now');
    const att = makeAttachmentEntry('a1', 'chart.png', 'image/png', 'ast-001');
    const container = makeContainer({
      entries: [entry, att],
      assets: { 'ast-001': btoa('PNGDATA') },
    });
    const { blob } = buildTextBundle(entry, container);
    const names = [...(await readZipEntries(blob)).keys()].sort();
    expect(names).toContain('manifest.json');
    expect(names).toContain('body.md');
    expect(names).toContain('assets/ast-001.png');
  });

  it('writes body.md verbatim (no normalization, no front-matter, no BOM)', async () => {
    // Use a body that would be mangled by any normalisation step:
    // leading blank line, Windows CRLF, trailing spaces, no trailing
    // newline. If we touch ANY of that, the test breaks.
    const original = '\r\n  Leading blank.\r\nThen **bold**.\r\n';
    const entry = makeTextEntry('e1', 'Verbatim', original);
    const container = makeContainer({ entries: [entry] });
    const body = await readBody(buildTextBundle(entry, container).blob);
    expect(body).toBe(original);
    // body.md must also not start with a UTF-8 BOM.
    expect(body.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('records source meta in the manifest verbatim', async () => {
    const entry = makeTextEntry('e7q', 'Daily', 'hello');
    const container = makeContainer({
      meta: { ...makeContainer().meta, container_id: 'cnt-abc' },
      entries: [entry],
    });
    const { blob } = buildTextBundle(entry, container, {
      now: new Date('2026-04-10T12:00:00.000Z'),
    });
    const manifest = await readManifest(blob);
    expect(manifest.source_cid).toBe('cnt-abc');
    expect(manifest.source_lid).toBe('e7q');
    expect(manifest.source_title).toBe('Daily');
    expect(manifest.exported_at).toBe('2026-04-10T12:00:00.000Z');
    expect(manifest.body_length).toBe('hello'.length);
  });
});

// ── asset bundling ────────────────────────

describe('buildTextBundle – assets', () => {
  it('includes only the assets actually referenced by body.md', async () => {
    const entry = makeTextEntry('e1', 'Note', 'See ![](asset:ast-001) here');
    const container = makeContainer({
      entries: [
        entry,
        makeAttachmentEntry('a1', 'used.png', 'image/png', 'ast-001'),
        makeAttachmentEntry('a2', 'unused.pdf', 'application/pdf', 'ast-002'),
      ],
      assets: {
        'ast-001': btoa('USED'),
        'ast-002': btoa('UNUSED'),
      },
    });
    const { blob, manifest } = buildTextBundle(entry, container);
    const names = [...(await readZipEntries(blob)).keys()];
    expect(names).toContain('assets/ast-001.png');
    expect(names.some((n) => n.includes('ast-002'))).toBe(false);
    expect(manifest.asset_count).toBe(1);
    expect(Object.keys(manifest.assets)).toEqual(['ast-001']);
  });

  it('deduplicates an asset referenced multiple times in the body', async () => {
    const entry = makeTextEntry(
      'e1',
      'Note',
      '![](asset:ast-001) and [link](asset:ast-001) and ![](asset:ast-001)',
    );
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'shared.png', 'image/png', 'ast-001')],
      assets: { 'ast-001': btoa('PNG') },
    });
    const { blob, manifest } = buildTextBundle(entry, container);
    const names = [...(await readZipEntries(blob)).keys()].filter((n) => n.startsWith('assets/'));
    expect(names).toEqual(['assets/ast-001.png']);
    expect(manifest.asset_count).toBe(1);
  });

  it('reports missing asset references in the manifest and skips writing them', async () => {
    const entry = makeTextEntry('e1', 'Note', '![gone](asset:ast-deleted)');
    const container = makeContainer({ entries: [entry] });
    const { blob, manifest } = buildTextBundle(entry, container);
    const names = [...(await readZipEntries(blob)).keys()];
    expect(names.some((n) => n.startsWith('assets/'))).toBe(false);
    expect(manifest.missing_asset_count).toBe(1);
    expect(manifest.missing_asset_keys).toEqual(['ast-deleted']);
    expect(manifest.asset_count).toBe(0);
  });

  it('records both missing and present keys without confusing them', async () => {
    const entry = makeTextEntry(
      'e1',
      'Note',
      '![](asset:ast-here) and ![](asset:ast-gone)',
    );
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'here.png', 'image/png', 'ast-here')],
      assets: { 'ast-here': btoa('PNG') },
    });
    const manifest = await readManifest(buildTextBundle(entry, container).blob);
    expect(Object.keys(manifest.assets)).toEqual(['ast-here']);
    expect(manifest.missing_asset_keys).toEqual(['ast-gone']);
  });
});

// ── body.md inside the ZIP ────────────────────────

describe('buildTextBundle – body.md content', () => {
  it('non-compact mode leaves broken asset references verbatim in body.md', async () => {
    const entry = makeTextEntry('e1', 'Note', 'See ![chart](asset:ast-gone) now');
    const container = makeContainer({ entries: [entry] });
    const body = await readBody(buildTextBundle(entry, container).blob);
    // Non-compact: the broken ref is NOT stripped.
    expect(body).toBe('See ![chart](asset:ast-gone) now');
  });

  it('non-compact mode leaves present asset references untouched', async () => {
    const entry = makeTextEntry('e1', 'Note', 'See ![chart](asset:ast-001)');
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'chart.png', 'image/png', 'ast-001')],
      assets: { 'ast-001': btoa('PNG') },
    });
    const body = await readBody(buildTextBundle(entry, container).blob);
    expect(body).toBe('See ![chart](asset:ast-001)');
  });
});

// ── filename generation ────────────────────────

describe('buildTextBundleFilename', () => {
  it('uses the entry title slug + yyyymmdd + .text.zip', () => {
    const entry: Entry = {
      lid: 'e1',
      title: 'Daily Plan',
      body: 'content',
      archetype: 'text',
      created_at: T,
      updated_at: T,
    };
    const filename = buildTextBundleFilename(entry, new Date('2026-04-10T00:00:00Z'));
    expect(filename).toMatch(/^daily-plan-\d{8}\.text\.zip$/);
  });

  it('falls back to the entry lid when the title is empty', () => {
    const entry: Entry = {
      lid: 'e7q',
      title: '',
      body: 'content',
      archetype: 'text',
      created_at: T,
      updated_at: T,
    };
    const filename = buildTextBundleFilename(entry, new Date('2026-04-10T00:00:00Z'));
    expect(filename.startsWith('e7q-')).toBe(true);
  });
});

// ── exportTextAsBundle ────────────────────────

describe('exportTextAsBundle', () => {
  it('triggers the download with a generated filename and returns success metadata', async () => {
    const entry = makeTextEntry('e1', 'Test Note', 'hello');
    const container = makeContainer({ entries: [entry] });
    const downloadFn = vi.fn();
    const result = await exportTextAsBundle(entry, container, {
      downloadFn,
      now: new Date('2026-04-10T00:00:00Z'),
    });
    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/\.text\.zip$/);
    expect(result.size).toBeGreaterThan(0);
    expect(downloadFn).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadFn.mock.calls[0]!;
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toBe(result.filename);
  });

  it('returns a failure result instead of throwing on a non-text entry', async () => {
    const entry: Entry = {
      lid: 'e1',
      title: 'Log',
      body: '{"entries":[]}',
      archetype: 'textlog',
      created_at: T,
      updated_at: T,
    };
    const container = makeContainer({ entries: [entry] });
    const downloadFn = vi.fn();
    const result = await exportTextAsBundle(entry, container, { downloadFn });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/text/);
    expect(downloadFn).not.toHaveBeenCalled();
  });
});

// ── compact mode ────────────────────────

describe('buildTextBundle – compact mode', () => {
  it('marks manifest.compacted = false by default', async () => {
    const entry = makeTextEntry('e1', 'Note', 'plain');
    const container = makeContainer({ entries: [entry] });
    const manifest = await readManifest(buildTextBundle(entry, container).blob);
    expect(manifest.compacted).toBe(false);
  });

  it('marks manifest.compacted = true when compact: true is passed', async () => {
    const entry = makeTextEntry('e1', 'Note', 'plain');
    const container = makeContainer({ entries: [entry] });
    const manifest = await readManifest(
      buildTextBundle(entry, container, { compact: true }).blob,
    );
    expect(manifest.compacted).toBe(true);
  });

  it('strips ![alt](asset:<missing>) down to alt text in body.md', async () => {
    const entry = makeTextEntry('e1', 'Note', 'See ![chart](asset:ast-gone) now');
    const container = makeContainer({ entries: [entry] });
    const body = await readBody(
      buildTextBundle(entry, container, { compact: true }).blob,
    );
    expect(body).toBe('See chart now');
    expect(body).not.toContain('asset:ast-gone');
  });

  it('strips [label](asset:<missing>) down to label text in body.md', async () => {
    const entry = makeTextEntry('e1', 'Note', 'Open [budget](asset:ast-missing) please');
    const container = makeContainer({ entries: [entry] });
    const body = await readBody(
      buildTextBundle(entry, container, { compact: true }).blob,
    );
    expect(body).toBe('Open budget please');
    expect(body).not.toContain('asset:ast-missing');
  });

  it('leaves present (valid) references untouched under compact mode', async () => {
    const entry = makeTextEntry('e1', 'Note', 'See ![chart](asset:ast-ok)');
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'chart.png', 'image/png', 'ast-ok')],
      assets: { 'ast-ok': btoa('OK') },
    });
    const body = await readBody(
      buildTextBundle(entry, container, { compact: true }).blob,
    );
    // Valid refs survive — compact mode only touches broken ones.
    expect(body).toBe('See ![chart](asset:ast-ok)');
  });

  it('still reports missing_asset_keys in manifest under compact mode (audit trail)', async () => {
    const entry = makeTextEntry('e1', 'Note', '![x](asset:ast-gone)');
    const container = makeContainer({ entries: [entry] });
    const manifest = await readManifest(
      buildTextBundle(entry, container, { compact: true }).blob,
    );
    // Even though the ref was stripped from body.md, the manifest
    // MUST still report what was stripped. This is the audit trail —
    // compact mode is lossy to the body but not to the manifest.
    expect(manifest.missing_asset_count).toBe(1);
    expect(manifest.missing_asset_keys).toEqual(['ast-gone']);
    expect(manifest.compacted).toBe(true);
  });

  it('handles a mixed body with present and missing refs', async () => {
    const entry = makeTextEntry(
      'e1',
      'Note',
      'Start ![chart](asset:ast-ok) mid [doc](asset:ast-gone) end ![photo](asset:ast-photo).',
    );
    const container = makeContainer({
      entries: [
        entry,
        makeAttachmentEntry('a1', 'chart.png', 'image/png', 'ast-ok'),
        makeAttachmentEntry('a2', 'photo.jpg', 'image/jpeg', 'ast-photo'),
      ],
      assets: { 'ast-ok': btoa('OK'), 'ast-photo': btoa('PHOTO') },
    });
    const body = await readBody(
      buildTextBundle(entry, container, { compact: true }).blob,
    );
    expect(body).toContain('![chart](asset:ast-ok)');
    expect(body).toContain('![photo](asset:ast-photo)');
    expect(body).toContain(' doc ');
    expect(body).not.toContain('ast-gone');
  });
});

// ── live-state invariance ────────────────────────

describe('buildTextBundle – live state invariance', () => {
  it('does not mutate the entry body even when compact mode strips refs', () => {
    const original = 'See ![chart](asset:ast-gone) here';
    const entry = makeTextEntry('e1', 'Note', original);
    const bodyBefore = entry.body;
    const container = makeContainer({ entries: [entry] });
    buildTextBundle(entry, container, { compact: true });
    expect(entry.body).toBe(bodyBefore);
    expect(entry.body).toBe(original);
  });

  it('does not mutate container.assets when missing keys are reported', () => {
    const entry = makeTextEntry('e1', 'Note', '![](asset:ast-gone)');
    const assets = { 'ast-here': btoa('X') };
    const container = makeContainer({ entries: [entry], assets });
    const snapshot = JSON.stringify(container.assets);
    buildTextBundle(entry, container, { compact: true });
    expect(JSON.stringify(container.assets)).toBe(snapshot);
  });

  it('plain (non-compact) export is deterministic for the same inputs', async () => {
    const entry = makeTextEntry(
      'e1',
      'Note',
      'hello ![img](asset:ast-ok) there',
    );
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'img.png', 'image/png', 'ast-ok')],
      assets: { 'ast-ok': btoa('OK') },
    });
    const now = new Date('2026-04-10T00:00:00Z');
    const body1 = await readBody(buildTextBundle(entry, container, { now }).blob);
    const body2 = await readBody(buildTextBundle(entry, container, { now }).blob);
    expect(body1).toBe(body2);
  });
});

// ── re-import (happy path) ────────────────────────

/**
 * Build an in-memory `.text.zip` for the given entry / container,
 * then immediately import it back. Keeps the build → import
 * plumbing in one place so tests can focus on shape.
 */
async function buildAndReimport(entry: Entry, container: Container, opts?: { compact?: boolean }) {
  const built = buildTextBundle(entry, container, { compact: opts?.compact });
  const buf = await built.blob.arrayBuffer();
  return importTextBundleFromBuffer(buf, 'roundtrip.text.zip');
}

describe('importTextBundleFromBuffer – happy path', () => {
  it('round-trips a plain text entry', async () => {
    const entry = makeTextEntry('e1', 'Hello', 'Hello **world**');
    const container = makeContainer({ entries: [entry] });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text.title).toBe('Hello');
    expect(result.text.body).toBe('Hello **world**');
    expect(result.attachments).toEqual([]);
  });

  it('falls back to "Imported text" when source_title is empty', async () => {
    const entry = makeTextEntry('e1', '', 'content');
    const container = makeContainer({ entries: [entry] });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text.title).toBe('Imported text');
  });

  it('does not trim leading/trailing whitespace on body.md', async () => {
    const body = '\n  indented preface\n\ncontent\n';
    const entry = makeTextEntry('e1', 'Preserve', body);
    const container = makeContainer({ entries: [entry] });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text.body).toBe(body);
  });
});

// ── re-import (format / version guards) ────────────────────────

describe('importTextBundleFromBuffer – format / version guards', () => {
  it('rejects a bundle whose manifest.format is not pkc2-text-bundle', async () => {
    const entry = makeTextEntry('e1', 'Note', 'hello');
    const container = makeContainer({ entries: [entry] });
    const built = buildTextBundle(entry, container);
    // Byte rewrite: swap the canonical format token for a same-length
    // placeholder. Same technique as the textlog guard tests.
    const buf = new Uint8Array(await built.blob.arrayBuffer());
    const target = new TextEncoder().encode('"pkc2-text-bundle"');
    const replacement = new TextEncoder().encode('"pkc2-text-bundlX"');
    expect(replacement.length).toBe(target.length);
    const idx = findBytes(buf, target);
    expect(idx).toBeGreaterThan(0);
    buf.set(replacement, idx);
    const result = importTextBundleFromBuffer(buf.buffer, 'tampered.text.zip');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Invalid format/);
  });

  it('rejects a bundle whose manifest.version is not 1', async () => {
    const entry = makeTextEntry('e1', 'Note', 'hello');
    const container = makeContainer({ entries: [entry] });
    const built = buildTextBundle(entry, container);
    const buf = new Uint8Array(await built.blob.arrayBuffer());
    const target = new TextEncoder().encode('"version": 1');
    const replacement = new TextEncoder().encode('"version": 9');
    expect(replacement.length).toBe(target.length);
    const idx = findBytes(buf, target);
    expect(idx).toBeGreaterThan(0);
    buf.set(replacement, idx);
    const result = importTextBundleFromBuffer(buf.buffer, 'tampered.text.zip');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Unsupported text bundle version/);
  });

  it('rejects a buffer that is not a valid ZIP at all', () => {
    const buf = new TextEncoder().encode('not a zip').buffer;
    const result = importTextBundleFromBuffer(buf, 'garbage');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Invalid ZIP/);
  });
});

// ── re-import (asset handling) ────────────────────────

describe('importTextBundleFromBuffer – assets', () => {
  it('reconstructs attachments with re-keyed asset_keys', async () => {
    const entry = makeTextEntry('e1', 'Note', 'Look ![chart](asset:ast-001)');
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'chart.png', 'image/png', 'ast-001')],
      assets: { 'ast-001': btoa('PNGDATA') },
    });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toHaveLength(1);
    const att = result.attachments[0]!;
    expect(att.name).toBe('chart.png');
    expect(att.mime).toBe('image/png');
    expect(atob(att.data)).toBe('PNGDATA');
    // The new key MUST NOT equal the old key — re-keying is mandatory.
    expect(att.assetKey).not.toBe('ast-001');
    expect(att.assetKey).toMatch(/^att-/);
  });

  it('rewrites every body.md reference from old key to new key', async () => {
    const entry = makeTextEntry(
      'e1',
      'Note',
      'a ![](asset:ast-001) b [doc](asset:ast-002) c ![](asset:ast-001)',
    );
    const container = makeContainer({
      entries: [
        entry,
        makeAttachmentEntry('a1', 'screen.png', 'image/png', 'ast-001'),
        makeAttachmentEntry('a2', 'budget.pdf', 'application/pdf', 'ast-002'),
      ],
      assets: { 'ast-001': btoa('PNG'), 'ast-002': btoa('PDF') },
    });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const att1 = result.attachments.find((a) => a.name === 'screen.png')!;
    const att2 = result.attachments.find((a) => a.name === 'budget.pdf')!;
    expect(result.text.body).not.toContain('ast-001');
    expect(result.text.body).not.toContain('ast-002');
    expect(result.text.body).toContain(att1.assetKey);
    expect(result.text.body).toContain(att2.assetKey);
    // Both occurrences of the duplicated key must have been rewritten.
    const occurrences = result.text.body.split(att1.assetKey).length - 1;
    expect(occurrences).toBe(2);
  });

  it('always re-keys, even when the source key would not collide', async () => {
    // Spec §7.3: re-keying is unconditional; the platform layer does
    // not try to determine whether a collision is possible.
    const entry = makeTextEntry('e1', 'Note', '![](asset:ast-only)');
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'x.png', 'image/png', 'ast-only')],
      assets: { 'ast-only': btoa('PNG') },
    });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments[0]!.assetKey).not.toBe('ast-only');
  });
});

// ── re-import (missing-asset bundles) ────────────────────────

describe('importTextBundleFromBuffer – missing-asset bundles', () => {
  it('imports a bundle whose manifest had missing_asset_keys without throwing', async () => {
    const entry = makeTextEntry('e1', 'Note', '![chart](asset:ast-gone)');
    const container = makeContainer({ entries: [entry] }); // assets: {}
    const built = buildTextBundle(entry, container);
    expect(built.manifest.missing_asset_count).toBe(1);
    expect(built.manifest.missing_asset_keys).toEqual(['ast-gone']);
    const buf = await built.blob.arrayBuffer();
    const result = importTextBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toEqual([]);
    // The broken reference is preserved verbatim — keys not in
    // keyMap are left untouched (spec §7.6).
    expect(result.text.body).toBe('![chart](asset:ast-gone)');
  });

  it('imports a half-broken bundle (one present + one missing)', async () => {
    const entry = makeTextEntry(
      'e1',
      'Note',
      'ok ![](asset:ast-ok) and missing ![](asset:ast-gone)',
    );
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'ok.png', 'image/png', 'ast-ok')],
      assets: { 'ast-ok': btoa('PNG') },
      // ast-gone intentionally absent
    });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toHaveLength(1);
    const newKey = result.attachments[0]!.assetKey;
    expect(result.text.body).toContain(newKey);
    expect(result.text.body).not.toContain('asset:ast-ok)');
    // Broken reference preserved verbatim.
    expect(result.text.body).toContain('asset:ast-gone');
  });
});

// ── re-import (compacted bundles) ────────────────────────

describe('importTextBundleFromBuffer – compacted bundles', () => {
  it('imports a compact: true bundle with the rewritten body verbatim', async () => {
    const entry = makeTextEntry('e1', 'Note', 'ok ![chart](asset:ast-gone) end');
    const container = makeContainer({ entries: [entry] }); // ast-gone missing
    const result = await buildAndReimport(entry, container, { compact: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // compact pass replaced `![chart](asset:ast-gone)` with `chart`.
    expect(result.text.body).toBe('ok chart end');
  });
});

// ── re-import (failure atomicity) ────────────────────────

describe('importTextBundleFromBuffer – failure atomicity', () => {
  it('returns ok:false without throwing on garbage input', () => {
    const result = importTextBundleFromBuffer(new Uint8Array([1, 2, 3, 4, 5]).buffer);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('does not mutate the source container when round-tripping', async () => {
    const entry = makeTextEntry('e1', 'Note', '![](asset:ast-001)');
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'x.png', 'image/png', 'ast-001')],
      assets: { 'ast-001': btoa('PNG') },
    });
    const snapshot = JSON.stringify(container);
    await buildAndReimport(entry, container);
    expect(JSON.stringify(container)).toBe(snapshot);
  });

  it('a tampered version returns ok:false and yields zero dispatches (caller-side)', async () => {
    const entry = makeTextEntry('e1', 'Note', 'hello');
    const container = makeContainer({ entries: [entry] });
    const built = buildTextBundle(entry, container);
    const buf = new Uint8Array(await built.blob.arrayBuffer());
    const target = new TextEncoder().encode('"version": 1');
    const replacement = new TextEncoder().encode('"version": 7');
    const idx = findBytes(buf, target);
    expect(idx).toBeGreaterThan(0);
    buf.set(replacement, idx);
    const result = importTextBundleFromBuffer(buf.buffer);
    expect(result.ok).toBe(false);
    // Caller-side simulation of the documented early-return pattern.
    let dispatchedCount = 0;
    if (result.ok) {
      dispatchedCount = result.attachments.length + 1;
    }
    expect(dispatchedCount).toBe(0);
  });
});

// ── container-wide export ────────────────────────

/**
 * Parse ZIP entries from a Uint8Array (byte-level helper for testing
 * nested ZIP-in-ZIP structures without depending on the platform's
 * own parseZip as a test oracle).
 */
function parseZipBytes(buf: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('EOCD not found');
  const total = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  let p = cdOffset;
  for (let i = 0; i < total; i++) {
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const localNameLen = view.getUint16(localOff + 26, true);
    const localExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    out.set(name, buf.slice(dataStart, dataStart + compressed));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe('buildTextsContainerBundle', () => {
  it('produces a valid outer ZIP with manifest + nested .text.zip bundles', async () => {
    const e1 = makeTextEntry('e1', 'Doc A', 'Hello world');
    const e2 = makeTextEntry('e2', 'Doc B', 'Goodbye world');
    const container = makeContainer({ entries: [e1, e2] });
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildTextsContainerBundle(container, { now });
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.filename).toMatch(/^texts-.*\.texts\.zip$/);

    // Parse the outer ZIP
    const outerBytes = new Uint8Array(await result.blob.arrayBuffer());
    const outerEntries = parseZipBytes(outerBytes);

    // Should have: manifest.json + 2 inner .text.zip
    expect(outerEntries.size).toBe(3);
    expect(outerEntries.has('manifest.json')).toBe(true);

    // Verify manifest
    const manifest = JSON.parse(
      new TextDecoder().decode(outerEntries.get('manifest.json')!),
    ) as TextsContainerManifest;
    expect(manifest.format).toBe('pkc2-texts-container-bundle');
    expect(manifest.version).toBe(1);
    expect(manifest.entry_count).toBe(2);
    expect(manifest.entries).toHaveLength(2);
    expect(manifest.entries[0]!.lid).toBe('e1');
    expect(manifest.entries[1]!.lid).toBe('e2');
  });

  it('nested ZIPs are valid and can be parsed individually', async () => {
    const e1 = makeTextEntry('e1', 'Doc A', 'Hello **markdown**');
    const container = makeContainer({ entries: [e1] });
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildTextsContainerBundle(container, { now });
    const outerBytes = new Uint8Array(await result.blob.arrayBuffer());
    const outerEntries = parseZipBytes(outerBytes);

    // Find the inner .text.zip
    const innerName = result.manifest.entries[0]!.filename;
    expect(outerEntries.has(innerName)).toBe(true);

    // Parse the inner ZIP
    const innerBytes = outerEntries.get(innerName)!;
    const innerEntries = parseZipBytes(innerBytes);
    expect(innerEntries.has('manifest.json')).toBe(true);
    expect(innerEntries.has('body.md')).toBe(true);

    // Inner manifest should be a single-entry text bundle
    const innerManifest = JSON.parse(
      new TextDecoder().decode(innerEntries.get('manifest.json')!),
    ) as TextBundleManifest;
    expect(innerManifest.format).toBe('pkc2-text-bundle');
    expect(innerManifest.source_lid).toBe('e1');

    // Inner body.md should contain the original text
    const body = new TextDecoder().decode(innerEntries.get('body.md')!);
    expect(body).toBe('Hello **markdown**');
  });

  it('skips non-text entries', () => {
    const textlogEntry: Entry = {
      lid: 'e-log', title: 'Log', body: '{"entries":[]}',
      archetype: 'textlog', created_at: T, updated_at: T,
    };
    const textEntry = makeTextEntry('e-text', 'Doc', 'hello');
    const container = makeContainer({ entries: [textlogEntry, textEntry] });

    const result = buildTextsContainerBundle(container);
    expect(result.manifest.entry_count).toBe(1);
    expect(result.manifest.entries).toHaveLength(1);
    expect(result.manifest.entries[0]!.lid).toBe('e-text');
  });

  it('deduplicates filenames with -2, -3 suffixes', () => {
    const e1 = makeTextEntry('e1', 'Same Title', 'body a');
    const e2 = makeTextEntry('e2', 'Same Title', 'body b');
    const e3 = makeTextEntry('e3', 'Same Title', 'body c');
    const container = makeContainer({ entries: [e1, e2, e3] });
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildTextsContainerBundle(container, { now });
    const filenames = result.manifest.entries.map((e) => e.filename);
    // All filenames must be unique
    expect(new Set(filenames).size).toBe(3);
    // First keeps original, rest get -2, -3 suffixes
    expect(filenames[0]).toBe('same-title-20260410.text.zip');
    expect(filenames[1]).toBe('same-title-20260410-2.text.zip');
    expect(filenames[2]).toBe('same-title-20260410-3.text.zip');
  });

  it('reports totalMissingAssetCount across all bundles', () => {
    const e1 = makeTextEntry('e1', 'Doc A', '![](asset:ast-gone-1)');
    const e2 = makeTextEntry('e2', 'Doc B', '![](asset:ast-gone-2) and ![](asset:ast-gone-3)');
    const container = makeContainer({ entries: [e1, e2] });

    const result = buildTextsContainerBundle(container);
    expect(result.totalMissingAssetCount).toBe(3);
    expect(result.manifest.entries[0]!.missing_asset_count).toBe(1);
    expect(result.manifest.entries[1]!.missing_asset_count).toBe(2);
  });

  it('handles container with zero text entries gracefully', () => {
    const textlogEntry: Entry = {
      lid: 'e-log', title: 'A Log', body: '{"entries":[]}',
      archetype: 'textlog', created_at: T, updated_at: T,
    };
    const container = makeContainer({ entries: [textlogEntry] });

    const result = buildTextsContainerBundle(container);
    expect(result.manifest.entry_count).toBe(0);
    expect(result.manifest.entries).toEqual([]);
    expect(result.totalMissingAssetCount).toBe(0);
    expect(result.blob.size).toBeGreaterThan(0); // still a valid ZIP (manifest only)
  });

  it('passes compact flag through to inner bundles and records in manifest', () => {
    const e1 = makeTextEntry('e1', 'Doc', '![](asset:ast-gone)');
    const container = makeContainer({ entries: [e1] });

    const resultPlain = buildTextsContainerBundle(container, { compact: false });
    expect(resultPlain.manifest.compact).toBe(false);

    const resultCompact = buildTextsContainerBundle(container, { compact: true });
    expect(resultCompact.manifest.compact).toBe(true);
  });

  it('records correct body_length and asset_count per entry', () => {
    const e1 = makeTextEntry('e1', 'Doc A', '![pic](asset:ast-ok) and more text');
    const att = makeAttachmentEntry('a1', 'pic.png', 'image/png', 'ast-ok');
    const container = makeContainer({
      entries: [e1, att],
      assets: { 'ast-ok': btoa('PNG') },
    });

    const result = buildTextsContainerBundle(container);
    expect(result.manifest.entries[0]!.body_length).toBe(e1.body.length);
    expect(result.manifest.entries[0]!.asset_count).toBe(1);
    expect(result.manifest.entries[0]!.missing_asset_count).toBe(0);
  });

  it('outer filename follows texts-<slug>-<yyyymmdd>.texts.zip convention', () => {
    const container = makeContainer({ entries: [] });
    container.meta.title = 'My Project';
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildTextsContainerBundle(container, { now });
    expect(result.filename).toBe('texts-my-project-20260410.texts.zip');
  });

  it('does not mutate container or entries', () => {
    const e1 = makeTextEntry('e1', 'Doc', '![](asset:ast-gone)');
    const container = makeContainer({ entries: [e1] });
    const bodyBefore = e1.body;
    const entriesBefore = container.entries.length;
    const assetsBefore = JSON.stringify(container.assets);

    buildTextsContainerBundle(container, { compact: true });

    expect(e1.body).toBe(bodyBefore);
    expect(container.entries.length).toBe(entriesBefore);
    expect(JSON.stringify(container.assets)).toBe(assetsBefore);
  });

  it('single-entry buildTextBundle still works after container-wide addition (regression)', async () => {
    const entry = makeTextEntry('e1', 'Solo Doc', 'hello **world**');
    const att = makeAttachmentEntry('a1', 'pic.png', 'image/png', 'ast-001');
    const container = makeContainer({
      entries: [entry, att],
      assets: { 'ast-001': btoa('PNG_DATA') },
    });

    const built = buildTextBundle(entry, container);
    expect(built.blob).toBeInstanceOf(Blob);
    expect(built.zipBytes).toBeInstanceOf(Uint8Array);
    expect(built.zipBytes.length).toBeGreaterThan(0);
    expect(built.filename).toMatch(/\.text\.zip$/);

    // Verify the zipBytes match the blob content
    const blobBytes = new Uint8Array(await built.blob.arrayBuffer());
    expect(built.zipBytes.length).toBe(blobBytes.length);
  });
});
