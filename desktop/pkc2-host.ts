/**
 * PKC2 デスクトップ host(spike)── Bun 単一実行ファイル版の実証。
 *
 * > 「chrome 系の天使の取り分が大きいのは変わらん。だから、Bun による webview を
 * >  使用した単一 exe 版も併せてリリースしたい」(user 指示 2026-07-27)
 *
 * 何を実証するか:
 *  1. **単一 HTML をそのまま埋め込める**(`dist/pkc2.html` を bun の asset
 *     埋め込みで exe に取り込み、実行時 fetch なしで配る)
 *  2. **wasm-sqlite で作った schema と RPC 境界がそのまま流用できる**
 *     ── `sqlite-schema.ts`(DDL / 行マッパ / 参照 diff)と `sqlite-rpc.ts` の
 *     op 語彙を**変更せず** `bun:sqlite`(ネイティブ)で実装する。
 *     ブラウザ版の worker(wasm + OPFS SAHPool)を、exe 版では
 *     この host プロセス(ネイティブ sqlite + 実ファイル)が担う
 *  3. wasm リニアメモリ経由が消える(ゼロコピー原則 ── user 指示 2026-07-27)
 *
 * ⚠ **spike であり製品ではない**。webview の起動は環境依存(下記 §webview)。
 *    製品化の可否・範囲は設計 doc の user 裁定事項。
 *
 * 使い方:
 *   bun run desktop/pkc2-host.ts            # 開発時(HTML はディスクから)
 *   bun build --compile desktop/pkc2-host.ts --outfile dist/pkc2-desktop
 *   ./dist/pkc2-desktop --print-stats       # 起動して自身の RSS を出す
 */
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import htmlAsset from '../dist/pkc2.html' with { type: 'file' };
import {
  DDL,
  type ContainerRow,
  type ContainerRows,
  type EntryRow,
  type RelationRow,
  type RevisionRow,
  type RowOp,
} from '../src/adapter/platform/storage/sqlite/sqlite-schema';
import type { AssetMetaRow, SqliteRequestBody } from '../src/adapter/platform/storage/sqlite/sqlite-rpc';

// ── ネイティブ storage(ブラウザ版 worker と同じ op 語彙)──
//
// ブラウザ版: main thread → postMessage → worker(wasm sqlite + OPFS)
// exe 版:     webview     → HTTP POST   → この host(bun:sqlite + 実ファイル)
// **op の型(SqliteRequestBody)は共有**。呼び出し側(SqliteContainerStore)は
// transport を差し替えるだけで、ロジックは 1 行も変わらない。

const DB_PATH = process.env.PKC2_DB ?? join(process.env.HOME ?? '.', '.pkc2', 'pkc2.db');
let db: Database | null = null;

function openDb(): Database {
  if (db) return db;
  const dir = DB_PATH.replace(/\/[^/]+$/, '');
  try {
    require('node:fs').mkdirSync(dir, { recursive: true });
  } catch {
    /* 既存 */
  }
  const d = new Database(DB_PATH, { create: true });
  // ブラウザ版 worker と同じ DDL・同じ PRAGMA 方針(常駐を抑える)。
  // 違いは WAL が使えること(OPFS SAHPool は WAL 非対応だった)。
  for (const sql of DDL) d.run(sql);
  d.run('PRAGMA journal_mode = WAL');
  d.run('PRAGMA synchronous = NORMAL');
  d.run('PRAGMA cache_size = -2000');
  db = d;
  return d;
}

const REV_ORDER = 'ORDER BY created_at, ord';

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

const SQL = {
  meta: `INSERT OR REPLACE INTO containers (cid,title,created_at,updated_at,schema_version,extra) VALUES (?,?,?,?,?,?)`,
  entry: `INSERT OR REPLACE INTO entries (cid,lid,title,archetype,created_at,updated_at,ord,body,extra) VALUES (?,?,?,?,?,?,?,?,?)`,
  rev: `INSERT OR REPLACE INTO revisions (cid,id,entry_lid,created_at,prev_rid,content_hash,ord,snapshot,extra) VALUES (?,?,?,?,?,?,?,?,?)`,
  rel: `INSERT OR REPLACE INTO relations (cid,id,from_lid,to_lid,kind,created_at,updated_at,ord,extra) VALUES (?,?,?,?,?,?,?,?,?)`,
};

