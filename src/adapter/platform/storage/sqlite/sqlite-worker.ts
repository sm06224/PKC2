/**
 * sqlite worker 常駐ホスト(P2)── 永続化 sqlite の実行体。
 *
 * なぜ worker か(設計 doc §8-1、2026-07-27 実機確認):
 *   - OPFS の `createSyncAccessHandle` は worker 専用。main thread での
 *     SAHPool install は "Missing required OPFS APIs" で失敗する(実測)
 *   - 副産物として、保存処理(直列化 + 書込)が main thread から完全に外れる
 *
 * 静的 bundle の作法(user 指示 2026-07-27「ビルドが静的であれば何も問題ない」):
 *   - wasm バイナリは `?inline` で **この worker chunk にだけ**焼き込む。
 *     main 側は glue も wasm も import しない(bundle 内に 1 部だけ)
 *   - worker 自体は `?worker&inline` で bundle.js に焼き込まれ、Blob URL で
 *     起動する ── 実行時 fetch ゼロ、単一 HTML 哲学と両立
 *
 * メモリ原則(user 指示 2026-07-27「ゼロコピー、生成とライフサイクル後の
 * 速やかな破棄を徹底」):
 *   - prepared statement は finally で必ず finalize
 *   - 行データは transaction 適用後に参照を持たない(worker 側に model を
 *     常駐させない ── DB ファイルが正本)
 *   - probe 系は DB / VFS を必ず閉じ、痕跡を残さない
 */
import sqlite3InitModule, { type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import wasmDataUrl from './sqlite3.wasm.bin?inline';
import {
  DDL,
  type ContainerRow,
  type ContainerRows,
  type EntryRow,
  type RelationRow,
  type RevisionRow,
  type RowOp,
} from './sqlite-schema';
import type {
  AssetMetaRow,
  SqliteInitResult,
  SqlitePersistenceProbeResult,
  SqliteProbeResult,
  SqliteRequest,
  SqliteResponse,
} from './sqlite-rpc';

/** worker グローバル(DOM lib でコンパイルするための最小 cast)。 */
const ctx = globalThis as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  crossOriginIsolated?: boolean;
};

// ── sqlite3 module(遅延 singleton)──

let sqlite3Promise: Promise<Sqlite3Static> | null = null;

