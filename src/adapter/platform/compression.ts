/**
 * Compression utilities for HTML Full export.
 *
 * Responsibility:
 * - Compress base64 asset data to gzip+base64 for size-efficient HTML embedding.
 * - Decompress gzip+base64 data back to base64 on import.
 * - Provide feature detection for CompressionStream API.
 *
 * Design decisions:
 * - Input/output is base64 strings (matches IDB asset storage format).
 * - Uses CompressionStream/DecompressionStream (browser API, no npm deps).
 * - Fallback: if CompressionStream is unavailable, returns data unchanged.
 * - Applied per-asset during export; artifact-level asset_encoding records the mode.
 * - IDB stays uncompressed — compression is only for Portable HTML artifacts.
 *
 * This module lives in adapter/platform/ because:
 * - CompressionStream is a browser API
 * - Must NOT be imported by core/
 *
 * Browser support: Chrome 80+, Firefox 113+, Safari 16.4+
 */

/**
 * Check whether the CompressionStream API is available.
 */
export function isCompressionSupported(): boolean {
  return typeof CompressionStream === 'function'
    && typeof DecompressionStream === 'function';
}

/**
 * Compress a base64 string to gzip+base64.
 *
 * Flow: base64 → decode to binary → gzip compress → encode to base64
 *
 * If CompressionStream is not supported, returns the input unchanged.
 */
export async function compressToBase64(rawBase64: string): Promise<string> {
  if (!isCompressionSupported()) return rawBase64;

  // Decode base64 to binary
  const binaryString = atob(rawBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Compress with gzip
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();

  // Read compressed output
  const compressed = await readAllBytes(cs.readable);

  // Encode compressed bytes to base64
  return bytesToBase64(compressed);
}

/**
 * Decompress a gzip+base64 string back to base64.
 *
 * Flow: gzip+base64 → decode to compressed binary → gzip decompress → encode to base64
 *
 * If DecompressionStream is not supported, returns the input unchanged.
 */
export async function decompressFromBase64(compressedBase64: string): Promise<string> {
  if (!isCompressionSupported()) return compressedBase64;

  // Decode base64 to compressed binary
  const binaryString = atob(compressedBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Decompress with gzip
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();

  // Read decompressed output
  const decompressed = await readAllBytes(ds.readable);

  // Encode decompressed bytes back to base64
  return bytesToBase64(decompressed);
}

/**
 * Compress all assets in a record. Returns a new record with compressed values.
 * If compression is not supported, returns the original record unchanged.
 */
export async function compressAssets(
  assets: Record<string, string>,
): Promise<{ assets: Record<string, string>; encoding: 'base64' | 'gzip+base64' }> {
  if (!isCompressionSupported() || Object.keys(assets).length === 0) {
    return { assets, encoding: 'base64' };
  }

  const compressed: Record<string, string> = {};
  for (const [key, value] of Object.entries(assets)) {
    compressed[key] = await compressToBase64(value);
  }
  return { assets: compressed, encoding: 'gzip+base64' };
}

/**
 * Decompress all assets in a record based on the encoding flag.
 * If encoding is 'base64' or absent, returns the original record unchanged.
 */
export async function decompressAssets(
  assets: Record<string, string>,
  encoding?: string,
): Promise<Record<string, string>> {
  if (encoding !== 'gzip+base64' || Object.keys(assets).length === 0) {
    return assets;
  }

  const decompressed: Record<string, string> = {};
  for (const [key, value] of Object.entries(assets)) {
    decompressed[key] = await decompressFromBase64(value);
  }
  return decompressed;
}

// ── Internal helpers ────────────────────────

/** Read all bytes from a ReadableStream into a single Uint8Array. */
async function readAllBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/** Convert a Uint8Array to a base64 string. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
