/**
 * getEntryAssetDependencies — working-set 遅延ロード(#7 メモリ削減)の土台。
 * 単一 entry(+ transclusion 閉包)が render 時に要する asset key を求める。
 */
import { describe, it, expect } from 'vitest';
import { getEntryAssetDependencies, collectReferencedAssetKeys } from '@features/asset/asset-scan';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-06-24T00:00:00Z';
const text = (lid: string, body: string): Entry => ({ lid, title: lid, body, archetype: 'text', created_at: T, updated_at: T });
const attach = (lid: string, assetKey: string): Entry => ({
  lid, title: lid,
  body: JSON.stringify({ asset_key: assetKey, mime: 'image/png' }),
  archetype: 'attachment', created_at: T, updated_at: T,
});
const container = (entries: Entry[]): Container => ({
  meta: { container_id: 'c', title: 'c', created_at: T, updated_at: T, schema_version: 1 },
  entries, relations: [], revisions: [], assets: {},
});

describe('getEntryAssetDependencies', () => {
  it('text body の image / chip 形式 asset 参照を集める', () => {
    const c = container([text('e1', '# x\n![](asset:k1) and [doc](asset:k2)')]);
    expect([...getEntryAssetDependencies(c, 'e1')].sort()).toEqual(['k1', 'k2']);
  });

  it('attachment entry は asset_key を返す', () => {
    expect([...getEntryAssetDependencies(container([attach('a1', 'kA')]), 'a1')]).toEqual(['kA']);
  });

  it('transclusion 先(entry:LID)の asset も再帰的に含める', () => {
    const c = container([
      text('host', 'see ![](entry:child)'),
      text('child', 'inner ![](asset:kc)'),
    ]);
    expect([...getEntryAssetDependencies(c, 'host')]).toEqual(['kc']);
  });

  it('transclusion の循環でも無限ループしない', () => {
    const c = container([
      text('a', 'to ![](entry:b) and ![](asset:ka)'),
      text('b', 'to ![](entry:a) and ![](asset:kb)'),
    ]);
    expect([...getEntryAssetDependencies(c, 'a')].sort()).toEqual(['ka', 'kb']);
  });

  it('未知 lid は空集合', () => {
    expect(getEntryAssetDependencies(container([]), 'nope').size).toBe(0);
  });

  it('単一 entry の deps は全件参照(collectReferencedAssetKeys)の部分集合', () => {
    const c = container([text('e1', '![](asset:k1)'), text('e2', '![](asset:k2)')]);
    const all = collectReferencedAssetKeys(c);
    const dep = getEntryAssetDependencies(c, 'e1');
    expect([...dep]).toEqual(['k1']);
    expect([...dep].every((k) => all.has(k))).toBe(true);
  });
});
