/**
 * PR-W24 v6:`sortTreeNodes` の階層 sort 動作確認。
 *
 * user 報告「左ペイン要素並び替え 1 階層しか sort 対応していなくて全てが
 * バラバラ」「マニュアルが顕著な例。本来 ASSETS に整理されるべき埋め込み
 * 要素が露出」に対する fix の regression 防止。
 */
import { describe, it, expect } from 'vitest';
import { buildTree, sortTreeNodes } from '@features/relation/tree';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

function makeEntry(lid: string, title: string, archetype: Entry['archetype'] = 'text', createdAt = '2026-05-16T00:00:00Z'): Entry {
  return {
    lid,
    title,
    body: '',
    archetype,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function makeRel(from: string, to: string, id?: string): Relation {
  return {
    id: id ?? `rel-${from}-${to}`,
    kind: 'structural',
    from,
    to,
    created_at: '2026-05-16T00:00:00Z',
    updated_at: '2026-05-16T00:00:00Z',
  };
}

describe('PR-W24 v6 sortTreeNodes:階層 sort + folder 優先', () => {
  it('flat tree(folder なし)で title 昇順 sort', () => {
    const entries = [
      makeEntry('e3', 'CCC'),
      makeEntry('e1', 'AAA'),
      makeEntry('e2', 'BBB'),
    ];
    const tree = buildTree(entries, []);
    const sorted = sortTreeNodes(tree, 'title', 'asc');
    expect(sorted.map((n) => n.entry.title)).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('folder 優先:同 level 内で folder が先頭に出る(title sort 内で archetype grouping)', () => {
    const entries = [
      makeEntry('text-z', 'ZZZ'),
      makeEntry('folder-a', 'AAA', 'folder'),
      makeEntry('text-a', 'AAA-text'),
      makeEntry('folder-z', 'ZZZ-folder', 'folder'),
    ];
    const tree = buildTree(entries, []);
    const sorted = sortTreeNodes(tree, 'title', 'asc');
    // folder が先頭(2 件)、後に text(2 件)
    expect(sorted.map((n) => n.entry.archetype)).toEqual(['folder', 'folder', 'text', 'text']);
    // 各 group 内で title 昇順
    expect(sorted.map((n) => n.entry.title)).toEqual(['AAA', 'ZZZ-folder', 'AAA-text', 'ZZZ']);
  });

  it('再帰 sort:folder の children も同 key で sort', () => {
    const entries = [
      makeEntry('folder-a', 'folder-a', 'folder'),
      makeEntry('child-c', 'C-child'),
      makeEntry('child-a', 'A-child'),
      makeEntry('child-b', 'B-child'),
    ];
    const relations = [
      makeRel('folder-a', 'child-c'),
      makeRel('folder-a', 'child-a'),
      makeRel('folder-a', 'child-b'),
    ];
    const tree = buildTree(entries, relations);
    const sorted = sortTreeNodes(tree, 'title', 'asc');
    expect(sorted).toHaveLength(1);
    expect(sorted[0]!.entry.lid).toBe('folder-a');
    expect(sorted[0]!.children.map((c) => c.entry.title)).toEqual(['A-child', 'B-child', 'C-child']);
  });

  it('descending order でも folder 優先 + 内 sort 反転', () => {
    const entries = [
      makeEntry('text-a', 'AAA'),
      makeEntry('folder-a', 'folder-a', 'folder'),
      makeEntry('text-b', 'BBB'),
    ];
    const tree = buildTree(entries, []);
    const sorted = sortTreeNodes(tree, 'title', 'desc');
    // folder は依然先頭、text は降順
    expect(sorted.map((n) => n.entry.archetype)).toEqual(['folder', 'text', 'text']);
    expect(sorted.map((n) => n.entry.title)).toEqual(['folder-a', 'BBB', 'AAA']);
  });

  it('created_at sort も同じ pattern(folder 優先 + 日付昇順)', () => {
    const entries = [
      makeEntry('text-new', 'new', 'text', '2026-05-20T00:00:00Z'),
      makeEntry('text-old', 'old', 'text', '2026-05-10T00:00:00Z'),
      makeEntry('folder-mid', 'folder', 'folder', '2026-05-15T00:00:00Z'),
    ];
    const tree = buildTree(entries, []);
    const sorted = sortTreeNodes(tree, 'created_at', 'asc');
    expect(sorted.map((n) => n.entry.lid)).toEqual(['folder-mid', 'text-old', 'text-new']);
  });

  it('manual sample:章エントリ + ASSETS folder + 画像 attachment が hierarchical に整理', () => {
    const entries = [
      makeEntry('manual-folder-basics', '基本操作', 'folder'),
      makeEntry('manual-folder-assets', 'ASSETS', 'folder'),
      makeEntry('manual-text-12', '12 マークダウン拡張記法', 'text'),
      makeEntry('manual-text-15', '15 PKC Hint 機構', 'text'),
      makeEntry('manual-img-fig1', 'fig1.png', 'attachment'),
      makeEntry('manual-img-fig2', 'fig2.png', 'attachment'),
    ];
    const relations = [
      makeRel('manual-folder-basics', 'manual-text-12'),
      makeRel('manual-folder-basics', 'manual-text-15'),
      makeRel('manual-folder-assets', 'manual-img-fig1'),
      makeRel('manual-folder-assets', 'manual-img-fig2'),
    ];
    const tree = buildTree(entries, relations);
    const sorted = sortTreeNodes(tree, 'title', 'asc');
    // 2 つの folder のみ root に(image attachments は ASSETS folder の child)
    expect(sorted).toHaveLength(2);
    expect(sorted.map((n) => n.entry.archetype)).toEqual(['folder', 'folder']);
    const assetsFolder = sorted.find((n) => n.entry.lid === 'manual-folder-assets')!;
    expect(assetsFolder.children.map((c) => c.entry.archetype)).toEqual(['attachment', 'attachment']);
    expect(assetsFolder.children.map((c) => c.entry.title)).toEqual(['fig1.png', 'fig2.png']);
  });
});