function applyOps(d: Database, cid: string, ops: RowOp[], setDefault: boolean): void {
  d.transaction(() => {
    for (const op of ops) {
      switch (op.t) {
        case 'meta': d.run(SQL.meta, bindMeta(cid, op.row)); break;
        case 'entry-upsert': d.run(SQL.entry, bindEntry(cid, op.row)); break;
        case 'entry-ord': d.run(`UPDATE entries SET ord=? WHERE cid=? AND lid=?`, [op.ord, cid, op.lid]); break;
        case 'entry-delete': d.run(`DELETE FROM entries WHERE cid=? AND lid=?`, [cid, op.lid]); break;
        case 'rev-upsert': d.run(SQL.rev, bindRev(cid, op.row)); break;
        case 'rev-ord': d.run(`UPDATE revisions SET ord=? WHERE cid=? AND id=?`, [op.ord, cid, op.id]); break;
        case 'rev-delete': d.run(`DELETE FROM revisions WHERE cid=? AND id=?`, [cid, op.id]); break;
        case 'rel-upsert': d.run(SQL.rel, bindRel(cid, op.row)); break;
        case 'rel-ord': d.run(`UPDATE relations SET ord=? WHERE cid=? AND id=?`, [op.ord, cid, op.id]); break;
        case 'rel-delete': d.run(`DELETE FROM relations WHERE cid=? AND id=?`, [cid, op.id]); break;
      }
    }
    if (setDefault) d.run(`INSERT OR REPLACE INTO kv (cid,k,v) VALUES ('','__default__',?)`, [cid]);
  })();
}

