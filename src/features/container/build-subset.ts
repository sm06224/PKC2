/**
 * Build a self-consistent subset of a `Container` rooted at a single
 * entry.
 *
 * Used by the "selected-entry HTML clone export" feature: given the
 * container currently open in PKC2 and the lid of one entry, produce
 * a smaller container that can be embedded into a stand-alone HTML
 * clone and will still open cleanly on the recipient side.
 *
 * Reachability rules:
 *
 *   1. The root entry is always included.
 *   2. Every `entry:<lid>` reference in a TEXT body, a TEXTLOG log
 *      entry's text, a TODO description, or a FOLDER description
 *      (including transclusion `![](entry:lid)` and link
 *      `[label](entry:lid)` forms, plus any fragment variant) pulls
 *      the target entry into the subset, recursively. TODO description
 *      scanning was added in P1 Slice 2 and FOLDER description
 *      scanning in P1 Slice 3, matching the markdown render surfaces
 *      on the viewer side.
 *   3. Every `asset:<key>` reference in a TEXT body, a TEXTLOG log
 *      entry's text, a TODO description, or a FOLDER description
 *      contributes the key.
 *      Attachment entries whose `asset_key` matches a contributed key
 *      are pulled into the subset too so the recipient keeps MIME /
 *      display-name metadata.
 *   4. Structural ancestor folders of every included entry are added
 *      so the tree path used by breadcrumbs, storage-profile jumps,
 *      and `SELECT_ENTRY` auto-expand still resolves.
 *
 * Filtering rules (applied after reachability closes):
 *
 *   - `relations`: only entries whose `from` AND `to` are both in the
 *     subset survive. Structural relations remain structural,
 *     categorical/semantic/temporal relations survive when their
 *     endpoints are both included. Dangling edges are dropped.
 *   - `assets`: only keys that the included entries reference survive.
 *     Missing-in-source keys (referenced but not present in
 *     `container.assets`) are simply absent in the subset — the peer
 *     sees the same broken-ref signal the sender saw.
 *   - `revisions`: dropped. Revisions are historical snapshots of
 *     bodies — preserving them across a subset export would leak
 *     content from entries that were filtered out. Callers that want
 *     revision history should export the full container.
 *
 * Features layer — pure. No DOM, no browser APIs.
 */

import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import type { Relation } from '../../core/model/relation';
import { extractAssetReferences } from '../markdown/asset-resolver';
import { extractEntryReferences } from '../entry-ref/extract-entry-refs';
import { parseTextlogBody } from '../textlog/textlog-body';
import { parseTodoBody } from '../todo/todo-body';
import { getStructuralParent } from '../relation/tree';

/** Maximum ancestor-walk depth. Matches `getAncestorFolderLids`. */
const MAX_ANCESTOR_DEPTH = 32;

/** Maximum ref-closure iterations (cycle safety). */
const MAX_REF_ITERATIONS = 10_000;

export interface BuildSubsetResult {
  /** Subset container suitable for embedding into an HTML clone. */
  container: Container;
  /** Lids of every entry that ended up in the subset. */
  includedLids: ReadonlySet<string>;
  /** Asset keys that the subset references. */
  includedAssetKeys: ReadonlySet<string>;
  /** Referenced LIDs that could not be resolved in the source container. */
  missingEntryLids: ReadonlySet<string>;
  /** Referenced asset keys that are not present in `container.assets`. */
  missingAssetKeys: ReadonlySet<string>;
}

/**
 * Build a subset container rooted at `rootLid` (or multiple roots).
 *
 * Single-root: returns `null` when `rootLid` does not resolve to any
 * entry in `container.entries` — callers should treat that as an
 * inert case (the UI is already gated but a stale selection could
 * still reach this helper).
 *
 * Multi-root (S2): accepts `readonly string[]`. Invalid / missing
 * root lids are silently dropped so a stale multi-selection does
 * not fail the entire export; only when *every* provided root is
 * missing (or the array is empty) does the function return `null`.
 * Duplicate roots collapse via the shared `includedLids` set. Root
 * order in `container.entries` remains deterministic (the filter
 * pass preserves `container.entries` order, not the input root
 * order), matching the single-root contract.
 */
