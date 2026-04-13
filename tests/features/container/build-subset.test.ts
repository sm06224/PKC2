/**
 * Tests for `buildSubsetContainer` — the reachability helper that
 * backs the selected-entry HTML clone export. See
 * `docs/development/selected-entry-html-clone-export.md`.
 */
import { describe, it, expect } from 'vitest';
import { buildSubsetContainer } from '../../../src/features/container/build-subset';
import type { Container } from '../../../src/core/model/container';

function makeContainer(partial: Partial<Container>): Container {
  return {
    meta: {
      container_id: 'test',
      title: 'Test',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
    ...partial,
  };
}

describe('buildSubsetContainer — root-only minimum', () => {
  it('returns null for an unknown lid', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    expect(buildSubsetContainer(c, 'nonexistent')).toBeNull();
  });

  it('includes only the root when nothing is referenced', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: 'plain text, no refs', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: 'unrelated', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.entries.map((e) => e.lid)).toEqual(['a']);
    expect(r.container.assets).toEqual({});
    expect(r.missingEntryLids.size).toBe(0);
    expect(r.missingAssetKeys.size).toBe(0);
  });

  it('drops revisions unconditionally', () => {
    const c = makeContainer({
      entries: [{ lid: 'a', title: 'A', body: '', archetype: 'text', created_at: '', updated_at: '' }],
      revisions: [
        { id: 'r1', entry_lid: 'a', snapshot: '{}', created_at: '2026-01-01T00:00:00Z' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.revisions).toEqual([]);
  });
});

describe('buildSubsetContainer — asset collection', () => {
  it('pulls asset keys referenced in the root body', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'a',
          title: 'A',
          body: 'before ![pic](asset:ast-1) after [link](asset:ast-2)',
          archetype: 'text',
          created_at: '',
          updated_at: '',
        },
      ],
      assets: { 'ast-1': 'base64-aaa', 'ast-2': 'base64-bbb', 'ast-orphan': 'base64-ccc' },
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(Object.keys(r.container.assets).sort()).toEqual(['ast-1', 'ast-2']);
    expect(r.includedAssetKeys.has('ast-orphan')).toBe(false);
  });

  it('pulls an attachment entry that owns a body-referenced asset', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '![p](asset:ast-1)', archetype: 'text', created_at: '', updated_at: '' },
        {
          lid: 'att1',
          title: 'pic.png',
          body: JSON.stringify({ asset_key: 'ast-1', mime: 'image/png', name: 'pic.png' }),
          archetype: 'attachment',
          created_at: '',
          updated_at: '',
        },
        {
          lid: 'att2',
          title: 'unrelated.pdf',
          body: JSON.stringify({ asset_key: 'ast-9', mime: 'application/pdf', name: 'x.pdf' }),
          archetype: 'attachment',
          created_at: '',
          updated_at: '',
        },
      ],
      assets: { 'ast-1': 'base64-aaa', 'ast-9': 'base64-ddd' },
    });
    const r = buildSubsetContainer(c, 'a')!;
    const lids = r.container.entries.map((e) => e.lid).sort();
    expect(lids).toContain('att1');
    expect(lids).not.toContain('att2');
    expect(Object.keys(r.container.assets)).toEqual(['ast-1']);
  });

  it('records missing assets rather than silently dropping them', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '![miss](asset:ast-missing)', archetype: 'text', created_at: '', updated_at: '' },
      ],
      assets: {},
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.assets).toEqual({});
    expect(Array.from(r.missingAssetKeys)).toEqual(['ast-missing']);
  });
});

