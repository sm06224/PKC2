/**
 * sqlite-schema(P2)の純粋部 test: 行マッパの往復と参照 diff。
 *
 * ここで pin する不変条件:
 *  1. additive optional field(tags / color_tag / bulk_id / metadata /
 *     saved_searches …)は extra 列で**落ちずに往復**する
 *  2. absent な optional field は absent のまま帰る(undefined キーを
 *     作らない ── Object.keys 比較系が誤判しないため)
 *  3. diff は**参照比較**: 変更行だけを op にし、同一参照は 0 op
 */
import { describe, expect, it } from 'vitest';
import type { Container, Revision } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';
import type { Relation } from '../../src/core/model/relation';
import {
  containerToRows,
  diffContainerToOps,
  entryToRow,
  relationToRow,
  revisionToRow,
  rowsToContainer,
  rowToEntry,
  rowToRelation,
  rowToRevision,
} from '../../src/adapter/platform/storage/sqlite/sqlite-schema';

function makeEntry(over: Partial<Entry> = {}): Entry {
  return {
    lid: 'e1',
    title: 'タイトル',
    body: '本文',
    archetype: 'text',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-02T00:00:00Z',
    ...over,
  };
}

function makeContainer(over: Partial<Container> = {}): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'C',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-02T00:00:00Z',
      schema_version: 1,
    },
    entries: [makeEntry()],
    relations: [],
    revisions: [],
    assets: {},
    ...over,
  };
}

describe('sqlite-schema mappers', () => {
  it('entry: optional fields(tags / color_tag / display_profile)が extra 経由で往復する', () => {
    const entry = makeEntry({
      tags: ['a', 'b'],
      color_tag: 'red',
      display_profile: { kind: 'explorer' },
    });
    const back = rowToEntry(entryToRow(entry, 3));
    expect(back).toEqual(entry);
  });

  it('entry: absent な optional field は absent のまま(キーを作らない)', () => {
    const back = rowToEntry(entryToRow(makeEntry(), 0));
    expect('tags' in back).toBe(false);
    expect('color_tag' in back).toBe(false);
    expect(back).toEqual(makeEntry());
  });

  it('entry: 未知の additive field も落とさない(将来互換)', () => {
    const entry = { ...makeEntry(), future_field: { nested: true } } as unknown as Entry;
    const back = rowToEntry(entryToRow(entry, 0));
    expect((back as unknown as Record<string, unknown>).future_field).toEqual({ nested: true });
  });

  it('revision: prev_rid / content_hash は列、bulk_id は extra で往復', () => {
    const full: Revision = {
      id: 'r1',
      entry_lid: 'e1',
      snapshot: '{"lid":"e1"}',
      created_at: '2026-07-01T00:00:00Z',
      prev_rid: 'r0',
      content_hash: 'abcd1234abcd1234',
      bulk_id: 'bulk-1',
    };
    expect(rowToRevision(revisionToRow(full, 5))).toEqual(full);

    const minimal: Revision = {
      id: 'r2',
      entry_lid: 'e1',
      snapshot: '{}',
      created_at: '2026-07-01T00:00:00Z',
    };
    const back = rowToRevision(revisionToRow(minimal, 0));
    expect(back).toEqual(minimal);
    expect('prev_rid' in back).toBe(false);
    expect('content_hash' in back).toBe(false);
    expect('bulk_id' in back).toBe(false);
  });

  it('relation: metadata が extra で往復する', () => {
    const rel: Relation = {
      id: 'rel1',
      from: 'e1',
      to: 'e2',
      kind: 'structural',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
      metadata: { weight: 2 },
    };
    expect(rowToRelation(relationToRow(rel, 0))).toEqual(rel);
  });

  it('container 全体: meta の additive field(entry_order / saved_searches / sandbox_policy)込みで往復', () => {
    const container = makeContainer({
      meta: {
        container_id: 'c1',
        title: 'C',
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-02T00:00:00Z',
        schema_version: 1,
        sandbox_policy: 'relaxed',
        entry_order: ['e1'],
        saved_searches: [
          {
            id: 's1',
            name: '検索',
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
            search_query: 'q',
            archetype_filter: ['text'],
            categorical_peer_filter: null,
            sort_key: 'updated_at',
            sort_direction: 'desc',
            show_archived: false,
          },
        ],
      },
      relations: [
        {
          id: 'rel1',
          from: 'e1',
          to: 'e1',
          kind: 'semantic',
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-01T00:00:00Z',
        },
      ],
      revisions: [
        { id: 'r1', entry_lid: 'e1', snapshot: '{}', created_at: '2026-07-01T00:00:00Z' },
      ],
    });
    const back = rowsToContainer(containerToRows(container));
    expect(back).toEqual({ ...container, assets: {} });
  });
});

describe('sqlite-schema diff', () => {
  it('同一参照は 0 op', () => {
    const c = makeContainer();
    expect(diffContainerToOps(c, c)).toEqual([]);
  });

  it('entry 1 件の差し替えは entry-upsert 1 op だけ(revisions/relations に波及しない)', () => {
    const prev = makeContainer({
      entries: [makeEntry(), makeEntry({ lid: 'e2', title: '2' })],
      revisions: [
        { id: 'r1', entry_lid: 'e1', snapshot: '{}', created_at: '2026-07-01T00:00:00Z' },
      ],
    });
    const edited = { ...prev.entries[0]!, body: '編集後' };
    const next = { ...prev, entries: [edited, prev.entries[1]!] };
    const ops = diffContainerToOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ t: 'entry-upsert', row: { lid: 'e1', body: '編集後', ord: 0 } });
  });

  it('並べ替えだけなら entry-ord op(本文を運ばない)', () => {
    const e1 = makeEntry();
    const e2 = makeEntry({ lid: 'e2' });
    const prev = makeContainer({ entries: [e1, e2] });
    const next = { ...prev, entries: [e2, e1] };
    const ops = diffContainerToOps(prev, next);
    expect(ops).toEqual([
      { t: 'entry-ord', lid: 'e2', ord: 0 },
      { t: 'entry-ord', lid: 'e1', ord: 1 },
    ]);
  });

  it('削除は entry-delete、revision 追記は rev-upsert だけ', () => {
    const e1 = makeEntry();
    const e2 = makeEntry({ lid: 'e2' });
    const prev = makeContainer({ entries: [e1, e2] });
    const rev: Revision = {
      id: 'r1',
      entry_lid: 'e2',
      snapshot: '{}',
      created_at: '2026-07-03T00:00:00Z',
    };
    const next = { ...prev, entries: [e1], revisions: [rev] };
    const ops = diffContainerToOps(prev, next);
    expect(ops).toEqual([
      { t: 'entry-delete', lid: 'e2' },
      { t: 'rev-upsert', row: expect.objectContaining({ id: 'r1', ord: 0 }) },
    ]);
  });

  it('meta の差し替えは meta op', () => {
    const prev = makeContainer();
    const next = { ...prev, meta: { ...prev.meta, title: '改名' } };
    const ops = diffContainerToOps(prev, next);
    expect(ops).toEqual([{ t: 'meta', row: expect.objectContaining({ title: '改名' }) }]);
  });
});
