// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildBatchImportPlan } from '@features/batch-import/import-planner';
import {
  importBatchBundleFromBuffer,
  previewBatchBundleFromBuffer,
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

// ── folder-scoped import tests ────────────────────────

describe('importBatchBundleFromBuffer — folder-scoped import', () => {
  it('imports a folder export bundle and reports format correctly', async () => {
    const folder = makeEntry('f1', 'Project', 'folder');
    const t1 = makeEntry('t1', 'ReadMe', 'text', '# Project');
    const t2 = makeEntry('t2', 'Notes', 'text', 'some notes');
    const l1 = makeEntry('l1', 'DevLog', 'textlog', makeTextlogBody([{ id: 'x', text: 'started' }]));
    const container = makeContainer({
      entries: [folder, t1, t2, l1],
      relations: [
        makeRelation('r1', 'f1', 't1'),
        makeRelation('r2', 'f1', 't2'),
        makeRelation('r3', 'f1', 'l1'),
      ],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('pkc2-folder-export-bundle');
    expect(result.entries).toHaveLength(3);
    const archetypes = result.entries.map((e) => e.archetype);
    expect(archetypes.filter((a) => a === 'text')).toHaveLength(2);
    expect(archetypes.filter((a) => a === 'textlog')).toHaveLength(1);
  });

  it('preserves TEXT body content through folder export → import round-trip', async () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const text = makeEntry('t1', 'Doc', 'text', '**bold** and _italic_');
    const container = makeContainer({
      entries: [folder, text],
      relations: [makeRelation('r1', 'f1', 't1')],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]!.body).toBe('**bold** and _italic_');
  });

  it('preserves TEXTLOG body content through folder export → import round-trip', async () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const log = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([
      { id: 'a', text: 'first' },
      { id: 'b', text: 'second' },
    ]));
    const container = makeContainer({
      entries: [folder, log],
      relations: [makeRelation('r1', 'f1', 'l1')],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]!.archetype).toBe('textlog');
    // Body should be parseable JSON with 2 log entries
    const parsed = JSON.parse(result.entries[0]!.body) as { entries: unknown[] };
    expect(parsed.entries).toHaveLength(2);
  });

  it('re-keys asset references in folder export bundle', async () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const text = makeEntry('t1', 'With Asset', 'text', 'See ![img](asset:ast-folder-001)');
    const att = makeAttachmentEntry('a1', 'photo.jpg', 'image/jpeg', 'ast-folder-001');
    const container = makeContainer({
      entries: [folder, text, att],
      relations: [
        makeRelation('r1', 'f1', 't1'),
        makeRelation('r2', 'f1', 'a1'),
      ],
      assets: { 'ast-folder-001': btoa('JPEG_DATA') },
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Text entry should have re-keyed attachment
    const textEntry = result.entries.find((e) => e.archetype === 'text')!;
    expect(textEntry.attachments).toHaveLength(1);
    const importedAtt = textEntry.attachments[0]!;
    expect(importedAtt.assetKey).not.toBe('ast-folder-001');
    expect(importedAtt.assetKey).toMatch(/^att-/);
    // Body references the new key
    expect(textEntry.body).toContain(`asset:${importedAtt.assetKey}`);
    expect(textEntry.body).not.toContain('asset:ast-folder-001');
  });

  it('accepts a compacted folder export bundle', async () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const text = makeEntry('t1', 'Doc', 'text', '![gone](asset:ast-missing) content');
    const container = makeContainer({
      entries: [folder, text],
      relations: [makeRelation('r1', 'f1', 't1')],
    });
    const exported = buildFolderExportBundle(folder, container, { compact: true });
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    // Compacted body should not contain the broken ref
    expect(result.entries[0]!.body).not.toContain('asset:ast-missing');
  });

  it('accepts a folder export bundle with missing assets (non-compact)', async () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const text = makeEntry('t1', 'Doc', 'text', '![gone](asset:ast-missing)');
    const container = makeContainer({
      entries: [folder, text],
      relations: [makeRelation('r1', 'f1', 't1')],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Missing ref preserved verbatim
    expect(result.entries[0]!.body).toContain('asset:ast-missing');
  });

  it('rejects folder export with corrupted nested bundle (failure-atomic)', () => {
    const corruptedInner = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const buf = buildFakeZip(
      {
        format: 'pkc2-folder-export-bundle',
        version: 1,
        source_folder_lid: 'f1',
        source_folder_title: 'Folder',
        scope: 'recursive',
        entries: [
          { filename: 'bad.text.zip', lid: 't1', title: 'Bad', archetype: 'text' },
        ],
      },
      [{ name: 'bad.text.zip', data: corruptedInner }],
    );
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Failed to parse nested text bundle');
  });

  it('rejects folder export with missing nested textlog bundle (failure-atomic)', () => {
    const buf = buildFakeZip({
      format: 'pkc2-folder-export-bundle',
      version: 1,
      source_folder_lid: 'f1',
      source_folder_title: 'Folder',
      scope: 'recursive',
      entries: [
        { filename: 'missing.textlog.zip', lid: 'l1', title: 'Missing', archetype: 'textlog' },
      ],
    });
    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('missing from ZIP');
  });

  it('does not produce folder or relation entries (folder structure not restored)', async () => {
    const folder = makeEntry('f1', 'Project', 'folder');
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
    // Only text and textlog entries — no folder entry produced
    for (const entry of result.entries) {
      expect(entry.archetype === 'text' || entry.archetype === 'textlog').toBe(true);
    }
    // No structural relation data in the result (BatchImportEntry has no relations field)
    expect(result.entries.every((e) => !('relations' in e))).toBe(true);
  });

  it('handles folder export with zero exportable descendants', async () => {
    const folder = makeEntry('f1', 'Empty Folder', 'folder');
    const container = makeContainer({
      entries: [folder],
      relations: [],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(0);
    expect(result.format).toBe('pkc2-folder-export-bundle');
  });

  it('imports deeply nested folder descendants', async () => {
    // folder → subfolder → text
    const folder = makeEntry('f1', 'Root', 'folder');
    const subfolder = makeEntry('f2', 'Sub', 'folder');
    const text = makeEntry('t1', 'Deep', 'text', 'deep content');
    const container = makeContainer({
      entries: [folder, subfolder, text],
      relations: [
        makeRelation('r1', 'f1', 'f2'),
        makeRelation('r2', 'f2', 't1'),
      ],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.title).toBe('Deep');
    expect(result.entries[0]!.body).toBe('deep content');
  });
});

// ── preview function tests ────────────────────────

describe('previewBatchBundleFromBuffer — texts container bundle', () => {
  it('extracts preview info from a valid texts container bundle', async () => {
    const t1 = makeEntry('t1', 'Doc A', 'text', 'Hello');
    const t2 = makeEntry('t2', 'Doc B', 'text', 'World');
    const container = makeContainer({ entries: [t1, t2] });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf, 'test.texts.zip');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.format).toBe('pkc2-texts-container-bundle');
    expect(result.info.formatLabel).toBe('TEXT container bundle');
    expect(result.info.totalEntries).toBe(2);
    expect(result.info.textCount).toBe(2);
    expect(result.info.textlogCount).toBe(0);
    expect(result.info.isFolderExport).toBe(false);
    expect(result.info.sourceFolderTitle).toBeNull();
    expect(result.info.source).toBe('test.texts.zip');
  });

  it('reports compacted flag correctly', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'content');
    const container = makeContainer({ entries: [t1] });
    const exported = buildTextsContainerBundle(container, { compact: true });
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.compacted).toBe(true);
  });

  it('reports missing asset count', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', '![img](asset:ast-missing)');
    const container = makeContainer({ entries: [t1] });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.missingAssetCount).toBeGreaterThanOrEqual(0);
  });
});