describe('buildSubsetContainer — entry reference closure', () => {
  it('pulls entries referenced via `entry:<lid>` links, recursively', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: 'see [B](entry:b) and [D](entry:d)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: 'chain to [C](entry:c)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'c', title: 'C', body: 'leaf', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'd', title: 'D', body: 'leaf2', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'z', title: 'Z', body: 'unrelated', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    const lids = r.container.entries.map((e) => e.lid).sort();
    expect(lids).toEqual(['a', 'b', 'c', 'd']);
    expect(lids).not.toContain('z');
  });

  it('treats the transclusion form `![](entry:lid)` as a reference', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '![](entry:b)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: 'embedded', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.entries.map((e) => e.lid).sort()).toEqual(['a', 'b']);
  });

  it('treats fragment variants (#log/ #day/) as pointing at the target entry', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: 'see [L](entry:log1#log/row-42) and [D](entry:tl1#day/2026-04-01)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'log1', title: 'Log', body: JSON.stringify({ entries: [] }), archetype: 'textlog', created_at: '', updated_at: '' },
        { lid: 'tl1', title: 'TL', body: JSON.stringify({ entries: [] }), archetype: 'textlog', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    const lids = r.container.entries.map((e) => e.lid).sort();
    expect(lids).toEqual(['a', 'log1', 'tl1']);
  });

  it('records unresolved entry refs as missing without crashing', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: 'gone: [G](entry:ghost)', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.entries.map((e) => e.lid)).toEqual(['a']);
    expect(Array.from(r.missingEntryLids)).toEqual(['ghost']);
  });

  it('is safe against cycles (a → b → a)', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: 'see [B](entry:b)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: 'back to [A](entry:a)', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.entries.map((e) => e.lid).sort()).toEqual(['a', 'b']);
  });

  it('follows refs from inside TEXTLOG row text', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'log',
          title: 'Log',
          body: JSON.stringify({
            entries: [
              { id: 'r1', text: 'Mentions [X](entry:x)', createdAt: '2026-04-01T00:00:00Z', flags: [] },
            ],
          }),
          archetype: 'textlog',
          created_at: '',
          updated_at: '',
        },
        { lid: 'x', title: 'X', body: 'leaf', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'z', title: 'Z', body: 'unrelated', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'log')!;
    const lids = r.container.entries.map((e) => e.lid).sort();
    expect(lids).toEqual(['log', 'x']);
  });
});

describe('buildSubsetContainer — structural ancestors', () => {
  it('includes ancestor folders so the tree path stays reachable', () => {
    const c = makeContainer({
      entries: [
        { lid: 'root', title: 'Root', body: '', archetype: 'folder', created_at: '', updated_at: '' },
        { lid: 'mid', title: 'Mid', body: '', archetype: 'folder', created_at: '', updated_at: '' },
        { lid: 'leaf', title: 'Leaf', body: '', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'unrelated', title: 'Sibling', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
      relations: [
        { id: 'r1', from: 'root', to: 'mid', kind: 'structural', created_at: '', updated_at: '' },
        { id: 'r2', from: 'mid', to: 'leaf', kind: 'structural', created_at: '', updated_at: '' },
        { id: 'r3', from: 'mid', to: 'unrelated', kind: 'structural', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'leaf')!;
    const lids = r.container.entries.map((e) => e.lid).sort();
    // 'unrelated' is a sibling — it must NOT be pulled in.
    expect(lids).toEqual(['leaf', 'mid', 'root']);
  });
});

describe('buildSubsetContainer — relation filtering', () => {
  it('drops relations whose endpoints are not both in the subset', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: 'see [B](entry:b)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: 'leaf', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'c', title: 'C', body: 'outside', archetype: 'text', created_at: '', updated_at: '' },
      ],
      relations: [
        { id: 'r-keep', from: 'a', to: 'b', kind: 'semantic', created_at: '', updated_at: '' },
        { id: 'r-dangling-out', from: 'a', to: 'c', kind: 'semantic', created_at: '', updated_at: '' },
        { id: 'r-dangling-in', from: 'c', to: 'a', kind: 'semantic', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.relations.map((rel) => rel.id)).toEqual(['r-keep']);
  });
});

describe('buildSubsetContainer — end-to-end invariants', () => {
  it('output has no dangling relations and no asset keys missing from assets map (except explicitly-tracked missing set)', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '![p](asset:ast-1) and [B](entry:b)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '![q](asset:ast-2)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'unrelated', title: 'Z', body: '![x](asset:ast-9)', archetype: 'text', created_at: '', updated_at: '' },
      ],
      assets: { 'ast-1': 'x', 'ast-2': 'y', 'ast-9': 'z' },
      relations: [
        { id: 'sem', from: 'a', to: 'b', kind: 'semantic', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    const lids = new Set(r.container.entries.map((e) => e.lid));
    for (const rel of r.container.relations) {
      expect(lids.has(rel.from)).toBe(true);
      expect(lids.has(rel.to)).toBe(true);
    }
    // Every asset key in the map is referenced by at least one
    // included entry.
    expect(Object.keys(r.container.assets).sort()).toEqual(['ast-1', 'ast-2']);
    // Unrelated asset did not leak in.
    expect(r.container.assets['ast-9']).toBeUndefined();
  });
});
