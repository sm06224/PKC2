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

// Helper for TODO entries — the body is JSON per the schema in
// `src/features/todo/todo-body.ts`.
function makeTodoBody(description: string, status: 'open' | 'done' = 'open'): string {
  return JSON.stringify({ status, description });
}

describe('buildSubsetContainer — TODO description scan (Slice 2 pre-positioning)', () => {
  // Slice 2 extends `collectScannableBodies` to scan TODO descriptions
  // for `entry:` and `asset:` references. That scan is currently a
  // pre-position for Slice 3 (description markdown render), but the
  // closure side already has to be right — otherwise a TODO embed
  // exported via the selected-entry HTML clone would miss its referenced
  // targets.

  it('pulls entries referenced from a TODO description (link form)', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'root',
          title: 'Root todo',
          body: makeTodoBody('follow-up on [B](entry:b)'),
          archetype: 'todo',
          created_at: '',
          updated_at: '',
        },
        { lid: 'b', title: 'B', body: 'body-b', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'z', title: 'Z', body: 'unrelated', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'root')!;
    const lids = r.container.entries.map((e) => e.lid).sort();
    expect(lids).toEqual(['b', 'root']);
  });

  it('pulls entries referenced via bare `entry:<lid>` tokens in a TODO description', () => {
    // The regex in extract-entry-refs matches bare tokens too, so a
    // pasted ref inside a description still counts toward the closure.
    const c = makeContainer({
      entries: [
        {
          lid: 'root',
          title: 'Root',
          body: makeTodoBody('see entry:b and entry:c for context'),
          archetype: 'todo',
          created_at: '',
          updated_at: '',
        },
        { lid: 'b', title: 'B', body: '', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'c', title: 'C', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'root')!;
    const lids = r.container.entries.map((e) => e.lid).sort();
    expect(lids).toEqual(['b', 'c', 'root']);
  });

  it('pulls assets referenced via `asset:<key>` tokens in a TODO description', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'root',
          title: 'Root',
          body: makeTodoBody('attach ![pic](asset:ast-1)'),
          archetype: 'todo',
          created_at: '',
          updated_at: '',
        },
      ],
      assets: { 'ast-1': 'base64-aaa', 'ast-2': 'base64-bbb' },
    });
    const r = buildSubsetContainer(c, 'root')!;
    expect(Object.keys(r.container.assets)).toEqual(['ast-1']);
    expect(r.container.assets['ast-2']).toBeUndefined();
  });

  it('closes transitively — TODO description → TEXT body → another TODO', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'root',
          title: 'Root',
          body: makeTodoBody('chain via [text](entry:mid)'),
          archetype: 'todo',
          created_at: '',
          updated_at: '',
        },
        {
          lid: 'mid',
          title: 'Mid',
          body: 'further [todo](entry:leaf)',
          archetype: 'text',
          created_at: '',
          updated_at: '',
        },
        {
          lid: 'leaf',
          title: 'Leaf',
          body: makeTodoBody('plain'),
          archetype: 'todo',
          created_at: '',
          updated_at: '',
        },
      ],
    });
    const r = buildSubsetContainer(c, 'root')!;
    const lids = r.container.entries.map((e) => e.lid).sort();
    expect(lids).toEqual(['leaf', 'mid', 'root']);
  });

  it('TODO with an empty description does not add anything beyond the root', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'root',
          title: 'Root',
          body: makeTodoBody(''),
          archetype: 'todo',
          created_at: '',
          updated_at: '',
        },
        { lid: 'b', title: 'B', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'root')!;
    expect(r.container.entries.map((e) => e.lid)).toEqual(['root']);
  });

  it('records missing entries referenced from a TODO description', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'root',
          title: 'Root',
          body: makeTodoBody('see [ghost](entry:ghost)'),
          archetype: 'todo',
          created_at: '',
          updated_at: '',
        },
      ],
    });
    const r = buildSubsetContainer(c, 'root')!;
    expect(Array.from(r.missingEntryLids)).toEqual(['ghost']);
  });
});

