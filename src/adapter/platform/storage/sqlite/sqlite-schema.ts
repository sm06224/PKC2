/**
 * sqlite schema v1 と行マッパ ── wasm-sqlite 設計 P2 の純粋部。
 *
 * 設計正本: `docs/development/storage-wasm-sqlite-design-2026-07.md` §3。
 * このファイルは **wasm を import しない**(worker / store / vitest が共有する
 * 純粋な語彙)。DDL・Container⇄行の相互変換・参照 diff → RowOp 生成だけを持つ。
 *
 * doc §3 の DDL からの精緻化 2 点(実装時判断 2026-07-27):
 *
 * 1. **全表に `ord` 列**(doc は entries/revisions のみ)── Container の
 *    entries / revisions / relations は**配列**であり、順序はデータの一部
 *    (entry_order の手動並べ替え、revision の履歴列、relation の表示順)。
 *    行単位 upsert で rowid が動いても順序が壊れないよう明示列で持つ。
 * 2. **全表に `extra` JSON 列** ── データモデルは「additive optional field を
 *    黙って落とさない」が規約(Entry.tags / color_tag / display_profile、
 *    Revision.bulk_id、Relation.metadata、Meta.saved_searches / entry_order /
 *    sandbox_policy、および**未来の additive 追加**)。固定列に無い残余
 *    フィールドを JSON で往復させ、schema bump なしで additive 互換を守る。
 *    hot な検索・索引対象だけを列に昇格する(doc §3 の列は据え置き)。
 */
import type { Container, ContainerMeta, Revision } from '../../../../core/model/container';
import type { Entry, ArchetypeId } from '../../../../core/model/record';
import type { Relation, RelationKind } from '../../../../core/model/relation';

export const SQLITE_SCHEMA_VERSION = 1;

