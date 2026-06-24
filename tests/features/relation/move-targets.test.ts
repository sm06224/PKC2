/**
 * 「○○へ移動」候補 folder の安定順序化(user direction 2026-06-24:候補が
 * 増えると使いにくい・並び不均一・ASSETS フォルダ占有 への対応)。
 */
import { describe, it, expect } from 'vitest';
import { orderedMoveTargets } from '@features/relation/move-targets';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

const T = '2026-06-24T00:00:00Z';
const folder = (lid: string, title: string): Entry => ({ lid, title, body: '', archetype: 'folder', created_at: T, updated_at: T });
const note = (lid: string, title: string): Entry => ({ lid, title, body: 'x', archetype: 'text', created_at: T, updated_at: T });
const struct = (from: string, to: string): Relation => ({ id: `r-${from}-${to}`, from, to, kind: 'structural', created_at: T, updated_at: T });

describe('orderedMoveTargets', () => {
  // 構造:
  //   Beta (root)
  //     Alpha-sub
  //   Alpha (root)
  //   ASSETS (root)  ← 除外対象
  //   moving (root)  ← from 自身
  //     child-folder ← descendant、除外
  const entries: Entry[] = [
    folder('beta', 'Beta'),
    folder('beta-alpha', 'Alpha-sub'),
    folder('alpha', 'Alpha'),
    folder('assets', 'ASSETS'),
    folder('moving', 'moving'),
    folder('child', 'child-folder'),
    note('n1', 'a note'),
  ];
  const relations: Relation[] = [
    struct('beta', 'beta-alpha'),
    struct('moving', 'child'),
  ];

  it('ASSETS バケット folder を候補から除外する', () => {
    const out = orderedMoveTargets(entries, relations, 'n1');
    expect(out.map((t) => t.lid)).not.toContain('assets');
  });

  it('自分自身と descendants を除外する', () => {
    const out = orderedMoveTargets(entries, relations, 'moving');
    const lids = out.map((t) => t.lid);
    expect(lids).not.toContain('moving'); // self
    expect(lids).not.toContain('child'); // descendant
  });

  it('フルパス昇順で安定整列(子は親の直下、root は名前順)', () => {
    // fromLid=n1(note)なので moving/child も候補。ASSETS のみ除外。
    // パス昇順: Alpha / Beta / "Beta Alpha-sub" / moving / "moving child-folder"
    const out = orderedMoveTargets(entries, relations, 'n1');
    expect(out.map((t) => t.lid)).toEqual(['alpha', 'beta', 'beta-alpha', 'moving', 'child']);
  });

  it('depth を返す(字下げ用、root=0 / 子=1)', () => {
    const out = orderedMoveTargets(entries, relations, 'n1');
    const byLid = Object.fromEntries(out.map((t) => [t.lid, t.depth]));
    expect(byLid['alpha']).toBe(0);
    expect(byLid['beta']).toBe(0);
    expect(byLid['beta-alpha']).toBe(1);
  });

  it('folder 以外(note 等)は候補に含めない', () => {
    const out = orderedMoveTargets(entries, relations, 'moving');
    expect(out.map((t) => t.lid)).not.toContain('n1');
  });
});
