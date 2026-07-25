import type { Relation } from '../../core/model/relation';
import type { Entry } from '../../core/model/record';
import { isSystemArchetype } from '../../core/model/record';

/**
 * TreeNode: an entry with its structural children.
 * Used for rendering hierarchical sidebar.
 */
export interface TreeNode {
  entry: Entry;
  children: TreeNode[];
  depth: number;
  /**
   * 視覚監査 2026-07-25 B1(user 裁定「上限据え置き・打ち切りを可視化」):
   * `maxDepth` の cap で TreeNode 化されなかった **直下の** 子の件数。
   *
   * 従来は cap に当たった node の `children` が空になるだけで、呼び出し側は
   * 「子がいない」と区別できなかった ── サイドバーは深い entry を表示せず、
   * かつ子件数を `(0)` と表示して嘘をついていた。
   *
   * 子孫の総数ではなく **直下件数**。総数にすると `markReachableBelowCap` の
   * walk 結果に依存して経路によって値が変わる(walkVisited を共有するため)。
   * 0 件のときは `undefined` ── 既存の deep-equal test や spread による node
   * 複製を壊さないための optional。
   */
  truncatedChildCount?: number;
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
    let truncatedChildCount = 0;
    for (const childLid of childLids) {
      if (depth < maxDepth) {
        const child = buildNode(childLid, depth + 1, walkVisited);
        if (child) children.push(child);
      } else {
        // B1:「本来なら行になったはずの子」だけ数える。`childrenOf` は
        // 重複 structural relation を dedupe しない(上の loop 参照)ので
        // walkVisited で除外し、dangling ref は entryMap で除外する ──
        // depth < maxDepth 側の `children` は buildNode 内の同じ 2 つの
        // guard を通っているので、これで件数の意味論が一致する。
        // guard を落とすと「嘘(0)を別の嘘(水増し件数)で置き換える」ことになる。
        if (entryMap.has(childLid) && !walkVisited.has(childLid)) truncatedChildCount++;
        markReachableBelowCap(childLid, walkVisited);
      }
    }

    return truncatedChildCount > 0
      ? { entry, children, depth, truncatedChildCount }
      : { entry, children, depth };
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
 * PR-W24 v6(user 報告「左ペインと Filer の要素並び替え、1 階層しかソート対応
 * していなくて全てがバラバラ」):tree の各階層内で entries を sort する。
 *
 * - `'title'`:title 昇順、folder を folder で grouping(folder first, then non-folder)
 * - `'created_at'` / `'updated_at'`:同上 + 日付昇 / 降順(direction で切替)
 * - `'manual'`:identity(`reorderTreeByEntries` 経路で別途処理)
 *
 * 各 level で再帰的に同じ key + direction を適用。`hierarchical` doctrine:
 * 「folder が child を持つ場合、folder 自身は title 順、folder 内 child も
 * 同じ key で sort」。
 */
export function sortTreeNodes(
  nodes: readonly TreeNode[],
  key: 'title' | 'created_at' | 'updated_at',
  direction: 'asc' | 'desc',
): TreeNode[] {
  const dir = direction === 'asc' ? 1 : -1;
  const sorted = [...nodes].sort((a, b) => {
    // folder 優先(folder が同 level の non-folder より先に出る)
    const aIsFolder = a.entry.archetype === 'folder';
    const bIsFolder = b.entry.archetype === 'folder';
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
    // 同 archetype 内で primary key 比較
    const va = a.entry[key];
    const vb = b.entry[key];
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  // 再帰:各 node の children も同 key で sort
  return sorted.map((node) => ({
    ...node,
    children: sortTreeNodes(node.children, key, direction),
  }));
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
 * Direct structural children of `parentLid` (one hop), in the order
 * they appear in `relations`. Used by filer view to enumerate a
 * folder's contents without descending recursively (compare:
 * {@link collectDescendantLids} which walks the full subtree).
 *
 * Returns an empty array when the parent has no structural children
 * or when `parentLid` does not match any structural `from`.
 */
export function getStructuralChildren(
  relations: readonly Relation[],
  entries: readonly Entry[],
  parentLid: string,
): Entry[] {
  const out: Entry[] = [];
  const seen = new Set<string>();
  for (const r of relations) {
    if (r.kind !== 'structural' || r.from !== parentLid) continue;
    if (seen.has(r.to)) continue;
    seen.add(r.to);
    const child = entries.find((e) => e.lid === r.to);
    if (child) out.push(child);
  }
  return out;
}

/**
 * Top-level entries that have no structural parent. Filer view's
 * "root scope" (no folder selected) shows this list.
 *
 * Excludes system entries (`isSystemArchetype`) — those are PKC2-
 * managed and should not surface in the filer.
 */
export function getRootEntries(
  relations: readonly Relation[],
  entries: readonly Entry[],
): Entry[] {
  const hasParent = new Set<string>();
  for (const r of relations) {
    if (r.kind === 'structural') hasParent.add(r.to);
  }
  return entries.filter((e) => !hasParent.has(e.lid) && !isSystemArchetype(e.archetype));
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