/** DDL(idempotent)。worker が open 直後に毎回流す。 */
export const DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS containers (
     cid TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL, schema_version INTEGER NOT NULL, extra TEXT)`,
  `CREATE TABLE IF NOT EXISTS entries (
     cid TEXT NOT NULL, lid TEXT NOT NULL, title TEXT NOT NULL,
     archetype TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
     ord INTEGER NOT NULL, body TEXT NOT NULL, extra TEXT,
     PRIMARY KEY (cid, lid))`,
  `CREATE TABLE IF NOT EXISTS revisions (
     cid TEXT NOT NULL, id TEXT NOT NULL, entry_lid TEXT NOT NULL,
     created_at TEXT NOT NULL, prev_rid TEXT, content_hash TEXT,
     ord INTEGER NOT NULL, snapshot TEXT NOT NULL, extra TEXT,
     PRIMARY KEY (cid, id))`,
  `CREATE TABLE IF NOT EXISTS relations (
     cid TEXT NOT NULL, id TEXT NOT NULL, from_lid TEXT NOT NULL,
     to_lid TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL, ord INTEGER NOT NULL, extra TEXT,
     PRIMARY KEY (cid, id))`,
  // assets 表は P3(#1042)で使い始める。bytes は持たない(Blob storage 参照)。
  `CREATE TABLE IF NOT EXISTS assets (
     cid TEXT NOT NULL, key TEXT NOT NULL, mime TEXT, size INTEGER, hash TEXT,
     PRIMARY KEY (cid, key))`,
  // kv: グローバル行は cid = ''(default pointer / workspace record / active workspace)。
  `CREATE TABLE IF NOT EXISTS kv (
     cid TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL,
     PRIMARY KEY (cid, k))`,
  // ── 索引(2026-07-27 追加。常駐棚卸しの実測が根拠)──
  //
  // 🔴 **索引が無いと ORDER BY が wasm リニアメモリに TEMP B-TREE を作り、
  // それが二度と返らない**。WebAssembly.Memory は `grow` しかなく縮まないため、
  // 一度伸びた分は worker の寿命の間ずっと常駐する
  // (`PRAGMA shrink_memory` / `db.close()` / GC のいずれでも戻らないことを実測)。
  // 出荷 wasm は SQLITE_TEMP_STORE=2 でコンパイルされており、sorter は必ず
  // wasm 内に載る ── つまりブラウザ(SAHPool)でも同じ。
  //
  // 実測(同一 wasm、対照群は索引の有無だけ):
  //   3,000 行×4KB   SELECT 前 29.00MB → 後 41.81MB(+12.81MB)/ 索引あり **+0.00MB**
  //   5,000 行×20KB  150.13 → 259.50MB(+109.38MB)      / 索引あり **+0.00MB**
  // EXPLAIN QUERY PLAN でも、下記 4 本を足すと boot の 4 クエリから
  // `USE TEMP B-TREE FOR ORDER BY` が消えることを確認済み。
  //
  // ⚠ 既存 DB にも効く: DDL は open のたびに流れ、IF NOT EXISTS なので
  //    次回起動時に自動で張られる(移行コードは要らない)。
  //
  // 🔴 **索引を「広げる」ときは名前を変えて、旧名を DROP する**(2026-07-27 に
  //    自分の diff で踏みかけた)。`CREATE INDEX IF NOT EXISTS <同名>` は
  //    **既存の索引の定義を見ない** ── 旧定義のまま静かに素通りするので、
  //    この branch で既に DB を作った環境だけ狭い索引を持ち続け、
  //    「新規 DB では速いが既存 DB では遅い」という再現しない差になる。
  //    DROP + 別名なら DDL が毎回流れる性質だけで移行が完結する。
  `DROP INDEX IF EXISTS rev_by_entry`, // 旧: (cid, entry_lid) ── 下の rev_by_entry_order に置換
  `CREATE INDEX IF NOT EXISTS entry_by_ord ON entries (cid, ord)`,
  `CREATE INDEX IF NOT EXISTS rel_by_ord ON relations (cid, ord)`,
  `CREATE INDEX IF NOT EXISTS rev_by_order ON revisions (cid, created_at, ord)`,
  // revsFor(選択 entry の履歴)は WHERE entry_lid + ORDER BY created_at,ord
  // なので、entry_lid だけの索引では sort が残る。並び列まで含める。
  `CREATE INDEX IF NOT EXISTS rev_by_entry_order ON revisions (cid, entry_lid, created_at, ord)`,
  // グラフ探索用(2026-07-27 のグラフ PoC が根拠)。relations を辺として辿る
  // クエリ(backlinks / k-hop / 部分木)は、この 2 本が無いと毎段で全表走査になる。
  `CREATE INDEX IF NOT EXISTS rel_by_from ON relations (cid, from_lid)`,
  `CREATE INDEX IF NOT EXISTS rel_by_to ON relations (cid, to_lid)`,
];

// ── 行 shape(postMessage 越しに運ぶ JSON-serializable な形)──

export interface ContainerRow {
  cid: string;
  title: string;
  created_at: string;
  updated_at: string;
  schema_version: number;
  extra: string | null;
}

export interface EntryRow {
  lid: string;
  title: string;
  archetype: string;
  created_at: string;
  updated_at: string;
  ord: number;
  body: string;
  extra: string | null;
}

export interface RevisionRow {
  id: string;
  entry_lid: string;
  created_at: string;
  prev_rid: string | null;
  content_hash: string | null;
  ord: number;
  snapshot: string;
  extra: string | null;
}

export interface RelationRow {
  id: string;
  from_lid: string;
  to_lid: string;
  kind: string;
  created_at: string;
  updated_at: string;
  ord: number;
  extra: string | null;
}

/** Container の構造部まるごと(assets は含まない ── ハイブリッド設計 §2)。 */
export interface ContainerRows {
  container: ContainerRow;
  entries: EntryRow[];
  revisions: RevisionRow[];
  relations: RelationRow[];
}

/** 行単位の書込 op(saveDiff → worker の 1 transaction で適用)。 */
export type RowOp =
  | { t: 'meta'; row: ContainerRow }
  | { t: 'entry-upsert'; row: EntryRow }
  | { t: 'entry-ord'; lid: string; ord: number }
  | { t: 'entry-delete'; lid: string }
  | { t: 'rev-upsert'; row: RevisionRow }
  | { t: 'rev-ord'; id: string; ord: number }
  | { t: 'rev-delete'; id: string }
  | { t: 'rel-upsert'; row: RelationRow }
  | { t: 'rel-ord'; id: string; ord: number }
  | { t: 'rel-delete'; id: string };

// ── extra 詰め替えの共通則 ──
//
//   書き: 固定列に昇格したフィールドを除いた「残余」を JSON.stringify。
//         残余が空なら NULL(空文字列や '{}' を書かない ── 行の同一性を保つ)。
//   読み: extra を parse して土台にし、固定列を上書き。**列が NULL の optional
//         フィールドはキー自体を立てない**(absent → NULL → absent の往復。
//         `undefined` 値のキーを作ると Object.keys 比較系が「違う」と誤判する)。

function packRest(rest: Record<string, unknown>): string | null {
  for (const k in rest) {
    if (rest[k] !== undefined) return JSON.stringify(rest);
    // undefined 値のキーは JSON.stringify が落とすので「残余なし」扱いを続ける
  }
  return null;
}

function unpackExtra(extra: string | null): Record<string, unknown> {
  if (!extra) return {};
  try {
    const v: unknown = JSON.parse(extra);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ── mappers ──

export function metaToRow(meta: ContainerMeta): ContainerRow {
  const { container_id, title, created_at, updated_at, schema_version, ...rest } = meta;
  return {
    cid: container_id,
    title,
    created_at,
    updated_at,
    schema_version,
    extra: packRest(rest),
  };
}

export function rowToMeta(row: ContainerRow): ContainerMeta {
  return {
    ...unpackExtra(row.extra),
    container_id: row.cid,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
    schema_version: row.schema_version,
  } as ContainerMeta;
}

export function entryToRow(entry: Entry, ord: number): EntryRow {
  const { lid, title, body, archetype, created_at, updated_at, ...rest } = entry;
  return {
    lid,
    title,
    archetype,
    created_at,
    updated_at,
    ord,
    body,
    extra: packRest(rest),
  };
}

export function rowToEntry(row: EntryRow): Entry {
  return {
    ...unpackExtra(row.extra),
    lid: row.lid,
    title: row.title,
    body: row.body,
    archetype: row.archetype as ArchetypeId,
    created_at: row.created_at,
    updated_at: row.updated_at,
  } as Entry;
}

export function revisionToRow(rev: Revision, ord: number): RevisionRow {
  const { id, entry_lid, snapshot, created_at, prev_rid, content_hash, ...rest } = rev;
  return {
    id,
    entry_lid,
    created_at,
    prev_rid: prev_rid ?? null,
    content_hash: content_hash ?? null,
    ord,
    snapshot,
    extra: packRest(rest),
  };
}

export function rowToRevision(row: RevisionRow): Revision {
  const rev: Revision = {
    ...unpackExtra(row.extra),
    id: row.id,
    entry_lid: row.entry_lid,
    snapshot: row.snapshot,
    created_at: row.created_at,
  } as Revision;
  if (row.prev_rid !== null) rev.prev_rid = row.prev_rid;
  if (row.content_hash !== null) rev.content_hash = row.content_hash;
  return rev;
}

export function relationToRow(rel: Relation, ord: number): RelationRow {
  const { id, from, to, kind, created_at, updated_at, ...rest } = rel;
  return {
    id,
    from_lid: from,
    to_lid: to,
    kind,
    created_at,
    updated_at,
    ord,
    extra: packRest(rest),
  };
}

export function rowToRelation(row: RelationRow): Relation {
  return {
    ...unpackExtra(row.extra),
    id: row.id,
    from: row.from_lid,
    to: row.to_lid,
    kind: row.kind as RelationKind,
    created_at: row.created_at,
    updated_at: row.updated_at,
  } as Relation;
}

/** Container 全体 → 行の束(saveFull / 移行用)。assets は含まない。 */
export function containerToRows(container: Container): ContainerRows {
  return {
    container: metaToRow(container.meta),
    entries: container.entries.map(entryToRow),
    revisions: container.revisions.map(revisionToRow),
    relations: container.relations.map(relationToRow),
  };
}

/** 行の束 → Container。assets は空(caller が必要時に Blob storage から)。 */
export function rowsToContainer(rows: ContainerRows): Container {
  return {
    meta: rowToMeta(rows.container),
    entries: rows.entries.map(rowToEntry),
    revisions: rows.revisions.map(rowToRevision),
    relations: rows.relations.map(rowToRelation),
    assets: {},
  };
}

/**
 * 参照 diff → RowOp 列。**O(件数) の参照比較だけ**で、直列化は変更行のみ。
 * これが sqlite 移行の编集 churn 対策の本体(現行形式は 1 編集で
 * container 全体を JSON.stringify + structured clone していた)。
 *
 * 前提: reducer は不変更新(変更された要素だけ新オブジェクト)。この前提は
 * 既存 `saveDiff(container, previous)` と同一で、baseline の正確性は
 * caller(SqliteContainerStore が load / save 完了時点の参照を保持)が保証する。
 *
 * 返り値 `[]` = 書くものなし。`prev === next` の同一参照も自然に `[]` になる。
 */
export function diffContainerToOps(prev: Container, next: Container): RowOp[] {
  const ops: RowOp[] = [];
  if (prev.meta !== next.meta) ops.push({ t: 'meta', row: metaToRow(next.meta) });

  diffKeyed(
    prev.entries,
    next.entries,
    (e) => e.lid,
    (e, ord) => ops.push({ t: 'entry-upsert', row: entryToRow(e, ord) }),
    (lid, ord) => ops.push({ t: 'entry-ord', lid, ord }),
    (lid) => ops.push({ t: 'entry-delete', lid }),
  );
  diffKeyed(
    prev.revisions,
    next.revisions,
    (r) => r.id,
    (r, ord) => ops.push({ t: 'rev-upsert', row: revisionToRow(r, ord) }),
    (id, ord) => ops.push({ t: 'rev-ord', id, ord }),
    (id) => ops.push({ t: 'rev-delete', id }),
  );
  diffKeyed(
    prev.relations,
    next.relations,
    (r) => r.id,
    (r, ord) => ops.push({ t: 'rel-upsert', row: relationToRow(r, ord) }),
    (id, ord) => ops.push({ t: 'rel-ord', id, ord }),
    (id) => ops.push({ t: 'rel-delete', id }),
  );
  return ops;
}

function diffKeyed<T>(
  prev: readonly T[],
  next: readonly T[],
  keyOf: (item: T) => string,
  upsert: (item: T, ord: number) => void,
  reorder: (key: string, ord: number) => void,
  remove: (key: string) => void,
): void {
  if (prev === next) return;
  const prevByKey = new Map<string, { item: T; ord: number }>();
  for (let i = 0; i < prev.length; i++) {
    const item = prev[i] as T;
    prevByKey.set(keyOf(item), { item, ord: i });
  }
  const nextKeys = new Set<string>();
  for (let i = 0; i < next.length; i++) {
    const item = next[i] as T;
    const key = keyOf(item);
    nextKeys.add(key);
    const was = prevByKey.get(key);
    if (!was || was.item !== item) {
      upsert(item, i);
    } else if (was.ord !== i) {
      reorder(key, i);
    }
  }
  for (const key of prevByKey.keys()) {
    if (!nextKeys.has(key)) remove(key);
  }
}