describe('buildSubsetContainer — FOLDER description scan (Slice 3)', () => {
  // Slice 3 markdown-renders folder descriptions in the viewer. The
  // closure must follow suit: entry: / asset: refs in a folder body
  // have to be pulled into the HTML-clone subset, otherwise the
  // exported clone would show broken links / images.

  it('pulls entries referenced from a FOLDER description', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'root',
          title: 'Root folder',
          body: '# Overview\n\nsee [T](entry:target)',
          archetype: 'folder',
          created_at: '',
          updated_at: '',
        },
        { lid: 'target', title: 'T', body: '', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'zz', title: 'Z', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'root')!;
    const lids = r.container.entries.map((e) => e.lid).sort();
    expect(lids).toEqual(['root', 'target']);
  });

  it('pulls assets referenced from a FOLDER description', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'root',
          title: 'Root',
          body: 'notes ![pic](asset:ast-1)',
          archetype: 'folder',
          created_at: '',
          updated_at: '',
        },
      ],
      assets: { 'ast-1': 'AAAA', 'ast-2': 'BBBB' },
    });
    const r = buildSubsetContainer(c, 'root')!;
    expect(Object.keys(r.container.assets)).toEqual(['ast-1']);
  });

  it('FOLDER with empty body adds nothing beyond the root', () => {
    const c = makeContainer({
      entries: [
        { lid: 'root', title: 'R', body: '', archetype: 'folder', created_at: '', updated_at: '' },
        { lid: 'zz', title: 'Z', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'root')!;
    expect(r.container.entries.map((e) => e.lid)).toEqual(['root']);
  });

  it('closes transitively — FOLDER description → TEXT body → TODO', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'root',
          title: 'F',
          body: 'see [M](entry:mid)',
          archetype: 'folder',
          created_at: '',
          updated_at: '',
        },
        {
          lid: 'mid',
          title: 'M',
          body: 'and [L](entry:leaf)',
          archetype: 'text',
          created_at: '',
          updated_at: '',
        },
        {
          lid: 'leaf',
          title: 'L',
          body: makeTodoBody('plain'),
          archetype: 'todo',
          created_at: '',
          updated_at: '',
        },
      ],
    });
    const r = buildSubsetContainer(c, 'root')!;
    const lids = r.container.entries.map((e) => e.lid).sort();
    expect(lids).toEqual(['leaf', 'mid', 'root']);
  });

  it('records missing entries referenced from a FOLDER description', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'root',
          title: 'F',
          body: 'missing [g](entry:ghost)',
          archetype: 'folder',
          created_at: '',
          updated_at: '',
        },
      ],
    });
    const r = buildSubsetContainer(c, 'root')!;
    expect(Array.from(r.missingEntryLids)).toEqual(['ghost']);
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

// ── P0-2c / A10: cycle & multi-path observation tests ──────────
//
// Existing suites cover the happy path plus a 2-node (a → b → a)
// cycle. The tests below pin the remaining observation gaps flagged
// in the P0-2a inventory:
//
//   - longer cycles (3 / 4 nodes)
//   - multi-path reachability to the same entry
//   - multi-path reachability to the same asset
//   - cycles that travel through TODO / FOLDER / TEXTLOG bodies
//   - missing entry + missing asset refs on the same run
//   - subset size does not inflate under cycles (de-dup is real)
//   - relation filter still drops dangling edges when the graph
//     contains a cycle
//
// All tests are phrased to assert the OBSERVED shape of the current
// implementation. If any assertion fails, the intent is to surface
// the change and have it reviewed explicitly — not to paper over
// behaviour with a relaxed oracle.

describe('buildSubsetContainer — longer cycles', () => {
  it('closes a 3-node cycle (a → b → c → a) without looping', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: 'see [B](entry:b)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: 'see [C](entry:c)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'c', title: 'C', body: 'see [A](entry:a)', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.entries.map((e) => e.lid).sort()).toEqual(['a', 'b', 'c']);
    expect(r.includedLids.size).toBe(3);
    expect(r.missingEntryLids.size).toBe(0);
  });

  it('closes a 4-node cycle (a → b → c → d → a)', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '[B](entry:b)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '[C](entry:c)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'c', title: 'C', body: '[D](entry:d)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'd', title: 'D', body: '[A](entry:a)', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.entries.map((e) => e.lid).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(r.includedLids.size).toBe(4);
  });

  it('self-reference (a → a) closes cleanly without entering a loop', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: 'self [A](entry:a)', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.entries.map((e) => e.lid)).toEqual(['a']);
    expect(r.includedLids.size).toBe(1);
  });
});

