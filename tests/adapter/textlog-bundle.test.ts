// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import {
  buildTextlogBundle,
  buildTextlogsContainerBundle,
  exportTextlogAsBundle,
  buildBundleFilename,
  chooseExtension,
  importTextlogBundleFromBuffer,
  type TextlogBundleManifest,
  type TextlogsContainerManifest,
} from '@adapter/platform/textlog-bundle';
import { parseTextlogBody } from '@features/textlog/textlog-body';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-04-09T10:00:00.000Z';

// ── helpers ────────────────────────

function makeContainer(overrides?: Partial<Container>): Container {
  return {
    meta: {
      container_id: 'cnt-test-001',
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

function makeTextlogEntry(
  lid: string,
  title: string,
  entries: Array<{ id: string; text: string; createdAt?: string; flags?: string[] }>,
): Entry {
  const body = JSON.stringify({
    entries: entries.map((e) => ({
      id: e.id,
      text: e.text,
      createdAt: e.createdAt ?? T,
      flags: e.flags ?? [],
    })),
  });
  return {
    lid,
    title,
    body,
    archetype: 'textlog',
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
 * Parse the manifest.json bytes out of a bundle blob and decode it.
 * Implemented inline because we don't have a public ZIP parser
 * exported for this format — and we want to be sure we're really
 * looking at the bytes that landed in the ZIP, not just the manifest
 * the builder claimed to write.
 */
async function readZipEntries(blob: Blob): Promise<Map<string, Uint8Array>> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Find EOCD signature
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

async function readManifest(blob: Blob): Promise<TextlogBundleManifest> {
  const entries = await readZipEntries(blob);
  const m = entries.get('manifest.json');
  if (!m) throw new Error('manifest.json missing from bundle');
  return JSON.parse(new TextDecoder().decode(m)) as TextlogBundleManifest;
}

async function readCsv(blob: Blob): Promise<string> {
  const entries = await readZipEntries(blob);
  const csv = entries.get('textlog.csv');
  if (!csv) throw new Error('textlog.csv missing from bundle');
  return new TextDecoder().decode(csv);
}

// ── core build path ────────────────────────

describe('buildTextlogBundle', () => {
  it('produces a Blob, a manifest, and a default filename', () => {
    const entry = makeTextlogEntry('e1', 'My Log', [
      { id: 'log-1', text: 'first' },
    ]);
    const container = makeContainer({ entries: [entry] });
    const built = buildTextlogBundle(entry, container, { now: new Date('2026-04-10T00:00:00Z') });
    expect(built.blob).toBeInstanceOf(Blob);
    expect(built.blob.size).toBeGreaterThan(0);
    expect(built.manifest.format).toBe('pkc2-textlog-bundle');
    expect(built.manifest.version).toBe(1);
    expect(built.filename).toMatch(/\.textlog\.zip$/);
  });

  it('throws when called with a non-textlog entry', () => {
    const entry: Entry = {
      lid: 'e1',
      title: 'A text',
      body: 'hello',
      archetype: 'text',
      created_at: T,
      updated_at: T,
    };
    const container = makeContainer({ entries: [entry] });
    expect(() => buildTextlogBundle(entry, container)).toThrow(/textlog/);
  });

  it('writes manifest.json + textlog.csv + assets/ at the bundle root', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [{ id: 'log-1', text: '![](asset:ast-001)' }]);
    const att = makeAttachmentEntry('a1', 'screen.png', 'image/png', 'ast-001');
    const container = makeContainer({
      entries: [entry, att],
      assets: { 'ast-001': btoa('PNGDATA') },
    });
    const { blob } = buildTextlogBundle(entry, container);
    const names = [...(await readZipEntries(blob)).keys()].sort();
    expect(names).toContain('manifest.json');
    expect(names).toContain('textlog.csv');
    expect(names).toContain('assets/ast-001.png');
  });

  it('records source meta in the manifest verbatim', async () => {
    const entry = makeTextlogEntry('e7q', 'Daily', [{ id: 'log-1', text: 'x' }]);
    const container = makeContainer({
      meta: { ...makeContainer().meta, container_id: 'cnt-abc' },
      entries: [entry],
    });
    const { blob } = buildTextlogBundle(entry, container, { now: new Date('2026-04-10T12:00:00.000Z') });
    const manifest = await readManifest(blob);
    expect(manifest.source_cid).toBe('cnt-abc');
    expect(manifest.source_lid).toBe('e7q');
    expect(manifest.source_title).toBe('Daily');
    expect(manifest.exported_at).toBe('2026-04-10T12:00:00.000Z');
    expect(manifest.entry_count).toBe(1);
  });

  it('counts entries correctly', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: 'a' },
      { id: 'log-2', text: 'b' },
      { id: 'log-3', text: 'c' },
    ]);
    const container = makeContainer({ entries: [entry] });
    const manifest = await readManifest(buildTextlogBundle(entry, container).blob);
    expect(manifest.entry_count).toBe(3);
  });
});

// ── asset bundling ────────────────────────

