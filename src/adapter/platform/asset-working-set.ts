import type { Dispatcher } from '../state/dispatcher';
import type { ContainerStore } from './idb-store';
import type { DomainEvent } from '../../core/action/domain-event';
import { getEntryAssetDependencies } from '../../features/asset/asset-scan';
import { drainAssetMisses } from '../../features/asset/asset-miss-recorder';
import {
  markAssetAbsent,
  markAssetPresent,
  assetAbsenceRevision,
  resetAssetAbsence,
} from '../../features/asset/asset-absence';

/**
 * Working-set lazy asset loading (段階3, #868 / memory-reduction #7).
 *
 * Boot loads the container WITHOUT asset bytes (`loadDefaultShallow`),
 * so `container.assets` starts empty and the ≈400MB of base64 never
 * lands in the JS heap at startup. This manager keeps `container.assets`
 * populated with just the *working-set* — the assets the visible view
 * actually references — and evicts the rest under a byte budget. The
 * bytes stay safe in the store; an evicted-but-needed asset is reloaded
 * on demand.
 *
 * Two feeds decide what the working-set must contain:
 *   1. PROACTIVE — on selection / navigation / load we preload the
 *      selected entry's dependency closure (`getEntryAssetDependencies`,
 *      which now includes frontmatter thumbnails + transclusions). This
 *      reduces first-paint flicker.
 *   2. DEMAND (miss recovery) — the synchronous render path records, via
 *      `noteAssetMiss`, every asset key it looked up but did not find in
 *      `container.assets` (card-grid thumbnails, folder covers, anything
 *      the proactive closure of a single root entry can't enumerate).
 *      After each render the manager loads those keys and re-renders, so
 *      the image pops in. This is the robustness net: even if proactive
 *      preload misses something, the render miss heals it.
 *
 * ── Data-safety invariant ───────────────────────────────────────────
 * NEVER evict an asset whose bytes are not confirmed to exist in the
 * store. Freshly pasted attachments / just-imported assets live in
 * `container.assets` before the debounced `save()` persists them; if the
 * manager dropped one of those it would be unrecoverable. Eviction is
 * gated on a fresh `listAssetKeys` membership check, and any resident key
 * not yet in the store is retained verbatim.
 */

/** Default working-set byte budget (≈ base64 chars ≈ RAM bytes). */
const DEFAULT_BUDGET_BYTES = 48 * 1024 * 1024;

export interface WorkingSetManager {
  /**
   * Ensure `keys` are resident, loading any missing bytes from the
   * store, then re-publish the working-set if it changed. Awaitable so
   * tests can drive it deterministically.
   */
  ensure(keys: Iterable<string>): Promise<void>;
  /** Drain render misses + preload the current selection, then ensure. */
  refresh(): Promise<void>;
  /** Resident key count (for tests / diagnostics). */
  residentKeys(): string[];
  dispose(): void;
}

export interface WorkingSetOptions {
  store: ContainerStore;
  /** Byte budget for resident asset bytes. Default 48MB. */
  budgetBytes?: number;
}

/**
 * Mount the working-set manager onto a dispatcher. Subscribes to
 * selection / navigation / load events for proactive preload; callers
 * additionally invoke `refresh()` after each render to recover misses.
 */
