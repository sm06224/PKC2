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
 * ── 🔴 2026-07-27(B13):memo の**キーを base64 本文から asset key へ**移した ──
 *
 * 旧実装は `Map<base64本文, hash>` だった。「assets はどのみち container の
 * 寿命ぶん常駐するから、cache はそれを写しているだけ」という上のコメントは
 * **誤り**である:
 *   ① **判定しただけの候補ファイル**(まだ保存していない・保存しないかも
 *      しれない drop / paste)の base64 も**キーとして焼き付く**
 *   ② asset を削除しても Map のキーとして生き残る
 * Map のキーは強参照なので、どちらも解放されない。実測(node, --expose-gc):
 *   5MB の候補を 20 個「判定しただけ」(container.assets は空・**1 件も保存
 *   していない**)で heapUsed +99.0 MB。上限は無く、判定回数に比例する。
 *
 * 直し方は 2 つ:
 *   1. **候補側は memo しない** ── どのみち 1 呼び出しにつき 1 回しか
 *      hash しないので、memo は速度に 1 ミリも寄与せず、保持だけしていた
 *   2. 既存 asset 側は **asset key で引く**(値は identity 照合にだけ使い、
 *      container.assets に居ない key は毎回 prune)。これで memo の保持は
 *      **生きている asset を超えない**
 * 速度の性質は変わらない: burst 中の既存 asset 再 hash は O(1) のままで、
 * 30 ファイル drop が 13 秒 CPU に戻ることはない(下の test で pin)。
 *
 * On a container swap (import, workspace reset, container_id change) we drop
 * the cache via `__resetAssetDedupeCacheForTest`-style reset triggered on
 * `container.meta.container_id` divergence so stale hashes don't survive
 * across containers.
 */

import { fnv1a64Hex } from '../../core/operations/hash';
import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import type { AssetMetaIndex } from '../../features/asset/asset-meta';

/**
 * asset key → { 値の参照, その hash }。
 * `value` は**同一性照合のためだけ**に持つ ── prune によって
 * 「container.assets に今も居る key」しか残らないので、ここが掴む文字列は
 * 常に container が既に掴んでいるものと同じ(= 追加の常駐にならない)。
 */
const assetHashByKey = new Map<string, { value: string; hash: string }>();
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
    assetHashByKey.clear();
    cachedSizeByAssetKey = null;
    cachedEntriesRef = null;
  }
  cacheContainerId = id;
}

function getAssetHash(key: string, value: string): string {
  const memo = assetHashByKey.get(key);
  // 値が差し替わっていたら hash し直す(参照一致が高速路、内容一致も可)。
  if (memo !== undefined && memo.value === value) return memo.hash;
  const hash = fnv1a64Hex(value);
  assetHashByKey.set(key, { value, hash });
  return hash;
}

/**
 * container.assets に居ない key の memo を落とす(削除された asset の
 * base64 を掴み続けないため)。key の比較だけなので値は読まない。
 */
function pruneAssetHashCache(container: Container): void {
  if (assetHashByKey.size === 0) return;
  for (const key of assetHashByKey.keys()) {
    if (!(key in container.assets)) assetHashByKey.delete(key);
  }
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
 * `base64Data` + `fileSize` が既存 asset と一致すれば、その既存
 * `asset_key` を返す(複数一致時は最初の一致 key)。一致しなければ `null`。
 *
 * 一致条件(両方必須):
 *   A. fnv1a64Hex(base64Data) === fnv1a64Hex(existingAssetValue)
 *   B. fileSize === 当該 key を参照する attachment entry の body.size
 *
 * `null` を返すケース:
 *   - container が null
 *   - container.assets が空
 *   - hash 計算が失敗
 *   - 一致 entry body が parse 不能
 *
 * safe-biased:いずれの異常も `null`(重複の取りこぼし < 誤った再利用)。
 */
export function findDuplicateAssetKey(
  base64Data: string,
  fileSize: number,
  container: Container | null,
  metaIndex?: AssetMetaIndex,
): string | null {
  if (!container) return null;
  maybeResetForContainerSwap(container);

  // ⚠ 候補(これから判定するファイル)は **memo しない**。1 呼び出しにつき
  //    1 回しか hash しないので memo は速度に寄与せず、base64 を焼き付ける
  //    だけだった(B13: 5MB×20 の判定で +99MB)。
  let newHash: string;
  try {
    newHash = fnv1a64Hex(base64Data);
  } catch {
    return null;
  }

  pruneAssetHashCache(container);

  const sizeByKey = getSizeByAssetKey(container);

  // 段階4 (#868): when the resident asset-meta index is supplied, compare
  // against the FULL stored key set (every key → precomputed hash) so a
  // paste duplicating a non-resident asset is still detected. The hashes
  // are precomputed (no byte load / no rehash on the hot path). Falls back
  // to scanning the resident `container.assets` when no index is given.
  if (metaIndex) {
    for (const key in metaIndex) {
      if (metaIndex[key]!.hash !== newHash) continue;
      // Size guard: prefer the attachment entry's declared size; fall back
      // to the index's decoded-byte size when no owner entry is resident.
      const ownerSize = sizeByKey.get(key) ?? metaIndex[key]!.size;
      if (ownerSize === fileSize) return key;
    }
    return null;
  }

  for (const [key, assetValue] of Object.entries(container.assets)) {
    let existingHash: string;
    try {
      existingHash = getAssetHash(key, assetValue);
    } catch {
      continue;
    }
    if (existingHash !== newHash) continue;

    const ownerSize = sizeByKey.get(key);
    if (typeof ownerSize === 'number' && ownerSize === fileSize) return key;
  }

  return null;
}

/**
 * Return true when `base64Data` + `fileSize` matches an existing asset.
 * `findDuplicateAssetKey` の boolean ラッパー(既存呼び出し互換)。
 */
export function checkAssetDuplicate(
  base64Data: string,
  fileSize: number,
  container: Container | null,
  metaIndex?: AssetMetaIndex,
): boolean {
  return findDuplicateAssetKey(base64Data, fileSize, container, metaIndex) !== null;
}

/**
 * Test-only reset for the module-level dedupe cache. Invoked by tests
 * that exercise multiple synthetic containers to ensure isolation.
 */
export function __resetAssetDedupeCacheForTest(): void {
  assetHashByKey.clear();
  cacheContainerId = null;
  cachedSizeByAssetKey = null;
  cachedEntriesRef = null;
}

/** 計器: memo が保持している asset 数(常駐の pin 用)。 */
export function __assetDedupeCacheSize(): number {
  return assetHashByKey.size;
}