/** ブラウザ版 worker の `handle()` と同じ契約(op 語彙を共有)。 */
function handle(req: SqliteRequestBody): unknown {
  const d = openDb();
  switch (req.op) {
    case 'init':
      return { persistent: true, vfs: 'native', version: d.query('SELECT sqlite_version() AS v').get() as unknown, ms: 0 };
    case 'close':
      db?.close();
      db = null;
      return undefined;
    case 'shrinkMemory':
      d.run('PRAGMA shrink_memory');
      return undefined;
    case 'saveFull': {
      const rows: ContainerRows = req.rows;
      d.transaction(() => {
        for (const t of ['entries', 'revisions', 'relations']) d.run(`DELETE FROM ${t} WHERE cid=?`, [req.cid]);
        d.run(SQL.meta, bindMeta(req.cid, rows.container));
        for (const e of rows.entries) d.run(SQL.entry, bindEntry(req.cid, e));
        for (const r of rows.revisions) d.run(SQL.rev, bindRev(req.cid, r));
        for (const r of rows.relations) d.run(SQL.rel, bindRel(req.cid, r));
        if (req.setDefault) d.run(`INSERT OR REPLACE INTO kv (cid,k,v) VALUES ('','__default__',?)`, [req.cid]);
      })();
      return undefined;
    }
    case 'applyOps':
      applyOps(d, req.cid, req.ops, req.setDefault);
      return undefined;
    case 'loadContainer': {
      const container = d.query(`SELECT cid,title,created_at,updated_at,schema_version,extra FROM containers WHERE cid=?`).get(req.cid) as ContainerRow | null;
      if (!container) return null;
      return {
        container,
        entries: d.query(`SELECT lid,title,archetype,created_at,updated_at,ord,body,extra FROM entries WHERE cid=? ORDER BY ord`).all(req.cid),
        revisions: req.skipRevisions ? [] : d.query(`SELECT id,entry_lid,created_at,prev_rid,content_hash,ord,snapshot,extra FROM revisions WHERE cid=? ${REV_ORDER}`).all(req.cid),
        relations: d.query(`SELECT id,from_lid,to_lid,kind,created_at,updated_at,ord,extra FROM relations WHERE cid=? ORDER BY ord`).all(req.cid),
      } satisfies ContainerRows;
    }
    case 'loadBodies': {
      const out: Record<string, string> = {};
      const rows = req.lids
        ? req.lids.map((lid) => d.query(`SELECT lid, body FROM entries WHERE cid=? AND lid=?`).get(req.cid, lid))
        : d.query(`SELECT lid, body FROM entries WHERE cid=?`).all(req.cid);
      for (const r of rows as Array<{ lid: string; body: string } | null>) if (r) out[r.lid] = r.body;
      return out;
    }
    case 'revCounts':
      return d.query(`SELECT entry_lid, COUNT(*) AS n FROM revisions WHERE cid=? GROUP BY entry_lid`).all(req.cid);
    case 'revsFor':
      return d.query(`SELECT id,entry_lid,created_at,prev_rid,content_hash,ord,snapshot,extra FROM revisions WHERE cid=? AND entry_lid=? ${REV_ORDER}`).all(req.cid, req.entryLid);
    case 'revsAll':
      return d.query(`SELECT id,entry_lid,created_at,prev_rid,content_hash,ord,snapshot,extra FROM revisions WHERE cid=? ${REV_ORDER}`).all(req.cid);
    case 'revsTrashLatest':
      return d.query(
        `SELECT r.id,r.entry_lid,r.created_at,r.prev_rid,r.content_hash,r.ord,r.snapshot,r.extra FROM revisions r
         WHERE r.cid=? AND r.entry_lid NOT IN (SELECT lid FROM entries WHERE cid=?)
           AND r.created_at = (SELECT MAX(r2.created_at) FROM revisions r2 WHERE r2.cid=r.cid AND r2.entry_lid=r.entry_lid)
         GROUP BY r.entry_lid ORDER BY r.created_at DESC`,
      ).all(req.cid, req.cid);
    case 'listContainers':
      return d.query(`SELECT cid AS id, title FROM containers`).all();
    case 'deleteContainer':
      d.transaction(() => {
        for (const t of ['entries', 'revisions', 'relations', 'assets', 'kv']) d.run(`DELETE FROM ${t} WHERE cid=?`, [req.cid]);
        d.run(`DELETE FROM containers WHERE cid=?`, [req.cid]);
        d.run(`DELETE FROM kv WHERE cid='' AND k='__default__' AND v=?`, [req.cid]);
      })();
      return undefined;
    case 'clearAll':
      d.transaction(() => {
        for (const t of ['entries', 'revisions', 'relations', 'assets', 'kv', 'containers']) d.run(`DELETE FROM ${t}`);
      })();
      return undefined;
    case 'getDefaultCid':
      return (d.query(`SELECT v FROM kv WHERE cid='' AND k='__default__'`).get() as { v: string } | null)?.v ?? null;
    case 'setDefaultCid':
      d.run(`INSERT OR REPLACE INTO kv (cid,k,v) VALUES ('','__default__',?)`, [req.cid]);
      return undefined;
    case 'kvGet':
      return (d.query(`SELECT v FROM kv WHERE cid='' AND k=?`).get(req.k) as { v: string } | null)?.v ?? null;
    case 'kvSet':
      d.run(`INSERT OR REPLACE INTO kv (cid,k,v) VALUES ('',?,?)`, [req.k, req.v]);
      return undefined;
    case 'kvDelete':
      d.run(`DELETE FROM kv WHERE cid='' AND k=?`, [req.k]);
      return undefined;
    case 'kvList':
      return d.query(`SELECT k, v FROM kv WHERE cid='' AND k >= ? AND k < ?`).all(req.prefix, req.prefix + '￿');
    case 'assetMetaGet':
      return d.query(`SELECT key, size, hash FROM assets WHERE cid=?`).all(req.cid);
    case 'assetMetaSet':
      d.transaction(() => {
        d.run(`DELETE FROM assets WHERE cid=?`, [req.cid]);
        for (const r of req.rows as AssetMetaRow[]) {
          d.run(`INSERT INTO assets (cid,key,mime,size,hash) VALUES (?,?,NULL,?,?)`, [req.cid, r.key, r.size, r.hash]);
        }
      })();
      return undefined;
    default:
      throw new Error(`unknown op`);
  }
}

// ── host(webview へ HTML と storage を供給する)──

const html = await Bun.file(htmlAsset).text();

/** 埋め込み HTML と storage を供給する host。**127.0.0.1 のみ**に bind する。 */
const HOST_VERSION = '1';

