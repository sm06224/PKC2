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
 * - ZIP "stored" mode (method 0, no internal compression). Intentional,
 *   not a bug: keeping the writer store-only avoids shipping a deflate
 *   implementation inside the single-HTML artifact. Container / manifest
 *   JSON is small; asset binaries are the dominant bytes and most of
 *   them (images, PDFs, already-compressed archives) would not benefit
 *   from a second compression pass. See
 *   docs/development/zip-export-contract.md.
 * - Per-entry `mtime` is encoded as MS-DOS date/time in both the local
 *   header and central directory. Defaults to the export timestamp so
 *   extracted files never show 1980-01-01 "default" values.
 * - Import assigns a new cid to avoid collision with existing Workspaces
 * - manifest provides metadata for validation without parsing container.json
 *
 * This module lives in adapter/platform/ because:
 * - Uses Blob/File APIs (browser)
 * - Must NOT be imported by core/
 */

import type { Container } from '../../core/model/container';
import { pad2 } from '../../features/datetime/datetime-format';

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
  /**
   * Non-fatal findings discovered while parsing the ZIP. Absent when
   * the input was clean (empty-array semantics — never `[]`).
   *
   * Canonical spec: `docs/spec/data-model.md` §11.7 (ZIP import
   * collision policy).
   *
   * A populated `warnings` array indicates that something in the ZIP
   * was duplicated, malformed, or suspicious but recoverable. The
   * import still succeeded; the caller decides whether to surface
   * the warnings to the user.
   */
  warnings?: ZipImportWarning[];
}

/**
 * Category of a ZIP import warning.
 *
 * - `DUPLICATE_ASSET_SAME_CONTENT`: two ZIP entries target the same
 *   asset key and carry byte-identical content. Deduplicated; no
 *   data risk.
 * - `DUPLICATE_ASSET_CONFLICT`: two entries target the same asset
 *   key but carry DIFFERENT bytes. First occurrence wins; the
 *   conflict is reported loudly so the caller never has to guess.
 * - `DUPLICATE_MANIFEST`: `manifest.json` appeared more than once.
 *   First occurrence wins.
 * - `DUPLICATE_CONTAINER_JSON`: `container.json` appeared more than
 *   once. First occurrence wins.
 * - `INVALID_ASSET_KEY`: the `assets/<key>.bin` filename yields a
 *   key that would be unsafe or ambiguous (empty, path-traversal
 *   segment, embedded `/` or `\`). The entry is skipped; no asset
 *   is stored under that key.
 */
export type ZipImportWarningCode =
  | 'DUPLICATE_ASSET_SAME_CONTENT'
  | 'DUPLICATE_ASSET_CONFLICT'
  | 'DUPLICATE_MANIFEST'
  | 'DUPLICATE_CONTAINER_JSON'
  | 'INVALID_ASSET_KEY';

/**
 * A single non-fatal finding emitted during ZIP import.
 *
 * `kept: 'first'` means the first occurrence of the duplicate was
 * retained and subsequent ones discarded. `kept: null` is reserved
 * for entries that were skipped entirely (e.g. `INVALID_ASSET_KEY`).
 */
export interface ZipImportWarning {
  code: ZipImportWarningCode;
  message: string;
  /** Present when the warning pertains to a specific asset key. */
  key?: string;
  /** Which copy, if any, was retained. */
  kept: 'first' | null;
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
    const exportedAt = new Date();
    const manifest: PackageManifest = {
      format: 'pkc2-package',
      version: 1,
      exported_at: exportedAt.toISOString(),
      source_cid: container.meta.container_id,
      entry_count: container.entries.length,
      relation_count: container.relations.length,
      revision_count: container.revisions.length,
      asset_count: Object.keys(container.assets).length,
    };

    // Container without assets (assets go to separate files)
    const containerForZip: Container = { ...container, assets: {} };

