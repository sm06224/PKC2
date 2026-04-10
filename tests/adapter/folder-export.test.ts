// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  buildFolderExportBundle,
  type FolderExportManifest,
} from '@adapter/platform/folder-export';
import type { TextBundleManifest } from '@adapter/platform/text-bundle';
import type { TextlogBundleManifest } from '@adapter/platform/textlog-bundle';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

const T = '2026-04-09T10:00:00.000Z';

// ── helpers ────────────────────────

function makeContainer(overrides?: Partial<Container>): Container {
  return {
    meta: {
      container_id: 'cnt-test-folder-001',
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

function makeRelation(id: string, from: string, to: string): Relation {
  return { id, from, to, kind: 'structural', created_at: T, updated_at: T };
}

function makeTextlogBody(entries: { id: string; text: string }[]): string {
  return JSON.stringify({ entries: entries.map((e) => ({ ...e, created_at: T })) });
}

/**
 * Parse ZIP entries from a Uint8Array — test-level helper matching
 * the one in text-bundle.test.ts and textlog-bundle.test.ts.
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

// ── tests ────────────────────────

describe('buildFolderExportBundle', () => {
  it('produces a valid outer ZIP with manifest + nested bundles for folder descendants', async () => {
    const folder = makeEntry('f1', 'My Folder', 'folder');
    const text1 = makeEntry('t1', 'Doc A', 'text', 'Hello world');
    const text2 = makeEntry('t2', 'Doc B', 'text', 'Goodbye world');
    const container = makeContainer({
      entries: [folder, text1, text2],
      relations: [makeRelation('r1', 'f1', 't1'), makeRelation('r2', 'f1', 't2')],
    });
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildFolderExportBundle(folder, container, { now });
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.filename).toMatch(/^folder-.*\.folder-export\.zip$/);

    // Parse the outer ZIP
    const outerBytes = new Uint8Array(await result.blob.arrayBuffer());
    const outerEntries = parseZipBytes(outerBytes);

    // manifest + 2 inner .text.zip
    expect(outerEntries.size).toBe(3);
    expect(outerEntries.has('manifest.json')).toBe(true);

    // Verify manifest
    const manifest = JSON.parse(
      new TextDecoder().decode(outerEntries.get('manifest.json')!),
    ) as FolderExportManifest;
    expect(manifest.format).toBe('pkc2-folder-export-bundle');
    expect(manifest.version).toBe(1);
    expect(manifest.scope).toBe('recursive');
    expect(manifest.source_folder_lid).toBe('f1');
    expect(manifest.source_folder_title).toBe('My Folder');
    expect(manifest.text_count).toBe(2);
    expect(manifest.textlog_count).toBe(0);
    expect(manifest.entries).toHaveLength(2);
  });

  it('includes both TEXT and TEXTLOG entries', async () => {
    const folder = makeEntry('f1', 'Mixed', 'folder');
    const text = makeEntry('t1', 'Doc', 'text', 'hello');
    const log = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({
      entries: [folder, text, log],
      relations: [makeRelation('r1', 'f1', 't1'), makeRelation('r2', 'f1', 'l1')],
    });

    const result = buildFolderExportBundle(folder, container);
    expect(result.manifest.text_count).toBe(1);
    expect(result.manifest.textlog_count).toBe(1);
    expect(result.manifest.entries).toHaveLength(2);
    expect(result.manifest.entries[0]!.archetype).toBe('text');
    expect(result.manifest.entries[1]!.archetype).toBe('textlog');
  });

  it('nested ZIPs are valid and can be parsed individually', async () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const text = makeEntry('t1', 'Doc', 'text', 'Content here');
    const container = makeContainer({
      entries: [folder, text],
      relations: [makeRelation('r1', 'f1', 't1')],
    });
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildFolderExportBundle(folder, container, { now });
    const outerBytes = new Uint8Array(await result.blob.arrayBuffer());
    const outerEntries = parseZipBytes(outerBytes);

    const innerName = result.manifest.entries[0]!.filename;
    const innerBytes = outerEntries.get(innerName)!;
    const innerEntries = parseZipBytes(innerBytes);
    expect(innerEntries.has('manifest.json')).toBe(true);
    expect(innerEntries.has('body.md')).toBe(true);

    const innerManifest = JSON.parse(
      new TextDecoder().decode(innerEntries.get('manifest.json')!),
    ) as TextBundleManifest;
    expect(innerManifest.format).toBe('pkc2-text-bundle');
    expect(innerManifest.source_lid).toBe('t1');
  });

  it('collects recursive descendants (not just direct children)', () => {
    const root = makeEntry('f-root', 'Root', 'folder');
    const sub = makeEntry('f-sub', 'Sub', 'folder');
    const leaf = makeEntry('t-leaf', 'Leaf', 'text', 'deep');
    const container = makeContainer({
      entries: [root, sub, leaf],
      relations: [
        makeRelation('r1', 'f-root', 'f-sub'),
        makeRelation('r2', 'f-sub', 't-leaf'),
      ],
    });

    const result = buildFolderExportBundle(root, container);
    expect(result.manifest.text_count).toBe(1);
    expect(result.manifest.entries).toHaveLength(1);
    expect(result.manifest.entries[0]!.lid).toBe('t-leaf');
  });

  it('excludes entries outside the folder scope', () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const inside = makeEntry('t1', 'Inside', 'text', 'in');
    const outside = makeEntry('t2', 'Outside', 'text', 'out');
    const container = makeContainer({
      entries: [folder, inside, outside],
      relations: [makeRelation('r1', 'f1', 't1')],
      // t2 has no relation to f1
    });

    const result = buildFolderExportBundle(folder, container);
    expect(result.manifest.text_count).toBe(1);
    expect(result.manifest.entries).toHaveLength(1);
    expect(result.manifest.entries[0]!.lid).toBe('t1');
  });

  it('excludes non-text and non-textlog archetypes', () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const text = makeEntry('t1', 'Doc', 'text', 'hello');
    const todo = makeEntry('td1', 'Task', 'todo', '{"status":"open","description":"test"}');
    const att = makeEntry('a1', 'File', 'attachment', '{"name":"f","mime":"x/y","asset_key":"k"}');
    const container = makeContainer({
      entries: [folder, text, todo, att],
      relations: [
        makeRelation('r1', 'f1', 't1'),
        makeRelation('r2', 'f1', 'td1'),
        makeRelation('r3', 'f1', 'a1'),
      ],
    });

    const result = buildFolderExportBundle(folder, container);
    expect(result.manifest.text_count).toBe(1);
    expect(result.manifest.textlog_count).toBe(0);
    expect(result.manifest.entries).toHaveLength(1);
  });

  it('handles folder with zero exportable descendants gracefully', () => {
    const folder = makeEntry('f1', 'Empty', 'folder');
    const todo = makeEntry('td1', 'Task', 'todo', '{"status":"open","description":"x"}');
    const container = makeContainer({
      entries: [folder, todo],
      relations: [makeRelation('r1', 'f1', 'td1')],
    });

    const result = buildFolderExportBundle(folder, container);
    expect(result.manifest.text_count).toBe(0);
    expect(result.manifest.textlog_count).toBe(0);
    expect(result.manifest.entries).toEqual([]);
    expect(result.blob.size).toBeGreaterThan(0); // still a valid ZIP (manifest only)
  });

  it('deduplicates filenames with -2, -3 suffixes', () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const t1 = makeEntry('t1', 'Same', 'text', 'a');
    const t2 = makeEntry('t2', 'Same', 'text', 'b');
    const t3 = makeEntry('t3', 'Same', 'text', 'c');
    const container = makeContainer({
      entries: [folder, t1, t2, t3],
      relations: [
        makeRelation('r1', 'f1', 't1'),
        makeRelation('r2', 'f1', 't2'),
        makeRelation('r3', 'f1', 't3'),
      ],
    });
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildFolderExportBundle(folder, container, { now });
    const filenames = result.manifest.entries.map((e) => e.filename);
    expect(new Set(filenames).size).toBe(3);
    expect(filenames[0]).toBe('same-20260410.text.zip');
    expect(filenames[1]).toBe('same-20260410-2.text.zip');
    expect(filenames[2]).toBe('same-20260410-3.text.zip');
  });

  it('reports totalMissingAssetCount across all bundles', () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const t1 = makeEntry('t1', 'Doc A', 'text', '![](asset:ast-gone-1)');
    const t2 = makeEntry('t2', 'Doc B', 'text', '![](asset:ast-gone-2) ![](asset:ast-gone-3)');
    const container = makeContainer({
      entries: [folder, t1, t2],
      relations: [makeRelation('r1', 'f1', 't1'), makeRelation('r2', 'f1', 't2')],
    });

    const result = buildFolderExportBundle(folder, container);
    expect(result.totalMissingAssetCount).toBe(3);
    expect(result.manifest.entries[0]!.missing_asset_count).toBe(1);
    expect(result.manifest.entries[1]!.missing_asset_count).toBe(2);
  });

  it('passes compact flag through to inner bundles', () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const t1 = makeEntry('t1', 'Doc', 'text', '![](asset:ast-gone)');
    const container = makeContainer({
      entries: [folder, t1],
      relations: [makeRelation('r1', 'f1', 't1')],
    });

    const plain = buildFolderExportBundle(folder, container, { compact: false });
    expect(plain.manifest.compact).toBe(false);

    const compacted = buildFolderExportBundle(folder, container, { compact: true });
    expect(compacted.manifest.compact).toBe(true);
  });

  it('does not mutate container, entries, or relations', () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const t1 = makeEntry('t1', 'Doc', 'text', '![](asset:ast-gone)');
    const container = makeContainer({
      entries: [folder, t1],
      relations: [makeRelation('r1', 'f1', 't1')],
    });
    const bodyBefore = t1.body;
    const entriesBefore = container.entries.length;
    const relationsBefore = container.relations.length;
    const assetsBefore = JSON.stringify(container.assets);

    buildFolderExportBundle(folder, container, { compact: true });

    expect(t1.body).toBe(bodyBefore);
    expect(container.entries.length).toBe(entriesBefore);
    expect(container.relations.length).toBe(relationsBefore);
    expect(JSON.stringify(container.assets)).toBe(assetsBefore);
  });

  it('outer filename follows folder-<slug>-<yyyymmdd>.folder-export.zip convention', () => {
    const folder = makeEntry('f1', 'My Project', 'folder');
    const container = makeContainer({
      entries: [folder],
      relations: [],
    });
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildFolderExportBundle(folder, container, { now });
    expect(result.filename).toBe('folder-my-project-20260410.folder-export.zip');
  });

  it('records correct body_length for TEXT and log_entry_count for TEXTLOG', () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const text = makeEntry('t1', 'Doc', 'text', 'hello world');
    const log = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([
      { id: 'log-1', text: 'a' },
      { id: 'log-2', text: 'b' },
    ]));
    const container = makeContainer({
      entries: [folder, text, log],
      relations: [makeRelation('r1', 'f1', 't1'), makeRelation('r2', 'f1', 'l1')],
    });

    const result = buildFolderExportBundle(folder, container);
    const textEntry = result.manifest.entries.find((e) => e.archetype === 'text');
    const logEntry = result.manifest.entries.find((e) => e.archetype === 'textlog');
    expect(textEntry!.body_length).toBe('hello world'.length);
    expect(logEntry!.log_entry_count).toBe(2);
  });

  it('TEXTLOG nested ZIPs contain textlog.csv', async () => {
    const folder = makeEntry('f1', 'Folder', 'folder');
    const log = makeEntry('l1', 'Log', 'textlog', makeTextlogBody([{ id: 'x', text: 'hi' }]));
    const container = makeContainer({
      entries: [folder, log],
      relations: [makeRelation('r1', 'f1', 'l1')],
    });
    const now = new Date('2026-04-10T00:00:00Z');

    const result = buildFolderExportBundle(folder, container, { now });
    const outerBytes = new Uint8Array(await result.blob.arrayBuffer());
    const outerEntries = parseZipBytes(outerBytes);

    const innerName = result.manifest.entries[0]!.filename;
    const innerBytes = outerEntries.get(innerName)!;
    const innerEntries = parseZipBytes(innerBytes);
    expect(innerEntries.has('manifest.json')).toBe(true);
    expect(innerEntries.has('textlog.csv')).toBe(true);

    const innerManifest = JSON.parse(
      new TextDecoder().decode(innerEntries.get('manifest.json')!),
    ) as TextlogBundleManifest;
    expect(innerManifest.format).toBe('pkc2-textlog-bundle');
  });

  // ── folder hierarchy metadata tests ──────────────────

  it('manifest includes folders array with root folder', () => {
    const folder = makeEntry('f1', 'Root', 'folder');
    const text = makeEntry('t1', 'Doc', 'text', 'hello');
    const container = makeContainer({
      entries: [folder, text],
      relations: [makeRelation('r1', 'f1', 't1')],
    });

    const result = buildFolderExportBundle(folder, container);
    expect(result.manifest.folders).toBeDefined();
    expect(result.manifest.folders).toHaveLength(1);
    expect(result.manifest.folders![0]).toEqual({
      lid: 'f1', title: 'Root', parent_lid: null,
    });
  });

  it('manifest includes subfolder hierarchy', () => {
    const root = makeEntry('f1', 'Root', 'folder');
    const sub = makeEntry('f2', 'Sub', 'folder');
    const text = makeEntry('t1', 'Doc', 'text', 'hello');
    const container = makeContainer({
      entries: [root, sub, text],
      relations: [
        makeRelation('r1', 'f1', 'f2'),
        makeRelation('r2', 'f2', 't1'),
      ],
    });

    const result = buildFolderExportBundle(root, container);
    expect(result.manifest.folders).toHaveLength(2);
    expect(result.manifest.folders![0]).toEqual({
      lid: 'f1', title: 'Root', parent_lid: null,
    });
    expect(result.manifest.folders![1]).toEqual({
      lid: 'f2', title: 'Sub', parent_lid: 'f1',
    });
  });

  it('entries include parent_folder_lid', () => {
    const root = makeEntry('f1', 'Root', 'folder');
    const sub = makeEntry('f2', 'Sub', 'folder');
    const t1 = makeEntry('t1', 'Doc A', 'text', 'a');
    const t2 = makeEntry('t2', 'Doc B', 'text', 'b');
    const container = makeContainer({
      entries: [root, sub, t1, t2],
      relations: [
        makeRelation('r1', 'f1', 'f2'),
        makeRelation('r2', 'f1', 't1'),
        makeRelation('r3', 'f2', 't2'),
      ],
    });

    const result = buildFolderExportBundle(root, container);
    const entryA = result.manifest.entries.find((e) => e.title === 'Doc A');
    const entryB = result.manifest.entries.find((e) => e.title === 'Doc B');
    expect(entryA!.parent_folder_lid).toBe('f1');
    expect(entryB!.parent_folder_lid).toBe('f2');
  });

  it('deep nested folder hierarchy is preserved', () => {
    const root = makeEntry('f1', 'Root', 'folder');
    const sub1 = makeEntry('f2', 'Level 1', 'folder');
    const sub2 = makeEntry('f3', 'Level 2', 'folder');
    const text = makeEntry('t1', 'Deep Doc', 'text', 'deep');
    const container = makeContainer({
      entries: [root, sub1, sub2, text],
      relations: [
        makeRelation('r1', 'f1', 'f2'),
        makeRelation('r2', 'f2', 'f3'),
        makeRelation('r3', 'f3', 't1'),
      ],
    });

    const result = buildFolderExportBundle(root, container);
    expect(result.manifest.folders).toHaveLength(3);
    expect(result.manifest.folders![2]).toEqual({
      lid: 'f3', title: 'Level 2', parent_lid: 'f2',
    });
    const entry = result.manifest.entries[0]!;
    expect(entry.parent_folder_lid).toBe('f3');
  });
});