describe('buildTextlogBundle – assets', () => {
  it('includes only the assets actually referenced by the textlog', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: 'See ![](asset:ast-001)' },
    ]);
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
    const { blob, manifest } = buildTextlogBundle(entry, container);
    const names = [...(await readZipEntries(blob)).keys()];
    expect(names).toContain('assets/ast-001.png');
    expect(names.some((n) => n.includes('ast-002'))).toBe(false);
    expect(manifest.asset_count).toBe(1);
    expect(Object.keys(manifest.assets)).toEqual(['ast-001']);
  });

  it('writes referenced asset bytes correctly under assets/<key><ext>', async () => {
    const payload = btoa('PNG\u0000bytes');
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-001)' },
    ]);
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'photo.png', 'image/png', 'ast-001')],
      assets: { 'ast-001': payload },
    });
    const entries = await readZipEntries(buildTextlogBundle(entry, container).blob);
    const data = entries.get('assets/ast-001.png');
    expect(data).toBeDefined();
    // Decoded bytes should round-trip back to the original UTF-8 string.
    expect(new TextDecoder().decode(data!)).toBe('PNG\u0000bytes');
  });

  it('includes a referenced asset only once even when multiple rows reference it', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-001)' },
      { id: 'log-2', text: '![](asset:ast-001) again' },
    ]);
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'shared.png', 'image/png', 'ast-001')],
      assets: { 'ast-001': btoa('PNG') },
    });
    const { blob, manifest } = buildTextlogBundle(entry, container);
    const names = [...(await readZipEntries(blob)).keys()].filter((n) => n.startsWith('assets/'));
    expect(names).toEqual(['assets/ast-001.png']);
    expect(manifest.asset_count).toBe(1);
  });

  it('reports missing asset references in the manifest and skips writing them', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-deleted)' },
    ]);
    const container = makeContainer({ entries: [entry] });
    const { blob, manifest } = buildTextlogBundle(entry, container);
    const names = [...(await readZipEntries(blob)).keys()];
    expect(names.some((n) => n.startsWith('assets/'))).toBe(false);
    expect(manifest.missing_asset_count).toBe(1);
    expect(manifest.missing_asset_keys).toEqual(['ast-deleted']);
    expect(manifest.asset_count).toBe(0);
  });

  it('reports missing keys when the attachment entry exists but the binary is stripped', async () => {
    // Light export situation: attachment metadata is intact, but the
    // base64 in `container.assets` is missing. Bundle should treat
    // this as a missing reference.
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-stripped)' },
    ]);
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'photo.png', 'image/png', 'ast-stripped')],
      assets: {}, // empty
    });
    const manifest = await readManifest(buildTextlogBundle(entry, container).blob);
    expect(manifest.missing_asset_count).toBe(1);
    expect(manifest.missing_asset_keys).toEqual(['ast-stripped']);
  });

  it('records both missing and present keys without confusing them', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-here) and ![](asset:ast-gone)' },
    ]);
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'here.png', 'image/png', 'ast-here')],
      assets: { 'ast-here': btoa('PNG') },
    });
    const manifest = await readManifest(buildTextlogBundle(entry, container).blob);
    expect(Object.keys(manifest.assets)).toEqual(['ast-here']);
    expect(manifest.missing_asset_keys).toEqual(['ast-gone']);
  });

  it('records the original attachment name and mime in manifest.assets', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '[budget](asset:ast-001)' },
    ]);
    const container = makeContainer({
      entries: [
        entry,
        makeAttachmentEntry('a1', 'budget Q3.xlsx', 'application/vnd.ms-excel', 'ast-001'),
      ],
      assets: { 'ast-001': btoa('XLSX') },
    });
    const manifest = await readManifest(buildTextlogBundle(entry, container).blob);
    expect(manifest.assets['ast-001']).toEqual({
      name: 'budget Q3.xlsx',
      mime: 'application/vnd.ms-excel',
    });
  });
});

// ── CSV inside the ZIP ────────────────────────

describe('buildTextlogBundle – textlog.csv content', () => {
  it('writes a CSV with the canonical header on the first line', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [{ id: 'log-1', text: 'a' }]);
    const container = makeContainer({ entries: [entry] });
    const csv = await readCsv(buildTextlogBundle(entry, container).blob);
    const firstLine = csv.split('\r\n')[0]!;
    expect(firstLine).toContain('"log_id"');
    expect(firstLine).toContain('"timestamp_iso"');
    expect(firstLine).toContain('"asset_keys"');
  });

  it('writes one row per log entry, in append order', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-a', text: 'first', createdAt: '2026-04-09T12:00:00.000Z' },
      { id: 'log-b', text: 'second', createdAt: '2026-04-09T08:00:00.000Z' }, // earlier
    ]);
    const container = makeContainer({ entries: [entry] });
    const csv = await readCsv(buildTextlogBundle(entry, container).blob);
    const idxA = csv.indexOf('log-a');
    const idxB = csv.indexOf('log-b');
    expect(idxA).toBeGreaterThan(0);
    expect(idxB).toBeGreaterThan(idxA);
  });

  it('passes asset keys through into the asset_keys column', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![a](asset:ast-001) and [b](asset:ast-002)' },
    ]);
    const container = makeContainer({
      entries: [
        entry,
        makeAttachmentEntry('a1', 'a.png', 'image/png', 'ast-001'),
        makeAttachmentEntry('a2', 'b.pdf', 'application/pdf', 'ast-002'),
      ],
      assets: { 'ast-001': btoa('A'), 'ast-002': btoa('B') },
    });
    const csv = await readCsv(buildTextlogBundle(entry, container).blob);
    expect(csv).toContain('ast-001;ast-002');
  });
});

// ── chooseExtension ────────────────────────

