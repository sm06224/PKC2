/**
 * Orphan asset GC foundation.
 *
 * Features layer — pure functions over `Container`. No browser
 * APIs, no `Dispatcher`, no side effects. These helpers detect
 * which asset keys in `container.assets` are still referenced by
 * the container's entries and which have become orphans, and they
 * expose a minimal immutable cleanup helper that callers can
 * invoke explicitly.
 *
 * Reference sources (what counts as "referencing an asset"):
 *
 *   1. Attachment entries: every `attachment` archetype entry
 *      whose body parses to a JSON object with a non-empty string
 *      `asset_key` field contributes that key as a reference. This
 *      is the primary "owner" of an asset — attachments are how
 *      new assets enter the container in the first place.
 *
 *   2. Markdown asset references: `text` and `textlog` archetype
 *      entries may reference assets via `![alt](asset:K)` (image
 *      embed) or `[label](asset:K)` (non-image chip / link) inside
 *      their markdown body.
 *        - For `text` the whole body is scanned.
 *        - For `textlog` each log entry's `text` field is scanned
 *          individually. Log entries without a string `text` field
 *          contribute nothing.
 *      Extraction routes through `extractAssetReferences` so the
 *      set of recognised forms stays in sync with the markdown
 *      resolver.
 *
 * Out-of-scope reference sources (NOT counted here):
 *
 *   - `todo`, `form`, `folder`, `generic`, `opaque` bodies — none
 *     of these archetypes carry asset pointers today. If that ever
 *     changes, the scanner must be extended explicitly; there is
 *     no silent fallthrough.
 *   - Revisions snapshots (`container.revisions`) — they freeze
 *     historical body snapshots but do not own the underlying
 *     asset data. The foundation treats revisions as NOT
 *     reference-counted. See the docs for the trade-off rationale.
 *   - Relations — `container.relations` links entries, not assets.
 *   - `container.meta` — no asset pointers.
 *
 * Missing-reference handling:
 *
 *   An asset key that is referenced by a markdown body but NOT
 *   present in `container.assets` is still counted as a reference
 *   by `collectReferencedAssetKeys`. This reflects author INTENT
 *   (the user typed the reference) even though the resolver
 *   renders a `*[missing asset: K]*` marker. Orphan detection only
 *   cares about keys that EXIST in `container.assets` but have no
 *   referencer, so missing refs have no effect on the orphan set
 *   — they are simply filtered out by
 *   `keys(container.assets) ∩ referenced`. The spec is therefore:
 *   "include missing refs in the referenced set; they naturally
 *   drop out of the orphan set".
 *
 * Foundation vs policy:
 *
 *   This module is intentionally passive.
 *     - `collectReferencedAssetKeys` / `collectOrphanAssetKeys`
 *       are pure read-only scans.
 *     - `removeOrphanAssets` is a pure helper that builds a NEW
 *       container with orphans removed, leaving the original
 *       immutable.
 *
 *   Tier 2-1 (2026-04-14) wired ONE narrow auto-invocation site:
 *   the reducer calls `removeOrphanAssets` on `SYS_IMPORT_COMPLETE`
 *   and `CONFIRM_IMPORT`, i.e. whenever the container is being
 *   replaced wholesale. Every other reducer path — DELETE_ENTRY,
 *   COMMIT_EDIT, QUICK_UPDATE_ENTRY, BULK_DELETE, RESTORE_ENTRY,
 *   PURGE_TRASH — intentionally does NOT auto-GC, because those
 *   paths can leave revisions pointing at the purged asset key,
 *   and a later RESTORE_ENTRY could surface the missing asset. See
 *   `docs/development/orphan-asset-auto-gc.md` for the full policy
 *   rationale and the list of "not auto-GC'd" paths.
 *
 *   Manual cleanup via `PURGE_ORPHAN_ASSETS` is unchanged and
 *   remains the user-facing button for cleaning up after normal
 *   edits / deletes.
 */

import type { Container } from '../../core/model/container';
import { extractAssetReferences } from '../markdown/asset-resolver';
import { parseTextlogBody } from '../textlog/textlog-body';