describe('buildSubsetContainer — multi-path reachability', () => {
  it('diamond: a → b, a → c, b → d, c → d — d appears once', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '[B](entry:b) [C](entry:c)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '[D](entry:d)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'c', title: 'C', body: '[D](entry:d)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'd', title: 'D', body: 'leaf', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.entries.map((e) => e.lid).sort()).toEqual(['a', 'b', 'c', 'd']);
    const dOccurrences = r.container.entries.filter((e) => e.lid === 'd').length;
    expect(dOccurrences).toBe(1);
  });

  it('diamond + cycle: a → b → d → a, a → c → d — d appears once, graph still closes', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '[B](entry:b) [C](entry:c)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '[D](entry:d)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'c', title: 'C', body: '[D](entry:d)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'd', title: 'D', body: 'back [A](entry:a)', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.entries.map((e) => e.lid).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(r.includedLids.size).toBe(4);
  });

  it('same asset referenced from three different entries — single asset entry in subset', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '![](asset:ast-shared) [B](entry:b) [C](entry:c)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '![](asset:ast-shared)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'c', title: 'C', body: '![](asset:ast-shared)', archetype: 'text', created_at: '', updated_at: '' },
      ],
      assets: { 'ast-shared': 'shared-bytes' },
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(Object.keys(r.container.assets)).toEqual(['ast-shared']);
    expect(r.includedAssetKeys.size).toBe(1);
    expect(r.container.assets['ast-shared']).toBe('shared-bytes');
  });
});

describe('buildSubsetContainer — cycles through archetype-specific bodies', () => {
  it('TEXTLOG row cycle: text → textlog (log text references text) → text', () => {
    const c = makeContainer({
      entries: [
        { lid: 'doc', title: 'Doc', body: '[Log](entry:log)', archetype: 'text', created_at: '', updated_at: '' },
        {
          lid: 'log',
          title: 'Log',
          body: JSON.stringify({
            entries: [
              { id: 'l1', text: 'see [Doc](entry:doc)', createdAt: '2026-04-13T10:00:00Z', flags: [] },
              { id: 'l2', text: 'another back-ref [Doc](entry:doc)', createdAt: '2026-04-13T11:00:00Z', flags: [] },
            ],
          }),
          archetype: 'textlog',
          created_at: '',
          updated_at: '',
        },
      ],
    });
    const r = buildSubsetContainer(c, 'doc')!;
    expect(r.container.entries.map((e) => e.lid).sort()).toEqual(['doc', 'log']);
    expect(r.includedLids.size).toBe(2);
  });

  it('TODO description cycle: text → todo (description references text)', () => {
    const c = makeContainer({
      entries: [
        { lid: 'doc', title: 'Doc', body: '[Task](entry:task)', archetype: 'text', created_at: '', updated_at: '' },
        {
          lid: 'task',
          title: 'Task',
          body: JSON.stringify({ status: 'open', description: 'blocked by [Doc](entry:doc)' }),
          archetype: 'todo',
          created_at: '',
          updated_at: '',
        },
      ],
    });
    const r = buildSubsetContainer(c, 'doc')!;
    expect(r.container.entries.map((e) => e.lid).sort()).toEqual(['doc', 'task']);
  });

  it('FOLDER description cycle: text → folder (description references text)', () => {
    const c = makeContainer({
      entries: [
        { lid: 'doc', title: 'Doc', body: '[Home](entry:home)', archetype: 'text', created_at: '', updated_at: '' },
        {
          lid: 'home',
          title: 'Home',
          body: 'Welcome! Jump to [Doc](entry:doc)',
          archetype: 'folder',
          created_at: '',
          updated_at: '',
        },
      ],
    });
    const r = buildSubsetContainer(c, 'doc')!;
    expect(r.container.entries.map((e) => e.lid).sort()).toEqual(['doc', 'home']);
  });

  it('mixed-archetype cycle: folder → text → todo → folder', () => {
    const c = makeContainer({
      entries: [
        { lid: 'f', title: 'F', body: '[T](entry:t)', archetype: 'folder', created_at: '', updated_at: '' },
        { lid: 't', title: 'T', body: '[D](entry:d)', archetype: 'text', created_at: '', updated_at: '' },
        {
          lid: 'd',
          title: 'D',
          body: JSON.stringify({ status: 'open', description: 'back to [F](entry:f)' }),
          archetype: 'todo',
          created_at: '',
          updated_at: '',
        },
      ],
    });
    const r = buildSubsetContainer(c, 'f')!;
    expect(r.container.entries.map((e) => e.lid).sort()).toEqual(['d', 'f', 't']);
    expect(r.includedLids.size).toBe(3);
  });
});