/** data URL → bytes(base64 部分だけ decode。fetch は使わない)。 */
function wasmBytes(): Uint8Array {
  const comma = wasmDataUrl.indexOf(',');
  const b64 = wasmDataUrl.slice(comma + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getSqlite3(): Promise<Sqlite3Static> {
  if (!sqlite3Promise) {
    // 型注意: 公開型は `init(): Promise<Sqlite3Static>`(引数なし)だが、実装
    // (dist/index.mjs:405)は Emscripten Module init オブジェクトを受け取り、
    // `wasmBinary` があれば fetch せず instantiate に直行する。型が実装より
    // 狭いだけなので、ここだけ明示的に橋を架ける(main thread 版と同じ作法)。
    const init = sqlite3InitModule as unknown as (opts?: {
      wasmBinary?: ArrayBuffer;
      locateFile?: (f: string) => string;
      print?: (s: string) => void;
      printErr?: (s: string) => void;
    }) => Promise<Sqlite3Static>;
    sqlite3Promise = init({
      wasmBinary: wasmBytes().buffer as ArrayBuffer,
      // ⚠ wasmBinary があっても Emscripten は `findWasmBinary()` を評価し、
      // bundle 内では `new URL(..., import.meta.url)` が throw する(2026-07-27
      // 実測)。locateFile ダミーで URL 構築を回避(この path は読まれない)。
      locateFile: (f: string) => f,
      print: () => undefined,
      printErr: (msg: string) => console.warn('[PKC2] sqlite3(worker):', msg),
    });
  }
  return sqlite3Promise;
}

type OoDb = InstanceType<Sqlite3Static['oo1']['DB']>;
type SahPoolUtil = {
  OpfsSAHPoolDb: new (path: string) => OoDb;
  /**
   * 🔴 **DB ファイルごと消す**(実装 index.mjs:15164-15179 ──
   * `removeEntry(OPAQUE_DIR_NAME, {recursive:true})` + VFS root ごと削除。
   * 公式 doc も "intended primarily for testing" と明記)。
   * **probe(使い捨ての別 VFS 名)以外で呼んではならない。**
   * 2026-07-27、L1 の close 経路でこれを使って実際にデータを消し、
   * roundtrip Phase H が検出した。畳むときは `pauseVfs()` を使う。
   */
  removeVfs: () => Promise<boolean>;
  /**
   * SAH を解放して VFS を unregister する。**ファイルは残る**(index.mjs:15200-)。
   * 開いている file handle があると throw するので、**db.close() の後に呼ぶ**。
   */
  pauseVfs: () => unknown;
};

function installSahPool(sqlite3: Sqlite3Static, name: string): Promise<SahPoolUtil> {
  const s3 = sqlite3 as unknown as {
    installOpfsSAHPoolVfs: (o: { name: string }) => Promise<SahPoolUtil>;
  };
  return s3.installOpfsSAHPoolVfs({ name });
}

// ── 常駐 DB ──

let db: OoDb | null = null;
let poolUtil: SahPoolUtil | null = null;
let initInfo: SqliteInitResult | null = null;

/**
 * 常駐メモリの上限設定(2026-07-27、user 指示「ゼロコピー、生成とライフサイクル
 * 後の速やかな破棄を徹底」)。
 *
 * - `cache_size` は**負値で KiB 指定**。既定 -2000(2MB)だが、明示して
 *   「ページキャッシュがデータ量に比例して伸びない」ことを契約にする
 *   (75,000 行の一括移行のような書込でキャッシュが膨らんだまま居座るのを防ぐ)
 * - `mmap_size = 0`: SAHPool VFS は mmap を提供しない。明示 0 で
 *   wasm 側に無駄なマップ領域を作らせない
 * - `journal_mode = TRUNCATE` + `synchronous = NORMAL`: SAHPool は WAL 非対応。
 *   既定のままだが、明示して「別モードに落ちて挙動が変わる」事故を防ぐ
 */
const PRAGMAS: readonly string[] = [
  'PRAGMA cache_size = -2000',
  'PRAGMA mmap_size = 0',
  'PRAGMA synchronous = NORMAL',
];

async function handleInit(dbName: string, requirePersistent: boolean): Promise<SqliteInitResult> {
  if (initInfo && db) return initInfo; // idempotent(再 init は既存を返す)
  const t0 = performance.now();
  const sqlite3 = await getSqlite3();
  let vfs: SqliteInitResult['vfs'] = 'memory';
  let error: string | undefined;
  try {
    // ⚠ idle terminate → 再起動(§2 の破棄 lifecycle)で、直前の worker が
    // 握っていた SAH handle の解放が完了していないことがある。install は
    // 短い間隔で数回だけ retry する(それでも駄目なら :memory: へは**落とさず**
    // 例外を返し、client が IDB 継続を選ぶ ── 揮発 DB に書き始めない)。
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        poolUtil = await installSahPool(sqlite3, dbName);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise<void>((r) => setTimeout(r, 60 * (attempt + 1)));
      }
    }
    if (lastErr || !poolUtil) throw lastErr ?? new Error('SAHPool install failed');
    db = new poolUtil.OpfsSAHPoolDb('/pkc2.db');
    vfs = 'sahpool';
  } catch (err) {
    // SAHPool 不成立(OPFS 不可環境 / 多重 tab lock)。
    //
    // 🔴 **requirePersistent なら :memory: を開かずに throw する**
    // (2026-07-27、敵対的検証が検出)。揮発 DB を開いてしまうと、
    // main 側に残った baseline から**差分 op だけが空 DB へ飛び**、
    // 読みは null になる ── 初回 boot は caller が persistent=false を見て
    // IDB へ落ちるので安全だが、**idle terminate からの再起動にはその判定が
    // 無かった**。再起動では必ずこちらを通す。
    if (requirePersistent) {
      poolUtil = null;
      db = null;
      initInfo = null;
      throw new Error('sqlite: 永続 VFS を再取得できない', { cause: err });
    }
    // 初回 boot: 「開ける」ことは保証しつつ persistent=false を返す。
    // client 側がこれを不成立として扱い IDB へ fallback する。
    error = String(err);
    poolUtil = null;
    db = new sqlite3.oo1.DB(':memory:');
  }
  for (const sql of DDL) db.exec(sql);
  for (const sql of PRAGMAS) {
    try {
      db.exec(sql);
    } catch {
      /* PRAGMA 不対応は致命ではない(既定値で続行) */
    }
  }
  initInfo = {
    persistent: vfs === 'sahpool',
    vfs,
    version: sqlite3.version.libVersion,
    ms: performance.now() - t0,
    ...(error ? { error } : {}),
  };
  return initInfo;
}

