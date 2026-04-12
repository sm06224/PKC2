// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import {
  exportContainerAsZip,
  importContainerFromZip,
  buildPackageZip,
  importFromZipBuffer,
  createZipBytes,
  parseZip,
  toDosDateTime,
  fromDosDateTime,
  textToBytes,
} from '@adapter/platform/zip-package';
import type { Container } from '@core/model/container';

const T = '2026-04-06T00:00:00Z';

function createTestContainer(overrides?: Partial<Container>): Container {
  return {
    meta: {
      container_id: 'test-cid-001',
      title: 'Test Container',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [
      { lid: 'e1', title: 'Entry 1', body: 'Body 1', archetype: 'text', created_at: T, updated_at: T },
      { lid: 'e2', title: 'Entry 2', body: 'Body 2', archetype: 'todo', created_at: T, updated_at: T },
    ],
    relations: [
      { id: 'r1', from: 'e1', to: 'e2', kind: 'structural', created_at: T, updated_at: T },
    ],
    revisions: [],
    assets: {},
    ...overrides,
  };
}

describe('buildPackageZip', () => {
  it('creates a valid ZIP blob', () => {
    const c = createTestContainer();
    const blob = buildPackageZip(c);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('contains manifest.json and container.json', async () => {
    const c = createTestContainer();
    const blob = buildPackageZip(c);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer, 'test.pkc2.zip');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.format).toBe('pkc2-package');
    expect(result.manifest.version).toBe(1);
  });
});

describe('exportContainerAsZip', () => {
  it('returns success with filename and size', async () => {
    const downloadSpy = vi.fn();
    const c = createTestContainer();
    const result = await exportContainerAsZip(c, { downloadFn: downloadSpy });

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/^pkc2-test-container-\d{8}\.pkc2\.zip$/);
    expect(result.size).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it('calls download function with Blob and filename', async () => {
    const downloadSpy = vi.fn();
    const c = createTestContainer();
    await exportContainerAsZip(c, { downloadFn: downloadSpy });

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadSpy.mock.calls[0]!;
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toMatch(/\.pkc2\.zip$/);
  });

  it('accepts filename override', async () => {
    const downloadSpy = vi.fn();
    const c = createTestContainer();
    const result = await exportContainerAsZip(c, { filename: 'custom', downloadFn: downloadSpy });

    expect(result.filename).toBe('custom.pkc2.zip');
  });

  it('returns failure when download throws', async () => {
    const failFn = vi.fn(() => { throw new Error('disk full'); });
    const c = createTestContainer();
    const result = await exportContainerAsZip(c, { downloadFn: failFn });

    expect(result.success).toBe(false);
    expect(result.error).toContain('disk full');
  });
});

describe('ZIP manifest', () => {
  it('contains correct metadata', async () => {
    const c = createTestContainer({ assets: { 'ast-1': btoa('hello') } });
    const blob = buildPackageZip(c);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.format).toBe('pkc2-package');
    expect(result.manifest.version).toBe(1);
    expect(result.manifest.source_cid).toBe('test-cid-001');
    expect(result.manifest.entry_count).toBe(2);
    expect(result.manifest.relation_count).toBe(1);
    expect(result.manifest.revision_count).toBe(0);
    expect(result.manifest.asset_count).toBe(1);
    expect(result.manifest.exported_at).toBeTruthy();
  });
});

describe('importFromZipBuffer', () => {
  it('restores Container from ZIP with new cid', async () => {
    const c = createTestContainer();
    const blob = buildPackageZip(c);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // New cid assigned
    expect(result.container.meta.container_id).not.toBe('test-cid-001');

    // Content preserved
    expect(result.container.meta.title).toBe('Test Container');
    expect(result.container.entries).toHaveLength(2);
    expect(result.container.entries[0]!.lid).toBe('e1');
    expect(result.container.entries[0]!.title).toBe('Entry 1');
    expect(result.container.entries[0]!.body).toBe('Body 1');
    expect(result.container.relations).toHaveLength(1);
  });

  it('restores assets as base64', async () => {
    const assetData = btoa('Hello PKC2 Asset!');
    const c = createTestContainer({ assets: { 'ast-abc': assetData } });
    const blob = buildPackageZip(c);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.container.assets['ast-abc']).toBe(assetData);
  });

  it('restores multiple assets', async () => {
    const assets = {
      'ast-1': btoa('file one'),
      'ast-2': btoa('file two'),
      'ast-3': btoa('file three'),
    };
    const c = createTestContainer({ assets });
    const blob = buildPackageZip(c);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.container.assets)).toHaveLength(3);
    expect(result.container.assets['ast-1']).toBe(assets['ast-1']);
    expect(result.container.assets['ast-2']).toBe(assets['ast-2']);
    expect(result.container.assets['ast-3']).toBe(assets['ast-3']);
  });

  it('handles empty container', async () => {
    const c = createTestContainer({ entries: [], relations: [], revisions: [], assets: {} });
    const blob = buildPackageZip(c);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.container.entries).toEqual([]);
    expect(result.container.relations).toEqual([]);
    expect(result.container.assets).toEqual({});
  });

  it('preserves revisions', async () => {
    const c = createTestContainer({
      revisions: [
        { id: 'rev-1', entry_lid: 'e1', snapshot: '{"title":"old"}', created_at: T },
      ],
    });
    const blob = buildPackageZip(c);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.container.revisions).toHaveLength(1);
    expect(result.container.revisions[0]!.id).toBe('rev-1');
  });

  it('reports source filename', async () => {
    const c = createTestContainer();
    const blob = buildPackageZip(c);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer, 'my-package.pkc2.zip');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('my-package.pkc2.zip');
  });
});