describe('previewBatchBundleFromBuffer — textlogs container bundle', () => {
  it('extracts preview info from a valid textlogs container bundle', async () => {
    const l1 = makeEntry('l1', 'Log A', 'textlog', makeTextlogBody([{ id: 'x', text: 'hello' }]));
    const container = makeContainer({ entries: [l1] });
    const exported = buildTextlogsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.format).toBe('pkc2-textlogs-container-bundle');
    expect(result.info.textlogCount).toBe(1);
    expect(result.info.textCount).toBe(0);
  });
});

describe('previewBatchBundleFromBuffer — folder export bundle', () => {
  it('extracts preview info from a folder export bundle', async () => {
    const folder = makeEntry('f1', 'Project', 'folder');
    const t1 = makeEntry('t1', 'Doc', 'text', 'hello');
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({
      entries: [folder, t1, l1],
      relations: [makeRelation('r1', 'f1', 't1'), makeRelation('r2', 'f1', 'l1')],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.format).toBe('pkc2-folder-export-bundle');
    expect(result.info.formatLabel).toBe('Folder export bundle');
    expect(result.info.isFolderExport).toBe(true);
    expect(result.info.sourceFolderTitle).toBe('Project');
    expect(result.info.textCount).toBe(1);
    expect(result.info.textlogCount).toBe(1);
    expect(result.info.totalEntries).toBe(2);
  });
});

// ── preview entry list (selective import) ────────

describe('previewBatchBundleFromBuffer — entry list', () => {
  it('includes entries with title and archetype from texts bundle', async () => {
    const t1 = makeEntry('t1', 'Doc A', 'text', 'Hello');
    const t2 = makeEntry('t2', 'Doc B', 'text', 'World');
    const container = makeContainer({ entries: [t1, t2] });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf, 'test.texts.zip');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.entries).toHaveLength(2);
    expect(result.info.entries[0]).toMatchObject({ index: 0, title: 'Doc A', archetype: 'text' });
    expect(result.info.entries[1]).toMatchObject({ index: 1, title: 'Doc B', archetype: 'text' });
  });

  it('selectedIndices defaults to all entries', async () => {
    const t1 = makeEntry('t1', 'A', 'text', 'a');
    const t2 = makeEntry('t2', 'B', 'text', 'b');
    const t3 = makeEntry('t3', 'C', 'text', 'c');
    const container = makeContainer({ entries: [t1, t2, t3] });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.selectedIndices).toEqual([0, 1, 2]);
  });

  it('includes entries with correct archetype from folder export', async () => {
    const folder = makeEntry('f1', 'Project', 'folder');
    const t1 = makeEntry('t1', 'Note', 'text', 'content');
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({
      entries: [folder, t1, l1],
      relations: [makeRelation('r1', 'f1', 't1'), makeRelation('r2', 'f1', 'l1')],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.entries).toHaveLength(2);
    const archetypes = result.info.entries.map((e) => e.archetype);
    expect(archetypes).toContain('text');
    expect(archetypes).toContain('textlog');
  });

  it('includes entries from textlogs bundle', async () => {
    const l1 = makeEntry('l1', 'Log A', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({ entries: [l1] });
    const exported = buildTextlogsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.entries).toHaveLength(1);
    expect(result.info.entries[0]!.archetype).toBe('textlog');
    expect(result.info.entries[0]!.title).toBe('Log A');
    expect(result.info.selectedIndices).toEqual([0]);
  });
});