export function buildSubsetContainer(
  container: Container,
  rootLid: string,
): BuildSubsetResult | null;
export function buildSubsetContainer(
  container: Container,
  rootLids: readonly string[],
): BuildSubsetResult | null;
export function buildSubsetContainer(
  container: Container,
  rootLidOrLids: string | readonly string[],
): BuildSubsetResult | null {
  const entryByLid = new Map<string, Entry>();
  for (const e of container.entries) entryByLid.set(e.lid, e);

  // Normalise the two overloads into a deduped list of valid root
  // lids. Strict single-root null-on-missing is preserved; multi-root
  // silently drops missing lids and returns null only when nothing
  // resolves.
  let validRootLids: string[];
  if (typeof rootLidOrLids === 'string') {
    if (!entryByLid.has(rootLidOrLids)) return null;
    validRootLids = [rootLidOrLids];
  } else {
    const seen = new Set<string>();
    validRootLids = [];
    for (const lid of rootLidOrLids) {
      if (seen.has(lid)) continue;
      seen.add(lid);
      if (entryByLid.has(lid)) validRootLids.push(lid);
    }
    if (validRootLids.length === 0) return null;
  }

  // ─── 1. Close over entry refs (transclusion + link + bare) ───
  const includedLids = new Set<string>(validRootLids);
  const missingEntryLids = new Set<string>();
  const assetKeysFromBodies = new Set<string>();

  const pending: string[] = [...validRootLids];

  let iter = 0;
  while (pending.length > 0) {
    if (++iter > MAX_REF_ITERATIONS) break; // cycle / pathological input
    const lid = pending.pop()!;
    const entry = entryByLid.get(lid);
    if (!entry) continue;

    const bodies = collectScannableBodies(entry);
    for (const text of bodies) {
      for (const key of extractAssetReferences(text)) {
        assetKeysFromBodies.add(key);
      }
      for (const refLid of extractEntryReferences(text)) {
        if (!entryByLid.has(refLid)) {
          missingEntryLids.add(refLid);
          continue;
        }
        if (!includedLids.has(refLid)) {
          includedLids.add(refLid);
          pending.push(refLid);
        }
      }
    }
  }

  // ─── 2. Pull in attachment entries that own a referenced asset ───
  // They carry the MIME / name metadata the resolver needs. Their
  // own body is JSON, not markdown, so they do not themselves
  // contribute further refs.
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    const key = readAttachmentAssetKey(entry);
    if (!key) continue;
    if (assetKeysFromBodies.has(key) && !includedLids.has(entry.lid)) {
      includedLids.add(entry.lid);
    }
  }

  // ─── 3. Pull in structural ancestors of every included entry ───
  // Ancestor folders restore the tree path so navigation / breadcrumb
  // / SELECT_ENTRY auto-expand still resolve on the recipient side.
  // Non-folder ancestors are included too (rare but legal: a text
  // entry could be the structural parent of another), so the path
  // stays contiguous.
  const ancestorSeed = Array.from(includedLids);
  for (const lid of ancestorSeed) {
    let current = lid;
    const visited = new Set<string>([lid]);
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth++) {
      const parent = getStructuralParent(container.relations, container.entries, current);
      if (!parent) break;
      if (visited.has(parent.lid)) break;
      visited.add(parent.lid);
      includedLids.add(parent.lid);
      current = parent.lid;
    }
  }

  // ─── 4. Filter entries / relations / assets ───
  const subsetEntries: Entry[] = container.entries.filter((e) => includedLids.has(e.lid));
  const subsetRelations: Relation[] = container.relations.filter(
    (r) => includedLids.has(r.from) && includedLids.has(r.to),
  );

  // Re-scan the final entry subset for assets (attachment `asset_key`
  // fields contribute too, so we get the full referenced set — which
  // may be a superset of `assetKeysFromBodies` if an attachment got
  // pulled in as a structural ancestor but its owned asset wasn't
  // body-referenced; that case is degenerate but the extra key is
  // harmless).
  const referencedAssetKeys = new Set<string>();
  for (const entry of subsetEntries) {
    if (entry.archetype === 'attachment') {
      const key = readAttachmentAssetKey(entry);
      if (key) referencedAssetKeys.add(key);
      continue;
    }
    for (const text of collectScannableBodies(entry)) {
      for (const key of extractAssetReferences(text)) {
        referencedAssetKeys.add(key);
      }
    }
  }

  const sourceAssets = container.assets ?? {};
  const subsetAssets: Record<string, string> = {};
  const missingAssetKeys = new Set<string>();
  for (const key of referencedAssetKeys) {
    const data = sourceAssets[key];
    if (typeof data === 'string' && data.length > 0) {
      subsetAssets[key] = data;
    } else {
      missingAssetKeys.add(key);
    }
  }

  const subsetContainer: Container = {
    meta: container.meta,
    entries: subsetEntries,
    relations: subsetRelations,
    // Revisions intentionally dropped — they'd leak bodies from
    // entries that were filtered out.
    revisions: [],
    assets: subsetAssets,
  };

  return {
    container: subsetContainer,
    includedLids,
    includedAssetKeys: referencedAssetKeys,
    missingEntryLids,
    missingAssetKeys,
  };
}

// ── Internal helpers ──────────────────────────────────────────

/**
 * Collect every markdown-shaped string carried by an entry that
 * could contain an `asset:` or `entry:` reference.
 *
 * - `text`: the body is markdown — one string.
 * - `textlog`: each log row's `text` field is markdown — N strings.
 * - `todo`: the parsed `description` field (Slice 2 pre-positions this
 *   scan so the subset closure stays correct once Slice 3 switches
 *   the description render path from raw text to markdown).
 * - everything else: no markdown references contributed.
 */
function collectScannableBodies(entry: Entry): string[] {
  if (entry.archetype === 'text') {
    return typeof entry.body === 'string' ? [entry.body] : [];
  }
  if (entry.archetype === 'textlog') {
    const parsed = parseTextlogBody(entry.body);
    const out: string[] = [];
    for (const row of parsed.entries) {
      if (typeof row.text === 'string' && row.text.length > 0) out.push(row.text);
    }
    return out;
  }
  if (entry.archetype === 'todo') {
    const parsed = parseTodoBody(entry.body);
    return parsed.description.length > 0 ? [parsed.description] : [];
  }
  if (entry.archetype === 'folder') {
    // Folder descriptions are plain strings (no JSON wrapper) per
    // `adapter/ui/folder-presenter.ts`. Slice 3 markdown-renders the
    // body in the viewer, so any `entry:` / `asset:` refs in it must
    // close the subset too. The regex-based extractors tolerate
    // non-markdown input and simply return an empty set.
    return typeof entry.body === 'string' && entry.body.length > 0 ? [entry.body] : [];
  }
  return [];
}

function readAttachmentAssetKey(entry: Entry): string | null {
  if (entry.archetype !== 'attachment') return null;
  try {
    const parsed = JSON.parse(entry.body) as { asset_key?: unknown };
    if (typeof parsed.asset_key === 'string' && parsed.asset_key.length > 0) {
      return parsed.asset_key;
    }
  } catch {
    /* malformed body */
  }
  return null;
}
