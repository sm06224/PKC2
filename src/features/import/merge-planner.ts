/**
 * Merge import planner — pure helpers for the Tier 3-1 Overlay MVP.
 *
 * Canonical spec: `docs/spec/merge-import-conflict-resolution.md`.
 * Invariants I-Merge1 / I-Merge2 in `HANDOVER_FINAL.md §18.2`.
 *
 * Contract:
 *   planMergeImport(host, imported, now) →
 *     - { error: 'schema-mismatch' } when schema_version differs, or
 *     - MergePlan describing how imported flows into host's namespace.
 *   applyMergePlan(host, imported, plan, now) → a new Container that
 *     is host-with-imported overlayed.
 *
 * Overlay (append-only) semantics:
 *   - Host entries / relations / revisions are never mutated.
 *   - Imported entries always land with a fresh (or original) lid
 *     in host's namespace — never by overwriting host's lids.
 *   - Imported assets dedupe when key + content both match host;
 *     otherwise the imported key is rehashed with a suffix.
 *   - Imported relations are remapped through the lid table and
 *     only added when both endpoints resolve; duplicates are skipped.
 *   - Imported revisions are dropped wholesale (MVP §4.4).
 *
 * Determinism:
 *   The `now` parameter seeds minted lid / asset keys, so the plan
 *   is fully reproducible given the same inputs. Core is forbidden
 *   from calling Date.now(); features may, but this helper chooses
 *   to take `now` explicitly for testability.
 */

import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import type { Relation } from '../../core/model/relation';

/**
 * Counts surfaced in the preview UI's merge summary.
 * Every field is a non-negative integer; summing `addedEntries +
 * renamedLids` does NOT hold — `renamedLids` is a subset of
 * `addedEntries` (see `§7.1` of the spec).
 */
export interface MergeCounts {
  /** Every imported entry is added (append-only). */
  addedEntries: number;
  /** Imported entries whose lid collided with host and were renamed. */
  renamedLids: number;
  /** Net new asset keys written into host.assets. */
  addedAssets: number;
  /** Imported asset keys whose content exactly matches host (reused). */
  dedupedAssets: number;
  /** Imported asset keys that collided with host on a DIFFERENT content and were rehashed. */
  rehashedAssets: number;
  /** Imported relations accepted (remapped) into host. */
  addedRelations: number;
  /** Imported relations dropped (dangling endpoints or duplicate `(from,to,kind)`). */
  droppedRelations: number;
  /** Imported revisions dropped — MVP drops them all; always equals imported.revisions.length. */
  droppedRevisions: number;
}

export interface MergePlan {
  /** imported.lid → host-namespace lid (always populated for every imported entry). */
  lidRemap: Map<string, string>;
  /** imported asset key → host-namespace asset key (populated for every imported asset key). */
  assetRemap: Map<string, string>;
  /** Summary counts for the preview UI and downstream events. */
  counts: MergeCounts;
}

export type MergeError = { error: 'schema-mismatch' };

/**
 * Plan — read-only analysis. Does NOT mutate either container.
 */
export function planMergeImport(
  host: Container,
  imported: Container,
  now: string,
): MergePlan | MergeError {
  if (host.meta.schema_version !== imported.meta.schema_version) {
    return { error: 'schema-mismatch' };
  }

  // ── Entry lid remap ───────────────────────────
  const usedLids = new Set(host.entries.map((e) => e.lid));
  const lidRemap = new Map<string, string>();
  let renamedLids = 0;
  for (const entry of imported.entries) {
    if (!usedLids.has(entry.lid)) {
      // imported lid doesn't collide → reuse as-is
      usedLids.add(entry.lid);
      lidRemap.set(entry.lid, entry.lid);
    } else {
      const minted = mintMergedLid(usedLids, now);
      usedLids.add(minted);
      lidRemap.set(entry.lid, minted);
      renamedLids++;
    }
  }

  // ── Asset key remap ───────────────────────────
  const usedAssetKeys = new Set(Object.keys(host.assets));
  const assetRemap = new Map<string, string>();
  let addedAssets = 0;
  let dedupedAssets = 0;
  let rehashedAssets = 0;
  for (const [key, value] of Object.entries(imported.assets)) {
    if (!usedAssetKeys.has(key)) {
      // New key: write through as-is
      usedAssetKeys.add(key);
      assetRemap.set(key, key);
      addedAssets++;
    } else if (host.assets[key] === value) {
      // Content identical → dedupe onto host's entry
      assetRemap.set(key, key);
      dedupedAssets++;
    } else {
      // Collision with different content → rehash
      const minted = mintMergedAssetKey(usedAssetKeys, key, now);
      usedAssetKeys.add(minted);
      assetRemap.set(key, minted);
      addedAssets++;
      rehashedAssets++;
    }
  }

  // ── Relation pass (counts only) ────────────────
  const existingRelationKeys = new Set(
    host.relations.map((r) => relationKey(r.from, r.to, r.kind)),
  );
  let addedRelations = 0;
  let droppedRelations = 0;
  for (const rel of imported.relations) {
    const fromNew = lidRemap.get(rel.from);
    const toNew = lidRemap.get(rel.to);
    if (fromNew === undefined || toNew === undefined) {
      // At least one endpoint is not in the imported-entry space.
      // MVP drops these (§4.3 choice 2).
      droppedRelations++;
      continue;
    }
    const key = relationKey(fromNew, toNew, rel.kind);
    if (existingRelationKeys.has(key)) {
      droppedRelations++;
    } else {
      existingRelationKeys.add(key);
      addedRelations++;
    }
  }

  return {
    lidRemap,
    assetRemap,
    counts: {
      addedEntries: imported.entries.length,
      renamedLids,
      addedAssets,
      dedupedAssets,
      rehashedAssets,
      addedRelations,
      droppedRelations,
      droppedRevisions: imported.revisions.length,
    },
  };
}