/**
 * Walk every entry in `container.entries` and return the
 * deduplicated set of asset keys that are still referenced by at
 * least one entry.
 *
 * Counted sources (see module header for the full rationale):
 *   - `attachment` entries → `body.asset_key` (JSON field)
 *   - `text` entries → `![..](asset:K)` / `[..](asset:K)` in body
 *   - `textlog` entries → same markdown forms inside each log
 *     entry's `text` field
 *
 * Returns a fresh `Set<string>`. Does not mutate the container.
 *
 * The returned set may contain keys that are NOT present in
 * `container.assets` (broken references). That is by design —
 * callers that want the intersection should compute it themselves
 * or use `collectOrphanAssetKeys`, which already filters.
 */
export function collectReferencedAssetKeys(container: Container): Set<string> {
  const refs = new Set<string>();
  for (const entry of container.entries) {
    if (entry.archetype === 'attachment') {
      // Inline parse: we only need the `asset_key` field. Doing the
      // shallow read here avoids importing the adapter-layer
      // `parseAttachmentBody` into a features-layer file, and
      // keeps the per-entry work at a single JSON.parse.
      //
      // Legacy attachments without an `asset_key` (data stored
      // inline in body) contribute nothing — they do not point
      // into `container.assets`. Malformed JSON is tolerated and
      // contributes nothing.
      try {
        const parsed = JSON.parse(entry.body) as { asset_key?: unknown };
        if (typeof parsed.asset_key === 'string' && parsed.asset_key.length > 0) {
          refs.add(parsed.asset_key);
        }
      } catch {
        /* malformed body — no reference contributed */
      }
      continue;
    }
    if (entry.archetype === 'text') {
      for (const k of extractAssetReferences(entry.body)) refs.add(k);
      continue;
    }
    if (entry.archetype === 'textlog') {
      // Reuse the shared features-layer parser so the scanner
      // stays in sync with any future textlog schema evolution
      // (default flags, timestamp normalisation, etc.). Malformed
      // bodies parse to `{ entries: [] }` and contribute nothing.
      const parsed = parseTextlogBody(entry.body);
      for (const log of parsed.entries) {
        if (typeof log.text === 'string' && log.text.length > 0) {
          for (const k of extractAssetReferences(log.text)) refs.add(k);
        }
      }
      continue;
    }
    // `todo`, `form`, `folder`, `generic`, `opaque` — none of
    // these archetypes carry asset references today. Explicit
    // no-op to make the archetype filter visible at the call site.
    // If a new archetype starts pointing at assets, update this
    // function AND add a scan test.
  }
  return refs;
}

/**
 * Return the set of asset keys that exist in `container.assets`
 * but are NOT referenced by any entry in the container. These are
 * the candidates for cleanup.
 *
 * Pure read-only scan. Calling this does not mutate the container
 * and does not remove anything from `container.assets`. Returns a
 * fresh `Set<string>` — empty when every asset key is referenced
 * (or when `container.assets` itself is empty / absent).
 */
export function collectOrphanAssetKeys(container: Container): Set<string> {
  const referenced = collectReferencedAssetKeys(container);
  const orphans = new Set<string>();
  const assets = container.assets ?? {};
  for (const key of Object.keys(assets)) {
    if (!referenced.has(key)) orphans.add(key);
  }
  return orphans;
}

/**
 * Build a new container with every orphan asset removed from the
 * `assets` map. Returns the ORIGINAL container reference when
 * there are zero orphans — callers can therefore use a cheap
 * `prev === next` identity check to decide whether any cleanup
 * actually happened.
 *
 * Scope:
 *   - Only `container.assets` is pruned. `entries`, `relations`,
 *     `revisions`, and `meta` are all reused by reference; this is
 *     a shallow immutable update, not a deep clone.
 *   - The pruned `assets` object is a fresh record, never a
 *     mutated alias of the caller's input.
 *
 * Non-responsibilities:
 *   - Does NOT touch `meta.updated_at`. Asset cleanup is a
 *     maintenance operation; the timestamp semantics for "the
 *     container's user-visible content changed" are owned by the
 *     reducer, not by this helper.
 *   - Does NOT emit any domain event. Callers integrating with
 *     the dispatcher are responsible for wrapping this helper in
 *     an action / event pair if they need one.
 *   - Does NOT auto-trigger. Nothing in the app calls this helper
 *     today; wiring is a future policy decision.
 */
export function removeOrphanAssets(container: Container): Container {
  const orphans = collectOrphanAssetKeys(container);
  if (orphans.size === 0) return container;
  const pruned: Record<string, string> = {};
  const assets = container.assets ?? {};
  for (const [key, value] of Object.entries(assets)) {
    if (!orphans.has(key)) pruned[key] = value;
  }
  return { ...container, assets: pruned };
}
