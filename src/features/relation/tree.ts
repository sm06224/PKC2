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
 * Returns root-level nodes (entries with no structural parent).
 * Children are nested within their parent's TreeNode.
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

  function buildNode(lid: string, depth: number): TreeNode | null {
    const entry = entryMap.get(lid);
    if (!entry) return null;

    const children: TreeNode[] = [];
    if (depth < maxDepth) {
      const childLids = childrenOf.get(lid) ?? [];
      for (const childLid of childLids) {
        const child = buildNode(childLid, depth + 1);
        if (child) children.push(child);
      }
    }

    return { entry, children, depth };
  }

  // Root nodes: entries that have no structural parent
  const roots: TreeNode[] = [];
  for (const entry of entries) {
    if (!hasParent.has(entry.lid)) {
      const node = buildNode(entry.lid, 0);
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