/**
 * SQLite が保持している解放可能メモリを OS/allocator へ返す。
 * idle 時と、大量書込(移行 / 全量保存)の直後に呼ぶ。DB は開いたまま。
 */
function handleShrinkMemory(): void {
  if (!db) return;
  try {
    db.exec('PRAGMA shrink_memory');
  } catch {
    /* 不対応でも致命ではない */
  }
}

/**
 * **速やかな破棄**(user 指示 2026-07-27)── DB を閉じ SAH を解放して、
 * worker を terminate できる状態にする。client は idle N 秒でこれを呼んでから
 * terminate し、次の呼び出しで透過的に再 init する。
 *
 * 順序が意味を持つ: `shrink_memory` → `db.close()` → `pauseVfs()`。
 * - close より先に pause すると「開いている file handle がある」で throw する
 * - 🔴 **`removeVfs()` は使わない** ── **DB ファイルごと消える**
 *   (2026-07-27、ここで実際に消して roundtrip Phase H が検出した)。
 *   `pauseVfs()` は SAH を解放しつつ**ファイルを残す**、畳むための API
 * - SAH を明示解放しておくと、次の worker の install が確実に取れる
 *   (init 側の retry はあくまで保険)
 */
async function handleClose(): Promise<void> {
  handleShrinkMemory();
  try {
    db?.close();
  } catch {
    /* 既に閉じている */
  }
  db = null;
  initInfo = null;
  const pool = poolUtil;
  poolUtil = null;
  if (pool) {
    try {
      pool.pauseVfs();
    } catch (err) {
      // 解放できなくても terminate はする(worker 終了で OS/ブラウザが回収)。
      console.warn('[PKC2] sqlite worker: pauseVfs 失敗(terminate で回収):', err);
    }
  }
  await Promise.resolve();
}

function mustDb(): OoDb {
  if (!db) throw new Error('sqlite worker: init が先(DB 未 open)');
  return db;
}

// ── 書込(すべて 1 transaction)──

interface WriteStmts {
  meta: ReturnType<OoDb['prepare']>;
  entry: ReturnType<OoDb['prepare']>;
  entryOrd: ReturnType<OoDb['prepare']>;
  entryDel: ReturnType<OoDb['prepare']>;
  rev: ReturnType<OoDb['prepare']>;
  revOrd: ReturnType<OoDb['prepare']>;
  revDel: ReturnType<OoDb['prepare']>;
  rel: ReturnType<OoDb['prepare']>;
  relOrd: ReturnType<OoDb['prepare']>;
  relDel: ReturnType<OoDb['prepare']>;
}

