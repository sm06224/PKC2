// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import {
  buildTextlogBundle,
  exportTextlogAsBundle,
  buildBundleFilename,
  chooseExtension,
  type TextlogBundleManifest,
} from '@adapter/platform/textlog-bundle';
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
