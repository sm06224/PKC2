// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  importBatchBundleFromBuffer,
} from '@adapter/platform/batch-import';
import { buildTextsContainerBundle } from '@adapter/platform/text-bundle';
import { buildTextlogsContainerBundle } from '@adapter/platform/textlog-bundle';
import { buildFolderExportBundle } from '@adapter/platform/folder-export';
import { createZipBytes, textToBytes, type ZipEntry } from '@adapter/platform/zip-package';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

const T = '2026-04-09T10:00:00.000Z';

// ── helpers ────────────────────────

function makeContainer(overrides?: Partial<Container>): Container {
  return {
    meta: {
      container_id: 'cnt-test-batch-001',
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

function makeRelation(id: string, from: string, to: string): Relation {
  return { id, from, to, kind: 'structural', created_at: T, updated_at: T };
}

function makeAttachmentEntry(lid: string, name: string, mime: string, key: string): Entry {
  return {
    lid, title: name,
    body: JSON.stringify({ name, mime, asset_key: key }),
    archetype: 'attachment', created_at: T, updated_at: T,
  };
}

/**
 * Build a fake batch ZIP with a custom manifest and nested data.
 * Used for testing error paths where we need control over the content.
 */
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

// ── tests ────────────────────────

describe('importBatchBundleFromBuffer — texts container bundle', () => {
  it('imports a valid texts container bundle with multiple TEXT entries', async () => {
    const t1 = makeEntry('t1', 'Doc A', 'text', 'Hello world');
    const t2 = makeEntry('t2', 'Doc B', 'text', 'Goodbye world');
    const container = makeContainer({ entries: [t1, t2] });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf, 'test.texts.zip');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]!.archetype).toBe('text');
    expect(result.entries[0]!.title).toBe('Doc A');
    expect(result.entries[1]!.archetype).toBe('text');
    expect(result.entries[1]!.title).toBe('Doc B');
    expect(result.format).toBe('pkc2-texts-container-bundle');
  });

  it('reconstructs TEXT bodies correctly', async () => {
    const t1 = makeEntry('t1', 'Note', 'text', 'Hello **markdown**');
    const container = makeContainer({ entries: [t1] });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]!.body).toBe('Hello **markdown**');
  });
});

describe('importBatchBundleFromBuffer — textlogs container bundle', () => {
  it('imports a valid textlogs container bundle', async () => {
    const l1 = makeEntry('l1', 'Log A', 'textlog', makeTextlogBody([{ id: 'x', text: 'hello' }]));
    const l2 = makeEntry('l2', 'Log B', 'textlog', makeTextlogBody([{ id: 'y', text: 'world' }]));
    const container = makeContainer({ entries: [l1, l2] });
    const exported = buildTextlogsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf, 'test.textlogs.zip');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]!.archetype).toBe('textlog');
    expect(result.entries[1]!.archetype).toBe('textlog');
    expect(result.format).toBe('pkc2-textlogs-container-bundle');
  });
});

describe('importBatchBundleFromBuffer — folder export bundle', () => {
  it('imports a folder export bundle with mixed TEXT and TEXTLOG', async () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const text = makeEntry('t1', 'Doc', 'text', 'hello');
    const log = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({
      entries: [folder, text, log],
      relations: [makeRelation('r1', 'f1', 't1'), makeRelation('r2', 'f1', 'l1')],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(2);
    const archetypes = result.entries.map((e) => e.archetype);
    expect(archetypes).toContain('text');
    expect(archetypes).toContain('textlog');
    expect(result.format).toBe('pkc2-folder-export-bundle');
  });
});

describe('importBatchBundleFromBuffer — assets', () => {
  it('re-keys asset references in imported TEXT entries', async () => {
    const text = makeEntry('t1', 'With Asset', 'text', 'See ![pic](asset:ast-001) here');
    const att = makeAttachmentEntry('a1', 'pic.png', 'image/png', 'ast-001');
    const container = makeContainer({
      entries: [text, att],
      assets: { 'ast-001': btoa('PNG_DATA') },
    });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]!.attachments).toHaveLength(1);
    const importedAtt = result.entries[0]!.attachments[0]!;
    // Asset key was re-keyed (not the original)
    expect(importedAtt.assetKey).not.toBe('ast-001');
    expect(importedAtt.assetKey).toMatch(/^att-/);
    // Body references the new key
    expect(result.entries[0]!.body).toContain(`asset:${importedAtt.assetKey}`);
    expect(result.entries[0]!.body).not.toContain('asset:ast-001');
  });
});

