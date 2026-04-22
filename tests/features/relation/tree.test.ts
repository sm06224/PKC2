import { describe, it, expect } from 'vitest';
import {
  buildTree, getStructuralParent, getBreadcrumb, getAvailableFolders, isDescendant,
  collectDescendantLids, getAncestorFolderLids,
} from '@features/relation/tree';
import type { Relation } from '@core/model/relation';
import type { Entry } from '@core/model/record';

function makeRelation(
  id: string, from: string, to: string, kind: Relation['kind'] = 'structural',
): Relation {
  return { id, from, to, kind, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}

function makeEntry(lid: string, title: string, archetype: Entry['archetype'] = 'text'): Entry {
  return { lid, title, body: '', archetype, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
}

describe('buildTree', () => {
  it('returns all entries as roots when no structural relations exist', () => {
    const entries = [makeEntry('a', 'A'), makeEntry('b', 'B')];
    const tree = buildTree(entries, []);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.entry.lid).toBe('a');
    expect(tree[0]!.depth).toBe(0);
    expect(tree[0]!.children).toEqual([]);
  });

  it('nests children under parent via structural relation', () => {
    const entries = [
      makeEntry('folder1', 'Folder', 'folder'),
      makeEntry('child1', 'Child 1'),
      makeEntry('child2', 'Child 2'),
    ];
    const relations = [
      makeRelation('r1', 'folder1', 'child1'),
      makeRelation('r2', 'folder1', 'child2'),
    ];
    const tree = buildTree(entries, relations);
    expect(tree).toHaveLength(1); // Only folder1 is root
    expect(tree[0]!.entry.lid).toBe('folder1');
    expect(tree[0]!.children).toHaveLength(2);
    expect(tree[0]!.children[0]!.entry.lid).toBe('child1');
    expect(tree[0]!.children[0]!.depth).toBe(1);
    expect(tree[0]!.children[1]!.entry.lid).toBe('child2');
  });

  it('supports nested folders (2 levels)', () => {
    const entries = [
      makeEntry('root', 'Root', 'folder'),
      makeEntry('sub', 'Sub', 'folder'),
      makeEntry('leaf', 'Leaf'),
    ];
    const relations = [
      makeRelation('r1', 'root', 'sub'),
      makeRelation('r2', 'sub', 'leaf'),
    ];
    const tree = buildTree(entries, relations);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.children[0]!.entry.lid).toBe('leaf');
    expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2);
  });

  it('caps depth at maxDepth', () => {
    const entries = [
      makeEntry('a', 'A', 'folder'),
      makeEntry('b', 'B', 'folder'),
      makeEntry('c', 'C'),
    ];
    const relations = [
      makeRelation('r1', 'a', 'b'),
      makeRelation('r2', 'b', 'c'),
    ];
    // maxDepth=1 means children at depth 1 won't recurse further
    const tree = buildTree(entries, relations, 1);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.children).toEqual([]); // capped
  });

  it('ignores non-structural relations', () => {
    const entries = [makeEntry('a', 'A'), makeEntry('b', 'B')];
    const relations = [makeRelation('r1', 'a', 'b', 'categorical')];
    const tree = buildTree(entries, relations);
    expect(tree).toHaveLength(2); // Both are roots
  });

  it('handles entries with missing references gracefully', () => {
    const entries = [makeEntry('a', 'A', 'folder')];
    const relations = [makeRelation('r1', 'a', 'missing')];
    const tree = buildTree(entries, relations);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toEqual([]); // missing child ignored
  });

  // ── F-cycle hotfix: structural cycles must not hide entries ──
  // The previous implementation picked roots solely by
  // `hasParent`. A structural cycle leaves every member with a
  // parent, so no root was emitted and the entire component
  // vanished from the sidebar. These cases cover the rescue path.

  it('self-loop A→A: A is still emitted as a fallback root', () => {
    const entries = [makeEntry('a', 'A', 'folder')];
    const relations = [makeRelation('r1', 'a', 'a')];
    const tree = buildTree(entries, relations);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.entry.lid).toBe('a');
    // A self-loop must not expand into a runaway child chain.
    expect(tree[0]!.children).toEqual([]);
  });

  it('2-cycle A↔B: both entries are represented in the result (fallback root)', () => {
    const entries = [makeEntry('a', 'A', 'folder'), makeEntry('b', 'B', 'folder')];
    const relations = [
      makeRelation('r1', 'a', 'b'),
      makeRelation('r2', 'b', 'a'),
    ];
    const tree = buildTree(entries, relations);
    // Previously the result was `[]`; the sidebar went empty.
    expect(tree.length).toBeGreaterThan(0);
    const flat = new Set<string>();
    function collect(node: { entry: { lid: string }; children: unknown[] }): void {
      flat.add(node.entry.lid);
      for (const c of node.children) collect(c as { entry: { lid: string }; children: unknown[] });
    }
    for (const n of tree) collect(n);
    expect(flat.has('a')).toBe(true);
    expect(flat.has('b')).toBe(true);
  });

  it('3-cycle A→B→C→A: terminates and every member is represented', () => {
    const entries = [
      makeEntry('a', 'A', 'folder'),
      makeEntry('b', 'B', 'folder'),
      makeEntry('c', 'C', 'folder'),
    ];
    const relations = [
      makeRelation('r1', 'a', 'b'),
      makeRelation('r2', 'b', 'c'),
      makeRelation('r3', 'c', 'a'),
    ];
    const tree = buildTree(entries, relations);
    expect(tree.length).toBeGreaterThan(0);
    const flat = new Set<string>();
    function collect(node: { entry: { lid: string }; children: unknown[] }): void {
      flat.add(node.entry.lid);
      for (const c of node.children) collect(c as { entry: { lid: string }; children: unknown[] });
    }
    for (const n of tree) collect(n);
    expect(flat.has('a')).toBe(true);
    expect(flat.has('b')).toBe(true);
    expect(flat.has('c')).toBe(true);
  });

  it('mixed graph (healthy DAG + isolated cycle): both branches survive', () => {
    const entries = [
      makeEntry('root', 'Root', 'folder'),
      makeEntry('leaf', 'Leaf'),
      makeEntry('c', 'C', 'folder'),
      makeEntry('d', 'D', 'folder'),
    ];
    const relations = [
      // Healthy branch
      makeRelation('r1', 'root', 'leaf'),
      // Isolated cycle between c and d
      makeRelation('r2', 'c', 'd'),
      makeRelation('r3', 'd', 'c'),
    ];
    const tree = buildTree(entries, relations);
    // Healthy root comes first and keeps its child.
    expect(tree[0]!.entry.lid).toBe('root');
    expect(tree[0]!.children[0]!.entry.lid).toBe('leaf');
    // The cycle component is rescued into the tail of the root
    // list so both c and d remain visible.
    const fallbackLids = tree.slice(1).map((n) => n.entry.lid);
    expect(fallbackLids).toContain('c');
    const flat = new Set<string>();
    function collect(node: { entry: { lid: string }; children: unknown[] }): void {
      flat.add(node.entry.lid);
      for (const c of node.children) collect(c as { entry: { lid: string }; children: unknown[] });
    }
    for (const n of tree) collect(n);
    expect(flat.has('c')).toBe(true);
    expect(flat.has('d')).toBe(true);
  });

  it('dangling parent ref (missing→a): a is rescued as a fallback root', () => {
    // Regression: the naive root test only checks `hasParent`; a
    // relation whose `from` points to a non-existent entry still
    // marks the child as "has a parent", hiding it from the tree.
    const entries = [makeEntry('a', 'A')];
    const relations = [makeRelation('r1', 'missing', 'a')];
    const tree = buildTree(entries, relations);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.entry.lid).toBe('a');
    expect(tree[0]!.children).toEqual([]);
  });
});