describe('previewBatchBundleFromBuffer — error cases', () => {
  it('rejects non-ZIP input', () => {
    const garbage = new Uint8Array([0xff, 0xfe]).buffer as ArrayBuffer;
    const result = previewBatchBundleFromBuffer(garbage);
    expect(result.ok).toBe(false);
  });

  it('rejects ZIP without manifest', () => {
    const entries: ZipEntry[] = [{ name: 'data.txt', data: textToBytes('hello') }];
    const bytes = createZipBytes(entries);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Missing manifest.json');
  });

  it('rejects unsupported format', () => {
    const buf = buildFakeZip({ format: 'pkc2-unknown', version: 1, entries: [] });
    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Unsupported batch format');
  });

  it('rejects unsupported version', () => {
    const buf = buildFakeZip({ format: 'pkc2-texts-container-bundle', version: 99, entries: [] });
    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Unsupported batch version');
  });
});

// ── deep preview tests ────────────────────────

describe('previewBatchBundleFromBuffer — deep preview (entry-level)', () => {
  it('includes bodySnippet and bodyLength for TEXT entries', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'Hello **world** this is markdown');
    const container = makeContainer({ entries: [t1] });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.info.entries[0]!;
    expect(entry.bodySnippet).toBe('Hello **world** this is markdown');
    expect(entry.bodyLength).toBe(32);
  });

  it('truncates bodySnippet at 200 chars', async () => {
    const longBody = 'A'.repeat(300);
    const t1 = makeEntry('t1', 'Long Doc', 'text', longBody);
    const container = makeContainer({ entries: [t1] });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.info.entries[0]!;
    expect(entry.bodySnippet).toHaveLength(201); // 200 + '…'
    expect(entry.bodySnippet!.endsWith('…')).toBe(true);
    expect(entry.bodyLength).toBe(300);
  });

  it('includes logEntryCount and logSnippets for TEXTLOG entries', async () => {
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([
      { id: 'a', text: 'First entry' },
      { id: 'b', text: 'Second entry' },
      { id: 'c', text: 'Third entry' },
      { id: 'd', text: 'Fourth entry' },
    ]));
    const container = makeContainer({ entries: [l1] });
    const exported = buildTextlogsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.info.entries[0]!;
    expect(entry.logEntryCount).toBe(4);
    expect(entry.logSnippets).toHaveLength(3); // max 3
    expect(entry.logSnippets![0]).toBe('First entry');
    expect(entry.logSnippets![1]).toBe('Second entry');
    expect(entry.logSnippets![2]).toBe('Third entry');
  });

  it('truncates individual log snippets at 80 chars', async () => {
    const longText = 'B'.repeat(120);
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([
      { id: 'a', text: longText },
    ]));
    const container = makeContainer({ entries: [l1] });
    const exported = buildTextlogsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.info.entries[0]!;
    expect(entry.logSnippets).toHaveLength(1);
    expect(entry.logSnippets![0]).toHaveLength(81); // 80 + '…'
    expect(entry.logSnippets![0]!.endsWith('…')).toBe(true);
  });

  it('includes assetCount and missingAssetCount in deep preview', async () => {
    const t1 = makeEntry('t1', 'With Asset', 'text', '![pic](asset:ast-001) ![gone](asset:ast-missing)');
    const att = makeAttachmentEntry('a1', 'pic.png', 'image/png', 'ast-001');
    const container = makeContainer({
      entries: [t1, att],
      assets: { 'ast-001': btoa('PNG_DATA') },
    });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.info.entries[0]!;
    expect(entry.assetCount).toBe(1);
    expect(entry.missingAssetCount).toBe(1);
  });

  it('deep preview works for mixed bundle', async () => {
    const { buildMixedContainerBundle } = await import('@adapter/platform/mixed-bundle');
    const t1 = makeEntry('t1', 'Doc', 'text', 'text content');
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'log content' }]));
    const container = makeContainer({ entries: [t1, l1] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const textEntry = result.info.entries.find((e) => e.archetype === 'text')!;
    const logEntry = result.info.entries.find((e) => e.archetype === 'textlog')!;
    expect(textEntry.bodySnippet).toBe('text content');
    expect(logEntry.logEntryCount).toBe(1);
    expect(logEntry.logSnippets).toEqual(['log content']);
  });

  it('deep preview works for folder export bundle', async () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const t1 = makeEntry('t1', 'Doc', 'text', 'folder text');
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'folder log' }]));
    const container = makeContainer({
      entries: [folder, t1, l1],
      relations: [makeRelation('r1', 'f1', 't1'), makeRelation('r2', 'f1', 'l1')],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const textEntry = result.info.entries.find((e) => e.archetype === 'text')!;
    expect(textEntry.bodySnippet).toBe('folder text');
  });

  it('summary preview still works when deep preview data is unavailable', async () => {
    // Build a fake batch with a valid outer manifest but corrupted inner data
    // The deep peek should fail silently, leaving summary preview intact
    const validManifest = {
      format: 'pkc2-texts-container-bundle',
      version: 1,
      exported_at: '2026-04-10T00:00:00Z',
      source_cid: 'cnt-test',
      source_title: 'Test',
      entry_count: 1,
      compact: false,
      entries: [{ lid: 't1', title: 'Broken', filename: 'broken.text.zip', body_length: 100, asset_count: 0, missing_asset_count: 0 }],
    };
    // Provide corrupted nested ZIP bytes
    const corruptedNested = new Uint8Array([0x50, 0x4b, 0x00, 0x00]);
    const buf = buildFakeZip(validManifest, [{ name: 'broken.text.zip', data: corruptedNested }]);

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Summary fields intact
    expect(result.info.format).toBe('pkc2-texts-container-bundle');
    expect(result.info.totalEntries).toBe(1);
    expect(result.info.entries[0]!.title).toBe('Broken');
    // Deep preview fields absent (peek failed silently)
    expect(result.info.entries[0]!.bodySnippet).toBeUndefined();
  });
});