function prepareWriteStmts(d: OoDb): WriteStmts {
  return {
    meta: d.prepare(
      `INSERT OR REPLACE INTO containers (cid,title,created_at,updated_at,schema_version,extra)
       VALUES (?,?,?,?,?,?)`,
    ),
    entry: d.prepare(
      `INSERT OR REPLACE INTO entries (cid,lid,title,archetype,created_at,updated_at,ord,body,extra)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ),
    entryOrd: d.prepare(`UPDATE entries SET ord=? WHERE cid=? AND lid=?`),
    entryDel: d.prepare(`DELETE FROM entries WHERE cid=? AND lid=?`),
    rev: d.prepare(
      `INSERT OR REPLACE INTO revisions (cid,id,entry_lid,created_at,prev_rid,content_hash,ord,snapshot,extra)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ),
    revOrd: d.prepare(`UPDATE revisions SET ord=? WHERE cid=? AND id=?`),
    revDel: d.prepare(`DELETE FROM revisions WHERE cid=? AND id=?`),
    rel: d.prepare(
      `INSERT OR REPLACE INTO relations (cid,id,from_lid,to_lid,kind,created_at,updated_at,ord,extra)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ),
    relOrd: d.prepare(`UPDATE relations SET ord=? WHERE cid=? AND id=?`),
    relDel: d.prepare(`DELETE FROM relations WHERE cid=? AND id=?`),
  };
}

function finalizeAll(stmts: WriteStmts): void {
  for (const s of Object.values(stmts)) {
    try {
      s.finalize();
    } catch {
      /* finalize 失敗は握る(元例外を優先) */
    }
  }
}

function run(stmt: ReturnType<OoDb['prepare']>, bind: unknown[]): void {
  stmt.bind(bind as never).stepReset();
}

function bindMeta(cid: string, r: ContainerRow): unknown[] {
  return [cid, r.title, r.created_at, r.updated_at, r.schema_version, r.extra];
}
function bindEntry(cid: string, r: EntryRow): unknown[] {
  return [cid, r.lid, r.title, r.archetype, r.created_at, r.updated_at, r.ord, r.body, r.extra];
}
function bindRev(cid: string, r: RevisionRow): unknown[] {
  return [cid, r.id, r.entry_lid, r.created_at, r.prev_rid, r.content_hash, r.ord, r.snapshot, r.extra];
}
function bindRel(cid: string, r: RelationRow): unknown[] {
  return [cid, r.id, r.from_lid, r.to_lid, r.kind, r.created_at, r.updated_at, r.ord, r.extra];
}

function setDefaultCidTx(d: OoDb, cid: string): void {
  d.exec({
    sql: `INSERT OR REPLACE INTO kv (cid,k,v) VALUES ('','__default__',?)`,
    bind: [cid],
  });
}

function inTransaction(d: OoDb, body: () => void): void {
  d.exec('BEGIN IMMEDIATE');
  try {
    body();
    d.exec('COMMIT');
  } catch (err) {
    try {
      d.exec('ROLLBACK');
    } catch {
      /* rollback 失敗は元例外を優先 */
    }
    throw err;
  }
}

function handleSaveFull(cid: string, rows: ContainerRows, setDefault: boolean): void {
  const d = mustDb();
  const stmts = prepareWriteStmts(d);
  try {
    inTransaction(d, () => {
      d.exec({ sql: `DELETE FROM entries WHERE cid=?`, bind: [cid] });
      d.exec({ sql: `DELETE FROM revisions WHERE cid=?`, bind: [cid] });
      d.exec({ sql: `DELETE FROM relations WHERE cid=?`, bind: [cid] });
      run(stmts.meta, bindMeta(cid, rows.container));
      for (const e of rows.entries) run(stmts.entry, bindEntry(cid, e));
      for (const r of rows.revisions) run(stmts.rev, bindRev(cid, r));
      for (const r of rows.relations) run(stmts.rel, bindRel(cid, r));
      if (setDefault) setDefaultCidTx(d, cid);
    });
  } finally {
    finalizeAll(stmts);
  }
}

function handleApplyOps(cid: string, ops: RowOp[], setDefault: boolean): void {
  const d = mustDb();
  const stmts = prepareWriteStmts(d);
  try {
    inTransaction(d, () => {
      for (const op of ops) {
        switch (op.t) {
          case 'meta':
            run(stmts.meta, bindMeta(cid, op.row));
            break;
          case 'entry-upsert':
            run(stmts.entry, bindEntry(cid, op.row));
            break;
          case 'entry-ord':
            run(stmts.entryOrd, [op.ord, cid, op.lid]);
            break;
          case 'entry-delete':
            run(stmts.entryDel, [cid, op.lid]);
            break;
          case 'rev-upsert':
            run(stmts.rev, bindRev(cid, op.row));
            break;
          case 'rev-ord':
            run(stmts.revOrd, [op.ord, cid, op.id]);
            break;
          case 'rev-delete':
            run(stmts.revDel, [cid, op.id]);
            break;
          case 'rel-upsert':
            run(stmts.rel, bindRel(cid, op.row));
            break;
          case 'rel-ord':
            run(stmts.relOrd, [op.ord, cid, op.id]);
            break;
          case 'rel-delete':
            run(stmts.relDel, [cid, op.id]);
            break;
        }
      }
      if (setDefault) setDefaultCidTx(d, cid);
    });
  } finally {
    finalizeAll(stmts);
  }
}

// ── 読出 ──

function selectRows<T>(d: OoDb, sql: string, bind: unknown[]): T[] {
  const rows: T[] = [];
  d.exec({ sql, bind: bind as never, rowMode: 'object', resultRows: rows as never });
  return rows;
}

// P4a: revisions の並びは created_at を第一鍵にする。要求時読みの世界では
// 常駐配列への追記 ord が保存済み行の ord と衝突しうる(部分常駐の配列 index を
// そのまま ord にするため)。消費者は元々 created_at で解釈しており
// (getEntryRevisions は created_at sort)、ord は同時刻の tiebreak に落とす。
const REV_ORDER = 'ORDER BY created_at, ord';

function handleLoadContainer(cid: string, skipRevisions: boolean): ContainerRows | null {
  const d = mustDb();
  const containers = selectRows<ContainerRow>(
    d,
    `SELECT cid,title,created_at,updated_at,schema_version,extra FROM containers WHERE cid=?`,
    [cid],
  );
  const container = containers[0];
  if (!container) return null;
  return {
    container,
    entries: selectRows<EntryRow>(
      d,
      `SELECT lid,title,archetype,created_at,updated_at,ord,body,extra
       FROM entries WHERE cid=? ORDER BY ord`,
      [cid],
    ),
    // P4a: boot(deferred)は revisions を運ばない ── §7-c で 2 回目 boot
    // +1.9s の主因だった 75k 行の postMessage 転送がここで消える。
    revisions: skipRevisions
      ? []
      : selectRows<RevisionRow>(
          d,
          `SELECT id,entry_lid,created_at,prev_rid,content_hash,ord,snapshot,extra
           FROM revisions WHERE cid=? ${REV_ORDER}`,
          [cid],
        ),
    relations: selectRows<RelationRow>(
      d,
      `SELECT id,from_lid,to_lid,kind,created_at,updated_at,ord,extra
       FROM relations WHERE cid=? ORDER BY ord`,
      [cid],
    ),
  };
}

/** P4a: entry_lid → revision 件数(1 クエリ。行本体は運ばない)。 */
function handleRevCounts(cid: string): Array<{ entry_lid: string; n: number }> {
  return selectRows<{ entry_lid: string; n: number }>(
    mustDb(),
    `SELECT entry_lid, COUNT(*) AS n FROM revisions WHERE cid=? GROUP BY entry_lid`,
    [cid],
  );
}

function handleRevsFor(cid: string, entryLid: string): RevisionRow[] {
  return selectRows<RevisionRow>(
    mustDb(),
    `SELECT id,entry_lid,created_at,prev_rid,content_hash,ord,snapshot,extra
     FROM revisions WHERE cid=? AND entry_lid=? ${REV_ORDER}`,
    [cid, entryLid],
  );
}

function handleRevsAll(cid: string): RevisionRow[] {
  return selectRows<RevisionRow>(
    mustDb(),
    `SELECT id,entry_lid,created_at,prev_rid,content_hash,ord,snapshot,extra
     FROM revisions WHERE cid=? ${REV_ORDER}`,
    [cid],
  );
}

/**
 * P4a: ゴミ箱 subset ── active でない entry_lid ごとの最新 revision。
 * 同時刻の tie は JS 側で先勝ち(getRestoreCandidates の `>` 比較 =
 * 先に見たものが勝つ、と同じ向き)にするため created_at DESC で返す。
 */
function handleRevsTrashLatest(cid: string): RevisionRow[] {
  const rows = selectRows<RevisionRow>(
    mustDb(),
    `SELECT r.id,r.entry_lid,r.created_at,r.prev_rid,r.content_hash,r.ord,r.snapshot,r.extra
     FROM revisions r
     WHERE r.cid=? AND r.entry_lid NOT IN (SELECT lid FROM entries WHERE cid=?)
       AND r.created_at = (
         SELECT MAX(r2.created_at) FROM revisions r2
         WHERE r2.cid=r.cid AND r2.entry_lid=r.entry_lid)
     ORDER BY r.created_at DESC, r.ord`,
    [cid, cid],
  );
  const seen = new Set<string>();
  const out: RevisionRow[] = [];
  for (const row of rows) {
    if (seen.has(row.entry_lid)) continue;
    seen.add(row.entry_lid);
    out.push(row);
  }
  return out;
}

function handleLoadBodies(cid: string, lids?: string[]): Record<string, string> {
  const d = mustDb();
  const out: Record<string, string> = {};
  if (lids) {
    const stmt = d.prepare(`SELECT body FROM entries WHERE cid=? AND lid=?`);
    try {
      for (const lid of lids) {
        stmt.bind([cid, lid] as never);
        if (stmt.step()) out[lid] = String(stmt.get(0) ?? '');
        stmt.reset();
      }
    } finally {
      stmt.finalize();
    }
  } else {
    for (const row of selectRows<{ lid: string; body: string }>(
      d,
      `SELECT lid, body FROM entries WHERE cid=?`,
      [cid],
    )) {
      out[row.lid] = row.body;
    }
  }
  return out;
}

function handleDeleteContainer(cid: string): void {
  const d = mustDb();
  inTransaction(d, () => {
    d.exec({ sql: `DELETE FROM entries WHERE cid=?`, bind: [cid] });
    d.exec({ sql: `DELETE FROM revisions WHERE cid=?`, bind: [cid] });
    d.exec({ sql: `DELETE FROM relations WHERE cid=?`, bind: [cid] });
    d.exec({ sql: `DELETE FROM assets WHERE cid=?`, bind: [cid] });
    d.exec({ sql: `DELETE FROM kv WHERE cid=?`, bind: [cid] });
    d.exec({ sql: `DELETE FROM containers WHERE cid=?`, bind: [cid] });
    d.exec({ sql: `DELETE FROM kv WHERE cid='' AND k='__default__' AND v=?`, bind: [cid] });
  });
}

function handleClearAll(): void {
  const d = mustDb();
  inTransaction(d, () => {
    for (const table of ['entries', 'revisions', 'relations', 'assets', 'kv', 'containers']) {
      d.exec(`DELETE FROM ${table}`);
    }
  });
}

/** P3: asset meta 索引の全置換(cid 単位・1 transaction)。数百行の軽量書込。 */
function handleAssetMetaSet(cid: string, rows: AssetMetaRow[]): void {
  const d = mustDb();
  const stmt = d.prepare(`INSERT INTO assets (cid,key,mime,size,hash) VALUES (?,?,NULL,?,?)`);
  try {
    inTransaction(d, () => {
      d.exec({ sql: `DELETE FROM assets WHERE cid=?`, bind: [cid] });
      for (const r of rows) run(stmt, [cid, r.key, r.size, r.hash]);
    });
  } finally {
    stmt.finalize();
  }
}

function kvGet(k: string): string | null {
  const rows = selectRows<{ v: string }>(mustDb(), `SELECT v FROM kv WHERE cid='' AND k=?`, [k]);
  return rows[0]?.v ?? null;
}

// ── probe(spike 実証用。実 DB に触らない)──

async function handleProbe(): Promise<SqliteProbeResult> {
  const t0 = performance.now();
  try {
    const sqlite3 = await getSqlite3();
    const mem = new sqlite3.oo1.DB(':memory:');
    try {
      mem.exec('CREATE TABLE probe (k TEXT PRIMARY KEY, v TEXT)');
      mem.exec({ sql: 'INSERT INTO probe (k, v) VALUES (?, ?)', bind: ['hello', 'sqlite'] });
      const rows: unknown[] = [];
      mem.exec({
        sql: 'SELECT v FROM probe WHERE k = ?',
        bind: ['hello'],
        rowMode: 'array',
        resultRows: rows as never,
      });
      const first = rows[0] as string[] | undefined;
      return {
        ok: Array.isArray(first) && first[0] === 'sqlite',
        version: sqlite3.version.libVersion,
        ms: performance.now() - t0,
        context: 'worker',
      };
    } finally {
      mem.close(); // 速やかな破棄
    }
  } catch (err) {
    return { ok: false, version: '', ms: performance.now() - t0, context: 'worker', error: String(err) };
  }
}

async function handleProbePersistence(): Promise<SqlitePersistenceProbeResult> {
  const sqlite3 = await getSqlite3();
  const out: SqlitePersistenceProbeResult = {
    coi: ctx.crossOriginIsolated === true,
    opfsVfsRegistered: !!sqlite3.capi.sqlite3_vfs_find('opfs'),
    sahpool: { ok: false, ms: 0 },
    context: 'worker',
  };
  const t0 = performance.now();
  try {
    const pool = await installSahPool(sqlite3, 'pkc2-p2-probe');
    try {
      const probeDb = new pool.OpfsSAHPoolDb('/probe.db');
      try {
        probeDb.exec('CREATE TABLE IF NOT EXISTS p (k TEXT PRIMARY KEY, v TEXT)');
        probeDb.exec({ sql: 'INSERT OR REPLACE INTO p (k, v) VALUES (?, ?)', bind: ['k', 'persist'] });
        const rows: unknown[] = [];
        probeDb.exec({
          sql: 'SELECT v FROM p WHERE k = ?',
          bind: ['k'],
          rowMode: 'array',
          resultRows: rows as never,
        });
        const first = rows[0] as string[] | undefined;
        out.sahpool = {
          ok: true,
          roundTrip: Array.isArray(first) && first[0] === 'persist',
          ms: performance.now() - t0,
        };
      } finally {
        probeDb.close(); // 速やかな破棄
      }
    } finally {
      await pool.removeVfs().catch(() => undefined); // probe は痕跡を残さない
    }
  } catch (err) {
    out.sahpool = { ok: false, ms: performance.now() - t0, error: String(err) };
  }
  return out;
}

// ── dispatcher ──

async function handle(req: SqliteRequest): Promise<unknown> {
  switch (req.op) {
    case 'init':
      return handleInit(req.dbName, req.requirePersistent === true);
    case 'close':
      await handleClose();
      return undefined;
    case 'shrinkMemory':
      handleShrinkMemory();
      return undefined;
    case 'probe':
      return handleProbe();
    case 'probePersistence':
      return handleProbePersistence();
    case 'saveFull':
      handleSaveFull(req.cid, req.rows, req.setDefault);
      return undefined;
    case 'applyOps':
      handleApplyOps(req.cid, req.ops, req.setDefault);
      return undefined;
    case 'loadContainer':
      return handleLoadContainer(req.cid, req.skipRevisions === true);
    case 'loadBodies':
      return handleLoadBodies(req.cid, req.lids);
    case 'revCounts':
      return handleRevCounts(req.cid);
    case 'revsFor':
      return handleRevsFor(req.cid, req.entryLid);
    case 'revsAll':
      return handleRevsAll(req.cid);
    case 'revsTrashLatest':
      return handleRevsTrashLatest(req.cid);
    case 'listContainers':
      return selectRows<{ id: string; title: string }>(
        mustDb(),
        `SELECT cid AS id, title FROM containers`,
        [],
      );
    case 'deleteContainer':
      handleDeleteContainer(req.cid);
      return undefined;
    case 'clearAll':
      handleClearAll();
      return undefined;
    case 'getDefaultCid':
      return kvGet('__default__');
    case 'setDefaultCid':
      setDefaultCidTx(mustDb(), req.cid);
      return undefined;
    case 'kvGet':
      return kvGet(req.k);
    case 'kvSet':
      mustDb().exec({ sql: `INSERT OR REPLACE INTO kv (cid,k,v) VALUES ('',?,?)`, bind: [req.k, req.v] });
      return undefined;
    case 'kvDelete':
      mustDb().exec({ sql: `DELETE FROM kv WHERE cid='' AND k=?`, bind: [req.k] });
      return undefined;
    case 'assetMetaGet':
      return selectRows<AssetMetaRow>(
        mustDb(),
        `SELECT key, size, hash FROM assets WHERE cid=?`,
        [req.cid],
      );
    case 'assetMetaSet':
      handleAssetMetaSet(req.cid, req.rows);
      return undefined;
    case 'kvList': {
      // prefix range scan(LIKE の escape 問題を避ける)。'￿' 番兵は
      // key が BMP 内の実用文字列(workspace: / __ 系)である前提で十分。
      return selectRows<{ k: string; v: string }>(
        mustDb(),
        `SELECT k, v FROM kv WHERE cid='' AND k >= ? AND k < ?`,
        [req.prefix, req.prefix + '￿'],
      );
    }
  }
}

ctx.onmessage = (ev: { data: unknown }) => {
  const req = ev.data as SqliteRequest;
  void (async () => {
    let res: SqliteResponse;
    try {
      res = { id: req.id, ok: true, result: await handle(req) };
    } catch (err) {
      res = { id: req.id, ok: false, error: String(err) };
    }
    ctx.postMessage(res);
  })();
};
