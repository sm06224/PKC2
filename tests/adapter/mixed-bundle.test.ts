// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  buildMixedContainerBundle,
  type MixedContainerManifest,
} from '@adapter/platform/mixed-bundle';
import {
  importBatchBundleFromBuffer,
  previewBatchBundleFromBuffer,
} from '@adapter/platform/batch-import';
import { createZipBytes, textToBytes, type ZipEntry } from '@adapter/platform/zip-package';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-04-09T10:00:00.000Z';

// ── helpers ────────────────────────

function makeContainer(overrides?: Partial<Container>): Container {
  return {
    meta: {
      container_id: 'cnt-test-mixed-001',
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

function makeEntry(lid: string, title: string, archetype: Entry['archetype'], body = ''): Entry {
  return { lid, title, body, archetype, created_at: T, updated_at: T };
}

function makeTextlogBody(entries: { id: string; text: string }[]): string {
  return JSON.stringify({ entries: entries.map((e) => ({ ...e, created_at: T })) });
}

function makeAttachmentEntry(lid: string, name: string, mime: string, key: string): Entry {
  return {
    lid, title: name,
    body: JSON.stringify({ name, mime, asset_key: key }),
    archetype: 'attachment', created_at: T, updated_at: T,
  };
}

async function readManifest(blob: Blob): Promise<MixedContainerManifest> {
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
  let p = cdOffset;
  for (let i = 0; i < total; i++) {
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (name === 'manifest.json') {
      const compressed = view.getUint32(p + 20, true);
      const localNameLen = view.getUint16(localOff + 26, true);
      const localExtraLen = view.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + localNameLen + localExtraLen;
      const data = buf.slice(dataStart, dataStart + compressed);
      return JSON.parse(decoder.decode(data)) as MixedContainerManifest;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('manifest.json not found in ZIP');
}

function buildFakeZip(manifest: Record<string, unknown>, nestedFiles?: { name: string; data: Uint8Array }[]): ArrayBuffer {
  const entries: ZipEntry[] = [
    { name: 'manifest.json', data: textToBytes(JSON.stringify(manifest)) },
  ];
  if (nestedFiles) {
    for (const f of nestedFiles) {
      entries.push({ name: f.name, data: f.data });
    }
  }
  const bytes = createZipBytes(entries);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// ── export tests ────────────────────────

describe('buildMixedContainerBundle — export', () => {
  it('bundles TEXT and TEXTLOG entries into a single ZIP', () => {
    const t1 = makeEntry('t1', 'Doc A', 'text', 'Hello');
    const l1 = makeEntry('l1', 'Log A', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({ entries: [t1, l1] });
    const result = buildMixedContainerBundle(container);

    expect(result.manifest.format).toBe('pkc2-mixed-container-bundle');
    expect(result.manifest.version).toBe(1);
    expect(result.manifest.text_count).toBe(1);
    expect(result.manifest.textlog_count).toBe(1);
    expect(result.manifest.entries).toHaveLength(2);
  });

  it('sets correct archetype on each manifest entry', () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'body');
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({ entries: [t1, l1] });
    const result = buildMixedContainerBundle(container);

    const textEntry = result.manifest.entries.find((e) => e.archetype === 'text');
    const logEntry = result.manifest.entries.find((e) => e.archetype === 'textlog');
    expect(textEntry).toBeDefined();
    expect(logEntry).toBeDefined();
    expect(textEntry!.filename).toMatch(/\.text\.zip$/);
    expect(logEntry!.filename).toMatch(/\.textlog\.zip$/);
  });

  it('excludes non-TEXT/TEXTLOG entries from the bundle', () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'body');
    const todo = makeEntry('td1', 'Task', 'todo', '{}');
    const att = makeEntry('a1', 'file.png', 'attachment', '{}');
    const folder = makeEntry('f1', 'Folder', 'folder', '');
    const container = makeContainer({ entries: [t1, todo, att, folder] });
    const result = buildMixedContainerBundle(container);

    expect(result.manifest.text_count).toBe(1);
    expect(result.manifest.textlog_count).toBe(0);
    expect(result.manifest.entries).toHaveLength(1);
  });

  it('produces correct filename pattern', () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'body');
    const container = makeContainer({ entries: [t1] });
    const now = new Date('2026-04-10T00:00:00Z');
    const result = buildMixedContainerBundle(container, { now });

    expect(result.filename).toMatch(/^mixed-.*-20260410\.mixed\.zip$/);
  });

  it('deduplicates nested filenames with suffixes', () => {
    // Two entries with the same title will produce the same slug
    const t1 = makeEntry('t1', 'Same', 'text', 'first');
    const t2 = makeEntry('t2', 'Same', 'text', 'second');
    const container = makeContainer({ entries: [t1, t2] });
    const result = buildMixedContainerBundle(container);

    const filenames = result.manifest.entries.map((e) => e.filename);
    expect(new Set(filenames).size).toBe(2);
    // Second one should have a -2 suffix
    expect(filenames[1]).toMatch(/-2\.text\.zip$/);
  });

  it('records source metadata from container', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'body');
    const container = makeContainer({ entries: [t1] });
    const result = buildMixedContainerBundle(container);
    const manifest = await readManifest(result.blob);

    expect(manifest.source_cid).toBe('cnt-test-mixed-001');
    expect(manifest.source_title).toBe('Test Container');
    expect(manifest.exported_at).toBeDefined();
  });

  it('reports missing asset counts', () => {
    const t1 = makeEntry('t1', 'Doc', 'text', '![img](asset:ast-missing)');
    const container = makeContainer({ entries: [t1] });
    const result = buildMixedContainerBundle(container);

    expect(result.totalMissingAssetCount).toBeGreaterThanOrEqual(1);
    expect(result.manifest.entries[0]!.missing_asset_count).toBeGreaterThanOrEqual(1);
  });

  it('records compact flag in manifest', () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'body');
    const container = makeContainer({ entries: [t1] });
    const normal = buildMixedContainerBundle(container);
    const compacted = buildMixedContainerBundle(container, { compact: true });

    expect(normal.manifest.compact).toBe(false);
    expect(compacted.manifest.compact).toBe(true);
  });

  it('includes assets in nested bundles', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', '![pic](asset:ast-001)');
    const att = makeAttachmentEntry('a1', 'pic.png', 'image/png', 'ast-001');
    const container = makeContainer({
      entries: [t1, att],
      assets: { 'ast-001': btoa('PNG_DATA') },
    });
    const result = buildMixedContainerBundle(container);

    expect(result.manifest.entries[0]!.asset_count).toBe(1);
    expect(result.manifest.entries[0]!.missing_asset_count).toBe(0);
  });

  it('handles TEXT-only container (no TEXTLOG)', () => {
    const t1 = makeEntry('t1', 'Doc A', 'text', 'Hello');
    const t2 = makeEntry('t2', 'Doc B', 'text', 'World');
    const container = makeContainer({ entries: [t1, t2] });
    const result = buildMixedContainerBundle(container);

    expect(result.manifest.text_count).toBe(2);
    expect(result.manifest.textlog_count).toBe(0);
  });

  it('handles TEXTLOG-only container (no TEXT)', () => {
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({ entries: [l1] });
    const result = buildMixedContainerBundle(container);

    expect(result.manifest.text_count).toBe(0);
    expect(result.manifest.textlog_count).toBe(1);
  });

  it('handles empty container (no TEXT or TEXTLOG)', () => {
    const container = makeContainer({ entries: [] });
    const result = buildMixedContainerBundle(container);

    expect(result.manifest.text_count).toBe(0);
    expect(result.manifest.textlog_count).toBe(0);
    expect(result.manifest.entries).toHaveLength(0);
  });
});

