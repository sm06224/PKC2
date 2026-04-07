import { describe, it, expect } from 'vitest';
import {
  buildTree, getStructuralParent, getBreadcrumb, getAvailableFolders,
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
