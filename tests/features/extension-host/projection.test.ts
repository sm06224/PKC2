/**
 * ContainerProjection(#806 一括実装 2/6)— 拡張への既定露出。
 * データ最小化(body / assets / revisions を含まない)を契約として pin。
 */
import { describe, it, expect } from 'vitest';
import { buildContainerProjection } from '@features/extension-host/projection';
import type { Container } from '@core/model/container';

const T = '2026-06-12T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'proj-c', title: 'Proj', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'Folder', body: '', archetype: 'folder', created_at: T, updated_at: T },
      { lid: 'e1', title: 'Text', body: 'SECRET BODY', archetype: 'text', created_at: T, updated_at: T, tags: ['a'], color_tag: 'red' },
      {
        lid: 'a1', title: 'PDF', archetype: 'attachment', created_at: T, updated_at: T,
        body: JSON.stringify({ mime: 'application/pdf', name: 'r.pdf', asset_key: 'k1' }),
      },
      { lid: 'sys1', title: 'About', body: 'sys', archetype: 'system-about', created_at: T, updated_at: T },
    ],
    relations: [
      { id: 'r1', from: 'f1', to: 'e1', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r2', from: 'e1', to: 'sys1', kind: 'semantic', created_at: T, updated_at: T },
    ],
    revisions: [],
    assets: { k1: 'QkFTRTY0REFUQQ==' },
  };
}

describe('buildContainerProjection', () => {
  it('entries / relations / stats を投影し、system archetype を除外する', () => {
    const p = buildContainerProjection(makeContainer());
    expect(p.containerId).toBe('proj-c');
    expect(p.entries.map((e) => e.lid).sort()).toEqual(['a1', 'e1', 'f1']);
    // system 宛の relation は除外。
    expect(p.relations).toEqual([{ from: 'f1', to: 'e1', kind: 'structural' }]);
    expect(p.stats).toEqual({
      totalEntries: 3,
      byArchetype: { folder: 1, text: 1, attachment: 1 },
      totalRelations: 1,
      totalAssets: 1,
    });
  });

  it('folder 同定 / tags / color_tag を carry する', () => {
    const p = buildContainerProjection(makeContainer());
    const e1 = p.entries.find((e) => e.lid === 'e1')!;
    expect(e1.folder).toBe('f1');
    expect(e1.tags).toEqual(['a']);
    expect(e1.color_tag).toBe('red');
  });

  it('attachment は mime / filename / asset_size メタを持つ', () => {
    const p = buildContainerProjection(makeContainer());
    const a1 = p.entries.find((e) => e.lid === 'a1')!;
    expect(a1.mime).toBe('application/pdf');
    expect(a1.filename).toBe('r.pdf');
    expect(a1.asset_size).toBe('QkFTRTY0REFUQQ=='.length);
  });

  it('【不変条件】body / assets(base64)/ revisions を一切含まない', () => {
    const p = buildContainerProjection(makeContainer());
    const json = JSON.stringify(p);
    expect(json).not.toContain('SECRET BODY');
    expect(json).not.toContain('QkFTRTY0REFUQQ==');
    expect(json).not.toContain('revisions');
    for (const e of p.entries) {
      expect('body' in e).toBe(false);
    }
  });

  it('壊れた attachment JSON でも projection は落ちない', () => {
    const c = makeContainer();
    c.entries.push({
      lid: 'a2', title: 'Broken', body: '{not json', archetype: 'attachment', created_at: T, updated_at: T,
    });
    const p = buildContainerProjection(c);
    const a2 = p.entries.find((e) => e.lid === 'a2')!;
    expect(a2.mime).toBeUndefined();
    expect(a2.filename).toBeUndefined();
  });
});

describe('buildGraphProjection は汎用 projection の上で従来出力を維持する', () => {
  it('nodes / edges が汎用 projection と一致し、graph 固有統計を重ねる', async () => {
    const { buildGraphProjection } = await import('@features/graph-extension/projection');
    const c = makeContainer();
    c.entries.find((e) => e.lid === 'e1')!.body = 'see https://example.com/x and more';
    const g = buildGraphProjection(c);
    expect(g.nodes.map((n) => n.lid).sort()).toEqual(['a1', 'e1', 'f1']);
    expect(g.edges).toEqual([{ from: 'f1', to: 'e1', kind: 'structural' }]);
    expect(g.externalLinks).toEqual([{ from: 'e1', url: 'https://example.com/x' }]);
  });
});