// ── import round-trip tests ────────────────────────

describe('importBatchBundleFromBuffer — mixed container bundle', () => {
  it('imports a mixed bundle with TEXT and TEXTLOG', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'hello markdown');
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'entry' }]));
    const container = makeContainer({ entries: [t1, l1] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf, 'test.mixed.zip');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('pkc2-mixed-container-bundle');
    expect(result.entries).toHaveLength(2);
    const archetypes = result.entries.map((e) => e.archetype);
    expect(archetypes).toContain('text');
    expect(archetypes).toContain('textlog');
  });

  it('preserves TEXT body content through round-trip', async () => {
    const t1 = makeEntry('t1', 'Note', 'text', '**bold** and _italic_');
    const container = makeContainer({ entries: [t1] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]!.body).toBe('**bold** and _italic_');
  });

  it('preserves TEXTLOG body content through round-trip', async () => {
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([
      { id: 'a', text: 'first' },
      { id: 'b', text: 'second' },
    ]));
    const container = makeContainer({ entries: [l1] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]!.archetype).toBe('textlog');
    const parsed = JSON.parse(result.entries[0]!.body) as { entries: unknown[] };
    expect(parsed.entries).toHaveLength(2);
  });

  it('re-keys asset references in imported TEXT entries', async () => {
    const t1 = makeEntry('t1', 'With Asset', 'text', 'See ![pic](asset:ast-mix-001) here');
    const att = makeAttachmentEntry('a1', 'pic.png', 'image/png', 'ast-mix-001');
    const container = makeContainer({
      entries: [t1, att],
      assets: { 'ast-mix-001': btoa('PNG_DATA') },
    });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const textEntry = result.entries.find((e) => e.archetype === 'text')!;
    expect(textEntry.attachments).toHaveLength(1);
    const importedAtt = textEntry.attachments[0]!;
    expect(importedAtt.assetKey).not.toBe('ast-mix-001');
    expect(importedAtt.assetKey).toMatch(/^att-/);
    expect(textEntry.body).toContain(`asset:${importedAtt.assetKey}`);
    expect(textEntry.body).not.toContain('asset:ast-mix-001');
  });

  it('re-keys asset references in imported TEXTLOG entries', async () => {
    const logBody = makeTextlogBody([{ id: 'x', text: '![img](asset:ast-log-001)' }]);
    const l1 = makeEntry('l1', 'Log', 'textlog', logBody);
    const att = makeAttachmentEntry('a1', 'photo.jpg', 'image/jpeg', 'ast-log-001');
    const container = makeContainer({
      entries: [l1, att],
      assets: { 'ast-log-001': btoa('JPEG_DATA') },
    });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const logEntry = result.entries.find((e) => e.archetype === 'textlog')!;
    expect(logEntry.attachments).toHaveLength(1);
    const importedAtt = logEntry.attachments[0]!;
    expect(importedAtt.assetKey).not.toBe('ast-log-001');
    expect(importedAtt.assetKey).toMatch(/^att-/);
    expect(logEntry.body).toContain(`asset:${importedAtt.assetKey}`);
  });

  it('accepts a compacted mixed bundle', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', '![gone](asset:ast-missing) ok');
    const container = makeContainer({ entries: [t1] });
    const exported = buildMixedContainerBundle(container, { compact: true });
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.body).not.toContain('asset:ast-missing');
  });

  it('accepts a mixed bundle with missing assets (non-compact)', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', '![gone](asset:ast-missing)');
    const container = makeContainer({ entries: [t1] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]!.body).toContain('asset:ast-missing');
  });

  it('handles mixed bundle with zero entries', async () => {
    const container = makeContainer({ entries: [] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(0);
  });
});