const server = Bun.serve({
  port: Number(process.env.PKC2_PORT ?? 0),
  hostname: '127.0.0.1',
  async fetch(req) {
    const url = new URL(req.url);
    const selfOrigin = `http://127.0.0.1:${server.port}`;

    /**
     * 🔴 **同一 origin からのみ storage を触らせる**。
     *
     * host は localhost で HTTP を話すので、**別の localhost ページ**(他の
     * 開発サーバ、悪意あるローカルページ)からも到達しうる。ブラウザは
     * cross-origin の fetch に必ず `Origin` を付けるので、
     * 「Origin が無い(same-origin ナビゲーション)か、自分と一致する」
     * だけを通す。これが無いと**他人のページが user の DB を読める**。
     */
    const origin = req.headers.get('origin');
    const sameOrigin = origin === null || origin === selfOrigin;

    // host の名乗り(page 側の `detectDesktopHost` が読む)。
    if (url.pathname === '/__pkc/host') {
      if (!sameOrigin) return new Response('forbidden', { status: 403 });
      return Response.json({ product: 'pkc2-desktop', version: HOST_VERSION, dbPath: DB_PATH });
    }

    if (url.pathname === '/__pkc/storage' && req.method === 'POST') {
      if (!sameOrigin) return new Response('forbidden', { status: 403 });
      try {
        const body = (await req.json()) as SqliteRequestBody;
        return Response.json({ ok: true, result: handle(body) ?? null });
      } catch (err) {
        return Response.json({ ok: false, error: String(err) }, { status: 500 });
      }
    }

    if (url.pathname === '/__stats') {
      const m = process.memoryUsage();
      return Response.json({ rssMB: +(m.rss / 1048576).toFixed(1), heapMB: +(m.heapUsed / 1048576).toFixed(1), dbPath: DB_PATH });
    }

    // 終了(harness / webview の window close から叩く)。
    if (url.pathname === '/__pkc/quit' && req.method === 'POST') {
      if (!sameOrigin) return new Response('forbidden', { status: 403 });
      queueMicrotask(() => shutdown(0));
      return Response.json({ ok: true });
    }

    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  },
});

/**
 * OS 既定のブラウザで開く(webview バインディングが無い環境の導線)。
 * 失敗しても host は動き続ける ── URL を手で開けばよい。
 */
function openInSystemBrowser(url: string): void {
  const cmd = process.platform === 'darwin'
    ? ['open', url]
    : process.platform === 'win32'
      ? ['cmd', '/c', 'start', '', url]
      : ['xdg-open', url];
  try {
    Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' });
    console.log(`[pkc2-desktop] 既定のブラウザで開きました: ${url}`);
  } catch {
    console.log(`[pkc2-desktop] ブラウザを自動で開けません ── 手動で開いてください: ${url}`);
  }
}

/**
 * 終了処理。**DB を明示的に close する**(user 指示「ライフサイクル後の
 * 速やかな破棄」)── ネイティブ sqlite は close で page cache ごと OS へ
 * 返す(実測 RSS 308.1 → 97.5MB)。wasm 版はここが worker terminate という
 * 重い手段でしか成立しなかった部分である。
 */
function shutdown(code: number): never {
  try {
    db?.close();
  } catch {
    /* 既に閉じている */
  }
  db = null;
  process.exit(code);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => shutdown(0));
}

const origin = `http://127.0.0.1:${server.port}`;
console.log(`[pkc2-desktop] serving ${origin}  (db: ${DB_PATH})`);
console.log(`[pkc2-desktop] embedded HTML: ${(html.length / 1048576).toFixed(2)} MB`);
console.log(`[pkc2-desktop] host RSS: ${(process.memoryUsage().rss / 1048576).toFixed(1)} MB`);

// §webview: OS の webview を開く。
// Linux=WebKitGTK / macOS=WKWebView / Windows=WebView2(Chromium)。
// ⚠ この spike は **バインディングが無い環境では URL を出して終わる**
//    (CI コンテナには WebKitGTK が無い ── 2026-07-27 実測)。
//    製品化時にどのバインディングを採るかは設計 doc の裁定事項。
if (process.argv.includes('--print-stats')) {
  // 計測モード: 数秒で自己終了(harness が RSS を読む)
  setTimeout(() => {
    console.log(JSON.stringify({ rssMB: +(process.memoryUsage().rss / 1048576).toFixed(1), port: server.port }));
    process.exit(0);
  }, 2000);
} else if (!process.argv.includes('--no-webview')) {
  try {
    // 動的 import: 未インストールでも host は動く(URL を手で開けばよい)
    const mod = (await import('webview-bun').catch(() => null)) as { Webview?: new (debug?: boolean) => { navigate: (u: string) => void; run: () => void; title: string } } | null;
    if (mod?.Webview) {
      const w = new mod.Webview();
      w.title = 'PKC2';
      w.navigate(origin);
      w.run();
      process.exit(0);
    }
    // webview が無い環境では **OS 既定のブラウザで開く**。
    // 「実行ファイルをダブルクリックしたら PKC2 が出る」を成立させるための
    // 最低限の導線であり、webview の代替ではない(engine は user のブラウザ)。
    openInSystemBrowser(origin);
  } catch (err) {
    console.log('[pkc2-desktop] webview 起動不可(URL を手動で開いてください):', String(err));
  }
}