describe('chooseExtension', () => {
  it('prefers the extension from the original filename when present', () => {
    expect(chooseExtension('budget.xlsx', 'application/octet-stream')).toBe('.xlsx');
    expect(chooseExtension('photo.JPG', 'image/jpeg')).toBe('.jpg');
    expect(chooseExtension('archive.tar.gz', 'application/octet-stream')).toBe('.gz');
  });

  it('falls back to the MIME-derived extension when the filename has none', () => {
    expect(chooseExtension('noext', 'image/png')).toBe('.png');
    expect(chooseExtension('', 'application/pdf')).toBe('.pdf');
    expect(chooseExtension('', 'audio/mpeg')).toBe('.mp3');
  });

  it('falls back to .bin for unknown MIMEs and missing names', () => {
    expect(chooseExtension('', 'application/octet-stream')).toBe('.bin');
    expect(chooseExtension('', 'application/x-mystery')).toBe('.bin');
  });
});

// ── filename generation ────────────────────────

describe('buildBundleFilename', () => {
  it('uses the entry title slug + yyyymmdd + .textlog.zip', () => {
    const entry: Entry = {
      lid: 'e1',
      title: 'Daily Standup',
      body: '{"entries":[]}',
      archetype: 'textlog',
      created_at: T,
      updated_at: T,
    };
    const filename = buildBundleFilename(entry, new Date('2026-04-10T00:00:00Z'));
    expect(filename).toMatch(/^daily-standup-\d{8}\.textlog\.zip$/);
  });

  it('falls back to the entry lid when the title is empty', () => {
    const entry: Entry = {
      lid: 'e7q',
      title: '',
      body: '{"entries":[]}',
      archetype: 'textlog',
      created_at: T,
      updated_at: T,
    };
    const filename = buildBundleFilename(entry, new Date('2026-04-10T00:00:00Z'));
    expect(filename.startsWith('e7q-')).toBe(true);
  });
});

// ── exportTextlogAsBundle ────────────────────────

describe('exportTextlogAsBundle', () => {
  it('triggers the download with a generated filename and returns success metadata', async () => {
    const entry = makeTextlogEntry('e1', 'Test Log', [{ id: 'log-1', text: 'a' }]);
    const container = makeContainer({ entries: [entry] });
    const downloadFn = vi.fn();
    const result = await exportTextlogAsBundle(entry, container, {
      downloadFn,
      now: new Date('2026-04-10T00:00:00Z'),
    });
    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/\.textlog\.zip$/);
    expect(result.size).toBeGreaterThan(0);
    expect(downloadFn).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadFn.mock.calls[0]!;
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toBe(result.filename);
  });

  it('honours an explicit filename override', async () => {
    const entry = makeTextlogEntry('e1', 'Default Title', [{ id: 'log-1', text: 'a' }]);
    const container = makeContainer({ entries: [entry] });
    const downloadFn = vi.fn();
    const result = await exportTextlogAsBundle(entry, container, {
      downloadFn,
      filename: 'custom-name',
    });
    expect(result.filename).toBe('custom-name.textlog.zip');
  });

  it('returns a failure result instead of throwing on a non-textlog entry', async () => {
    const entry: Entry = {
      lid: 'e1',
      title: 'A text',
      body: 'hello',
      archetype: 'text',
      created_at: T,
      updated_at: T,
    };
    const container = makeContainer({ entries: [entry] });
    const downloadFn = vi.fn();
    const result = await exportTextlogAsBundle(entry, container, { downloadFn });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/textlog/);
    expect(downloadFn).not.toHaveBeenCalled();
  });
});

// ── Issue G: manifest.compacted default ────────────────────────

describe('buildTextlogBundle – manifest.compacted default', () => {
  it('marks manifest.compacted = false when compact option is not passed', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [{ id: 'log-1', text: 'a' }]);
    const container = makeContainer({ entries: [entry] });
    const manifest = await readManifest(buildTextlogBundle(entry, container).blob);
    expect(manifest.compacted).toBe(false);
  });

  it('marks manifest.compacted = false when compact: false is explicit', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [{ id: 'log-1', text: 'a' }]);
    const container = makeContainer({ entries: [entry] });
    const manifest = await readManifest(
      buildTextlogBundle(entry, container, { compact: false }).blob,
    );
    expect(manifest.compacted).toBe(false);
  });

  it('marks manifest.compacted = true when compact: true is passed', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [{ id: 'log-1', text: 'a' }]);
    const container = makeContainer({ entries: [entry] });
    const manifest = await readManifest(
      buildTextlogBundle(entry, container, { compact: true }).blob,
    );
    expect(manifest.compacted).toBe(true);
  });
});

// ── Issue G: compact mode strips broken refs from the output CSV ──────