// ── failure atomicity tests ────────────────────────

describe('importBatchBundleFromBuffer — mixed bundle failure atomicity', () => {
  it('rejects a mixed bundle with corrupted nested TEXT bundle', () => {
    const corruptedInner = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const buf = buildFakeZip(
      {
        format: 'pkc2-mixed-container-bundle',
        version: 1,
        entries: [{ filename: 'bad.text.zip', lid: 't1', title: 'Bad', archetype: 'text' }],
      },
      [{ name: 'bad.text.zip', data: corruptedInner }],
    );
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Failed to parse nested text bundle');
  });

  it('rejects a mixed bundle with corrupted nested TEXTLOG bundle', () => {
    const corruptedInner = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const buf = buildFakeZip(
      {
        format: 'pkc2-mixed-container-bundle',
        version: 1,
        entries: [{ filename: 'bad.textlog.zip', lid: 'l1', title: 'Bad', archetype: 'textlog' }],
      },
      [{ name: 'bad.textlog.zip', data: corruptedInner }],
    );
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Failed to parse nested textlog bundle');
  });

  it('rejects a mixed bundle with missing nested file', () => {
    const buf = buildFakeZip({
      format: 'pkc2-mixed-container-bundle',
      version: 1,
      entries: [{ filename: 'missing.text.zip', lid: 't1', title: 'Missing', archetype: 'text' }],
    });
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('missing from ZIP');
  });

  it('rejects a mixed bundle with unknown archetype', () => {
    const dummyData = new Uint8Array([0x50, 0x4b, 0x05, 0x06]); // minimal bytes
    const buf = buildFakeZip(
      {
        format: 'pkc2-mixed-container-bundle',
        version: 1,
        entries: [{ filename: 'x.zip', lid: 't1', title: 'X', archetype: 'todo' }],
      },
      [{ name: 'x.zip', data: dummyData }],
    );
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Cannot determine archetype');
  });
});