export function mountWorkingSet(
  dispatcher: Dispatcher,
  options: WorkingSetOptions,
): WorkingSetManager {
  const { store } = options;
  const budgetBytes = options.budgetBytes ?? DEFAULT_BUDGET_BYTES;

  // Insertion-ordered LRU cache of asset bytes the manager has loaded
  // from the store. Most-recently-needed keys are moved to the end.
  const cache = new Map<string, string>();
  // Keys the store returned `null` for — broken references. Remembered
  // so a render miss for a non-existent key doesn't reload every frame.
  const absent = new Set<string>();
  // Serialize ensure() runs so concurrent proactive + miss feeds don't
  // race on the cache or dispatch a torn working-set.
  let running: Promise<void> = Promise.resolve();
  let disposed = false;
  // A4:absence 確定を 1 回だけ publish に反映させるための版数。
  let lastPublishedAbsenceRevision = assetAbsenceRevision();

  function currentCid(): string | null {
    return dispatcher.getState().container?.meta.container_id ?? null;
  }

  async function runEnsure(keys: Iterable<string>): Promise<void> {
    if (disposed) return;
    const cid = currentCid();
    if (!cid) return;
    const state = dispatcher.getState();
    const container = state.container;
    if (!container) return;

    const needed = new Set<string>();
    for (const k of keys) if (k.length > 0) needed.add(k);

    // Load any needed key we don't already hold (skip known-absent).
    for (const key of needed) {
      if (cache.has(key)) {
        // Touch for LRU recency.
        const v = cache.get(key)!;
        cache.delete(key);
        cache.set(key, v);
        continue;
      }
      if (absent.has(key)) continue;
      // A4(視覚監査 2026-07-25):throw は「不在の確定」ではない。
      // 一時的な I/O 障害を bytes 欠落と誤認すると、Light export の説明が
      // 消えて user を不安にさせる。clean な null のときだけ absence を記録する。
      let data: string | null;
      try {
        data = await store.loadAsset(cid, key);
      } catch (err) {
        if (disposed) return;
        console.warn('[PKC2] asset load failed (retryable):', key, err);
        continue;
      }
      if (disposed) return;
      if (typeof data === 'string') {
        cache.set(key, data);
        markAssetPresent(key);
      } else {
        absent.add(key);
        // 「store にも実体が無い」を render 経路から読める形で記録する。
        markAssetAbsent(key);
      }
    }

    // Retain any asset already resident in container.assets that the
    // manager did NOT load — those are dirty/unpersisted (freshly pasted
    // or imported) and must never be dropped. Fold them into the cache
    // so the published map keeps them.
    for (const [key, data] of Object.entries(container.assets)) {
      if (!cache.has(key)) cache.set(key, data);
    }

    await evictIfOverBudget(cid, needed);
    if (disposed) return;

    publishIfChanged(container.assets);
  }

  async function evictIfOverBudget(cid: string, needed: Set<string>): Promise<void> {
    let total = 0;
    for (const v of cache.values()) total += v.length;
    if (total <= budgetBytes) return;

    // Only evict keys confirmed present in the store — never drop bytes
    // that aren't safely persisted yet (data-safety invariant).
    const stored = new Set(await store.listAssetKeys(cid));
    if (disposed) return;
    // Iterate in LRU order (Map preserves insertion; least-recent first).
    for (const key of [...cache.keys()]) {
      if (total <= budgetBytes) break;
      if (needed.has(key)) continue; // never evict the current view
      if (!stored.has(key)) continue; // never evict unpersisted bytes
      const v = cache.get(key)!;
      cache.delete(key);
      total -= v.length;
    }
  }

  function publishIfChanged(prevAssets: Record<string, string>): void {
    // Build the new working-set from the cache. Skip the dispatch when
    // it is key-for-key identical to the live map (prevents the
    // render→miss→ensure→render loop from spinning forever).
    const prevKeys = Object.keys(prevAssets);
    let identical = prevKeys.length === cache.size;
    if (identical) {
      for (const k of prevKeys) {
        if (prevAssets[k] !== cache.get(k)) {
          identical = false;
          break;
        }
      }
    }
    // A4:bytes が 1 つも増えていなくても **absence が確定した回は publish
    // する**。そうしないと再 render 自体が起きず、「⏳ 読み込み中」が画面に
    // 残り続ける(このバグの本体)。revision で 1 回だけに絞るのでループ
    // しない ── 次の回は revision が動かず従来どおり早期 return する。
    const absenceRev = assetAbsenceRevision();
    if (identical && absenceRev === lastPublishedAbsenceRevision) return;
    lastPublishedAbsenceRevision = absenceRev;
    dispatcher.dispatch({
      type: 'SET_WORKING_SET_ASSETS',
      assets: Object.fromEntries(cache),
    });
  }

  function ensure(keys: Iterable<string>): Promise<void> {
    // Snapshot the keys eagerly — the caller's iterable (e.g. a drained
    // Set) may be mutated before the queued run executes.
    const snapshot = [...keys];
    running = running.then(() => runEnsure(snapshot)).catch((err) => {
      console.warn('[PKC2] working-set ensure failed:', err);
    });
    return running;
  }

  function selectionDeps(): string[] {
    const state = dispatcher.getState();
    const lid = state.selectedLid;
    if (!lid || !state.container) return [];
    return [...getEntryAssetDependencies(state.container, lid)];
  }

  function refresh(): Promise<void> {
    const keys = new Set<string>(selectionDeps());
    for (const k of drainAssetMisses()) keys.add(k);
    return ensure(keys);
  }

  // Proactive preload on the events that change which entry is shown.
  const PRELOAD_EVENTS: ReadonlySet<DomainEvent['type']> = new Set([
    'ENTRY_SELECTED',
    'CONTAINER_LOADED',
    'CONTAINER_IMPORTED',
    'CONTAINER_MERGED',
    'CONTAINER_REHYDRATED',
  ]);

  const unsub = dispatcher.onEvent((event) => {
    // On container replacement the cache is stale (possibly a different
    // cid / asset set). Reset so we don't retain another container's
    // bytes or treat stale keys as absent.
    if (
      event.type === 'CONTAINER_IMPORTED'
      || event.type === 'CONTAINER_MERGED'
      || event.type === 'CONTAINER_REHYDRATED'
      || event.type === 'CONTAINER_LOADED'
    ) {
      cache.clear();
      absent.clear();
      // A4:container が入れ替わったら不在判定も捨てる。残すと新しい
      // データに古い嘘(「見つかりません」)が付いたままになる。
      resetAssetAbsence();
      lastPublishedAbsenceRevision = assetAbsenceRevision();
    }
    if (PRELOAD_EVENTS.has(event.type)) void ensure(selectionDeps());
  });

  return {
    ensure,
    refresh,
    residentKeys: () => [...cache.keys()],
    dispose: () => {
      disposed = true;
      unsub();
    },
  };
}