/**
 * Apply a plan to produce the merged Container.
 *
 * Pure: does not mutate inputs. `now` advances host.meta.updated_at
 * only; host's other meta fields (title / description / created_at /
 * container_id) are preserved per §4.5.
 */
export function applyMergePlan(
  host: Container,
  imported: Container,
  plan: MergePlan,
  now: string,
): Container {
  // ── Entries: remap lid + rewrite body asset refs ───
  const addedEntries: Entry[] = imported.entries.map((entry) => {
    const newLid = plan.lidRemap.get(entry.lid) ?? entry.lid;
    const newBody = rewriteAssetReferences(entry.body, plan.assetRemap);
    return { ...entry, lid: newLid, body: newBody };
  });

  // ── Assets: merge with rename-on-collision ─────
  const mergedAssets: Record<string, string> = { ...host.assets };
  for (const [oldKey, newKey] of plan.assetRemap) {
    if (oldKey === newKey && newKey in mergedAssets) {
      // Dedupe: host already has exact content under the same key.
      continue;
    }
    // Writing imported content under newKey. If newKey happens to
    // equal a host key, planMergeImport classified this as dedupe
    // (content identical) — the `in mergedAssets` guard above
    // covers that case. Otherwise newKey is a minted fresh key.
    mergedAssets[newKey] = imported.assets[oldKey]!;
  }

  // ── Relations: remap, drop dangling, skip duplicates ─
  const existingKeys = new Set(
    host.relations.map((r) => relationKey(r.from, r.to, r.kind)),
  );
  const addedRelations: Relation[] = [];
  for (const rel of imported.relations) {
    const fromNew = plan.lidRemap.get(rel.from);
    const toNew = plan.lidRemap.get(rel.to);
    if (fromNew === undefined || toNew === undefined) continue;
    const key = relationKey(fromNew, toNew, rel.kind);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    addedRelations.push({ ...rel, from: fromNew, to: toNew });
  }

  return {
    meta: { ...host.meta, updated_at: now },
    entries: [...host.entries, ...addedEntries],
    relations: [...host.relations, ...addedRelations],
    // MVP drops imported revisions wholesale (spec §4.4).
    revisions: host.revisions,
    assets: mergedAssets,
  };
}

// ── Internal ─────────────────────────

function relationKey(from: string, to: string, kind: string): string {
  return `${from}\u0000${to}\u0000${kind}`;
}

/**
 * Rewrite `asset:<oldKey>` occurrences to `asset:<newKey>` inside a
 * body string. Scope: every occurrence in any markdown form
 * (`![alt](asset:key)` / `[label](asset:key)`). Boundary protection
 * via negative lookahead on the allowed key charset.
 *
 * Noop when every key in `assetRemap` maps to itself (common case).
 */
function rewriteAssetReferences(
  body: string,
  assetRemap: Map<string, string>,
): string {
  let result = body;
  for (const [oldKey, newKey] of assetRemap) {
    if (oldKey === newKey) continue;
    const escaped = oldKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match `asset:<oldKey>` not followed by another key-char.
    // Key charset per spec body-formats.md §9: [A-Za-z0-9_-]+
    const re = new RegExp(`asset:${escaped}(?![A-Za-z0-9_-])`, 'g');
    result = result.replace(re, `asset:${newKey}`);
  }
  return result;
}

/**
 * Mint a lid in host's namespace that is not present in `used`.
 * Deterministic given `now` + the collision sequence. Format:
 * `m-<now-stripped>-<seq>` so merged lids are visually
 * distinguishable from app-minted ones while still respecting the
 * [A-Za-z0-9-] character class.
 */
function mintMergedLid(used: Set<string>, now: string): string {
  const stamp = normalizeStamp(now);
  // eslint no-constant-condition: this loop is guaranteed to
  // terminate because `used` is a finite Set and we only add to
  // it; seq monotonically increases until a free slot is found.
  for (let seq = 1; ; seq++) {
    const candidate = `m-${stamp}-${seq}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Mint an asset key in host's namespace that is not present in `used`.
 * Format preserves the imported key as a hint so the provenance is
 * still traceable: `<importedKey>-m<stamp>-<seq>`.
 */
function mintMergedAssetKey(
  used: Set<string>,
  importedKey: string,
  now: string,
): string {
  const stamp = normalizeStamp(now);
  // See mintMergedLid for the termination argument.
  for (let seq = 1; ; seq++) {
    const candidate = `${importedKey}-m${stamp}-${seq}`;
    if (!used.has(candidate)) return candidate;
  }
}

function normalizeStamp(now: string): string {
  // Keep only characters safe in lid / asset key: [A-Za-z0-9-].
  // ISO 8601 timestamps like `2026-04-14T12:34:56.789Z` pass through
  // mostly intact, minus `:` / `.` / `T` / `Z` normalization.
  return now.replace(/[^A-Za-z0-9]/g, '').slice(0, 14) || '0';
}