describe('importBatchBundleFromBuffer — compacted / missing bundles', () => {
  it('accepts a compacted batch bundle', async () => {
    const text = makeEntry('t1', 'Doc', 'text', '![gone](asset:ast-missing) ok');
    const container = makeContainer({ entries: [text] });
    // Export with compact: true
    const exported = buildTextsContainerBundle(container, { compact: true });
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    // Compacted body should not contain the broken ref
    expect(result.entries[0]!.body).not.toContain('asset:ast-missing');
  });

  it('accepts a bundle with missing assets (non-compact)', async () => {
    const text = makeEntry('t1', 'Doc', 'text', '![gone](asset:ast-missing)');
    const container = makeContainer({ entries: [text] });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Missing ref preserved verbatim
    expect(result.entries[0]!.body).toContain('asset:ast-missing');
  });
});

describe('importBatchBundleFromBuffer — failure atomicity', () => {
  it('rejects a ZIP with unsupported format', () => {
    const buf = buildFakeZip({ format: 'pkc2-unknown', version: 1, entries: [] });
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Unsupported batch format');
  });

  it('rejects a ZIP with unsupported version', () => {
    const buf = buildFakeZip({ format: 'pkc2-texts-container-bundle', version: 99, entries: [] });
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Unsupported batch version');
  });

  it('rejects when a nested bundle listed in manifest is missing from ZIP', () => {
    const buf = buildFakeZip({
      format: 'pkc2-texts-container-bundle',
      version: 1,
      entries: [{ filename: 'nonexistent.text.zip', lid: 'x', title: 'X' }],
    });
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('missing from ZIP');
  });

  it('rejects when a nested bundle is invalid (corrupted inner ZIP)', () => {
    const corruptedInner = new Uint8Array([0, 1, 2, 3, 4, 5]); // not a valid ZIP
    const buf = buildFakeZip(
      {
        format: 'pkc2-texts-container-bundle',
        version: 1,
        entries: [{ filename: 'bad.text.zip', lid: 'x', title: 'Bad' }],
      },
      [{ name: 'bad.text.zip', data: corruptedInner }],
    );
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Failed to parse nested text bundle');
  });

  it('rejects non-ZIP input gracefully', () => {
    const garbage = new Uint8Array([0xff, 0xfe, 0x00, 0x01]).buffer as ArrayBuffer;
    const result = importBatchBundleFromBuffer(garbage);
    expect(result.ok).toBe(false);
  });

  it('rejects ZIP without manifest.json', () => {
    const entries: ZipEntry[] = [
      { name: 'random.txt', data: textToBytes('hello') },
    ];
    const bytes = createZipBytes(entries);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Missing manifest.json');
  });
});

describe('importBatchBundleFromBuffer — empty and edge cases', () => {
  it('handles batch with zero entries', async () => {
    const container = makeContainer({ entries: [] });
    // Build a texts container bundle with no text entries
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(0);
  });

  it('existing single-entry TEXT import still works (regression)', async () => {
    // Verify that building + re-importing a single TEXT bundle still works
    // independently of the batch import path
    const { importTextBundleFromBuffer } = await import('@adapter/platform/text-bundle');
    const { buildTextBundle } = await import('@adapter/platform/text-bundle');
    const entry = makeEntry('t1', 'Solo', 'text', 'hello world');
    const container = makeContainer({ entries: [entry] });
    const built = buildTextBundle(entry, container);
    const buf = await built.blob.arrayBuffer();
    const result = importTextBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text.body).toBe('hello world');
  });

  it('existing single-entry TEXTLOG import still works (regression)', async () => {
    const { importTextlogBundleFromBuffer } = await import('@adapter/platform/textlog-bundle');
    const { buildTextlogBundle } = await import('@adapter/platform/textlog-bundle');
    const entry = makeEntry('l1', 'Solo Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({ entries: [entry] });
    const built = buildTextlogBundle(entry, container);
    const buf = await built.blob.arrayBuffer();
    const result = importTextlogBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.textlog.title).toBe('Solo Log');
  });
});