describe('buildTextlogBundle – compact mode', () => {
  it('strips ![alt](asset:<missing>) down to alt text in text_markdown', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: 'See ![chart](asset:ast-gone) now' },
    ]);
    const container = makeContainer({ entries: [entry] });
    const csv = await readCsv(
      buildTextlogBundle(entry, container, { compact: true }).blob,
    );
    expect(csv).toContain('See chart now');
    expect(csv).not.toContain('asset:ast-gone');
  });

  it('strips [label](asset:<missing>) down to label text in text_markdown', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: 'Open [budget](asset:ast-missing)' },
    ]);
    const container = makeContainer({ entries: [entry] });
    const csv = await readCsv(
      buildTextlogBundle(entry, container, { compact: true }).blob,
    );
    expect(csv).toContain('Open budget');
    expect(csv).not.toContain('asset:ast-missing');
  });

  it('removes missing keys from the asset_keys column under compact mode', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-present) and ![](asset:ast-gone)' },
    ]);
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'p.png', 'image/png', 'ast-present')],
      assets: { 'ast-present': btoa('P') },
    });
    const csv = await readCsv(
      buildTextlogBundle(entry, container, { compact: true }).blob,
    );
    // The row's asset_keys column should now only list the present key.
    expect(csv).toContain('"ast-present"');
    expect(csv).not.toContain('ast-gone');
  });

  it('leaves present (valid) references untouched under compact mode', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: 'See ![chart](asset:ast-ok)' },
    ]);
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'chart.png', 'image/png', 'ast-ok')],
      assets: { 'ast-ok': btoa('OK') },
    });
    const csv = await readCsv(
      buildTextlogBundle(entry, container, { compact: true }).blob,
    );
    // The original reference form must survive — compact mode only
    // strips BROKEN references.
    expect(csv).toContain('![chart](asset:ast-ok)');
  });

  it('still reports missing_asset_keys in manifest under compact mode (audit trail)', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-gone)' },
    ]);
    const container = makeContainer({ entries: [entry] });
    const manifest = await readManifest(
      buildTextlogBundle(entry, container, { compact: true }).blob,
    );
    // Even though the ref was stripped from text_markdown, the manifest
    // MUST still report what was stripped. This is the audit trail —
    // compact mode is lossy to the CSV but not to the manifest.
    expect(manifest.missing_asset_count).toBe(1);
    expect(manifest.missing_asset_keys).toEqual(['ast-gone']);
    expect(manifest.compacted).toBe(true);
  });

  it('handles a row with mixed present and missing references correctly', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      {
        id: 'log-1',
        text:
          'Start ![chart](asset:ast-ok) then [doc](asset:ast-gone) and' +
          ' ![photo](asset:ast-photo) end.',
      },
    ]);
    const container = makeContainer({
      entries: [
        entry,
        makeAttachmentEntry('a1', 'chart.png', 'image/png', 'ast-ok'),
        makeAttachmentEntry('a2', 'photo.jpg', 'image/jpeg', 'ast-photo'),
      ],
      assets: {
        'ast-ok': btoa('OK'),
        'ast-photo': btoa('PHOTO'),
      },
    });
    const csv = await readCsv(
      buildTextlogBundle(entry, container, { compact: true }).blob,
    );
    // Valid refs kept verbatim.
    expect(csv).toContain('![chart](asset:ast-ok)');
    expect(csv).toContain('![photo](asset:ast-photo)');
    // Broken ref flattened to its label.
    expect(csv).toContain(' doc ');
    expect(csv).not.toContain('ast-gone');
  });
});

// ── Issue G: live state invariance under compact mode ─────────────────

describe('buildTextlogBundle – live state invariance', () => {
  /**
   * Compact mode is the most likely culprit for accidental state
   * mutation. These tests pin down the invariant that the live entry
   * body and live container assets are never touched by export,
   * regardless of compact flag.
   */
  it('does not mutate the entry body even when compact mode strips refs', () => {
    const originalText = 'See ![chart](asset:ast-gone) here';
    const entry = makeTextlogEntry('e1', 'Log', [{ id: 'log-1', text: originalText }]);
    const bodyBefore = entry.body;
    const container = makeContainer({ entries: [entry] });
    buildTextlogBundle(entry, container, { compact: true });
    // Body string must be identical — same reference + same content.
    expect(entry.body).toBe(bodyBefore);
    // Parse it and confirm the text is still the original text.
    const parsed = JSON.parse(entry.body) as { entries: Array<{ text: string }> };
    expect(parsed.entries[0]!.text).toBe(originalText);
  });

  it('does not mutate container.assets even when missing keys are reported', () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-gone)' },
    ]);
    const assets = { 'ast-here': btoa('X') };
    const container = makeContainer({ entries: [entry], assets });
    const keysBefore = Object.keys(container.assets ?? {}).sort();
    const snapshot = JSON.stringify(container.assets);
    buildTextlogBundle(entry, container, { compact: true });
    expect(Object.keys(container.assets ?? {}).sort()).toEqual(keysBefore);
    expect(JSON.stringify(container.assets)).toBe(snapshot);
  });

  it('does not mutate other entries in the container', () => {
    const textlogEntry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-gone)' },
    ]);
    const sibling = makeTextlogEntry('e2', 'Other', [{ id: 'log-2', text: 'untouched' }]);
    const container = makeContainer({ entries: [textlogEntry, sibling] });
    const siblingBodyBefore = sibling.body;
    buildTextlogBundle(textlogEntry, container, { compact: true });
    expect(sibling.body).toBe(siblingBodyBefore);
  });

  it('plain (non-compact) export is byte-deterministic for the same container', async () => {
    // Sanity: two successive exports of the same entry produce
    // identical CSV bodies. This catches accidental hidden state.
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: 'hello' },
      { id: 'log-2', text: '![img](asset:ast-ok)' },
    ]);
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'img.png', 'image/png', 'ast-ok')],
      assets: { 'ast-ok': btoa('OK') },
    });
    const now = new Date('2026-04-10T00:00:00Z');
    const csv1 = await readCsv(buildTextlogBundle(entry, container, { now }).blob);
    const csv2 = await readCsv(buildTextlogBundle(entry, container, { now }).blob);
    expect(csv1).toBe(csv2);
  });
});

// ── Issue G: exportTextlogAsBundle forwards compact ───────────────────

