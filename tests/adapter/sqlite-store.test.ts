/**
 * SqliteContainerStore(P2)の意味論 test ── fake RPC(in-memory 表)で
 * worker を代役し、store 層の契約を pin する:
 *
 *  1. baseline なしの初回 save は saveFull、以後は **applyOps(変更行のみ)**
 *  2. load が baseline を立てる = boot 後の最初の編集からいきなり行 diff
 *     (全量 clone の初回保存が存在しない)
 *  3. assets は additive-only で inner へ委譲、同一 key は session 中 1 回だけ書く
 *  4. IDB → sqlite 移行は非破壊(inner のデータが残る)で idempotent
 *  5. workspace / default pointer / listContainers の契約が idb-store と同型
 *
 * 実 worker + 実 sqlite の検証は happy-dom では不可能(OPFS / Worker なし)
 * なので、実ブラウザ harness(tests/bench/sqlite-roundtrip.mjs)が担う。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { Container } from '../../src/core/model/container';
import { createMemoryStore } from '../../src/adapter/platform/idb-store';
import {
  createSqliteContainerStore,
  migrateFromInnerIfEmpty,
} from '../../src/adapter/platform/storage/sqlite/sqlite-store';
import {
  rowsToContainer,
  type ContainerRow,
  type ContainerRows,
  type EntryRow,
  type RelationRow,
  type RevisionRow,
  type RowOp,
} from '../../src/adapter/platform/storage/sqlite/sqlite-schema';
import type { SqliteRequestBody, SqliteRpc } from '../../src/adapter/platform/storage/sqlite/sqlite-rpc';

/** worker の in-memory 代役: RowOp / query を Map 上で忠実に適用する。 */
function createFakeRpc(): SqliteRpc & { calls: SqliteRequestBody[] } {
  const containers = new Map<string, ContainerRow>();
  const entries = new Map<string, Map<string, EntryRow>>();
  const revisions = new Map<string, Map<string, RevisionRow>>();
  const relations = new Map<string, Map<string, RelationRow>>();
  const kv = new Map<string, string>();
  const calls: SqliteRequestBody[] = [];

  const tableFor = <T>(m: Map<string, Map<string, T>>, cid: string): Map<string, T> => {
    let t = m.get(cid);
    if (!t) {
      t = new Map();
      m.set(cid, t);
    }
    return t;
  };
  const sorted = <T extends { ord: number }>(t: Map<string, T>): T[] =>
    [...t.values()].sort((a, b) => a.ord - b.ord);

  function applyOp(cid: string, op: RowOp): void {
    switch (op.t) {
      case 'meta':
        containers.set(cid, op.row);
        break;
      case 'entry-upsert':
        tableFor(entries, cid).set(op.row.lid, op.row);
        break;
      case 'entry-ord': {
        const row = tableFor(entries, cid).get(op.lid);
        if (row) row.ord = op.ord;
        break;
      }
      case 'entry-delete':
        tableFor(entries, cid).delete(op.lid);
        break;
      case 'rev-upsert':
        tableFor(revisions, cid).set(op.row.id, op.row);
        break;
      case 'rev-ord': {
        const row = tableFor(revisions, cid).get(op.id);
        if (row) row.ord = op.ord;
        break;
      }
      case 'rev-delete':
        tableFor(revisions, cid).delete(op.id);
        break;
      case 'rel-upsert':
        tableFor(relations, cid).set(op.row.id, op.row);
        break;
      case 'rel-ord': {
        const row = tableFor(relations, cid).get(op.id);
        if (row) row.ord = op.ord;
        break;
      }
      case 'rel-delete':
        tableFor(relations, cid).delete(op.id);
        break;
    }
  }

  return {
    calls,
    call<T = unknown>(req: SqliteRequestBody): Promise<T> {
      calls.push(req);
      const done = (v: unknown) => Promise.resolve(v as T);
      switch (req.op) {
        case 'init':
          return done({ persistent: true, vfs: 'sahpool', version: 'fake', ms: 0 });
        case 'saveFull': {
          const { cid, rows } = req;
          containers.set(cid, rows.container);
          entries.set(cid, new Map(rows.entries.map((r) => [r.lid, { ...r }])));
          revisions.set(cid, new Map(rows.revisions.map((r) => [r.id, { ...r }])));
          relations.set(cid, new Map(rows.relations.map((r) => [r.id, { ...r }])));
          if (req.setDefault) kv.set('__default__', cid);
          return done(undefined);
        }
        case 'applyOps':
          for (const op of req.ops) applyOp(req.cid, op);
          if (req.setDefault) kv.set('__default__', req.cid);
          return done(undefined);
        case 'loadContainer': {
          const c = containers.get(req.cid);
          if (!c) return done(null);
          const rows: ContainerRows = {
            container: c,
            entries: sorted(tableFor(entries, req.cid)),
            revisions: sorted(tableFor(revisions, req.cid)),
            relations: sorted(tableFor(relations, req.cid)),
          };
          return done(rows);
        }
        case 'loadBodies': {
          const out: Record<string, string> = {};
          for (const row of tableFor(entries, req.cid).values()) {
            if (!req.lids || req.lids.includes(row.lid)) out[row.lid] = row.body;
          }
          return done(out);
        }
        case 'listContainers':
          return done([...containers.values()].map((c) => ({ id: c.cid, title: c.title })));
        case 'deleteContainer':
          containers.delete(req.cid);
          entries.delete(req.cid);
          revisions.delete(req.cid);
          relations.delete(req.cid);
          if (kv.get('__default__') === req.cid) kv.delete('__default__');
          return done(undefined);
        case 'clearAll':
          containers.clear();
          entries.clear();
          revisions.clear();
          relations.clear();
          kv.clear();
          return done(undefined);
        case 'getDefaultCid':
          return done(kv.get('__default__') ?? null);
        case 'setDefaultCid':
          kv.set('__default__', req.cid);
          return done(undefined);
        case 'kvGet':
          return done(kv.get(req.k) ?? null);
        case 'kvSet':
          kv.set(req.k, req.v);
          return done(undefined);
        case 'kvDelete':
          kv.delete(req.k);
          return done(undefined);
        case 'kvList':
          return done(
            [...kv.entries()]
              .filter(([k]) => k.startsWith(req.prefix))
              .map(([k, v]) => ({ k, v })),
          );
        default:
          return Promise.reject(new Error(`fake rpc: unknown op`));
      }
    },
    dispose(): void {
      /* noop */
    },
  };
}

