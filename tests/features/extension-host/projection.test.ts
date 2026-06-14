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

  it('todo は status / date / archived メタを持つが description は含めない(#830 R1)', () => {
    const c = makeContainer();
    c.entries.push({
      lid: 'td1', title: 'Buy milk', archetype: 'todo', created_at: T, updated_at: T,
      body: JSON.stringify({ status: 'done', description: 'SECRET TODO DESC', date: '2026-07-01', archived: true }),
    });
    const p = buildContainerProjection(c);
    const td1 = p.entries.find((e) => e.lid === 'td1')!;
    expect(td1.todo).toEqual({ status: 'done', date: '2026-07-01', archived: true });
    // description(body の中身)は projection に載らない。
    expect(JSON.stringify(p)).not.toContain('SECRET TODO DESC');
  });

  it('todo メタは date/archived が無ければ status のみ、壊れた JSON でも落ちない(#830 R1)', () => {
    const c = makeContainer();
    c.entries.push({
      lid: 'td2', title: 'Open task', archetype: 'todo', created_at: T, updated_at: T,
      body: JSON.stringify({ status: 'open', description: 'd' }),
    });
    c.entries.push({
      lid: 'td3', title: 'Legacy', archetype: 'todo', created_at: T, updated_at: T,
      body: 'not json',
    });
    const p = buildContainerProjection(c);
    expect(p.entries.find((e) => e.lid === 'td2')!.todo).toEqual({ status: 'open' });
    expect(p.entries.find((e) => e.lid === 'td3')!.todo).toEqual({ status: 'open' });
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

describe('links — body から導出する link 統計(旧 graph projection を吸収、#796 切替)', () => {
  it('external: body 中の外部 URL を (entry, url) で dedupe して集計', () => {
    const c = makeContainer();
    c.entries.find((e) => e.lid === 'e1')!.body =
      'see https://example.com/x and again https://example.com/x.';
    const p = buildContainerProjection(c);
    expect(p.links.external).toEqual([{ from: 'e1', url: 'https://example.com/x' }]);
  });

  it('internal: 解決済み entry 参照を from/to で集計(self / 未解決は除外)', () => {
    const c = makeContainer();
    c.entries.push({
      lid: 't2', title: 'Linker', archetype: 'text', created_at: T, updated_at: T,
      body: 'see [Text](entry:e1) and [ghost](entry:nope) and [me](entry:t2)',
    });
    const p = buildContainerProjection(c);
    expect(p.links.internal).toEqual([{ from: 't2', to: 'e1' }]);
  });

  it('links も body そのものは含まない(lid / url のみ)', () => {
    const c = makeContainer();
    c.entries.find((e) => e.lid === 'e1')!.body = 'SECRET https://example.com/y BODY';
    const p = buildContainerProjection(c);
    expect(JSON.stringify(p)).not.toContain('SECRET');
  });
});
