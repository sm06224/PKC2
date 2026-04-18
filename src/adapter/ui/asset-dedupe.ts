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
 */

import { fnv1a64Hex } from '../../core/operations/hash';
import type { Container } from '../../core/model/container';

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

  let newHash: string;
  try {
    newHash = fnv1a64Hex(base64Data);
  } catch {
    return false;
  }

  for (const [key, assetValue] of Object.entries(container.assets)) {
    let existingHash: string;
    try {
      existingHash = fnv1a64Hex(assetValue);
    } catch {
      continue;
    }
    if (existingHash !== newHash) continue;

    // Hash matches — verify size via the attachment entry that owns this key
    const ownerEntry = container.entries.find((e) => {
      if (e.archetype !== 'attachment') return false;
      try {
        const parsed = JSON.parse(e.body) as { asset_key?: string };
        return parsed.asset_key === key;
      } catch {
        return false;
      }
    });
    if (!ownerEntry) continue;

    try {
      const parsed = JSON.parse(ownerEntry.body) as { size?: number };
      if (typeof parsed.size === 'number' && parsed.size === fileSize) return true;
    } catch {
      continue;
    }
  }

  return false;
}