describe('exportTextlogAsBundle – compact passthrough', () => {
  it('forwards compact: true to the bundle builder', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-gone)' },
    ]);
    const container = makeContainer({ entries: [entry] });
    let captured: Blob | null = null;
    await exportTextlogAsBundle(entry, container, {
      downloadFn: (b) => { captured = b; },
      compact: true,
    });
    expect(captured).not.toBeNull();
    const manifest = await readManifest(captured!);
    expect(manifest.compacted).toBe(true);
  });

  it('defaults to compact: false when the option is omitted', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-gone)' },
    ]);
    const container = makeContainer({ entries: [entry] });
    let captured: Blob | null = null;
    await exportTextlogAsBundle(entry, container, {
      downloadFn: (b) => { captured = b; },
    });
    const manifest = await readManifest(captured!);
    expect(manifest.compacted).toBe(false);
  });
});

// ── Issue H: re-import (importTextlogBundleFromBuffer) ────────────

/**
 * Build an in-memory `.textlog.zip` for the given entry / container,
 * then immediately import it back. Returns the round-trip result.
 *
 * Used as the workhorse for the import tests so each test only has
 * to specify the source-side state and assert the imported-side
 * shape — the build-then-import boilerplate stays in this helper.
 */
async function buildAndReimport(entry: Entry, container: Container, opts?: { compact?: boolean }) {
  const built = buildTextlogBundle(entry, container, { compact: opts?.compact });
  const buf = await built.blob.arrayBuffer();
  return importTextlogBundleFromBuffer(buf, 'roundtrip.textlog.zip');
}

describe('importTextlogBundleFromBuffer – happy path', () => {
  it('round-trips a single-entry textlog bundle', async () => {
    const entry = makeTextlogEntry('e1', 'My Log', [
      { id: 'log-1', text: 'Hello world', flags: ['important'] },
    ]);
    const container = makeContainer({ entries: [entry] });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.textlog.title).toBe('My Log');
    expect(result.entryCount).toBe(1);
    const parsed = parseTextlogBody(result.textlog.body);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]!.id).toBe('log-1');
    expect(parsed.entries[0]!.text).toBe('Hello world');
    expect(parsed.entries[0]!.flags).toEqual(['important']);
  });

  it('preserves CSV row order verbatim — never re-sorts by timestamp', async () => {
    // Append order is "later first", as if a backdated row was
    // appended after a future-dated one. The importer must keep
    // that order.
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-future', text: 'future', createdAt: '2030-01-01T00:00:00.000Z' },
      { id: 'log-past', text: 'past', createdAt: '2020-01-01T00:00:00.000Z' },
      { id: 'log-mid', text: 'mid', createdAt: '2025-01-01T00:00:00.000Z' },
    ]);
    const container = makeContainer({ entries: [entry] });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseTextlogBody(result.textlog.body);
    expect(parsed.entries.map((e) => e.id)).toEqual(['log-future', 'log-past', 'log-mid']);
  });

  it('falls back to "Imported textlog" when source_title is empty', async () => {
    const entry = makeTextlogEntry('e1', '', [{ id: 'log-1', text: 'x' }]);
    const container = makeContainer({ entries: [entry] });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.textlog.title).toBe('Imported textlog');
  });

  it('handles a header-only CSV (zero rows) without throwing', async () => {
    const entry = makeTextlogEntry('e1', 'Empty Log', []);
    const container = makeContainer({ entries: [entry] });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entryCount).toBe(0);
    expect(parseTextlogBody(result.textlog.body).entries).toEqual([]);
    expect(result.attachments).toEqual([]);
  });
});

// Byte-level substring search — safer than decoding the whole ZIP
// as text (binary framing bytes may decode to replacement chars,
// which makes String.indexOf's UTF-16 index disagree with the byte
// offset we need for Uint8Array.set).
function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

describe('importTextlogBundleFromBuffer – format / version guards', () => {
  it('rejects a bundle whose manifest.format is not pkc2-textlog-bundle', async () => {
    // Re-pack the bundle with a tampered manifest. We do this by
    // calling the importer with a freshly built ZIP whose
    // manifest.json has been swapped via a bytewise rewrite — the
    // simplest path that doesn't introduce a second writer.
    const entry = makeTextlogEntry('e1', 'Log', [{ id: 'log-1', text: 'x' }]);
    const container = makeContainer({ entries: [entry] });
    const built = buildTextlogBundle(entry, container);
    // Inline rewrite: replace the canonical format token in the
    // ZIP bytes. The token appears exactly once (inside
    // manifest.json) and the rewrite preserves length so the
    // central-directory offsets stay valid.
    const buf = new Uint8Array(await built.blob.arrayBuffer());
    const target = new TextEncoder().encode('"pkc2-textlog-bundle"');
    const replacement = new TextEncoder().encode('"pkc2-textlog-bundlX"'); // same length, valid JSON, different value
    expect(replacement.length).toBe(target.length);
    const idx = findBytes(buf, target);
    expect(idx).toBeGreaterThan(0);
    buf.set(replacement, idx);
    const result = importTextlogBundleFromBuffer(buf.buffer, 'tampered.textlog.zip');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Invalid format/);
  });

  it('rejects a bundle whose manifest.version is not 1', async () => {
    // Same byte-rewrite trick: swap `"version": 1` for
    // `"version": 9` (same length).
    const entry = makeTextlogEntry('e1', 'Log', [{ id: 'log-1', text: 'x' }]);
    const container = makeContainer({ entries: [entry] });
    const built = buildTextlogBundle(entry, container);
    const buf = new Uint8Array(await built.blob.arrayBuffer());
    const target = new TextEncoder().encode('"version": 1');
    const replacement = new TextEncoder().encode('"version": 9');
    expect(replacement.length).toBe(target.length);
    const idx = findBytes(buf, target);
    expect(idx).toBeGreaterThan(0);
    buf.set(replacement, idx);
    const result = importTextlogBundleFromBuffer(buf.buffer, 'tampered.textlog.zip');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Unsupported textlog bundle version/);
  });

  it('rejects a buffer that is not a valid ZIP at all', () => {
    const buf = new TextEncoder().encode('not a zip').buffer;
    const result = importTextlogBundleFromBuffer(buf, 'garbage');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Invalid ZIP/);
  });
});