describe('buildSubsetContainer — mixed missing refs', () => {
  it('records both missing entry refs and missing asset refs in one pass', () => {
    const c = makeContainer({
      entries: [
        {
          lid: 'a',
          title: 'A',
          body: 'dangling [B](entry:ghost-entry) and ![](asset:ghost-asset) and ok ![](asset:ast-ok)',
          archetype: 'text',
          created_at: '',
          updated_at: '',
        },
      ],
      assets: { 'ast-ok': 'present' },
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(Array.from(r.missingEntryLids)).toEqual(['ghost-entry']);
    expect(Array.from(r.missingAssetKeys)).toEqual(['ghost-asset']);
    expect(Object.keys(r.container.assets)).toEqual(['ast-ok']);
  });

  it('missing refs do not break the closure of the reachable part', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '[B](entry:b)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '[Lost](entry:nowhere)', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    expect(r.container.entries.map((e) => e.lid).sort()).toEqual(['a', 'b']);
    expect(Array.from(r.missingEntryLids)).toEqual(['nowhere']);
  });
});

describe('buildSubsetContainer — subset stays bounded under cycles', () => {
  it('includedLids size never exceeds the number of unique entries in source', () => {
    const lids = ['n1', 'n2', 'n3', 'n4', 'n5'];
    const entries = lids.map((lid) => ({
      lid,
      title: lid,
      body: `refs: ${lids.map((t) => `[${t}](entry:${t})`).join(' ')}`,
      archetype: 'text' as const,
      created_at: '',
      updated_at: '',
    }));
    const c = makeContainer({ entries });
    const r = buildSubsetContainer(c, 'n1')!;
    expect(r.container.entries).toHaveLength(5);
    expect(r.includedLids.size).toBe(5);
  });

  it('complete-graph cycle: no entry appears twice in the output', () => {
    const lids = ['x1', 'x2', 'x3'];
    const entries = lids.map((lid) => ({
      lid,
      title: lid,
      body: lids.filter((o) => o !== lid).map((o) => `[${o}](entry:${o})`).join(' '),
      archetype: 'text' as const,
      created_at: '',
      updated_at: '',
    }));
    const c = makeContainer({ entries });
    const r = buildSubsetContainer(c, 'x1')!;
    const seenLids = new Set<string>();
    for (const e of r.container.entries) {
      expect(seenLids.has(e.lid), `duplicate lid ${e.lid} in subset`).toBe(false);
      seenLids.add(e.lid);
    }
    expect(seenLids.size).toBe(3);
  });
});

// ── S2: multi-root overload ──────────────────────────────────────
//
// Multi-root tests pin the additive multi-select HTML export
// revival. The single-root overload and its tests above remain the
// authoritative contract; the array overload is an extension that
// unions reachability across every valid root.

describe('buildSubsetContainer — multi-root overload (S2)', () => {
  it('array of two independent roots includes both and their references', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '[B](entry:b)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'c', title: 'C', body: '[D](entry:d)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'd', title: 'D', body: '', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'z', title: 'Z', body: 'unrelated', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, ['a', 'c'])!;
    const lids = new Set(r.container.entries.map((e) => e.lid));
    expect(lids.has('a')).toBe(true);
    expect(lids.has('b')).toBe(true); // a → b
    expect(lids.has('c')).toBe(true);
    expect(lids.has('d')).toBe(true); // c → d
    expect(lids.has('z')).toBe(false);
  });

  it('shared descendant is not duplicated', () => {
    // Both roots reference `shared`. It must appear exactly once in
    // the subset's entry list.
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '[S](entry:shared)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '[S](entry:shared)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'shared', title: 'Shared', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, ['a', 'b'])!;
    const sharedCount = r.container.entries.filter((e) => e.lid === 'shared').length;
    expect(sharedCount).toBe(1);
  });

  it('duplicate root lids in input collapse to one', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, ['a', 'a', 'a'])!;
    expect(r.container.entries).toHaveLength(1);
    expect(r.includedLids.size).toBe(1);
  });

  it('mixed valid + invalid root lids: invalid ones are silently dropped', () => {
    // A stale multi-selection (e.g. one entry just deleted) must
    // not fail the whole export — proceed with the valid roots.
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, ['a', 'ghost', 'b'])!;
    const lids = new Set(r.container.entries.map((e) => e.lid));
    expect(lids.has('a')).toBe(true);
    expect(lids.has('b')).toBe(true);
    expect(r.missingEntryLids.has('ghost')).toBe(false); // not a dangling body ref
  });

  it('returns null only when every root lid is missing', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    expect(buildSubsetContainer(c, ['ghost-1', 'ghost-2'])).toBeNull();
  });

  it('empty array returns null (nothing to export)', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    expect(buildSubsetContainer(c, [] as readonly string[])).toBeNull();
  });

  it('single-element array matches single-root overload output shape', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '[B](entry:b)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    const viaString = buildSubsetContainer(c, 'a')!;
    const viaArray = buildSubsetContainer(c, ['a'])!;
    const stringLids = [...viaString.container.entries.map((e) => e.lid)].sort();
    const arrayLids = [...viaArray.container.entries.map((e) => e.lid)].sort();
    expect(arrayLids).toEqual(stringLids);
    expect(viaArray.includedLids.size).toBe(viaString.includedLids.size);
  });

  it('shared asset key across two roots surfaces once in missingAssetKeys', () => {
    // Two TEXT entries reference the same asset key; it is absent
    // from `assets`, so it is reported missing. It must be reported
    // exactly once — union semantics, not duplicated.
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '![png](asset:k)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '![png](asset:k)', archetype: 'text', created_at: '', updated_at: '' },
      ],
      assets: {}, // `k` is missing
    });
    const r = buildSubsetContainer(c, ['a', 'b'])!;
    expect(r.missingAssetKeys.size).toBe(1);
    expect(r.missingAssetKeys.has('k')).toBe(true);
  });

  it('deterministic entry order matches container.entries order, not input order', () => {
    const c = makeContainer({
      entries: [
        { lid: 'first', title: 'First', body: '', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'second', title: 'Second', body: '', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'third', title: 'Third', body: '', archetype: 'text', created_at: '', updated_at: '' },
      ],
    });
    // Inputs in reversed order — output still follows container
    // entries order.
    const r = buildSubsetContainer(c, ['third', 'first', 'second'])!;
    expect(r.container.entries.map((e) => e.lid)).toEqual(['first', 'second', 'third']);
  });
});

