/**
 * FI-04: Asset duplicate detection — pure helper.
 *
 * Checks whether a file (represented as base64 data + byte size) already
 * exists in the container's assets. Both the FNV-1a 64-bit hash AND the
 * declared size on the attachment entry must match to reduce false positives.
 *
 * Safe-biased: any parse error returns false (prefer allowing duplicates
 * over accidentally suppressing genuinely distinct files).
 *
 * See docs/spec/attachment-foundation-fi04-v1-behavior-contract.md §3.
 *
 * ── PR #184 hot-path memoization ──────────────────────────────────────
 *
 * The previous implementation re-hashed every existing asset value on
 * every call:
 *
 *     for (const [key, value] of Object.entries(container.assets)) {
 *       existingHash = fnv1a64Hex(value);     // ← N × 5 MB per call
 *       ...
 *     }
 *
 * For a multi-file drop of 30 × 5 MB images, this totals
 *   ∑(i=0..29) i = 435 hash operations × ~30 ms each ≈ 13 s of pure CPU.
 *
 * `dispatcher.dispatch` produces a fresh `container` reference on every
 * mutation, but the underlying asset string values stay reference-equal
 * across snapshots when nothing touched them — that's the standard
 * immutable-update pattern. The cache exploits this:
 *
 *   - `assetHashByValue: Map<string, string>` — value identity ⇒ hash
 *   - the new file's base64 is hashed once on each call
 *   - existing assets are looked up by string identity; cold misses
 *     hash once and remember the result
 *
 * Cold-cache pass on a fresh boot is unchanged (one-time cost). Across
 * a 30-file drop the per-call cost goes from O(N) hashes to O(1) hash
 * + O(N) Map lookups. The 14-23 s span for the user collapses to <300 ms.
 *
 * Cache lifetime / leak control: assets are retained for the lifetime
 * of the container anyway; the cache simply mirrors that. On a container
 * swap (import, workspace reset, container_id change) we drop the cache
 * via `__resetAssetDedupeCacheForTest`-style reset triggered on
 * `container.meta.container_id` divergence so stale hashes don't survive
 * across containers.
 */

import { fnv1a64Hex } from '../../core/operations/hash';
import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';

const assetHashByValue = new Map<string, string>();
let cacheContainerId: string | null = null;
/**
 * Per-container index of (asset_key → size) extracted from attachment
 * entries. Rebuilt only when the container's `entries` array reference
 * changes (immutable update protocol — unchanged entries keep their
 * refs across snapshots so structural equality on the array catches
 * any owner change). The previous code did a linear `entries.find`
 * per hash match.
 */
let cachedSizeByAssetKey: Map<string, number> | null = null;
let cachedEntriesRef: ReadonlyArray<Entry> | null = null;

function maybeResetForContainerSwap(container: Container): void {
  const id = container.meta.container_id;
  if (cacheContainerId !== null && cacheContainerId !== id) {
    assetHashByValue.clear();
    cachedSizeByAssetKey = null;
    cachedEntriesRef = null;
  }
  cacheContainerId = id;
}

function getAssetHash(value: string): string {
  let h = assetHashByValue.get(value);
  if (h !== undefined) return h;
  h = fnv1a64Hex(value);
  assetHashByValue.set(value, h);
  return h;
}

function getSizeByAssetKey(container: Container): Map<string, number> {
  if (cachedEntriesRef === container.entries && cachedSizeByAssetKey) {
    return cachedSizeByAssetKey;
  }
  const idx = new Map<string, number>();
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    try {
      const parsed = JSON.parse(entry.body) as { asset_key?: string; size?: number };
      if (typeof parsed.asset_key === 'string' && typeof parsed.size === 'number') {
        idx.set(parsed.asset_key, parsed.size);
      }
    } catch {
      // safe-biased: skip unparseable bodies
    }
  }
  cachedSizeByAssetKey = idx;
  cachedEntriesRef = container.entries;
  return idx;
}

/**
 * Return true when `base64Data` + `fileSize` matches an existing asset.
 *
 * Matching criteria (both required):
 *   A. fnv1a64Hex(base64Data) === fnv1a64Hex(existingAssetValue)
 *   B. fileSize === body.size of the attachment entry that references the key
 *
 * Returns false when:
 *   - container is null
 *   - container.assets is empty
 *   - hash computation fails for either side
 *   - no matching entry body can be parsed
 */
export function checkAssetDuplicate(
  base64Data: string,
  fileSize: number,
  container: Container | null,
): boolean {
  if (!container) return false;
  maybeResetForContainerSwap(container);

  let newHash: string;
  try {
    newHash = getAssetHash(base64Data);
  } catch {
    return false;
  }

  const sizeByKey = getSizeByAssetKey(container);

  for (const [key, assetValue] of Object.entries(container.assets)) {
    let existingHash: string;
    try {
      existingHash = getAssetHash(assetValue);
    } catch {
      continue;
    }
    if (existingHash !== newHash) continue;

    const ownerSize = sizeByKey.get(key);
    if (typeof ownerSize === 'number' && ownerSize === fileSize) return true;
  }

  return false;
}

/**
 * Test-only reset for the module-level dedupe cache. Invoked by tests
 * that exercise multiple synthetic containers to ensure isolation.
 */
export function __resetAssetDedupeCacheForTest(): void {
  assetHashByValue.clear();
  cacheContainerId = null;
  cachedSizeByAssetKey = null;
  cachedEntriesRef = null;
}