// ── folder structure restore tests ─────────────────

describe('folder structure restore', () => {
  it('importBatchBundleFromBuffer returns folders for folder-export bundles', async () => {
    const folder = makeEntry('f1', 'Root', 'folder');
    const sub = makeEntry('f2', 'Sub', 'folder');
    const t1 = makeEntry('t1', 'Doc', 'text', 'hello');
    const container = makeContainer({
      entries: [folder, sub, t1],
      relations: [makeRelation('r1', 'f1', 'f2'), makeRelation('r2', 'f2', 't1')],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.folders).toBeDefined();
    expect(result.folders).toHaveLength(2);
    expect(result.folders![0]).toMatchObject({ lid: 'f1', title: 'Root', parentLid: null });
    expect(result.folders![1]).toMatchObject({ lid: 'f2', title: 'Sub', parentLid: 'f1' });
  });

  it('importBatchBundleFromBuffer includes parentFolderLid on entries', async () => {
    const folder = makeEntry('f1', 'Root', 'folder');
    const t1 = makeEntry('t1', 'Doc', 'text', 'hello');
    const container = makeContainer({
      entries: [folder, t1],
      relations: [makeRelation('r1', 'f1', 't1')],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]!.parentFolderLid).toBe('f1');
  });

  it('non-folder-export bundles do not have folders', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'hello');
    const container = makeContainer({ entries: [t1] });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.folders).toBeUndefined();
  });

  it('preview reports canRestoreFolderStructure for new folder-export bundles', async () => {
    const folder = makeEntry('f1', 'Root', 'folder');
    const t1 = makeEntry('t1', 'Doc', 'text', 'hello');
    const container = makeContainer({
      entries: [folder, t1],
      relations: [makeRelation('r1', 'f1', 't1')],
    });
    const exported = buildFolderExportBundle(folder, container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.canRestoreFolderStructure).toBe(true);
    expect(result.info.folderCount).toBe(1);
  });

  it('preview reports canRestoreFolderStructure=false for old bundles without folders', () => {
    const manifest = {
      format: 'pkc2-folder-export-bundle',
      version: 1,
      exported_at: '2026-04-10T00:00:00Z',
      source_cid: 'cnt-test',
      source_folder_lid: 'f1',
      source_folder_title: 'Root',
      scope: 'recursive',
      text_count: 1,
      textlog_count: 0,
      compact: false,
      entries: [{ lid: 't1', title: 'Doc', archetype: 'text', filename: 'doc.text.zip', asset_count: 0, missing_asset_count: 0 }],
      // No folders array — old format
    };
    const dummy = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const buf = buildFakeZip(manifest, [{ name: 'doc.text.zip', data: dummy }]);

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.canRestoreFolderStructure).toBe(false);
    expect(result.info.folderCount).toBe(0);
  });

  it('non-folder-export bundles have canRestoreFolderStructure=false', async () => {
    const t1 = makeEntry('t1', 'Doc', 'text', 'hello');
    const container = makeContainer({ entries: [t1] });
    const exported = buildTextsContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.canRestoreFolderStructure).toBe(false);
    expect(result.info.folderCount).toBe(0);
  });

  it('deep nested folder-export preserves full hierarchy in import result', async () => {
    const root = makeEntry('f1', 'Root', 'folder');
    const sub1 = makeEntry('f2', 'Level 1', 'folder');
    const sub2 = makeEntry('f3', 'Level 2', 'folder');
    const t1 = makeEntry('t1', 'Deep', 'text', 'deep content');
    const container = makeContainer({
      entries: [root, sub1, sub2, t1],
      relations: [
        makeRelation('r1', 'f1', 'f2'),
        makeRelation('r2', 'f2', 'f3'),
        makeRelation('r3', 'f3', 't1'),
      ],
    });
    const exported = buildFolderExportBundle(root, container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.folders).toHaveLength(3);
    expect(result.folders![0]).toMatchObject({ lid: 'f1', parentLid: null });
    expect(result.folders![1]).toMatchObject({ lid: 'f2', parentLid: 'f1' });
    expect(result.folders![2]).toMatchObject({ lid: 'f3', parentLid: 'f2' });
    expect(result.entries[0]!.parentFolderLid).toBe('f3');
  });

  it('mixed import remains unaffected by folder restore', async () => {
    const { buildMixedContainerBundle } = await import('@adapter/platform/mixed-bundle');
    const t1 = makeEntry('t1', 'Doc', 'text', 'hello');
    const l1 = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({ entries: [t1, l1] });
    const exported = buildMixedContainerBundle(container);
    const buf = await exported.blob.arrayBuffer();

    const result = importBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.folders).toBeUndefined();
    expect(result.entries[0]!.parentFolderLid).toBeUndefined();
    expect(result.entries[1]!.parentFolderLid).toBeUndefined();
  });
});

