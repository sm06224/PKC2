/**
 * Filter-pipeline memoization cache (PR #189).
 *
 * The sidebar render pipeline's bucket-folder filters are pure
 * functions of `container.entries` + `container.relations`:
 *
 *   - `searchHide` excludes entries whose structural parent is an
 *     `ASSETS` / `TODOS` bucket folder
 *   - `treeHide` excludes bucket folders themselves AND their entire
 *     descendant subtree
 *   - the unreferenced-attachments lens excludes attachments that
 *     no other entry points to
 *
 * Pre-PR-189 these recomputed on every render. For c-5000 the
 * `treeHide` walk alone took ~100 ms / search-keystroke (PR #182
 * sub-instrumentation). State-only changes (the user typing in the
 * search box) do not change the container reference — so caching
 * by container identity is a clean win:
 *
 *   - Container immutable update (PASTE_ATTACHMENT / BATCH /
 *     COMMIT_EDIT / DELETE_ENTRY / ...) → new container ref → cache
 *     invalidates next read
 *   - Search keystroke / archetype filter toggle → container ref
 *     unchanged → cache hits
 *
 * The cache holds three derived Sets and is rebuilt lazily on the
 * first read against a new container reference.
 */

import type { Container } from '../../core/model/container';
import { collectDescendantLids, getStructuralParent } from '../../features/relation/tree';
import { ARCHETYPE_SUBFOLDER_NAMES } from '../../features/relation/auto-placement';
import { collectUnreferencedAttachmentLids } from '../../features/asset/asset-scan';

export interface FilterIndexes {
  /**
   * Bucket folders (ASSETS / TODOS) AND every entry inside them
   * (transitive descendants). Used by `treeHide` to drop the whole
   * subtree from the entry list.
   */
  hiddenBucketLids: ReadonlySet<string>;
  /**
   * Entries whose structural parent is itself a bucket folder
   * (ASSETS / TODOS). Used by `searchHide` to drop just the leaves
   * (the bucket folder itself stays visible).
   */
  bucketChildLids: ReadonlySet<string>;
  /**
   * Attachment entries that no other entry points to via any
   * relation. Used by the unreferenced-attachments cleanup lens.
   */
  unreferencedAttachmentLids: ReadonlySet<string>;
}

let cachedContainer: Container | null = null;
let cachedIndexes: FilterIndexes | null = null;

function buildIndexes(container: Container): FilterIndexes {
  const bucketTitles = new Set(Object.values(ARCHETYPE_SUBFOLDER_NAMES));

  // hiddenBucketLids: bucket folders + their descendants
  const hiddenBucketLids = new Set<string>();
  for (const e of container.entries) {
    if (e.archetype === 'folder' && bucketTitles.has(e.title)) {
      hiddenBucketLids.add(e.lid);
      for (const d of collectDescendantLids(container.relations, e.lid)) {
        hiddenBucketLids.add(d);
      }
    }
  }

  // bucketChildLids: entries whose structural parent is a bucket folder.
  // Implementation: scan structural relations once, mark `to` lids
  // whose `from` is a bucket-titled folder. O(R) instead of N × O(R)
  // (= per-entry getStructuralParent walk, the pre-PR-189 path).
  const bucketChildLids = new Set<string>();
  const entryByLid = new Map(container.entries.map((e) => [e.lid, e]));
  for (const rel of container.relations) {
    if (rel.kind !== 'structural') continue;
    const parent = entryByLid.get(rel.from);
    if (!parent || parent.archetype !== 'folder') continue;
    if (bucketTitles.has(parent.title)) bucketChildLids.add(rel.to);
  }

  // unreferencedAttachmentLids: attachments with no incoming references.
  const unreferencedAttachmentLids = collectUnreferencedAttachmentLids(container);

  return { hiddenBucketLids, bucketChildLids, unreferencedAttachmentLids };
}

/**
 * Return the derived filter indexes for `container`. First call per
 * container ref builds them; subsequent calls with the same ref are
 * O(1) cache hits. Container ref change = full rebuild.
 */
export function getFilterIndexes(container: Container): FilterIndexes {
  if (cachedContainer === container && cachedIndexes) {
    return cachedIndexes;
  }
  cachedIndexes = buildIndexes(container);
  cachedContainer = container;
  return cachedIndexes;
}

/**
 * Compatibility helper for the searchHide path. Returns the structural
 * parent's title (if folder) or null. Used to be implemented as a
 * per-entry call to `getStructuralParent`; PR #189 keeps the same
 * surface for callers that still want the "is the parent a folder
 * of this title?" question (e.g. unit tests of the existing path).
 *
 * Production renderer prefers `bucketChildLids.has(lid)` directly.
 */
export function getStructuralParentFolderTitle(
  container: Container,
  lid: string,
): string | null {
  const parent = getStructuralParent(container.relations, container.entries, lid);
  if (!parent || parent.archetype !== 'folder') return null;
  return parent.title;
}

/**
 * Test-only reset. Used by tests that exercise multiple synthetic
 * containers in a single suite to prevent cache bleed between cases.
 */
export function __resetFilterIndexCacheForTest(): void {
  cachedContainer = null;
  cachedIndexes = null;
}
