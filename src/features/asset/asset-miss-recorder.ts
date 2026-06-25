/**
 * Asset miss recorder (段階3, #868 working-set lazy asset loading).
 *
 * The synchronous render path resolves `asset:KEY` references against
 * `container.assets`, which — under lazy loading — holds only the
 * resident working-set. When a lookup misses (the bytes were never
 * loaded or were LRU-evicted), the resolver records the key here. After
 * the render the working-set manager (adapter layer) drains these keys,
 * loads them from the store, and re-renders so the image pops in.
 *
 * This lives in the features layer (not adapter) so the pure resolve
 * functions — `resolveAssetReferences` (features/markdown) and the
 * adapter presenters alike — can record misses without an upward import.
 * It is a deliberately tiny module-level Set: threading a callback
 * through every asset-resolution call site would be far more invasive,
 * and a single render pass is single-threaded so there is no contention.
 *
 * No-op cost when lazy loading is inactive (assets fully resident): the
 * Set simply never receives a key.
 */
const missedKeys = new Set<string>();

/** Record an asset key the render path looked up but could not resolve. */
export function noteAssetMiss(key: string): void {
  if (key.length > 0) missedKeys.add(key);
}

/** Drain and clear the misses recorded since the last call. */
export function drainAssetMisses(): string[] {
  if (missedKeys.size === 0) return [];
  const out = [...missedKeys];
  missedKeys.clear();
  return out;
}

/** Test helper: clear without draining. */
export function resetAssetMisses(): void {
  missedKeys.clear();
}