describe('getStructuralParent', () => {
  it('returns parent entry when structural relation exists', () => {
    const entries = [makeEntry('folder', 'Folder', 'folder'), makeEntry('child', 'Child')];
    const relations = [makeRelation('r1', 'folder', 'child')];
    const parent = getStructuralParent(relations, entries, 'child');
    expect(parent).not.toBeNull();
    expect(parent!.lid).toBe('folder');
  });

  it('returns null when no structural parent', () => {
    const entries = [makeEntry('a', 'A'), makeEntry('b', 'B')];
    const parent = getStructuralParent([], entries, 'a');
    expect(parent).toBeNull();
  });

  it('ignores non-structural relations', () => {
    const entries = [makeEntry('a', 'A'), makeEntry('b', 'B')];
    const relations = [makeRelation('r1', 'a', 'b', 'semantic')];
    const parent = getStructuralParent(relations, entries, 'b');
    expect(parent).toBeNull();
  });
});

describe('getBreadcrumb', () => {
  it('returns empty array for root entries', () => {
    const entries = [makeEntry('a', 'A')];
    const bc = getBreadcrumb([], entries, 'a');
    expect(bc).toEqual([]);
  });

  it('returns parent chain from root to immediate parent', () => {
    const entries = [
      makeEntry('root', 'Root', 'folder'),
      makeEntry('mid', 'Mid', 'folder'),
      makeEntry('leaf', 'Leaf'),
    ];
    const relations = [
      makeRelation('r1', 'root', 'mid'),
      makeRelation('r2', 'mid', 'leaf'),
    ];
    const bc = getBreadcrumb(relations, entries, 'leaf');
    expect(bc).toHaveLength(2);
    expect(bc[0]!.lid).toBe('root');
    expect(bc[1]!.lid).toBe('mid');
  });

  it('caps breadcrumb depth at maxDepth', () => {
    const entries = [
      makeEntry('a', 'A', 'folder'),
      makeEntry('b', 'B', 'folder'),
      makeEntry('c', 'C', 'folder'),
      makeEntry('d', 'D'),
    ];
    const relations = [
      makeRelation('r1', 'a', 'b'),
      makeRelation('r2', 'b', 'c'),
      makeRelation('r3', 'c', 'd'),
    ];
    const bc = getBreadcrumb(relations, entries, 'd', 2);
    expect(bc).toHaveLength(2); // Only last 2 ancestors
  });

  it('under multi-parent, uses the first structural relation encountered', () => {
    // Spec: docs/development/breadcrumb-path-trail-v1.md §8.
    // v1 contract — "最初に見つかった structural parent を採用".
    const entries = [
      makeEntry('f1', 'Folder One', 'folder'),
      makeEntry('f2', 'Folder Two', 'folder'),
      makeEntry('leaf', 'Leaf'),
    ];
    // f1 appears first in the relations array, so it wins.
    const relations = [
      makeRelation('r1', 'f1', 'leaf'),
      makeRelation('r2', 'f2', 'leaf'),
    ];
    const bc = getBreadcrumb(relations, entries, 'leaf');
    expect(bc).toHaveLength(1);
    expect(bc[0]!.lid).toBe('f1');

    // Reversed order — now f2 wins.
    const reversed = [
      makeRelation('r2', 'f2', 'leaf'),
      makeRelation('r1', 'f1', 'leaf'),
    ];
    const bc2 = getBreadcrumb(reversed, entries, 'leaf');
    expect(bc2).toHaveLength(1);
    expect(bc2[0]!.lid).toBe('f2');
  });
});