describe('importTextlogBundleFromBuffer – assets', () => {
  it('reconstructs assets as ImportedAttachment entries with re-keyed asset_keys', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![chart](asset:ast-001)' },
    ]);
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'screen.png', 'image/png', 'ast-001')],
      assets: { 'ast-001': btoa('PNGDATA') },
    });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toHaveLength(1);
    const att = result.attachments[0]!;
    expect(att.name).toBe('screen.png');
    expect(att.mime).toBe('image/png');
    expect(atob(att.data)).toBe('PNGDATA');
    // The new key MUST NOT equal the old key — re-keying is mandatory.
    expect(att.assetKey).not.toBe('ast-001');
    expect(att.assetKey).toMatch(/^att-/);
  });

  it('rewrites every text_markdown reference from old key to new key', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: 'a ![](asset:ast-001) b [doc](asset:ast-002)' },
      { id: 'log-2', text: 'and again ![](asset:ast-001)' },
    ]);
    const container = makeContainer({
      entries: [
        entry,
        makeAttachmentEntry('a1', 'screen.png', 'image/png', 'ast-001'),
        makeAttachmentEntry('a2', 'budget.pdf', 'application/pdf', 'ast-002'),
      ],
      assets: {
        'ast-001': btoa('PNG'),
        'ast-002': btoa('PDF'),
      },
    });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const att1 = result.attachments.find((a) => a.name === 'screen.png')!;
    const att2 = result.attachments.find((a) => a.name === 'budget.pdf')!;
    const parsed = parseTextlogBody(result.textlog.body);
    // Original keys must be GONE everywhere; only the new keys
    // appear in text_markdown.
    expect(parsed.entries[0]!.text).not.toContain('ast-001');
    expect(parsed.entries[0]!.text).not.toContain('ast-002');
    expect(parsed.entries[0]!.text).toContain(att1.assetKey);
    expect(parsed.entries[0]!.text).toContain(att2.assetKey);
    expect(parsed.entries[1]!.text).toContain(att1.assetKey);
    expect(parsed.entries[1]!.text).not.toContain('ast-001');
  });

  it('always re-keys, even when the source key would not collide with anything', async () => {
    // The source key here ("ast-only") is unique by name and would
    // not collide with any existing container asset. Spec §14.4
    // says we still re-key — collision-or-not is opaque to the
    // platform layer.
    const entry = makeTextlogEntry('e1', 'Log', [{ id: 'log-1', text: '![](asset:ast-only)' }]);
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

describe('importTextlogBundleFromBuffer – missing-asset bundles', () => {
  it('imports a bundle whose manifest had missing_asset_keys without throwing', async () => {
    // Reference an asset whose binary is NOT in container.assets.
    // The export side records it under missing_asset_keys; the
    // import side must accept the bundle, leave the broken
    // reference in text_markdown verbatim, and produce zero
    // attachments for the missing key.
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![chart](asset:ast-gone)' },
    ]);
    const container = makeContainer({ entries: [entry] }); // assets: {}
    const built = buildTextlogBundle(entry, container);
    expect(built.manifest.missing_asset_count).toBe(1);
    expect(built.manifest.missing_asset_keys).toEqual(['ast-gone']);
    const buf = await built.blob.arrayBuffer();
    const result = importTextlogBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toEqual([]);
    const parsed = parseTextlogBody(result.textlog.body);
    // The broken reference is preserved verbatim — keys not in
    // the keyMap are left untouched (spec §14.3).
    expect(parsed.entries[0]!.text).toBe('![chart](asset:ast-gone)');
  });

  it('imports a bundle that is half-broken (one present + one missing)', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: 'ok ![](asset:ast-ok) and missing ![](asset:ast-gone)' },
    ]);
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'ok.png', 'image/png', 'ast-ok')],
      assets: { 'ast-ok': btoa('PNG') },
      // ast-gone is intentionally absent from container.assets
    });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments).toHaveLength(1);
    const newKey = result.attachments[0]!.assetKey;
    const text = parseTextlogBody(result.textlog.body).entries[0]!.text;
    // Present reference rewritten to the new key.
    expect(text).toContain(newKey);
    expect(text).not.toContain('ast-ok');
    // Broken reference preserved verbatim.
    expect(text).toContain('asset:ast-gone');
  });
});