describe('buildSubsetContainer — relation filter under cycles', () => {
  it('cycle + dangling relation: final subset has no dangling relations', () => {
    const c = makeContainer({
      entries: [
        { lid: 'a', title: 'A', body: '[B](entry:b)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'b', title: 'B', body: '[A](entry:a)', archetype: 'text', created_at: '', updated_at: '' },
        { lid: 'z', title: 'Z', body: 'unrelated', archetype: 'text', created_at: '', updated_at: '' },
      ],
      relations: [
        { id: 'r-ab', from: 'a', to: 'b', kind: 'semantic', created_at: '', updated_at: '' },
        { id: 'r-az', from: 'a', to: 'z', kind: 'semantic', created_at: '', updated_at: '' },
        { id: 'r-za', from: 'z', to: 'a', kind: 'semantic', created_at: '', updated_at: '' },
      ],
    });
    const r = buildSubsetContainer(c, 'a')!;
    const lids = new Set(r.container.entries.map((e) => e.lid));
    expect(lids.has('z')).toBe(false);
    for (const rel of r.container.relations) {
      expect(lids.has(rel.from)).toBe(true);
      expect(lids.has(rel.to)).toBe(true);
    }
    expect(r.container.relations.map((rr) => rr.id)).toEqual(['r-ab']);
  });
});
