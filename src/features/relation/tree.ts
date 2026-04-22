import type { Relation } from '../../core/model/relation';
import type { Entry } from '../../core/model/record';

/**
 * TreeNode: an entry with its structural children.
 * Used for rendering hierarchical sidebar.
 */
export interface TreeNode {
  entry: Entry;
  children: TreeNode[];
  depth: number;
}

/**
 * Build a tree from entries and structural relations.
 *
 * Convention: a structural relation `from → to` means
 * "from is the parent, to is the child".
 * i.e., from = folder, to = contained entry.
 *
 * Returns root-level nodes (entries with no structural parent) plus
 * a fallback tail of any entry that the root pass failed to reach.
 *
 * ── Cycle-safety (F-cycle hotfix) ───────────────────────────────
 * The naive root rule ("entry has no structural parent") leaves a
 * structural cycle (A→B and B→A, 3-cycle A→B→C→A, …) with every
 * member marked `hasParent = true`, so none are picked as root and
 * the whole component disappears from the sidebar. The `placedLids`
 * sweep at the end rescues any entry still missing after the normal
 * pass, treating it as a fallback root. A per-walk `visited` set
 * inside `buildNode` keeps cycle recursion from looping back on
 * itself (also covers self-loops A→A and dangling parent refs
 * where the referenced parent lid is not in `entries`).
 *
 * Normal DAG output is preserved: the fallback sweep only fires
 * when entries are truly unreachable from the root pass.
 *
 * Max depth is capped to prevent runaway recursion.
 */
export function buildTree(
  entries: readonly Entry[],
  relations: readonly Relation[],
  maxDepth = 4,
): TreeNode[] {
  // Build parent→children map from structural relations
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const r of relations) {
    if (r.kind !== 'structural') continue;
    // from = parent, to = child
    if (!childrenOf.has(r.from)) childrenOf.set(r.from, []);
    childrenOf.get(r.from)!.push(r.to);
    hasParent.add(r.to);
  }

  const entryMap = new Map(entries.map((e) => [e.lid, e]));

  // Every lid that has been materialised into the returned tree,
  // whether as a root or as a descendant. Populated by `buildNode`;
  // consulted by the fallback sweep below.
  const placedLids = new Set<string>();

  // When `maxDepth` truncates display, we still need to record that
  // the truncated descendants are structurally reachable — otherwise
  // the fallback sweep below would misread them as isolated and
  // promote them to a second root. Pure bookkeeping: it mutates only
  // the shared `placedLids` / `walkVisited` sets, it does not build
  // TreeNodes.
  function markReachableBelowCap(lid: string, walkVisited: Set<string>): void {
    if (!entryMap.has(lid)) return;
    if (walkVisited.has(lid)) return;
    walkVisited.add(lid);
    placedLids.add(lid);
    const childLids = childrenOf.get(lid) ?? [];
    for (const childLid of childLids) {
      markReachableBelowCap(childLid, walkVisited);
    }
  }

  function buildNode(lid: string, depth: number, walkVisited: Set<string>): TreeNode | null {
    const entry = entryMap.get(lid);
    if (!entry) return null;
    // Per-walk cycle guard: if the current walk has already seen
    // this lid, cut the recursion. Self-loops and mutual cycles
    // both hit this path.
    if (walkVisited.has(lid)) return null;
    walkVisited.add(lid);
    placedLids.add(lid);

    const children: TreeNode[] = [];
    const childLids = childrenOf.get(lid) ?? [];
    for (const childLid of childLids) {
      if (depth < maxDepth) {
        const child = buildNode(childLid, depth + 1, walkVisited);
        if (child) children.push(child);
      } else {
        markReachableBelowCap(childLid, walkVisited);
      }
    }

    return { entry, children, depth };
  }

  // Root nodes: entries that have no structural parent
  const roots: TreeNode[] = [];
  for (const entry of entries) {
    if (!hasParent.has(entry.lid)) {
      const node = buildNode(entry.lid, 0, new Set<string>());
      if (node) roots.push(node);
    }
  }

  // Fallback sweep — rescue entries that the root pass did not
  // reach. Two causes in practice:
  //   (a) a structural cycle in which every member has a parent,
  //       so no natural root exists (mutual / 3-cycle / self-loop);
  //   (b) a dangling `from` pointing at a lid not in `entries`,
  //       which incorrectly marks the referenced child as "has a
  //       parent" even though that parent is absent.
  // Entries order is preserved so fallback placement is
  // deterministic.
  for (const entry of entries) {
    if (!placedLids.has(entry.lid)) {
      const node = buildNode(entry.lid, 0, new Set<string>());
      if (node) roots.push(node);
    }
  }

  return roots;
}

/**
 * Get the structural parent of an entry, if any.
 */
