/**
 * 階層 cap の打ち切り件数(`TreeNode.truncatedChildCount`)。
 *
 * 背景(視覚監査 2026-07-25、docs/development/visual-audit-2026-07-25.md §3 B1):
 * `buildTree(entries, relations, maxDepth = 4)` は depth 4 に達すると子を
 * `TreeNode` 化せず、`markReachableBelowCap` で「配置済み」とマークするだけ。
 * この処置は後段の孤立エントリ救済 sweep が深い子を第 2 の root に昇格させて
 * しまうのを防ぐためだが、結果として深い entry は **root にも親の下にも出ない**
 * = サイドバーから消えていた。さらに cap に当たった folder は `children: []`
 * になるため、子件数を読む表示が **「(0)」= 子なし** と嘘をついていた。
 *
 * user 裁定(2026-07-25)は「上限は据え置き、**打ち切りを可視化**する(最小版)」。
 * その最小の型追加が `truncatedChildCount` で、renderer 側が
 * 「(実在件数)」+「…N」marker を出すのに使う。
 */

import { describe, it, expect } from 'vitest';
import { buildTree } from '@features/relation/tree';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

const TS = '2026-01-01T00:00:00Z';

function entry(lid: string, archetype: Entry['archetype'] = 'folder'): Entry {
  return { lid, title: lid, body: '', archetype, created_at: TS, updated_at: TS };
}
function rel(from: string, to: string, id = `${from}->${to}`): Relation {
  return { id, from, to, kind: 'structural', created_at: TS, updated_at: TS };
}

/** root → d1 → d2 → … の直列チェーン(長さ n)。 */
function chain(n: number): { entries: Entry[]; relations: Relation[] } {
  const entries: Entry[] = [entry('root')];
  const relations: Relation[] = [];
  let prev = 'root';
  for (let i = 1; i <= n; i++) {
    const lid = `d${i}`;
    entries.push(entry(lid));
    relations.push(rel(prev, lid));
    prev = lid;
  }
  return { entries, relations };
}

/** depth 順に node を辿る(children[0] を降りる)。 */
function descend(nodes: ReturnType<typeof buildTree>, depth: number): ReturnType<typeof buildTree>[number] {
  let n = nodes[0]!;
  for (let i = 0; i < depth; i++) n = n.children[0]!;
  return n;
}

describe('buildTree の階層 cap 打ち切り件数', () => {
  it('cap に当たらない node には truncatedChildCount を付けない(既存 deep-equal を壊さない)', () => {
    const { entries, relations } = chain(2);
    const tree = buildTree(entries, relations, 4);
    expect(descend(tree, 0).truncatedChildCount).toBeUndefined();
    expect(descend(tree, 1).truncatedChildCount).toBeUndefined();
    // 末端(子なし)にも付かない
    expect(descend(tree, 2).truncatedChildCount).toBeUndefined();
  });

  it('cap に当たった node に打ち切られた直下の子の件数が乗る', () => {
    const { entries, relations } = chain(6);
    const tree = buildTree(entries, relations, 4);
    const capped = descend(tree, 4); // depth 4 = cap
    expect(capped.entry.lid).toBe('d4');
    expect(capped.children).toEqual([]); // 従来どおり子は作られない
    expect(capped.truncatedChildCount).toBe(1); // が、いることは分かる
  });

  it('打ち切り件数は直下のみ(子孫の総数ではない)', () => {
    // d4 の直下に 3 件、そのさらに下にも 3 件ずつぶら下げる
    const entries: Entry[] = [entry('root'), entry('d1'), entry('d2'), entry('d3'), entry('d4')];
    const relations: Relation[] = [rel('root', 'd1'), rel('d1', 'd2'), rel('d2', 'd3'), rel('d3', 'd4')];
    for (let i = 0; i < 3; i++) {
      entries.push(entry(`leaf${i}`));
      relations.push(rel('d4', `leaf${i}`));
      for (let j = 0; j < 3; j++) {
        entries.push(entry(`leaf${i}-${j}`));
        relations.push(rel(`leaf${i}`, `leaf${i}-${j}`));
      }
    }
    const capped = descend(buildTree(entries, relations, 4), 4);
    // 直下 3 件(子孫を数えると 12 件になるが、それは採らない ──
    // 総数は walkVisited 共有で経路依存になり意味論が壊れる)
    expect(capped.truncatedChildCount).toBe(3);
  });

  it('重複 structural relation を二重に数えない(嘘を別の嘘に置き換えない)', () => {
    const { entries, relations } = chain(5);
    // d4 → d5 を重複登録
    relations.push(rel('d4', 'd5', 'dup'));
    const capped = descend(buildTree(entries, relations, 4), 4);
    expect(capped.truncatedChildCount).toBe(1);
  });

  it('dangling ref(entries に無い子)を数えない', () => {
    const { entries, relations } = chain(4);
    relations.push(rel('d4', 'ghost-not-in-entries'));
    const capped = descend(buildTree(entries, relations, 4), 4);
    expect(capped.truncatedChildCount).toBeUndefined();
  });

  it('cap 下の entry は依然として第 2 の root に昇格しない(既存の救済 sweep 契約)', () => {
    const { entries, relations } = chain(6);
    const tree = buildTree(entries, relations, 4);
    expect(tree.map((n) => n.entry.lid)).toEqual(['root']);
  });

  it('maxDepth を上げれば打ち切りは消える(上限の意味論は不変)', () => {
    const { entries, relations } = chain(6);
    const deep = buildTree(entries, relations, 10);
    expect(descend(deep, 4).truncatedChildCount).toBeUndefined();
    expect(descend(deep, 6).entry.lid).toBe('d6');
  });
});