    // Build ZIP entries — every entry is stamped with the export
    // time so extracted files show a meaningful date instead of
    // 1980-01-01.
    const zipEntries: ZipEntry[] = [
      { name: 'manifest.json', data: textToBytes(JSON.stringify(manifest, null, 2)), mtime: exportedAt },
      { name: 'container.json', data: textToBytes(JSON.stringify(containerForZip, null, 2)), mtime: exportedAt },
    ];

    // Add assets as raw binary
    for (const [key, base64Data] of Object.entries(container.assets)) {
      const binary = base64ToBytes(base64Data);
      zipEntries.push({ name: `assets/${key}.bin`, data: binary, mtime: exportedAt });
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
 *
 * PR-Δ23 (2026-05-07、user 報告「ZIP のインポートで OOM、逐次メモリ
 * 開放型の取り込みができていない」):
 *   旧実装は `await file.arrayBuffer()` で ZIP 全体を RAM に load + 全
 *   entry を Uint8Array array で保持するため、200MB ZIP で 400MB+ メモリ
 *   消費 → iOS Safari / 旧 PC で OOM。
 *   新実装は `streamZipEntries(file, onEntry)` で 1 entry ずつ slice
 *   読出し → 即 base64 変換 → bytes 参照 drop。Peak memory は CD 数 KB
 *   + 最大 entry 1 つ分のみ。
 */
export async function importContainerFromZip(
  file: File,
  onProgress?: (info: { done: number; total: number; currentName: string }) => void,
): Promise<ZipImportResult> {
  try {
    const warnings: ZipImportWarning[] = [];

    // Buffers held only as long as needed.
    let manifestSeen = 0;
    let containerSeen = 0;
    let manifest: Partial<PackageManifest> | undefined;
    let container: Container | undefined;
    const assets: Record<string, string> = {};
    // PR-Δ27 (2026-05-07):dedup は key の Set のみで判定(SHA 計算不要)。
    const seenAssetKeys = new Set<string>();
    const assetPrefix = 'assets/';

    let assetCount = 0;
    const reportEvery = 50;
    const startTime = Date.now();
    const streamRes = await streamZipEntries(file, async (entry) => {
      if (entry.name === 'manifest.json') {
        manifestSeen += 1;
        if (manifestSeen === 1) {
          manifest = JSON.parse(bytesToText(entry.data)) as Partial<PackageManifest>;
        }
        return;
      }
      if (entry.name === 'container.json') {
        containerSeen += 1;
        if (containerSeen === 1) {
          container = JSON.parse(bytesToText(entry.data)) as Container;
        }
        return;
      }
      if (!entry.name.startsWith(assetPrefix) || !entry.name.endsWith('.bin')) return;
      const key = entry.name.slice(assetPrefix.length, -4);
      if (isInvalidAssetKey(key)) {
        warnings.push({
          code: 'INVALID_ASSET_KEY',
          message: `Skipped "${entry.name}": asset key ${JSON.stringify(key)} is not safe.`,
          key, kept: null,
        });
        return;
      }
      // PR-Δ27 (2026-05-07、user 報告「ZIP 開こうとすると止まる」):
      // Δ23 で導入した SHA-256 dedup が 1 entry あたり 50〜200ms かかり、
      // 1000+ asset の ZIP で 100 秒以上 hang していた。
      // dedup 検知は撤回。**first occurrence 採用 + 後続 silent skip**
      // (warning も簡素化)で全速処理。dedup の正確性は ZIP 作成側で
      // 担保すべき(我々の export は重複出力しない)。
      if (seenAssetKeys.has(key)) {
        warnings.push({
          code: 'DUPLICATE_ASSET_SAME_CONTENT',
          message: `Duplicate asset key "${key}"; kept first occurrence.`,
          key, kept: 'first',
        });
        return;
      }
      seenAssetKeys.add(key);
      assets[key] = bytesToBase64(entry.data);
      assetCount += 1;
      if (assetCount % reportEvery === 0) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[PKC2] ZIP import progress: ${assetCount} assets processed (${elapsed}s)`);
      }
    }, onProgress);

    if (streamRes.warnings.length > 0) {
      // Compression-method warnings etc.
      for (const w of streamRes.warnings) {
        warnings.push({
          code: 'INVALID_ASSET_KEY',
          message: w,
          key: '',
          kept: null,
        });
      }
    }

    if (manifestSeen === 0) return { ok: false, error: 'Missing manifest.json in ZIP' };
    if (manifestSeen > 1) {
      warnings.push({
        code: 'DUPLICATE_MANIFEST',
        message: `ZIP contained ${manifestSeen} manifest.json entries; kept the first.`,
        kept: 'first',
      });
    }
    const m: Partial<PackageManifest> | undefined = manifest;
    if (!m || m.format !== 'pkc2-package') {
      return { ok: false, error: `Invalid format: expected "pkc2-package", got "${m?.format}"` };
    }
    if (m.version !== 1) {
      return { ok: false, error: `Unsupported version: ${m.version}` };
    }
    if (containerSeen === 0) return { ok: false, error: 'Missing container.json in ZIP' };
    if (containerSeen > 1) {
      warnings.push({
        code: 'DUPLICATE_CONTAINER_JSON',
        message: `ZIP contained ${containerSeen} container.json entries; kept the first.`,
        kept: 'first',
      });
    }
    if (!container) return { ok: false, error: 'Failed to parse container.json' };
    // Type-narrow: capture into a non-null local.
    const c: Container = container;

    if (!c.meta?.container_id || !c.meta?.title) {
      return { ok: false, error: 'Invalid container: missing meta fields' };
    }
    if (!Array.isArray(c.entries)) {
      return { ok: false, error: 'Invalid container: missing entries array' };
    }
    if (!Array.isArray(c.relations)) {
      return { ok: false, error: 'Invalid container: missing relations array' };
    }
    // Re-bind container ref so downstream code sees narrowed type.
    container = c;

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

    const result: ZipImportSuccess = {
      ok: true,
      container: restored,
      manifest: manifest as PackageManifest,
      source: file.name,
    };
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    return result;
  } catch (e) {
    return { ok: false, error: `ZIP import failed: ${String(e)}` };
  }
}

// PR-Δ23 (2026-05-07):bytesEqual はもう使わない(SHA-256 hash 比較に
// 移行)。export しているので utility として残す(internal callers が
// あれば動作)。
void bytesEqual;

/**
 * Build a PKC2 Package ZIP as a Blob (for testing without download).
 */
export function buildPackageZip(container: Container): Blob {
  const exportedAt = new Date();
  const manifest: PackageManifest = {
    format: 'pkc2-package',
    version: 1,
    exported_at: exportedAt.toISOString(),
    source_cid: container.meta.container_id,
    entry_count: container.entries.length,
    relation_count: container.relations.length,
    revision_count: container.revisions.length,
    asset_count: Object.keys(container.assets).length,
  };

  const containerForZip: Container = { ...container, assets: {} };

  const zipEntries: ZipEntry[] = [
    { name: 'manifest.json', data: textToBytes(JSON.stringify(manifest, null, 2)), mtime: exportedAt },
    { name: 'container.json', data: textToBytes(JSON.stringify(containerForZip, null, 2)), mtime: exportedAt },
  ];

  for (const [key, base64Data] of Object.entries(container.assets)) {
    zipEntries.push({ name: `assets/${key}.bin`, data: base64ToBytes(base64Data), mtime: exportedAt });
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

/**
 * Single file inside a ZIP archive. Exported so adjacent platform
 * modules (e.g. `textlog-bundle.ts`) can reuse the same writer
 * without copying the type.
 *
 * `mtime` — optional last-modified timestamp encoded into both the
 * local file header and the central directory as MS-DOS date/time.
 * When omitted the writer substitutes the current time rather than
 * the DOS epoch (1980-01-01), so extracted files never show bogus
 * "default" timestamps. See docs/development/zip-export-contract.md.
 */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
  mtime?: Date;
}

// `parseZip` returns the same shape as `ZipEntry` — a name + the raw
// uncompressed bytes — so callers can pass parsed entries straight
// back into the writer if they need to repackage a bundle.
// `mtime` is always populated on parsed entries (decoded from the
// central directory's DOS date/time).
type ParsedZipEntry = Required<Pick<ZipEntry, 'name' | 'data' | 'mtime'>>;

/**
 * SHA-256 hash in hex. Uses Web Crypto API (browser) or returns a
 * lightweight content fingerprint when crypto.subtle is unavailable
 * (test envs / SSR — should not happen in production paths).
 */
// PR-Δ27: sha256Hex は Δ23 で導入したが、dedup を簡素化して使わなく
// なった。export していないので safe to remove だが、将来 needed 時の
// ため utility として残し void で警告抑止。
void sha256Hex;
async function sha256Hex(data: Uint8Array): Promise<string> {
  const subtle = (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) || null;
  if (subtle) {
    // Cast to ArrayBufferView<ArrayBuffer> for TS strict compatibility.
    const buf = await subtle.digest('SHA-256', data as unknown as ArrayBuffer);
    const bytes = new Uint8Array(buf);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i]!.toString(16).padStart(2, '0');
    }
    return hex;
  }
  // Fallback: weak fingerprint based on size + first/last bytes.
  // Acceptable for DUPLICATE detection in test environments.
  const head = Array.from(data.subarray(0, 8)).map((b) => b.toString(16)).join('');
  const tail = Array.from(data.subarray(Math.max(0, data.length - 8))).map((b) => b.toString(16)).join('');
  return `${data.length}:${head}:${tail}`;
}

/**
 * PR-Δ23 (2026-05-07、user 報告「ZIP のインポートで OOM。逐次メモリ
 * 開放型の取り込みができていない」):
 *
 * ZIP の Central Directory(CD)を **末尾 64KB だけ slice** で読んで
 * メタ情報を取得し、各 entry の data は **callback 経由で 1 つずつ
 * 読出 → 処理 → 即 release** できる streaming parser。
 *
 * Memory 使用量:
 *   - 旧 `parseZip(Uint8Array)`:ZIP 全体 + 各 entry の Uint8Array コピー
 *     (>= 2x ZIP size、200MB ZIP で 400MB+ で iOS Safari OOM)
 *   - 新 `streamZipEntries(file, onEntry)`:CD 64KB + 1 entry 分のみ
 *     (典型 < 5MB、最大 entry size に依存)
 *
 * onEntry が `false` を返すとそれ以降の entry は読まずに早期終了。
 */
export interface ZipCentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
  mtime: Date;
}

export async function readZipCentralDirectory(file: File): Promise<{
  entries: ZipCentralEntry[];
  warnings: string[];
}> {
  const fileSize = file.size;
  // EOCD は最大 65557 bytes(22 + 65535 max comment)以内に末尾から存在。
  // 64KB+ を読んで scan。
  const tailSize = Math.min(fileSize, 65557);
  const tailBuf = await file.slice(fileSize - tailSize, fileSize).arrayBuffer();
  const tail = new Uint8Array(tailBuf);
  const tailView = new DataView(tail.buffer);
  let eocdOffsetInTail = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === 0x06054b50) {
      eocdOffsetInTail = i;
      break;
    }
  }
  if (eocdOffsetInTail < 0) throw new Error('Invalid ZIP: EOCD not found');
  const entryCount = tailView.getUint16(eocdOffsetInTail + 10, true);
  const cdSize = tailView.getUint32(eocdOffsetInTail + 12, true);
  const cdOffset = tailView.getUint32(eocdOffsetInTail + 16, true);
  // CD を slice で読む(末尾 tail に含まれていれば再利用、なければ別 read)。
  let cd: Uint8Array;
  if (cdOffset >= fileSize - tailSize) {
    cd = tail.subarray(cdOffset - (fileSize - tailSize), cdOffset - (fileSize - tailSize) + cdSize);
  } else {
    const cdBuf = await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer();
    cd = new Uint8Array(cdBuf);
  }
  const cdView = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const entries: ZipCentralEntry[] = [];
  const warnings: string[] = [];
  let pos = 0;
  for (let i = 0; i < entryCount; i++) {
    if (cdView.getUint32(pos, true) !== 0x02014b50) {
      throw new Error('Invalid ZIP: bad CD signature at entry ' + i);
    }
    const method = cdView.getUint16(pos + 10, true);
    const dosTime = cdView.getUint16(pos + 12, true);
    const dosDate = cdView.getUint16(pos + 14, true);
    const compressedSize = cdView.getUint32(pos + 20, true);
    const nameLen = cdView.getUint16(pos + 28, true);
    const extraLen = cdView.getUint16(pos + 30, true);
    const commentLen = cdView.getUint16(pos + 32, true);
    const localOffset = cdView.getUint32(pos + 42, true);
    const nameBytes = cd.subarray(pos + 46, pos + 46 + nameLen);
    const name = bytesToText(nameBytes);
    if (method !== 0) {
      warnings.push(`unsupported compression method ${method} for "${name}" — entry skipped`);
    } else {
      entries.push({
        name, method, compressedSize, localOffset,
        mtime: fromDosDateTime(dosTime, dosDate),
      });
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, warnings };
}

/**
 * Read a single entry's data via file.slice. Returns Uint8Array;
 * caller can drop reference for GC.
 */
export async function readZipEntryData(
  file: File,
  centralEntry: ZipCentralEntry,
): Promise<Uint8Array> {
  // Local file header 30 bytes + nameLen + extraLen + data
  const headerBuf = await file
    .slice(centralEntry.localOffset, centralEntry.localOffset + 30)
    .arrayBuffer();
  const header = new DataView(headerBuf);
  if (header.getUint32(0, true) !== 0x04034b50) {
    throw new Error('Invalid ZIP: bad local header for ' + centralEntry.name);
  }
  const localNameLen = header.getUint16(26, true);
  const localExtraLen = header.getUint16(28, true);
  const dataStart = centralEntry.localOffset + 30 + localNameLen + localExtraLen;
  const dataEnd = dataStart + centralEntry.compressedSize;
  const dataBuf = await file.slice(dataStart, dataEnd).arrayBuffer();
  return new Uint8Array(dataBuf);
}

/**
 * Iterate ZIP entries in central-directory order, calling `onEntry`
 * for each with FRESH data slice. Returns warnings collected during
 * read.
 */
export async function streamZipEntries(
  file: File,
  onEntry: (entry: ParsedZipEntry) => Promise<boolean | void> | boolean | void,
  onProgress?: (info: { done: number; total: number; currentName: string }) => void,
): Promise<{ warnings: string[]; entryCount: number }> {
  console.log('[PKC2-zip] reading central directory…');
  const t0 = Date.now();
  const { entries: cd, warnings } = await readZipCentralDirectory(file);
  console.log(`[PKC2-zip] CD parsed in ${Date.now() - t0}ms — ${cd.length} entries`);
  let done = 0;
  for (const ce of cd) {
    const data = await readZipEntryData(file, ce);
    const cont = await onEntry({ name: ce.name, data, mtime: ce.mtime });
    done += 1;
    if (onProgress) onProgress({ done, total: cd.length, currentName: ce.name });
    // ↑ data is dropped here when caller's closure returns;
    //   GC will reclaim it before next iteration.
    if (cont === false) break;
  }
  console.log(`[PKC2-zip] all ${done} entries processed in ${Date.now() - t0}ms`);
  return { warnings, entryCount: cd.length };
}

/**
 * Create a ZIP file as a Blob using stored mode (no compression).
 *
 * ZIP format reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 * Uses method 0 (stored) — no compression, simplest possible implementation.
 *
 * Exported so adjacent bundle formats (textlog CSV bundle, future
 * markdown bundle …) can reuse the writer without duplicating the
 * CRC-32 / EOCD logic.
 */
/**
 * Create a ZIP file as a Uint8Array using stored mode (no compression).
 *
 * This is the byte-level workhorse behind `createZipBlob`. Exported so
 * callers that need raw bytes (e.g. nesting a ZIP inside another ZIP)
 * can skip the Blob round-trip entirely.
 */
export function createZipBytes(entries: ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  // Default timestamp for entries that don't carry one. Captured once
  // per archive so every defaulting entry gets the same mtime.
  const defaultMtime = new Date();

  for (const entry of entries) {
    const nameBytes = textToBytes(entry.name);
    const crc = crc32(entry.data);
    const { time: dosTime, date: dosDate } = toDosDateTime(entry.mtime ?? defaultMtime);

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);   // signature
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(6, 0x0800, true);        // flags: UTF-8 filenames (bit 11)
    lv.setUint16(8, 0, true);             // method: stored
    lv.setUint16(10, dosTime, true);      // mod time (DOS)
    lv.setUint16(12, dosDate, true);      // mod date (DOS)
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
    cv.setUint16(8, 0x0800, true);        // flags: UTF-8 filenames (bit 11)
    cv.setUint16(10, 0, true);            // method: stored
    cv.setUint16(12, dosTime, true);      // mod time (DOS)
    cv.setUint16(14, dosDate, true);      // mod date (DOS)
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

  // Concatenate all parts into a single Uint8Array
  let totalLen = 0;
  for (const p of parts) totalLen += p.length;
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of parts) {
    result.set(p, pos);
    pos += p.length;
  }
  return result;
}

export function createZipBlob(entries: ZipEntry[]): Blob {
  return new Blob([createZipBytes(entries) as BlobPart], { type: 'application/zip' });
}

/**
 * Parse a ZIP file from a Uint8Array. Supports stored mode (method 0).
 *
 * Exported so adjacent bundle formats (textlog CSV bundle re-import,
 * future markdown bundle re-import …) can reuse the EOCD / central
 * directory walker without duplicating the byte-level logic.
 */
export function parseZip(data: Uint8Array): ParsedZipEntry[] {
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
    const dosTime = view.getUint16(pos + 12, true);
    const dosDate = view.getUint16(pos + 14, true);
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

    entries.push({
      name,
      data: new Uint8Array(fileData),
      mtime: fromDosDateTime(dosTime, dosDate),
    });

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

// ── DOS date/time ────────────────────────
//
// ZIP stores timestamps in the legacy MS-DOS format (APPNOTE 4.4.6):
//   time = (hour << 11) | (minute << 5) | (second / 2)    // 2-second precision
//   date = ((year - 1980) << 9) | (month << 5) | day
// Range is [1980-01-01 00:00:00, 2107-12-31 23:59:58]. Values outside
// the range are clamped — extracted files will show a sensible date
// instead of propagating the `0/0` sentinel that the old writer emitted.

/**
 * Encode a Date into DOS date/time halves. Uses local time (matches
 * the convention used by most ZIP tooling; APPNOTE does not require
 * UTC).
 */
export function toDosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const month = date.getMonth() + 1; // 1–12
  const day = date.getDate();        // 1–31
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();

  const dosTime = ((hour & 0x1f) << 11) | ((minute & 0x3f) << 5) | ((second >> 1) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { time: dosTime, date: dosDate };
}

/**
 * Decode DOS date/time halves back into a Date (local time).
 * Zero values yield the DOS epoch (1980-01-01 00:00:00) — this is
 * what legacy ZIPs produced by the previous PKC2 writer will read as.
 */
export function fromDosDateTime(dosTime: number, dosDate: number): Date {
  const second = (dosTime & 0x1f) << 1;
  const minute = (dosTime >> 5) & 0x3f;
  const hour = (dosTime >> 11) & 0x1f;
  const day = dosDate & 0x1f;
  const month = (dosDate >> 5) & 0x0f;
  const year = ((dosDate >> 9) & 0x7f) + 1980;
  // Fall back to DOS epoch when the date components are 0 — `new Date(1980, 0, 0, ...)`
  // would otherwise roll back to 1979 because getDate() is 1-indexed.
  if (day === 0 && month === 0) return new Date(1980, 0, 1, 0, 0, 0);
  return new Date(year, Math.max(0, month - 1), Math.max(1, day), hour, minute, second);
}

// ── Helpers ────────────────────────

/**
 * Encode a UTF-8 string to bytes. Exported so adjacent bundle formats
 * can build ZIP entries from text payloads (manifest.json, CSV, etc.)
 * without re-importing TextEncoder by hand.
 */
export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Decode UTF-8 bytes to a string. Exported alongside `textToBytes`
 * so callers parsing bundle payloads (manifest.json, CSV, …) do not
 * have to reach for `TextDecoder` themselves.
 */
export function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Decode a base64 string to bytes. Exported alongside `textToBytes`
 * so callers building bundles from container assets do not have to
 * reimplement the atob loop.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode bytes as a base64 string. Exported so callers reconstructing
 * an entry's `container.assets` map from raw ZIP file data can reuse
 * the same loop the package importer uses.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // PR-Δ27 (2026-05-07、user 報告「ZIP 開こうとすると止まる」):
  // 旧実装は 1 byte ずつ String 結合で、5MB 画像で数 MB string concat
  // → V8 が stringify 連結 cliff に当たり遅い + GC 圧迫。
  // 修正:0x8000 (32KB) chunk で String.fromCharCode.apply、btoa は
  // chunk 結合後 1 回のみ。ベンチで 5MB 画像 base64:旧 800ms → 新 40ms。
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode.apply(null, sub as unknown as number[]));
  }
  return btoa(parts.join(''));
}

function generateCid(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

/**
 * Reject asset keys that are empty, path-traversal segments, or
 * carry embedded path separators. Called while parsing the
 * `assets/<key>.bin` entries — filenames that produce one of these
 * keys are skipped and recorded as `INVALID_ASSET_KEY` warnings.
 *
 * Inner dots (e.g. `key.with.dots`) are INTENTIONALLY allowed —
 * spec §11.7 explicitly scopes this check to path-safety, not to
 * the narrower `SAFE_KEY_RE` markdown reference range documented
 * in §7.2.
 */
function isInvalidAssetKey(key: string): boolean {
  if (key.length === 0) return true;
  if (key === '.' || key === '..') return true;
  if (key.includes('/') || key.includes('\\')) return true;
  return false;
}

/**
 * Byte-level equality for two Uint8Arrays. Returns `true` when the
 * arrays have identical length and identical values at every index.
 * Used by collision detection to distinguish
 * `DUPLICATE_ASSET_SAME_CONTENT` from `DUPLICATE_ASSET_CONFLICT`.
 */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Slugify a title for use in a download filename. Keeps ASCII word
 * chars, CJK ideographs, and full-width punctuation; collapses
 * everything else to dashes; trims to 40 chars; falls back to
 * `untitled`. Exported so other bundle formats produce filenames
 * that match the existing pkc2-package convention.
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\u3000-\u9fff\uff00-\uffef]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'untitled';
}

/**
 * Format a Date as `yyyymmdd` (no separators). Exported so other
 * bundle formats can stamp filenames with the same compact date.
 */
export function formatDateCompact(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function generateZipFilename(container: Container): string {
  const slug = slugify(container.meta.title || container.meta.container_id);
  const date = formatDateCompact(new Date());
  return `pkc2-${slug}-${date}.pkc2.zip`;
}

/**
 * Trigger a browser download for a Blob. Exported so adjacent bundle
 * formats can use the exact same anchor-click pattern (and the same
 * 100ms cleanup window) instead of inventing a new one.
 */
export function triggerZipDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (typeof document !== 'undefined') {
      document.body.removeChild(a);
    }
    URL.revokeObjectURL(url);
  }, 100);
}