function makeContainer(cid = 'c1'): Container {
  return {
    meta: {
      container_id: cid,
      title: `Container ${cid}`,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-02T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'e1',
        title: 'One',
        body: 'body-1',
        archetype: 'text',
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      },
      {
        lid: 'e2',
        title: 'Two',
        body: 'body-2',
        archetype: 'todo',
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
        tags: ['x'],
      },
    ],
    relations: [
      {
        id: 'rel1',
        from: 'e1',
        to: 'e2',
        kind: 'semantic',
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
      },
    ],
    revisions: [
      { id: 'r1', entry_lid: 'e1', snapshot: '{}', created_at: '2026-07-01T00:00:00Z' },
    ],
    assets: {},
  };
}

const opsCalls = (rpc: { calls: SqliteRequestBody[] }) =>
  rpc.calls.filter((c) => c.op === 'applyOps') as Array<
    Extract<SqliteRequestBody, { op: 'applyOps' }>
  >;
const fullCalls = (rpc: { calls: SqliteRequestBody[] }) =>
  rpc.calls.filter((c) => c.op === 'saveFull');

describe('SqliteContainerStore', () => {
  let rpc: ReturnType<typeof createFakeRpc>;
  let inner: ReturnType<typeof createMemoryStore>;
  let store: ReturnType<typeof createSqliteContainerStore>;

  beforeEach(() => {
    rpc = createFakeRpc();
    inner = createMemoryStore();
    store = createSqliteContainerStore(inner, rpc);
  });

  it('初回 save は saveFull、2 回目の 1 entry 編集は applyOps 1 op', async () => {
    const c1 = makeContainer();
    await store.save(c1);
    expect(fullCalls(rpc)).toHaveLength(1);

    const edited = { ...c1.entries[0]!, body: '編集後' };
    const c2 = { ...c1, entries: [edited, c1.entries[1]!] };
    await store.save(c2);

    const ops = opsCalls(rpc);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.ops).toEqual([
      expect.objectContaining({ t: 'entry-upsert', row: expect.objectContaining({ lid: 'e1' }) }),
    ]);
    expect(fullCalls(rpc)).toHaveLength(1); // 増えない
  });

  it('save → loadDefault で構造が往復する(assets は inner から)', async () => {
    const c = makeContainer();
    await store.save(c);
    const back = await store.loadDefaultShallow();
    expect(back).toEqual({ ...c, assets: {} });
  });

  it('load が baseline を立てる: load 直後の編集 save は saveFull ではなく applyOps', async () => {
    const c = makeContainer();
    await store.save(c);

    // 新しい store instance = 新 session(baseline なし)を再現
    const store2 = createSqliteContainerStore(createMemoryStore(), rpc);
    const loaded = await store2.loadDefaultShallow();
    expect(loaded).not.toBeNull();

    const fullBefore = fullCalls(rpc).length;
    const edited = { ...loaded!.entries[0]!, title: '改題' };
    await store2.save({ ...loaded!, entries: [edited, ...loaded!.entries.slice(1)] });
    expect(fullCalls(rpc)).toHaveLength(fullBefore); // saveFull は増えない
    const last = opsCalls(rpc).at(-1)!;
    expect(last.ops).toEqual([
      expect.objectContaining({ t: 'entry-upsert', row: expect.objectContaining({ lid: 'e1' }) }),
    ]);
  });

  it('loadDefaultMetaShallow は storedInline=true / bodiesDeferred=false を返す', async () => {
    await store.save(makeContainer());
    const res = await store.loadDefaultMetaShallow();
    expect(res.storedInline).toBe(true);
    expect(res.bodiesDeferred).toBe(false);
    expect(res.container?.meta.container_id).toBe('c1');
  });

  it('assets は additive-only で inner へ、同一 key は 1 session 1 回だけ書く', async () => {
    const c = { ...makeContainer(), assets: { 'a.png': 'AAAA' } };
    await store.save(c);
    expect(await inner.loadAsset('c1', 'a.png')).toBe('AAAA');

    // 同じ assets でもう 1 回 save → inner の bytes を消して確かめる:
    // skip されていれば書き戻されない
    await inner.deleteAsset('c1', 'a.png');
    await store.save({ ...c, entries: [...c.entries] });
    expect(await inner.loadAsset('c1', 'a.png')).toBeNull();

    // invalidate で記録を破棄すれば次の save が書き直す
    store.invalidatePersistedAssets('c1');
    await store.save({ ...c, entries: [...c.entries, ...[]] });
    expect(await inner.loadAsset('c1', 'a.png')).toBe('AAAA');
  });

  it('workspace CRUD と active id が kv 経由で往復する', async () => {
    const ws = {
      id: 'w1',
      name: 'メイン',
      containerIds: ['c1'],
      activeContainerId: 'c1',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    };
    await store.saveWorkspace(ws);
    expect(await store.loadWorkspace('w1')).toEqual(ws);
    expect(await store.listWorkspaces()).toEqual([ws]);
    await store.setActiveWorkspaceId('w1');
    expect(await store.getActiveWorkspaceId()).toBe('w1');
    await store.deleteWorkspace('w1');
    expect(await store.loadWorkspace('w1')).toBeNull();
  });

  it('listContainers は title(case-insensitive)→ id 順', async () => {
    const a = makeContainer('cid-b');
    a.meta = { ...a.meta, title: 'beta' };
    const b = makeContainer('cid-a');
    b.meta = { ...b.meta, title: 'Alpha' };
    await store.save(a);
    await store.save(b);
    const list = await store.listContainers();
    expect(list.map((c) => c.title)).toEqual(['Alpha', 'beta']);
  });

  it('delete は sqlite と inner の両方から消す(明示操作)', async () => {
    const c = { ...makeContainer(), assets: { 'a.png': 'AAAA' } };
    await inner.save(c); // 旧形式の record を残しておく
    await store.save(c);
    await store.delete('c1');
    expect(await store.loadShallow('c1')).toBeNull();
    expect(await inner.load('c1')).toBeNull();
  });
});

