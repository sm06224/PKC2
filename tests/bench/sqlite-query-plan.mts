/**
 * sqlite の query plan 検証(B3、2026-07-27)。
 *
 *   npx tsx tests/bench/sqlite-query-plan.mts
 *
 * 目的は速度ではなく**メモリ**である。索引が無いと ORDER BY / GROUP BY が
 * wasm リニアメモリに TEMP B-TREE を作るが、出荷 wasm は
 * SQLITE_TEMP_STORE=2(常に memory)でコンパイルされており、しかも
 * `WebAssembly.Memory` は grow しかできない ── つまり **sorter が使った分は
 * worker を殺すまで返らない**(`PRAGMA shrink_memory` / `db.close()` / GC の
 * いずれでも戻らないことを実測済み)。
 *
 * 実測(同一 wasm・対照群は索引の有無だけ):
 *   3,000 行×4KB    29.00 → 41.81MB(+12.81MB)  / 索引あり **+0.00MB**
 *   5,000 行×20KB  150.13 → 259.50MB(+109.38MB) / 索引あり **+0.00MB**
 *
 * 2 ケースを見る:
 *   ① 新規 DB(DDL を一度流す)
 *   ② 旧 DB(狭い rev_by_entry を持つ)に DDL を流し直す = 既存環境の移行
 * ② を持つ理由は、`CREATE INDEX IF NOT EXISTS <同名>` が **既存索引の定義を
 * 見ずに素通りする**から。名前を据え置いて列だけ足すと、新規 DB でしか
 * 効かない差になる(この harness はその取りこぼしを検出するために在る)。
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { DDL } from '../../src/adapter/platform/storage/sqlite/sqlite-schema';

/** worker の実クエリ(sqlite-worker.ts と同じ形)。 */
const QUERIES = {
  'boot entries': `SELECT lid,title,archetype,created_at,updated_at,ord,body,extra FROM entries WHERE cid=? ORDER BY ord`,
  'boot relations': `SELECT id,from_lid,to_lid,kind,created_at,updated_at,ord,extra FROM relations WHERE cid=? ORDER BY ord`,
  revsAll: `SELECT id,entry_lid,created_at,prev_rid,content_hash,ord,snapshot,extra FROM revisions WHERE cid=? ORDER BY created_at, ord`,
  revsFor: `SELECT id,entry_lid,created_at,prev_rid,content_hash,ord,snapshot,extra FROM revisions WHERE cid=? AND entry_lid=? ORDER BY created_at, ord`,
  revCounts: `SELECT entry_lid, COUNT(*) c FROM revisions WHERE cid=? GROUP BY entry_lid`,
  backlinks: `SELECT id,from_lid FROM relations WHERE cid=? AND to_lid=?`,
  forwardlinks: `SELECT id,to_lid FROM relations WHERE cid=? AND from_lid=?`,
};

const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
console.log('sqlite', sqlite3.version.libVersion, '/ DDL statements:', DDL.length);

function checkPlans(db) {
  let bad = 0;
  for (const [name, sql] of Object.entries(QUERIES)) {
    const rows = [];
    db.exec({ sql: 'EXPLAIN QUERY PLAN ' + sql, rowMode: 'object', resultRows: rows });
    const flat = rows.map((r) => r.detail).join(' | ');
    // SCAN(全表走査)も NG: cid で絞れていない = 他 container の行まで舐めている。
    const ng = /TEMP B-TREE/i.test(flat) || /\bSCAN\b/i.test(flat);
    if (ng) bad++;
    console.log(`  ${ng ? '❌' : '✅'} ${name.padEnd(16)} ${flat}`);
  }
  return bad;
}

function indexNames(db) {
  const rows = [];
  db.exec({
    sql: `SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    rowMode: 'object',
    resultRows: rows,
  });
  return rows.map((r) => r.name);
}

console.log('\n== ① 新規 DB ==');
const fresh = new sqlite3.oo1.DB(':memory:');
for (const stmt of DDL) fresh.exec(stmt);
const badFresh = checkPlans(fresh);
console.log('  索引:', indexNames(fresh).join(', '));

console.log('\n== ② 旧 DB(狭い rev_by_entry あり)→ 起動時に DDL 再流し ==');
const old = new sqlite3.oo1.DB(':memory:');
for (const stmt of DDL) {
  if (stmt.startsWith('DROP') || stmt.includes('CREATE INDEX')) continue;
  old.exec(stmt);
}
old.exec(`CREATE INDEX IF NOT EXISTS rev_by_entry ON revisions (cid, entry_lid)`); // 旧定義
for (const stmt of DDL) old.exec(stmt);
const badOld = checkPlans(old);
const oldIdx = indexNames(old);
console.log('  索引:', oldIdx.join(', '));
if (oldIdx.includes('rev_by_entry')) {
  console.log('  ❌ 旧名 rev_by_entry が残っている(DROP が効いていない)');
}

const failed = badFresh + badOld + (oldIdx.includes('rev_by_entry') ? 1 : 0);
console.log(`\n判定: 新規=${badFresh === 0 ? 'OK' : badFresh + '本 NG'} / 移行=${badOld === 0 ? 'OK' : badOld + '本 NG'}`);
process.exit(failed === 0 ? 0 : 1);
