/**
 * Asset metadata (段階4, #868 working-set lazy asset loading).
 *
 * Under lazy loading `container.assets` holds only the resident
 * working-set, so any consumer that scans it for size / count / hash
 * (storage profile, guardrails export estimate, orphan count, paste
 * dedupe) under-reports. The fix is a lightweight **resident metadata
 * index** — `key → { size, hash }` for EVERY stored asset, kept in RAM
 * (a few dozen bytes per asset, negligible vs the bytes themselves).
 *
 * This module is the pure core: the `AssetMeta` shape and the function
 * that derives it from an asset's base64 bytes. The adapter-layer
 * manager (`adapter/platform/asset-meta-index.ts`) owns residency,
 * persistence, and the memory-safe backfill; the consumers take the
 * index as plain data so they stay pure.
 */
import { fnv1a64Hex } from '../../core/operations/hash';
import { estimateBase64Size } from './storage-profile';

export interface AssetMeta {
  /** Decoded byte size (matches `estimateBase64Size`, used by storage profile). */
  size: number;
  /** FNV-1a 64-bit hex of the base64 bytes (matches asset-dedupe hashing). */
  hash: string;
}

/** key → metadata for every stored asset of a container. */
export type AssetMetaIndex = Record<string, AssetMeta>;

/** Derive the resident metadata for one asset's base64 bytes. */
export function computeAssetMeta(base64: string): AssetMeta {
  return { size: estimateBase64Size(base64), hash: fnv1a64Hex(base64) };
}

/** Total decoded bytes across an index (full-store total, not working-set). */
export function totalIndexBytes(index: AssetMetaIndex): number {
  let total = 0;
  for (const k in index) total += index[k]!.size;
  return total;
}
