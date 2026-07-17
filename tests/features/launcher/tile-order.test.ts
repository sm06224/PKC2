/**
 * #928 — launcher タイルの並び・drag & drop 落下差分(pure)unit test。
 */
import { describe, it, expect } from 'vitest';
import { sortLauncherTiles, dropLauncherTile, normalizeGroup } from '@features/launcher/tile-order';

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

describe('dropLauncherTile', () => {
  const base = () => [t('a', undefined, undefined, 0), t('b', undefined, undefined, 1), t('c', undefined, undefined, 2)];

  it('tile の後ろへ drop → 挿入位置に入りグループ全体が 0..n-1 に正規化', () => {
    const updates = dropLauncherTile(base(), 'a', { kind: 'tile', lid: 'c', place: 'after' });
    expect(updates).toEqual([
      { lid: 'b', order: 0 },
      { lid: 'c', order: 1 },
      { lid: 'a', order: 2 },
    ]);
  });

  it('tile の前へ drop → その tile の直前に入る', () => {
    const updates = dropLauncherTile(base(), 'c', { kind: 'tile', lid: 'a', place: 'before' });
    expect(updates).toEqual([
      { lid: 'c', order: 0 },
      { lid: 'a', order: 1 },
      { lid: 'b', order: 2 },
    ]);
  });

  it('並びが変わらない drop(直後の tile の before など)は no-op', () => {
    expect(dropLauncherTile(base(), 'a', { kind: 'tile', lid: 'b', place: 'before' })).toEqual([]);
    expect(dropLauncherTile(base(), 'a', { kind: 'tile', lid: 'a', place: 'after' })).toEqual([]);
    expect(dropLauncherTile(base(), 'nope', { kind: 'tile', lid: 'a', place: 'after' })).toEqual([]);
    expect(dropLauncherTile(base(), 'a', { kind: 'tile', lid: 'nope', place: 'after' })).toEqual([]);
  });

  it('別グループの tile 上へ drop → そのグループへ移動し dragged だけ group を持つ', () => {
    const tiles = [t('a', undefined, undefined, 0), t('g1', 'G', 0, 1), t('g2', 'G', 1, 2)];
    const updates = dropLauncherTile(tiles, 'a', { kind: 'tile', lid: 'g1', place: 'after' });
    expect(updates).toEqual([
      { lid: 'g1', order: 0 },
      { lid: 'a', order: 1, group: 'G' },
      { lid: 'g2', order: 2 },
    ]);
  });

  it('group(grid 余白)へ drop → そのグループ末尾へ追加、"" は解除', () => {
    const tiles = [t('a', undefined, 0, 0), t('g1', 'G', 0, 1)];
    expect(dropLauncherTile(tiles, 'a', { kind: 'group', group: 'G' })).toEqual([
      { lid: 'g1', order: 0 },
      { lid: 'a', order: 1, group: 'G' },
    ]);
    expect(dropLauncherTile(tiles, 'g1', { kind: 'group', group: '' })).toEqual([
      { lid: 'a', order: 0 },
      { lid: 'g1', order: 1, group: '' },
    ]);
  });

  it('同一グループ末尾へ既に居る tile の group drop は no-op', () => {
    const tiles = [t('a', undefined, 0, 0), t('b', undefined, 1, 1)];
    expect(dropLauncherTile(tiles, 'b', { kind: 'group', group: '' })).toEqual([]);
  });
});

describe('normalizeGroup', () => {
  it('空白のみ・未設定は "" に正規化', () => {
    expect(normalizeGroup(undefined)).toBe('');
    expect(normalizeGroup('  ')).toBe('');
    expect(normalizeGroup(' Tools ')).toBe('Tools');
  });
});