export function getStructuralParent(
  relations: readonly Relation[],
  entries: readonly Entry[],
  lid: string,
): Entry | null {
  for (const r of relations) {
    if (r.kind === 'structural' && r.to === lid) {
      const parent = entries.find((e) => e.lid === r.from);
      if (parent) return parent;
    }
  }
  return null;
}

/**
 * Get the first structural child of a folder entry, if any.
 * Mirror of {@link getStructuralParent} — scans relations for the
 * first `structural` relation where `from === parentLid` and returns
 * the corresponding entry. Child order follows relation iteration order.
 */
export function getFirstStructuralChild(
  relations: readonly Relation[],
  entries: readonly Entry[],
  parentLid: string,
): Entry | null {
  for (const r of relations) {
    if (r.kind === 'structural' && r.from === parentLid) {
      const child = entries.find((e) => e.lid === r.to);
      if (child) return child;
    }
  }
  return null;
}

/**
 * Get the breadcrumb path (ancestors) for an entry.
 * Returns array from root ancestor to immediate parent (excludes self).
 */
export function getBreadcrumb(
  relations: readonly Relation[],
  entries: readonly Entry[],
  lid: string,
  maxDepth = 4,
): Entry[] {
  const path: Entry[] = [];
  let current = lid;
  for (let i = 0; i < maxDepth; i++) {
    const parent = getStructuralParent(relations, entries, current);
    if (!parent) break;
    path.unshift(parent);
    current = parent.lid;
  }
  return path;
}

/**
 * Walk the structural parent chain from `lid` upward and return the
 * lids of every ancestor that is itself a folder. Used to auto-expand
 * ancestors when `SELECT_ENTRY` is dispatched, so that Storage Profile
 * / entry-ref / calendar / kanban jumps land visibly inside the tree.
 *
 * Non-folder ancestors are silently skipped — only folder lids are
 * meaningful for `collapsedFolders` membership.
 *
 * Cycle-safe: a `visited` set breaks walks on malformed graphs.
 * Depth-bounded at `maxDepth` to match practical tree-build limits.
 */
export function getAncestorFolderLids(
  relations: readonly Relation[],
  entries: readonly Entry[],
  lid: string,
  maxDepth = 32,
): string[] {
  const out: string[] = [];
  const visited = new Set<string>([lid]);
  let current = lid;
  for (let i = 0; i < maxDepth; i++) {
    const parent = getStructuralParent(relations, entries, current);
    if (!parent) break;
    if (visited.has(parent.lid)) break;
    visited.add(parent.lid);
    if (parent.archetype === 'folder') out.push(parent.lid);
    current = parent.lid;
  }
  return out;
}

/**
 * Check whether `candidateDescendant` is a descendant of `ancestorLid`
 * via structural relations. Used by DnD to prevent circular moves.
 */
export function isDescendant(
  relations: readonly Relation[],
  ancestorLid: string,
  candidateDescendant: string,
): boolean {
  const visited = new Set<string>();
  function walk(lid: string): boolean {
    if (visited.has(lid)) return false;
    visited.add(lid);
    for (const r of relations) {
      if (r.kind === 'structural' && r.from === lid) {
        if (r.to === candidateDescendant) return true;
        if (walk(r.to)) return true;
      }
    }
    return false;
  }
  return walk(ancestorLid);
}

/**
 * Get available folder entries for "move to" UI.
 * Excludes the entry itself and its descendants.
 */
export function getAvailableFolders(
  entries: readonly Entry[],
  relations: readonly Relation[],
  excludeLid: string,
): Entry[] {
  // Find all descendants of excludeLid to prevent circular moves
  const descendants = new Set<string>();
  function collectDescendants(lid: string): void {
    for (const r of relations) {
      if (r.kind === 'structural' && r.from === lid && !descendants.has(r.to)) {
        descendants.add(r.to);
        collectDescendants(r.to);
      }
    }
  }
  collectDescendants(excludeLid);

  return entries.filter(
    (e) => e.archetype === 'folder' && e.lid !== excludeLid && !descendants.has(e.lid),
  );
}

/**
 * Collect all descendant LIDs of a folder, recursively, via
 * structural relations. Returns a Set of LIDs (does NOT include
 * the folder itself). Pure — no side effects or state mutation.
 *
 * Used by folder-scoped export to determine which entries belong
 * to a given folder subtree.
 */
export function collectDescendantLids(
  relations: readonly Relation[],
  folderLid: string,
): Set<string> {
  const descendants = new Set<string>();
  function walk(lid: string): void {
    for (const r of relations) {
      if (r.kind === 'structural' && r.from === lid && !descendants.has(r.to)) {
        descendants.add(r.to);
        walk(r.to);
      }
    }
  }
  walk(folderLid);
  return descendants;
}