describe('importTextlogBundleFromBuffer – compacted bundles', () => {
  it('imports a compact: true bundle with the rewritten body verbatim', async () => {
    // Source has a broken reference. Compact mode strips it from
    // text_markdown — the imported body must reflect the strip,
    // NOT the original markdown.
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: 'ok ![chart](asset:ast-gone) end' },
    ]);
    const container = makeContainer({ entries: [entry] }); // ast-gone missing
    const result = await buildAndReimport(entry, container, { compact: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The compact pass replaced `![chart](asset:ast-gone)` with `chart`.
    // The imported text must contain that flattening — and must NOT
    // contain the original reference.
    const text = parseTextlogBody(result.textlog.body).entries[0]!.text;
    expect(text).not.toContain('ast-gone');
    expect(text).toBe('ok chart end');
  });

  it('uses text_markdown as the source of truth, not text_plain', async () => {
    // text_plain is a derived view (markdown stripped). If the
    // importer ever started reading text_plain, the round-tripped
    // body would silently lose markdown formatting. This test
    // pins that text_markdown is the truth: bold markers survive.
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: 'meeting **with** Alice' },
    ]);
    const container = makeContainer({ entries: [entry] });
    const result = await buildAndReimport(entry, container);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = parseTextlogBody(result.textlog.body).entries[0]!.text;
    // Bold markers survive — proves text_markdown was the source.
    expect(text).toBe('meeting **with** Alice');
  });
});

describe('importTextlogBundleFromBuffer – failure atomicity', () => {
  it('returns ok:false without throwing on garbage input', () => {
    const result = importTextlogBundleFromBuffer(new Uint8Array([1, 2, 3, 4, 5]).buffer);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('does not mutate the source container when round-tripping', async () => {
    const entry = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-001)' },
    ]);
    const container = makeContainer({
      entries: [entry, makeAttachmentEntry('a1', 'x.png', 'image/png', 'ast-001')],
      assets: { 'ast-001': btoa('PNG') },
    });
    const snapshot = JSON.stringify(container);
    await buildAndReimport(entry, container);
    // Source container must be byte-identical after the round trip.
    expect(JSON.stringify(container)).toBe(snapshot);
  });

  it('on a tampered version, returns ok:false and dispatches no entries (caller-side)', async () => {
    // This test simulates the caller-side guarantee: if ok===false,
    // a caller that follows the documented pattern never enters
    // the dispatch loop. We assert that the result has no
    // textlog / attachments fields by virtue of the discriminated
    // union — the type system catches incorrect access.
    const entry = makeTextlogEntry('e1', 'Log', [{ id: 'log-1', text: 'x' }]);
    const container = makeContainer({ entries: [entry] });
    const built = buildTextlogBundle(entry, container);
    const buf = new Uint8Array(await built.blob.arrayBuffer());
    const target = new TextEncoder().encode('"version": 1');
    const replacement = new TextEncoder().encode('"version": 7');
    const idx = findBytes(buf, target);
    expect(idx).toBeGreaterThan(0);
    buf.set(replacement, idx);
    const result = importTextlogBundleFromBuffer(buf.buffer);
    expect(result.ok).toBe(false);
    // Caller-side simulation: a strict if (!result.ok) return;
    // would skip the entire dispatch loop.
    let dispatchedCount = 0;
    if (result.ok) {
      dispatchedCount = result.attachments.length + 1;
    }
    expect(dispatchedCount).toBe(0);
  });
});

// ── Container-wide TEXTLOG export ────────────────────────