describe('ZIP import validation', () => {
  it('rejects ZIP without manifest.json', async () => {
    // Create a minimal ZIP with only container.json
    const containerJson = JSON.stringify(createTestContainer());
    const blob = createMinimalZip([
      { name: 'container.json', data: containerJson },
    ]);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('manifest.json');
  });

  it('rejects ZIP without container.json', async () => {
    const manifest = JSON.stringify({ format: 'pkc2-package', version: 1 });
    const blob = createMinimalZip([
      { name: 'manifest.json', data: manifest },
    ]);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('container.json');
  });

  it('rejects ZIP with wrong format', async () => {
    const manifest = JSON.stringify({ format: 'not-pkc2', version: 1 });
    const container = JSON.stringify(createTestContainer());
    const blob = createMinimalZip([
      { name: 'manifest.json', data: manifest },
      { name: 'container.json', data: container },
    ]);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not-pkc2');
  });

  it('rejects ZIP with unsupported version', async () => {
    const manifest = JSON.stringify({ format: 'pkc2-package', version: 99 });
    const container = JSON.stringify(createTestContainer());
    const blob = createMinimalZip([
      { name: 'manifest.json', data: manifest },
      { name: 'container.json', data: container },
    ]);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('99');
  });

  it('rejects ZIP with invalid container (missing meta)', async () => {
    const manifest = JSON.stringify({ format: 'pkc2-package', version: 1 });
    const container = JSON.stringify({ entries: [], relations: [] });
    const blob = createMinimalZip([
      { name: 'manifest.json', data: manifest },
      { name: 'container.json', data: container },
    ]);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('meta');
  });

  it('rejects non-ZIP file', async () => {
    const file = new File(['not a zip file'], 'bad.zip', { type: 'application/zip' });
    const result = await importContainerFromZip(file);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });
});

