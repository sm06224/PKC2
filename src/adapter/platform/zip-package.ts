/**
 * PKC2 Package ZIP: lossless portable format for Container data.
 *
 * ZIP structure:
 *   manifest.json       — package metadata
 *   container.json      — Container (meta, entries, relations, revisions; assets: {})
 *   assets/<key>.bin    — raw binary asset data (base64 decoded)
 *
 * Design decisions:
 * - No external ZIP library: uses minimal ZIP implementation (stored mode)
 * - Assets stored as raw binary (base64 decoded) for interoperability
 * - ZIP "stored" mode (no internal compression) — simple, correct, extensible
 * - Import assigns a new cid to avoid collision with existing Workspaces
 * - manifest provides metadata for validation without parsing container.json
 *
 * This module lives in adapter/platform/ because:
 * - Uses Blob/File APIs (browser)
 * - Must NOT be imported by core/
 */

import type { Container } from '../../core/model/container';

// ── Types ────────────────────────

export interface PackageManifest {
  format: 'pkc2-package';
  version: 1;
  exported_at: string;
  source_cid: string;
  entry_count: number;
  relation_count: number;
  revision_count: number;
  asset_count: number;
}

export interface ZipExportResult {
  success: boolean;
  filename: string;
  size: number;
  error?: string;
}

export interface ZipImportSuccess {
  ok: true;
  container: Container;
  manifest: PackageManifest;
  source: string;
}

export interface ZipImportFailure {
  ok: false;
  error: string;
}

export type ZipImportResult = ZipImportSuccess | ZipImportFailure;

// ── Export ────────────────────────

/**
 * Export a Container as a PKC2 Package ZIP.
 * Downloads the ZIP file via Blob URL.
 */
export async function exportContainerAsZip(
  container: Container,
  options?: { filename?: string; downloadFn?: (blob: Blob, filename: string) => void },
): Promise<ZipExportResult> {
  try {
    const manifest: PackageManifest = {
      format: 'pkc2-package',
      version: 1,
      exported_at: new Date().toISOString(),
      source_cid: container.meta.container_id,
      entry_count: container.entries.length,
      relation_count: container.relations.length,
      revision_count: container.revisions.length,
      asset_count: Object.keys(container.assets).length,
    };

    // Container without assets (assets go to separate files)
    const containerForZip: Container = { ...container, assets: {} };

    // Build ZIP entries
    const zipEntries: ZipEntry[] = [
      { name: 'manifest.json', data: textToBytes(JSON.stringify(manifest, null, 2)) },
      { name: 'container.json', data: textToBytes(JSON.stringify(containerForZip, null, 2)) },
    ];

    // Add assets as raw binary
    for (const [key, base64Data] of Object.entries(container.assets)) {
      const binary = base64ToBytes(base64Data);
      zipEntries.push({ name: `assets/${key}.bin`, data: binary });
    }

    const zipBlob = createZipBlob(zipEntries);
    const filename = options?.filename
      ? `${options.filename}.pkc2.zip`
      : generateZipFilename(container);

    const download = options?.downloadFn ?? triggerZipDownload;
    download(zipBlob, filename);

    return {
      success: true,
      filename,
      size: zipBlob.size,
    };
  } catch (e) {
    return {
      success: false,
      filename: '',
      size: 0,
      error: String(e),
    };
  }
}

// ── Import ────────────────────────

/**
 * Import a PKC2 Package ZIP from a File.
 * Returns the restored Container with a new cid.
 */
export async function importContainerFromZip(file: File): Promise<ZipImportResult> {
  try {
    const buffer = await file.arrayBuffer();
    const entries = parseZip(new Uint8Array(buffer));

    // 1. Read and validate manifest
    const manifestEntry = entries.find((e) => e.name === 'manifest.json');
    if (!manifestEntry) {
      return { ok: false, error: 'Missing manifest.json in ZIP' };
    }
    const manifest = JSON.parse(bytesToText(manifestEntry.data)) as Partial<PackageManifest>;
    if (manifest.format !== 'pkc2-package') {
      return { ok: false, error: `Invalid format: expected "pkc2-package", got "${manifest.format}"` };
    }
    if (manifest.version !== 1) {
      return { ok: false, error: `Unsupported version: ${manifest.version}` };
    }

    // 2. Read container
    const containerEntry = entries.find((e) => e.name === 'container.json');
    if (!containerEntry) {
      return { ok: false, error: 'Missing container.json in ZIP' };
    }
    const container = JSON.parse(bytesToText(containerEntry.data)) as Container;

    // 3. Validate minimum container shape
    if (!container.meta?.container_id || !container.meta?.title) {
      return { ok: false, error: 'Invalid container: missing meta fields' };
    }
    if (!Array.isArray(container.entries)) {
      return { ok: false, error: 'Invalid container: missing entries array' };
    }
    if (!Array.isArray(container.relations)) {
      return { ok: false, error: 'Invalid container: missing relations array' };
    }

    // 4. Read assets
    const assets: Record<string, string> = {};
    const assetPrefix = 'assets/';
    for (const entry of entries) {
      if (entry.name.startsWith(assetPrefix) && entry.name.endsWith('.bin')) {
        const key = entry.name.slice(assetPrefix.length, -4); // strip "assets/" and ".bin"
        assets[key] = bytesToBase64(entry.data);
      }
    }

    // 5. Reassemble container with assets and new cid
    const newCid = generateCid();
    const now = new Date().toISOString();
    const restored: Container = {
      ...container,
      meta: {
        ...container.meta,
        container_id: newCid,
        updated_at: now,
      },
      assets,
      revisions: Array.isArray(container.revisions) ? container.revisions : [],
    };

    return {
      ok: true,
      container: restored,
      manifest: manifest as PackageManifest,
      source: file.name,
    };
  } catch (e) {
    return { ok: false, error: `ZIP import failed: ${String(e)}` };
  }
}