/**
 * Parse ZIP entries from a Uint8Array (inline helper replicating the
 * minimal ZIP walker from the test-level readZipEntries, but taking
 * bytes directly instead of Blob).
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

describe('buildTextlogsContainerBundle', () => {
  it('produces a valid outer ZIP with manifest + nested .textlog.zip bundles', async () => {
    const e1 = makeTextlogEntry('e1', 'Log A', [{ id: 'log-1', text: 'hello' }]);
    const e2 = makeTextlogEntry('e2', 'Log B', [{ id: 'log-2', text: 'world' }]);
    const container = makeContainer({ entries: [e1, e2] });
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildTextlogsContainerBundle(container, { now });
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.filename).toMatch(/^textlogs-.*\.textlogs\.zip$/);

    // Parse the outer ZIP
    const outerBytes = new Uint8Array(await result.blob.arrayBuffer());
    const outerEntries = parseZipBytes(outerBytes);

    // Should have: manifest.json + 2 inner .textlog.zip
    expect(outerEntries.size).toBe(3);
    expect(outerEntries.has('manifest.json')).toBe(true);

    // Verify manifest
    const manifest = JSON.parse(
      new TextDecoder().decode(outerEntries.get('manifest.json')!),
    ) as TextlogsContainerManifest;
    expect(manifest.format).toBe('pkc2-textlogs-container-bundle');
    expect(manifest.version).toBe(1);
    expect(manifest.entry_count).toBe(2);
    expect(manifest.entries).toHaveLength(2);
    expect(manifest.entries[0]!.lid).toBe('e1');
    expect(manifest.entries[1]!.lid).toBe('e2');
  });

  it('nested ZIPs are valid and can be parsed individually', async () => {
    const e1 = makeTextlogEntry('e1', 'Log A', [{ id: 'log-1', text: 'first' }]);
    const container = makeContainer({ entries: [e1] });
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildTextlogsContainerBundle(container, { now });
    const outerBytes = new Uint8Array(await result.blob.arrayBuffer());
    const outerEntries = parseZipBytes(outerBytes);

    // Find the inner .textlog.zip
    const innerName = result.manifest.entries[0]!.filename;
    expect(outerEntries.has(innerName)).toBe(true);

    // Parse the inner ZIP
    const innerBytes = outerEntries.get(innerName)!;
    const innerEntries = parseZipBytes(innerBytes);
    expect(innerEntries.has('manifest.json')).toBe(true);
    expect(innerEntries.has('textlog.csv')).toBe(true);

    // Inner manifest should be a single-entry textlog bundle
    const innerManifest = JSON.parse(
      new TextDecoder().decode(innerEntries.get('manifest.json')!),
    ) as TextlogBundleManifest;
    expect(innerManifest.format).toBe('pkc2-textlog-bundle');
    expect(innerManifest.source_lid).toBe('e1');
  });

  it('skips non-textlog entries', () => {
    const textEntry: Entry = {
      lid: 'e-text', title: 'Text', body: 'hello',
      archetype: 'text', created_at: T, updated_at: T,
    };
    const textlogEntry = makeTextlogEntry('e-log', 'Log', [{ id: 'log-1', text: 'x' }]);
    const container = makeContainer({ entries: [textEntry, textlogEntry] });

    const result = buildTextlogsContainerBundle(container);
    expect(result.manifest.entry_count).toBe(1);
    expect(result.manifest.entries).toHaveLength(1);
    expect(result.manifest.entries[0]!.lid).toBe('e-log');
  });

  it('deduplicates filenames with -2, -3 suffixes', () => {
    // Two entries with the same title produce the same default filename
    const e1 = makeTextlogEntry('e1', 'Same Title', [{ id: 'log-1', text: 'a' }]);
    const e2 = makeTextlogEntry('e2', 'Same Title', [{ id: 'log-2', text: 'b' }]);
    const e3 = makeTextlogEntry('e3', 'Same Title', [{ id: 'log-3', text: 'c' }]);
    const container = makeContainer({ entries: [e1, e2, e3] });
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildTextlogsContainerBundle(container, { now });
    const filenames = result.manifest.entries.map((e) => e.filename);
    // All filenames must be unique
    expect(new Set(filenames).size).toBe(3);
    // First keeps original, rest get -2, -3 suffixes
    expect(filenames[0]).toBe('same-title-20260410.textlog.zip');
    expect(filenames[1]).toBe('same-title-20260410-2.textlog.zip');
    expect(filenames[2]).toBe('same-title-20260410-3.textlog.zip');
  });

  it('reports totalMissingAssetCount across all bundles', () => {
    const e1 = makeTextlogEntry('e1', 'Log A', [
      { id: 'log-1', text: '![](asset:ast-gone-1)' },
    ]);
    const e2 = makeTextlogEntry('e2', 'Log B', [
      { id: 'log-2', text: '![](asset:ast-gone-2) and ![](asset:ast-gone-3)' },
    ]);
    const container = makeContainer({ entries: [e1, e2] });

    const result = buildTextlogsContainerBundle(container);
    expect(result.totalMissingAssetCount).toBe(3);
    expect(result.manifest.entries[0]!.missing_asset_count).toBe(1);
    expect(result.manifest.entries[1]!.missing_asset_count).toBe(2);
  });

  it('handles container with zero textlog entries gracefully', () => {
    const textEntry: Entry = {
      lid: 'e-text', title: 'A Text', body: 'hello',
      archetype: 'text', created_at: T, updated_at: T,
    };
    const container = makeContainer({ entries: [textEntry] });

    const result = buildTextlogsContainerBundle(container);
    expect(result.manifest.entry_count).toBe(0);
    expect(result.manifest.entries).toEqual([]);
    expect(result.totalMissingAssetCount).toBe(0);
    expect(result.blob.size).toBeGreaterThan(0); // still a valid ZIP (manifest only)
  });

  it('passes compact flag through to inner bundles and records in manifest', () => {
    const e1 = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-gone)' },
    ]);
    const container = makeContainer({ entries: [e1] });

    const resultPlain = buildTextlogsContainerBundle(container, { compact: false });
    expect(resultPlain.manifest.compact).toBe(false);

    const resultCompact = buildTextlogsContainerBundle(container, { compact: true });
    expect(resultCompact.manifest.compact).toBe(true);
  });

  it('records correct log_entry_count and asset_count per entry', () => {
    const e1 = makeTextlogEntry('e1', 'Log A', [
      { id: 'log-1', text: '![](asset:ast-ok)' },
      { id: 'log-2', text: 'plain' },
    ]);
    const att = makeAttachmentEntry('a1', 'pic.png', 'image/png', 'ast-ok');
    const container = makeContainer({
      entries: [e1, att],
      assets: { 'ast-ok': btoa('PNG') },
    });

    const result = buildTextlogsContainerBundle(container);
    expect(result.manifest.entries[0]!.log_entry_count).toBe(2);
    expect(result.manifest.entries[0]!.asset_count).toBe(1);
    expect(result.manifest.entries[0]!.missing_asset_count).toBe(0);
  });

  it('outer filename follows textlogs-<slug>-<yyyymmdd>.textlogs.zip convention', () => {
    const container = makeContainer({ entries: [] });
    container.meta.title = 'My Project';
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildTextlogsContainerBundle(container, { now });
    expect(result.filename).toBe('textlogs-my-project-20260410.textlogs.zip');
  });

  it('does not mutate container or entries', () => {
    const e1 = makeTextlogEntry('e1', 'Log', [
      { id: 'log-1', text: '![](asset:ast-gone)' },
    ]);
    const container = makeContainer({ entries: [e1] });
    const bodyBefore = e1.body;
    const entriesBefore = container.entries.length;
    const assetsBefore = JSON.stringify(container.assets);

    buildTextlogsContainerBundle(container, { compact: true });

    expect(e1.body).toBe(bodyBefore);
    expect(container.entries.length).toBe(entriesBefore);
    expect(JSON.stringify(container.assets)).toBe(assetsBefore);
  });
});