describe('ZIP round-trip', () => {
  it('round-trips Container through export → import', async () => {
    const original = createTestContainer();
    const blob = buildPackageZip(original);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // New cid but content preserved
    expect(result.container.meta.title).toBe(original.meta.title);
    expect(result.container.entries).toEqual(original.entries);
    expect(result.container.relations).toEqual(original.relations);
    expect(result.container.revisions).toEqual(original.revisions);
    expect(result.container.assets).toEqual(original.assets);
  });

  it('round-trips Container with assets through export → import', async () => {
    const original = createTestContainer({
      assets: {
        'ast-doc': btoa('document content here'),
        'ast-img': btoa('fake image binary data'),
      },
    });
    const blob = buildPackageZip(original);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.container.assets).toEqual(original.assets);
  });

  it('round-trips large binary asset', async () => {
    // Create a large "binary" payload
    const bytes = new Uint8Array(10000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    const largeBase64 = btoa(binary);

    const original = createTestContainer({ assets: { 'ast-large': largeBase64 } });
    const blob = buildPackageZip(original);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.container.assets['ast-large']).toBe(largeBase64);
  });

  it('imported container is independently editable', async () => {
    const original = createTestContainer();
    const blob = buildPackageZip(original);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // New cid means it's an independent workspace
    expect(result.container.meta.container_id).not.toBe(original.meta.container_id);

    // Can modify entries (basic editability check)
    const modified = {
      ...result.container,
      entries: [...result.container.entries, {
        lid: 'e-new', title: 'New', body: '', archetype: 'text' as const,
        created_at: T, updated_at: T,
      }],
    };
    expect(modified.entries).toHaveLength(3);
  });

  it('round-trips Container with special characters', async () => {
    const original = createTestContainer({
      entries: [
        {
          lid: 'e1',
          title: 'Test </script> & "quotes" and 日本語',
          body: 'Body with <b>html</b> & entities\nand newlines',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    const blob = buildPackageZip(original);
    const buffer = await blob.arrayBuffer();
    const result = await importFromZipBuffer(buffer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.container.entries[0]!.title).toBe('Test </script> & "quotes" and 日本語');
    expect(result.container.entries[0]!.body).toBe('Body with <b>html</b> & entities\nand newlines');
  });
});

// ── Helper: create minimal ZIP for validation tests ────────────────────

function createMinimalZip(entries: { name: string; data: string }[]): Blob {
  // Reuse the same ZIP creation logic via buildPackageZip indirectly
  // But we need to create a ZIP with specific files for validation tests
  // So we implement a tiny ZIP builder here

  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = encoder.encode(entry.data);
    const crc = simpleCrc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);

    parts.push(local, dataBytes);
    centralDir.push(cd);
    offset += local.length + dataBytes.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) {
    parts.push(cd);
    cdSize += cd.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  parts.push(eocd);

  return new Blob(parts as BlobPart[], { type: 'application/zip' });
}

function simpleCrc32(data: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]!) & 0xFF]! ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── P0-2: DOS date/time encoding regression guards ──

describe('DOS date/time encoding', () => {
  it('encodes a specific Date and round-trips with 2-second precision', () => {
    // ZIP stores seconds in 2-second increments, so odd seconds round down.
    const original = new Date(2026, 3, 12, 14, 37, 20); // 2026-04-12 14:37:20 local
    const { time, date } = toDosDateTime(original);
    const decoded = fromDosDateTime(time, date);
    expect(decoded.getFullYear()).toBe(2026);
    expect(decoded.getMonth()).toBe(3);
    expect(decoded.getDate()).toBe(12);
    expect(decoded.getHours()).toBe(14);
    expect(decoded.getMinutes()).toBe(37);
    expect(decoded.getSeconds()).toBe(20);
  });

  it('rounds odd seconds down to the nearest even second (ZIP spec)', () => {
    const original = new Date(2026, 0, 1, 0, 0, 5); // seconds=5 → 4
    const { time, date } = toDosDateTime(original);
    const decoded = fromDosDateTime(time, date);
    expect(decoded.getSeconds()).toBe(4);
  });

  it('clamps years below 1980 to the DOS epoch', () => {
    const original = new Date(1970, 5, 15, 12, 0, 0);
    const { time, date } = toDosDateTime(original);
    const decoded = fromDosDateTime(time, date);
    expect(decoded.getFullYear()).toBe(1980);
  });

  it('clamps years above 2107 to the DOS ceiling', () => {
    const original = new Date(2200, 5, 15, 12, 0, 0);
    const { time, date } = toDosDateTime(original);
    const decoded = fromDosDateTime(time, date);
    expect(decoded.getFullYear()).toBe(2107);
  });

  it('(0, 0) decodes to DOS epoch 1980-01-01 (legacy ZIP compatibility)', () => {
    const d = fromDosDateTime(0, 0);
    expect(d.getFullYear()).toBe(1980);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });
});