// ── preview tests ────────────────────────

describe('previewBatchBundleFromBuffer — mixed container bundle', () => {
  it('extracts preview info with correct counts', async () => {
    const t1 = makeEntry('t1', 'Doc A', 'text', 'Hello');
    const t2 = makeEntry('t2', 'Doc B', 'text', 'World');
    const l1 = makeEntry('l1', 'Log A', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({ entries: [t1, t2, l1] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf, 'test.mixed.zip');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.format).toBe('pkc2-mixed-container-bundle');
    expect(result.info.formatLabel).toBe('Mixed (TEXT + TEXTLOG) container bundle');
    expect(result.info.textCount).toBe(2);
    expect(result.info.textlogCount).toBe(1);
    expect(result.info.totalEntries).toBe(3);
    expect(result.info.isFolderExport).toBe(false);
    expect(result.info.sourceFolderTitle).toBeNull();
  });

  it('includes entries with correct archetypes', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'content');
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({ entries: [t1, l1] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.entries).toHaveLength(2);
    const archetypes = result.info.entries.map((e) => e.archetype);
    expect(archetypes).toContain('text');
    expect(archetypes).toContain('textlog');
  });

  it('selectedIndices defaults to all entries', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'a');
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'b' }]));
    const container = makeContainer({ entries: [t1, l1] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.selectedIndices).toEqual([0, 1]);
  });

  it('reports compacted flag', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'content');
    const container = makeContainer({ entries: [t1] });
    const exported = buildMixedContainerBundle(container, { compact: true });
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.compacted).toBe(true);
  });

  it('reports missing asset count', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', '![img](asset:ast-missing)');
    const container = makeContainer({ entries: [t1] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.missingAssetCount).toBeGreaterThanOrEqual(1);
  });
});

// ── selective import round-trip ────────────────────────

describe('mixed bundle — selective import integration', () => {
  it('selective import filters entries by index correctly', async () => {
    const t1 = makeEntry('t1', 'Doc A', 'text', 'first');
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const t2 = makeEntry('t2', 'Doc B', 'text', 'second');
    const container = makeContainer({ entries: [t1, l1, t2] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    // Full parse
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(3);

    // Simulate selective import: only import index 0 and 2 (both TEXT)
    const selectedSet = new Set([0, 2]);
    const selected = result.entries.filter((_, i) => selectedSet.has(i));
    expect(selected).toHaveLength(2);
    expect(selected.every((e) => e.archetype === 'text')).toBe(true);
    expect(selected[0]!.body).toBe('first');
    expect(selected[1]!.body).toBe('second');
  });

  it('selective import can pick only TEXTLOG from mixed bundle', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'text content');
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'log content' }]));
    const container = makeContainer({ entries: [t1, l1] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Select only the textlog (index 1)
    const selectedSet = new Set([1]);
    const selected = result.entries.filter((_, i) => selectedSet.has(i));
    expect(selected).toHaveLength(1);
    expect(selected[0]!.archetype).toBe('textlog');
  });
});