/**
 * Build a PKC2 Package ZIP as a Blob (for testing without download).
 */
export function buildPackageZip(container: Container): Blob {
  const manifest: PackageManifest = {
    format: 'pkc2-package',
    version: 1,
    exported_at: new Date().toISOString(),
    source_cid: container.meta.container_id,
    entry_count: container.entries.length,
    relation_count: container.relations.length,
    revision_count: container.revisions.length,
    asset_count: Object.keys(container.assets).length,
  };

  const containerForZip: Container = { ...container, assets: {} };

  const zipEntries: ZipEntry[] = [
    { name: 'manifest.json', data: textToBytes(JSON.stringify(manifest, null, 2)) },
    { name: 'container.json', data: textToBytes(JSON.stringify(containerForZip, null, 2)) },
  ];

  for (const [key, base64Data] of Object.entries(container.assets)) {
    zipEntries.push({ name: `assets/${key}.bin`, data: base64ToBytes(base64Data) });
  }

  return createZipBlob(zipEntries);
}

/**
 * Import from a raw ArrayBuffer (for testing without File).
 */
export async function importFromZipBuffer(
  buffer: ArrayBuffer,
  source = 'buffer',
): Promise<ZipImportResult> {
  const file = new File([buffer], source, { type: 'application/zip' });
  return importContainerFromZip(file);
}

// ── Minimal ZIP Implementation (Stored Mode) ────────────────────────

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

interface ParsedZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Create a ZIP file as a Blob using stored mode (no compression).
 *
 * ZIP format reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 * Uses method 0 (stored) — no compression, simplest possible implementation.
 */
function createZipBlob(entries: ZipEntry[]): Blob {
  const parts: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = textToBytes(entry.name);
    const crc = crc32(entry.data);

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);   // signature
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(6, 0, true);             // flags
    lv.setUint16(8, 0, true);             // method: stored
    lv.setUint16(10, 0, true);            // mod time
    lv.setUint16(12, 0, true);            // mod date
    lv.setUint32(14, crc, true);          // crc-32
    lv.setUint32(18, entry.data.length, true); // compressed size
    lv.setUint32(22, entry.data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);  // name length
    lv.setUint16(28, 0, true);            // extra field length
    localHeader.set(nameBytes, 30);

    // Central directory entry (46 bytes + name)
    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdEntry.buffer);
    cv.setUint32(0, 0x02014b50, true);    // signature
    cv.setUint16(4, 20, true);            // version made by
    cv.setUint16(6, 20, true);            // version needed
    cv.setUint16(8, 0, true);             // flags
    cv.setUint16(10, 0, true);            // method: stored
    cv.setUint16(12, 0, true);            // mod time
    cv.setUint16(14, 0, true);            // mod date
    cv.setUint32(16, crc, true);          // crc-32
    cv.setUint32(20, entry.data.length, true); // compressed size
    cv.setUint32(24, entry.data.length, true); // uncompressed size
    cv.setUint16(28, nameBytes.length, true);  // name length
    cv.setUint16(30, 0, true);            // extra field length
    cv.setUint16(32, 0, true);            // comment length
    cv.setUint16(34, 0, true);            // disk start
    cv.setUint16(36, 0, true);            // internal attr
    cv.setUint32(38, 0, true);            // external attr
    cv.setUint32(42, offset, true);       // local header offset
    cdEntry.set(nameBytes, 46);

    parts.push(localHeader, entry.data);
    centralDirectory.push(cdEntry);
    offset += localHeader.length + entry.data.length;
  }

  // Central directory
  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDirectory) {
    parts.push(cd);
    cdSize += cd.length;
  }

  // End of central directory (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);     // signature
  ev.setUint16(4, 0, true);              // disk number
  ev.setUint16(6, 0, true);              // cd disk
  ev.setUint16(8, entries.length, true);  // entries on disk
  ev.setUint16(10, entries.length, true); // total entries
  ev.setUint32(12, cdSize, true);         // cd size
  ev.setUint32(16, cdOffset, true);       // cd offset
  ev.setUint16(20, 0, true);             // comment length
  parts.push(eocd);

  return new Blob(parts as BlobPart[], { type: 'application/zip' });
}

/**
 * Parse a ZIP file from a Uint8Array. Supports stored mode (method 0).
 */
function parseZip(data: Uint8Array): ParsedZipEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const entries: ParsedZipEntry[] = [];

  // Find end of central directory (scan from end)
  let eocdOffset = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP: end of central directory not found');
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  // Parse central directory
  let pos = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) {
      throw new Error('Invalid ZIP: bad central directory signature');
    }

    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);

    const nameBytes = data.subarray(pos + 46, pos + 46 + nameLen);
    const name = bytesToText(nameBytes);

    // Read file data from local header
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const fileData = data.subarray(dataStart, dataStart + compressedSize);

    if (method !== 0) {
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}. Only stored (0) is supported.`);
    }

    entries.push({ name, data: new Uint8Array(fileData) });

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

// ── CRC-32 ────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xFF]! ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Helpers ────────────────────────

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function generateCid(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\u3000-\u9fff\uff00-\uffef]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'untitled';
}

function formatDateCompact(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function generateZipFilename(container: Container): string {
  const slug = slugify(container.meta.title || container.meta.container_id);
  const date = formatDateCompact(new Date());
  return `pkc2-${slug}-${date}.pkc2.zip`;
}

function triggerZipDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