describe('migrateFromInnerIfEmpty(IDB → sqlite、非破壊)', () => {
  it('inner の全 container / workspace / default が写り、inner は無傷', async () => {
    const inner = createMemoryStore();
    const c1 = makeContainer('c1');
    const c2 = makeContainer('c2');
    await inner.save(c2); // 保存順で default が c1 になるよう c2 → c1
    await inner.save(c1);
    await inner.saveWorkspace({
      id: 'w1',
      name: 'WS',
      containerIds: ['c1', 'c2'],
      activeContainerId: 'c1',
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    });
    await inner.setActiveWorkspaceId('w1');

    const rpc = createFakeRpc();
    const store = createSqliteContainerStore(inner, rpc);
    const migrated = await migrateFromInnerIfEmpty(store, inner, rpc);
    expect(migrated).toBe(true);

    // sqlite 側に全部ある
    expect((await store.listContainers()).map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect((await store.loadDefaultShallow())?.meta.container_id).toBe('c1');
    expect((await store.listWorkspaces()).map((w) => w.id)).toEqual(['w1']);
    expect(await store.getActiveWorkspaceId()).toBe('w1');

    // inner(旧 IDB 相当)は無傷 = 旧ビルドの戻り先が生きている
    expect((await inner.loadDefault())?.meta.container_id).toBe('c1');
    expect((await inner.listContainers()).length).toBe(2);

    // idempotent: 2 回目は何もしない
    expect(await migrateFromInnerIfEmpty(store, inner, rpc)).toBe(false);
  });

  it('両方空なら migrated=false(新規環境)', async () => {
    const inner = createMemoryStore();
    const rpc = createFakeRpc();
    const store = createSqliteContainerStore(inner, rpc);
    expect(await migrateFromInnerIfEmpty(store, inner, rpc)).toBe(false);
  });
});