// ── Preview-time folder graph validation ──────────────

describe('preview-time folder graph validation', () => {
  const dummyNestedZip = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  it('valid folder metadata → canRestoreFolderStructure true, no malformed flag', () => {
    const manifest = {
      format: 'pkc2-folder-export-bundle',
      version: 1,
      exported_at: '2026-04-10T00:00:00Z',
      source_cid: 'cnt-test',
      source_folder_lid: 'f1',
      source_folder_title: 'Root',
      scope: 'recursive',
      text_count: 1,
      textlog_count: 0,
      compact: false,
      entries: [{ lid: 't1', title: 'Doc', archetype: 'text', filename: 'doc.text.zip', parent_folder_lid: 'f1', asset_count: 0, missing_asset_count: 0 }],
      folders: [{ lid: 'f1', title: 'Root', parent_lid: null }],
    };
    const buf = buildFakeZip(manifest, [{ name: 'doc.text.zip', data: dummyNestedZip }]);
    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.canRestoreFolderStructure).toBe(true);
    expect(result.info.malformedFolderMetadata).toBeFalsy();
    expect(result.info.folderGraphWarning).toBeUndefined();
  });

  it('malformed folder metadata (self-parent) → canRestoreFolderStructure false + malformed flag', () => {
    const manifest = {
      format: 'pkc2-folder-export-bundle',
      version: 1,
      exported_at: '2026-04-10T00:00:00Z',
      source_cid: 'cnt-test',
      source_folder_lid: 'f1',
      source_folder_title: 'Root',
      scope: 'recursive',
      text_count: 1,
      textlog_count: 0,
      compact: false,
      entries: [{ lid: 't1', title: 'Doc', archetype: 'text', filename: 'doc.text.zip', parent_folder_lid: 'f1', asset_count: 0, missing_asset_count: 0 }],
      folders: [{ lid: 'f1', title: 'Root', parent_lid: 'f1' }],  // self-parent
    };
    const buf = buildFakeZip(manifest, [{ name: 'doc.text.zip', data: dummyNestedZip }]);
    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.canRestoreFolderStructure).toBe(false);
    expect(result.info.malformedFolderMetadata).toBe(true);
    expect(result.info.folderGraphWarning).toContain('Self-parent');
  });

  it('malformed folder metadata (cycle) → canRestoreFolderStructure false + malformed flag', () => {
    const manifest = {
      format: 'pkc2-folder-export-bundle',
      version: 1,
      exported_at: '2026-04-10T00:00:00Z',
      source_cid: 'cnt-test',
      source_folder_lid: 'f1',
      source_folder_title: 'Root',
      scope: 'recursive',
      text_count: 1,
      textlog_count: 0,
      compact: false,
      entries: [{ lid: 't1', title: 'Doc', archetype: 'text', filename: 'doc.text.zip', parent_folder_lid: 'f1', asset_count: 0, missing_asset_count: 0 }],
      folders: [
        { lid: 'f1', title: 'A', parent_lid: 'f2' },
        { lid: 'f2', title: 'B', parent_lid: 'f1' },
      ],
    };
    const buf = buildFakeZip(manifest, [{ name: 'doc.text.zip', data: dummyNestedZip }]);
    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.canRestoreFolderStructure).toBe(false);
    expect(result.info.malformedFolderMetadata).toBe(true);
    expect(result.info.folderGraphWarning).toContain('Cycle');
  });

  it('malformed folder metadata (duplicate LID) → canRestoreFolderStructure false + malformed flag', () => {
    const manifest = {
      format: 'pkc2-folder-export-bundle',
      version: 1,
      exported_at: '2026-04-10T00:00:00Z',
      source_cid: 'cnt-test',
      source_folder_lid: 'f1',
      source_folder_title: 'Root',
      scope: 'recursive',
      text_count: 1,
      textlog_count: 0,
      compact: false,
      entries: [{ lid: 't1', title: 'Doc', archetype: 'text', filename: 'doc.text.zip', parent_folder_lid: 'dup', asset_count: 0, missing_asset_count: 0 }],
      folders: [
        { lid: 'dup', title: 'A', parent_lid: null },
        { lid: 'dup', title: 'B', parent_lid: null },
      ],
    };
    const buf = buildFakeZip(manifest, [{ name: 'doc.text.zip', data: dummyNestedZip }]);
    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.canRestoreFolderStructure).toBe(false);
    expect(result.info.malformedFolderMetadata).toBe(true);
    expect(result.info.folderGraphWarning).toContain('Duplicate');
  });

  it('no folder metadata (old bundle) → no malformed flag, just flat', () => {
    const manifest = {
      format: 'pkc2-folder-export-bundle',
      version: 1,
      exported_at: '2026-04-10T00:00:00Z',
      source_cid: 'cnt-test',
      source_folder_lid: 'f1',
      source_folder_title: 'Root',
      scope: 'recursive',
      text_count: 1,
      textlog_count: 0,
      compact: false,
      entries: [{ lid: 't1', title: 'Doc', archetype: 'text', filename: 'doc.text.zip', asset_count: 0, missing_asset_count: 0 }],
      // No folders array
    };
    const buf = buildFakeZip(manifest, [{ name: 'doc.text.zip', data: dummyNestedZip }]);
    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.canRestoreFolderStructure).toBe(false);
    expect(result.info.malformedFolderMetadata).toBeFalsy();
    expect(result.info.folderGraphWarning).toBeUndefined();
  });

  it('stores folderMetadata and entryFolderRefs for selection-aware reclassification', () => {
    const manifest = {
      format: 'pkc2-folder-export-bundle',
      version: 1,
      exported_at: '2026-04-10T00:00:00Z',
      source_cid: 'cnt-test',
      source_folder_lid: 'f1',
      source_folder_title: 'Root',
      scope: 'recursive',
      text_count: 2,
      textlog_count: 0,
      compact: false,
      entries: [
        { lid: 't1', title: 'Doc A', archetype: 'text', filename: 'a.text.zip', parent_folder_lid: 'f1', asset_count: 0, missing_asset_count: 0 },
        { lid: 't2', title: 'Doc B', archetype: 'text', filename: 'b.text.zip', parent_folder_lid: 'f2', asset_count: 0, missing_asset_count: 0 },
      ],
      folders: [
        { lid: 'f1', title: 'Root', parent_lid: null },
        { lid: 'f2', title: 'Sub', parent_lid: 'f1' },
      ],
    };
    const buf = buildFakeZip(manifest, [
      { name: 'a.text.zip', data: dummyNestedZip },
      { name: 'b.text.zip', data: dummyNestedZip },
    ]);
    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Raw folder metadata stored for reclassification
    expect(result.info.folderMetadata).toEqual([
      { lid: 'f1', title: 'Root', parentLid: null },
      { lid: 'f2', title: 'Sub', parentLid: 'f1' },
    ]);
    // Entry folder refs indexed by entry index
    expect(result.info.entryFolderRefs).toEqual(['f1', 'f2']);
  });

  it('no folderMetadata/entryFolderRefs when no folders in manifest', () => {
    const manifest = {
      format: 'pkc2-texts-container-bundle',
      version: 1,
      exported_at: '2026-04-10T00:00:00Z',
      source_cid: 'cnt-test',
      text_count: 1,
      textlog_count: 0,
      compact: false,
      entries: [
        { lid: 't1', title: 'Doc', archetype: 'text', filename: 'doc.text.zip', asset_count: 0, missing_asset_count: 0 },
      ],
    };
    const buf = buildFakeZip(manifest, [{ name: 'doc.text.zip', data: dummyNestedZip }]);
    const result = previewBatchBundleFromBuffer(buf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.info.folderMetadata).toBeUndefined();
    expect(result.info.entryFolderRefs).toBeUndefined();
  });

  it('entry referencing unknown folder → malformed at preview time (parity with confirm)', () => {
    const manifest = {
      format: 'pkc2-folder-export-bundle',
      version: 1,
      exported_at: '2026-04-10T00:00:00Z',
      source_cid: 'cnt-test',
      source_folder_lid: 'f1',
      source_folder_title: 'Root',
      scope: 'recursive',
      text_count: 1,
      textlog_count: 0,
      compact: false,
      entries: [{ lid: 't1', title: 'Doc', archetype: 'text', filename: 'doc.text.zip', parent_folder_lid: 'nonexistent', asset_count: 0, missing_asset_count: 0 }],
      folders: [{ lid: 'f1', title: 'Root', parent_lid: null }],
    };
    const buf = buildFakeZip(manifest, [{ name: 'doc.text.zip', data: dummyNestedZip }]);

    // Preview should detect the unknown reference
    const preview = previewBatchBundleFromBuffer(buf);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.info.canRestoreFolderStructure).toBe(false);
    expect(preview.info.malformedFolderMetadata).toBe(true);
    expect(preview.info.folderGraphWarning).toContain('unknown folder');

    // Verify confirm-path parity: planner uses same validateFolderGraph and rejects too
    const plannerInput = {
      entries: [{
        archetype: 'text' as const,
        title: 'Doc',
        body: '',
        parentFolderLid: 'nonexistent',
        attachments: [],
      }],
      folders: [{ lid: 'f1', title: 'Root', parentLid: null }],
      source: 'test.zip',
      format: 'pkc2-folder-export-bundle',
    };
    const planResult = buildBatchImportPlan(plannerInput, new Set([0]));
    // Confirm must also classify as fallback — no surprise restore
    expect(planResult.ok).toBe(false);
  });
});