describe('createZipBytes timestamp stamping (P0-2)', () => {
  it('writes the entry mtime into the ZIP (regression guard for hardcoded zero)', () => {
    const mtime = new Date(2026, 3, 12, 9, 30, 0);
    const bytes = createZipBytes([
      { name: 'sample.txt', data: textToBytes('hello'), mtime },
    ]);
    const parsed = parseZip(bytes);
    expect(parsed).toHaveLength(1);
    // Precision is 2s; minute granularity is exact.
    expect(parsed[0]!.mtime.getFullYear()).toBe(2026);
    expect(parsed[0]!.mtime.getMonth()).toBe(3);
    expect(parsed[0]!.mtime.getDate()).toBe(12);
    expect(parsed[0]!.mtime.getHours()).toBe(9);
    expect(parsed[0]!.mtime.getMinutes()).toBe(30);
  });

  it('defaults missing mtime to the current time (not 1980-01-01)', () => {
    const before = Date.now();
    const bytes = createZipBytes([
      { name: 'nostamp.txt', data: textToBytes('x') },
    ]);
    const after = Date.now();
    const parsed = parseZip(bytes);
    const stamped = parsed[0]!.mtime.getTime();
    // 2-second rounding can push the stamp slightly below `before`, so
    // give a 2-second floor.
    expect(stamped).toBeGreaterThanOrEqual(before - 2000);
    expect(stamped).toBeLessThanOrEqual(after + 1000);
    // And definitely not the DOS epoch.
    expect(parsed[0]!.mtime.getFullYear()).toBeGreaterThan(2000);
  });

  it('all default-stamped entries in a single archive share the same mtime', () => {
    // Captured once per archive in createZipBytes, so two entries written
    // in the same call must match.
    const bytes = createZipBytes([
      { name: 'a.txt', data: textToBytes('a') },
      { name: 'b.txt', data: textToBytes('b') },
    ]);
    const parsed = parseZip(bytes);
    expect(parsed[0]!.mtime.getTime()).toBe(parsed[1]!.mtime.getTime());
  });
});

describe('buildPackageZip timestamp stamping (P0-2)', () => {
  it('stamps manifest.json, container.json and assets with the export time', async () => {
    const container = createTestContainer({
      assets: { 'ast-1': 'aGVsbG8=' }, // base64 "hello"
    });
    const before = Date.now();
    const blob = buildPackageZip(container);
    const after = Date.now();
    const parsed = parseZip(new Uint8Array(await blob.arrayBuffer()));
    expect(parsed.length).toBeGreaterThanOrEqual(3);
    for (const e of parsed) {
      const t = e.mtime.getTime();
      expect(t).toBeGreaterThanOrEqual(before - 2000);
      expect(t).toBeLessThanOrEqual(after + 1000);
      expect(e.mtime.getFullYear()).toBeGreaterThan(2000);
    }
  });
});

describe('compression mode audit (P0-2)', () => {
  it('every entry uses ZIP method 0 (stored) — documented & intentional', async () => {
    const container = createTestContainer();
    const blob = buildPackageZip(container);
    const data = new Uint8Array(await blob.arrayBuffer());
    // Scan local file headers for method at offset +8.
    // Local file header signature = 0x04034b50.
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let checked = 0;
    for (let i = 0; i < data.length - 4; i++) {
      if (view.getUint32(i, true) === 0x04034b50) {
        const method = view.getUint16(i + 8, true);
        expect(method).toBe(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