describe('isDescendant', () => {
  it('returns true for direct child', () => {
    const relations = [makeRelation('r1', 'parent', 'child')];
    expect(isDescendant(relations, 'parent', 'child')).toBe(true);
  });

  it('returns true for nested descendant', () => {
    const relations = [
      makeRelation('r1', 'a', 'b'),
      makeRelation('r2', 'b', 'c'),
    ];
    expect(isDescendant(relations, 'a', 'c')).toBe(true);
  });

  it('returns false for non-descendant', () => {
    const relations = [makeRelation('r1', 'a', 'b')];
    expect(isDescendant(relations, 'a', 'x')).toBe(false);
  });

  it('returns false when no relations', () => {
    expect(isDescendant([], 'a', 'b')).toBe(false);
  });

  it('ignores non-structural relations', () => {
    const relations = [makeRelation('r1', 'a', 'b', 'categorical')];
    expect(isDescendant(relations, 'a', 'b')).toBe(false);
  });

  it('handles circular references without infinite loop', () => {
    // This shouldn't happen in practice, but test robustness
    const relations = [
      makeRelation('r1', 'a', 'b'),
      makeRelation('r2', 'b', 'a'),
    ];
    expect(isDescendant(relations, 'a', 'b')).toBe(true);
  });
});

describe('getAvailableFolders', () => {
  it('returns folder entries excluding self and descendants', () => {
    const entries = [
      makeEntry('f1', 'Folder 1', 'folder'),
      makeEntry('f2', 'Folder 2', 'folder'),
      makeEntry('child', 'Child', 'folder'),
      makeEntry('note', 'Note'),
    ];
    const relations = [makeRelation('r1', 'f1', 'child')];
    const available = getAvailableFolders(entries, relations, 'f1');
    // f1 excluded (self), child excluded (descendant), note excluded (not folder)
    expect(available).toHaveLength(1);
    expect(available[0]!.lid).toBe('f2');
  });

  it('returns all folders when entry has no descendants', () => {
    const entries = [
      makeEntry('f1', 'Folder 1', 'folder'),
      makeEntry('f2', 'Folder 2', 'folder'),
      makeEntry('note', 'Note'),
    ];
    const available = getAvailableFolders(entries, [], 'note');
    expect(available).toHaveLength(2);
  });

  it('returns empty when no folders exist', () => {
    const entries = [makeEntry('a', 'A'), makeEntry('b', 'B')];
    const available = getAvailableFolders(entries, [], 'a');
    expect(available).toEqual([]);
  });
});

