/**
 * #928 — launcher タイルの並び・移動(pure)unit test。
 */
import { describe, it, expect } from 'vitest';
import { sortLauncherTiles, moveLauncherTile, normalizeGroup } from '@features/launcher/tile-order';

const t = (lid: string, group?: string, order?: number, seq = 0) =>
  ({ lid, group, order, seq });

describe('sortLauncherTiles', () => {
  it('未設定グループが先頭、グループ名昇順、グループ内は order → seq', () => {
    const sorted = sortLauncherTiles([
      t('b-tools', 'Tools', 1, 0),
      t('a-plain', undefined, undefined, 1),
      t('c-tools', 'Tools', 0, 2),
      t('d-plain2', '', undefined, 3),
      t('e-apps', 'Apps', undefined, 4),
    ]);
    expect(sorted.map((x) => x.lid)).toEqual(['a-plain', 'd-plain2', 'e-apps', 'c-tools', 'b-tools']);
  });

  it('order 未設定は末尾、同値は登録順(安定)', () => {
    const sorted = sortLauncherTiles([
      t('x', 'G', undefined, 0),
      t('y', 'G', 5, 1),
      t('z', 'G', undefined, 2),
    ]);
    expect(sorted.map((s) => s.lid)).toEqual(['y', 'x', 'z']);
  });
});

describe('moveLauncherTile', () => {
  it('next で隣と入れ替え、グループ全体が 0..n-1 に正規化される', () => {
    const updates = moveLauncherTile(
      [t('a', 'G', undefined, 0), t('b', 'G', undefined, 1), t('c', 'G', undefined, 2), t('other', undefined, undefined, 3)],
      'a',
      'next',
    );
    expect(updates).toEqual([
      { lid: 'b', order: 0 },
      { lid: 'a', order: 1 },
      { lid: 'c', order: 2 },
    ]);
  });

  it('端では動けない(空配列)', () => {
    const tiles = [t('a', undefined, 0, 0), t('b', undefined, 1, 1)];
    expect(moveLauncherTile(tiles, 'a', 'prev')).toEqual([]);
    expect(moveLauncherTile(tiles, 'b', 'next')).toEqual([]);
    expect(moveLauncherTile(tiles, 'nope', 'next')).toEqual([]);
  });

  it('移動は同一グループ内に閉じる(他グループの order は触らない)', () => {
    const updates = moveLauncherTile(
      [t('g1a', 'G1', 0, 0), t('g1b', 'G1', 1, 1), t('g2a', 'G2', 0, 2)],
      'g1b',
      'prev',
    );
    expect(updates.map((u) => u.lid).sort()).toEqual(['g1a', 'g1b']);
  });
});

describe('normalizeGroup', () => {
  it('空白のみ・未設定は "" に正規化', () => {
    expect(normalizeGroup(undefined)).toBe('');
    expect(normalizeGroup('  ')).toBe('');
    expect(normalizeGroup(' Tools ')).toBe('Tools');
  });
});
