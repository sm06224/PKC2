/**
 * Deterministic content-hash helpers for `core/` use.
 *
 * Canonical spec: `docs/spec/data-model.md` §6.2 — `Revision.content_hash`.
 *
 * Algorithm: **FNV-1a 64-bit**, output as 16-char lowercase hex.
 *
 * Why FNV-1a-64 (not SHA-256):
 *
 * - Synchronous pure function — `core/` layer forbids browser APIs
 *   like `SubtleCrypto` (which is also async, forcing every caller
 *   including `snapshotEntry` to become Promise-returning).
 * - No external dependency — bundle size budget is tight.
 * - 64-bit output gives ~5e-10 collision probability at 10^5 revisions,
 *   which is far better than the accidental-collision tolerance of
 *   `content_hash`'s intended use (integrity hint + future dedup /
 *   branch detection). `content_hash` is NOT a cryptographic commitment
 *   and must not be relied on as such.
 *
 * If a future scenario demands cryptographic strength, add a separate
 * optional field (e.g. `content_hash_sha256`) per the additive-only
 * rule in `docs/spec/schema-migration-policy.md` §3.1. Do NOT change
 * the algorithm of this field in place.
 */

const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_MASK = 0xffffffffffffffffn;

/**
 * Compute FNV-1a 64-bit hash of a UTF-8 encoded string.
 * Returns 16-character lowercase hex string.
 *
 * Deterministic: same input string always yields the same output.
 * Independent of platform endianness and JS engine version.
 */
export function fnv1a64Hex(input: string): string {
  let hash = FNV64_OFFSET_BASIS;
  // Encode as UTF-8 so multibyte characters hash consistently across
  // environments — relying on `charCodeAt` alone would drop the
  // high-surrogate half of astral-plane code points.
  const bytes = utf8Encode(input);
  for (let i = 0; i < bytes.length; i++) {
    hash ^= BigInt(bytes[i]!);
    hash = (hash * FNV64_PRIME) & FNV64_MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Minimal UTF-8 encoder. Pure, no DOM/Node dependency.
 * Mirrors the well-known 1/2/3/4-byte encoding.
 */
function utf8Encode(input: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let cp = input.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return out;
}