describe('collectDescendantLids', () => {
  it('collects direct children', () => {
    const relations = [
      makeRelation('r1', 'folder', 'child1'),
      makeRelation('r2', 'folder', 'child2'),
    ];
    const result = collectDescendantLids(relations, 'folder');
    expect(result.size).toBe(2);
    expect(result.has('child1')).toBe(true);
    expect(result.has('child2')).toBe(true);
  });

  it('collects recursive descendants', () => {
    const relations = [
      makeRelation('r1', 'root', 'sub'),
      makeRelation('r2', 'sub', 'leaf1'),
      makeRelation('r3', 'sub', 'leaf2'),
    ];
    const result = collectDescendantLids(relations, 'root');
    expect(result.size).toBe(3);
    expect(result.has('sub')).toBe(true);
    expect(result.has('leaf1')).toBe(true);
    expect(result.has('leaf2')).toBe(true);
  });

  it('does NOT include the folder itself', () => {
    const relations = [makeRelation('r1', 'folder', 'child')];
    const result = collectDescendantLids(relations, 'folder');
    expect(result.has('folder')).toBe(false);
  });

  it('returns empty set for folder with no children', () => {
    const relations: Relation[] = [];
    const result = collectDescendantLids(relations, 'lonely');
    expect(result.size).toBe(0);
  });

  it('ignores non-structural relations', () => {
    const relations = [
      makeRelation('r1', 'folder', 'child', 'categorical'),
      makeRelation('r2', 'folder', 'child2', 'semantic'),
    ];
    const result = collectDescendantLids(relations, 'folder');
    expect(result.size).toBe(0);
  });

  it('handles circular relations without infinite loop', () => {
    const relations = [
      makeRelation('r1', 'a', 'b'),
      makeRelation('r2', 'b', 'a'),
    ];
    const result = collectDescendantLids(relations, 'a');
    expect(result.has('b')).toBe(true);
    expect(result.has('a')).toBe(true); // circular back to a is recorded
  });
});

describe('getAncestorFolderLids', () => {
  it('returns empty for a root entry with no structural parent', () => {
    const entries = [makeEntry('root', 'Root')];
    expect(getAncestorFolderLids([], entries, 'root')).toEqual([]);
  });

  it('returns the folder chain from nearest parent outward', () => {
    // Graph: root-folder → mid-folder → leaf (text entry)
    // Nearest → farthest: ['mid-folder', 'root-folder'].
    const entries = [
      makeEntry('root-folder', 'Root', 'folder'),
      makeEntry('mid-folder', 'Mid', 'folder'),
      makeEntry('leaf', 'Leaf', 'text'),
    ];
    const relations = [
      makeRelation('r1', 'root-folder', 'mid-folder'),
      makeRelation('r2', 'mid-folder', 'leaf'),
    ];
    expect(getAncestorFolderLids(relations, entries, 'leaf')).toEqual([
      'mid-folder',
      'root-folder',
    ]);
  });

  it('skips non-folder ancestors', () => {
    // A text entry cannot be a folder — if something weird happens
    // and a text appears in the parent chain, it must not contribute
    // a collapsible lid (it has no collapsed-folder semantics).
    const entries = [
      makeEntry('root-folder', 'Root', 'folder'),
      makeEntry('mid-text', 'Mid (non-folder)', 'text'),
      makeEntry('leaf', 'Leaf', 'text'),
    ];
    const relations = [
      makeRelation('r1', 'root-folder', 'mid-text'),
      makeRelation('r2', 'mid-text', 'leaf'),
    ];
    // root-folder is a valid ancestor; mid-text is silently skipped.
    expect(getAncestorFolderLids(relations, entries, 'leaf')).toEqual([
      'root-folder',
    ]);
  });

  it('is cycle-safe: parent chain pointing back to self short-circuits', () => {
    // Malformed graph: a → b → a. Walk must terminate, not loop.
    const entries = [
      makeEntry('a', 'A', 'folder'),
      makeEntry('b', 'B', 'folder'),
    ];
    const relations = [
      makeRelation('r1', 'a', 'b'),
      makeRelation('r2', 'b', 'a'),
    ];
    // From b, parent is a; a's parent is b (already visited) — stop.
    expect(getAncestorFolderLids(relations, entries, 'b')).toEqual(['a']);
  });

  it('no-ops on a missing lid with no relations', () => {
    expect(getAncestorFolderLids([], [], 'ghost')).toEqual([]);
  });
});
