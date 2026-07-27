/* eslint-disable */
/**
 * グラフエンジン PoC(2026-07-27、user 要望「グラフデータベース系のエンジンも
 * PoC してレポートに含めてほしい」)。
 *
 * 論点: PKC2 は **既に sqlite を載せている**(P2)。relations 表もある。
 * ならば「グラフ DB を新たに足す」前に、**手持ちの sqlite でどこまで行けるか**を
 * 数字にするのが先である(プライム・ディレクティブ「機能を足さない」)。
 *
 * 3 腕で測る:
 *   **A(現行 JS)** relations 配列を全件メモリに置き、毎回 Map 索引を作って辿る
 *                  ── features/relation 系がやっていること
 *   **B(素朴な再帰 CTE)** 1 本の WITH RECURSIVE で解く
 *   **C(hop ごとの索引クエリ)** JS が BFS の制御をし、各段で index を使った
 *                  1 クエリだけ投げる ── **frontier しかメモリに載らない**
 *
 * 🔴 B は最初の実装で **答えを間違えた**(2-hop: JS 282 vs SQL 283)。
 *    再帰 CTE の `UNION` は **行(lid, depth)単位**で重複排除するため、
 *    同じノードが異なる深さで複数回残り、COUNT(*) が二重計上になる。
 *    さらに `ON (r.from_lid = x OR r.to_lid = x)` の **OR 結合は index が効かない**。
 *    この 2 点が「SQL は桁違いに遅い」という**誤った結論**を生みかけた。
 *    → B は「素朴に書くとこうなる」という対照として残し、C を本命として測る。
 *
 * ⚠ **bun:sqlite(ネイティブ)で測る**。実機はブラウザの wasm-sqlite で速度定数が
 *    違う ── 本 PoC の数字は「その問いが解けるか」「腕の間でどの向きか」を見るもの。
 *
 * 使い方: bun run tests/bench/graph-engine-poc.mjs [--entries=3000] [--rels=6000]
 */
import { Database } from 'bun:sqlite';

const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const N = Number(argOf('entries', '3000'));
const R = Number(argOf('rels', '6000'));
const REPEAT = Number(argOf('repeat', '5'));

// ── 決定的な合成グラフ(seed 固定 = 走行間で同じ形)──
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260727);
const lids = Array.from({ length: N }, (_, i) => `e${String(i).padStart(5, '0')}`);
const relations = [];
for (let i = 1; i < N; i++) { // ① folder 木(structural)= 現行 buildTree の対象
  const parent = Math.floor(rng() * Math.max(1, Math.floor(i / 3)));
  relations.push({ id: `rs${i}`, from: lids[parent], to: lids[i], kind: 'structural' });
}
while (relations.length < R) { // ② 意味リンク(semantic)= backlinks / connectedness
  const a = Math.floor(rng() * N), b = Math.floor(rng() * N);
  if (a !== b) relations.push({ id: `rm${relations.length}`, from: lids[a], to: lids[b], kind: 'semantic' });
}

const CID = 'poc';
const db = new Database(':memory:');
db.run(`CREATE TABLE relations (cid TEXT NOT NULL, id TEXT NOT NULL, from_lid TEXT NOT NULL,
        to_lid TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, ord INTEGER NOT NULL, extra TEXT, PRIMARY KEY (cid, id))`);
db.run(`CREATE TABLE entries (cid TEXT NOT NULL, lid TEXT NOT NULL, title TEXT NOT NULL,
        archetype TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        ord INTEGER NOT NULL, body TEXT NOT NULL, extra TEXT, PRIMARY KEY (cid, lid))`);
const insR = db.prepare(`INSERT INTO relations (cid,id,from_lid,to_lid,kind,created_at,updated_at,ord,extra) VALUES (?,?,?,?,?,'t','t',?,NULL)`);
const insE = db.prepare(`INSERT INTO entries (cid,lid,title,archetype,created_at,updated_at,ord,body,extra) VALUES (?,?,?,'text','t','t',?,'',NULL)`);
db.transaction(() => {
  lids.forEach((lid, i) => insE.run(CID, lid, lid, i));
  relations.forEach((r, i) => insR.run(CID, r.id, r.from, r.to, r.kind, i));
})();

const rssMB = () => +(process.memoryUsage().rss / 1048576).toFixed(1);
function bench(fn, repeat = REPEAT) {
  const t = [];
  let out;
  for (let i = 0; i < repeat; i++) { const t0 = performance.now(); out = fn(); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b);
  return { ms: t[Math.floor(t.length / 2)], out };
}

// ── A: 現行 JS(全 relations 常駐 + 毎回索引構築)──
function jsAdj() {
  const byFrom = new Map(), byTo = new Map();
  for (const r of relations) {
    (byFrom.get(r.from) ?? byFrom.set(r.from, []).get(r.from)).push(r);
    (byTo.get(r.to) ?? byTo.set(r.to, []).get(r.to)).push(r);
  }
  return { byFrom, byTo };
}
const jsDescendants = (root) => {
  const { byFrom } = jsAdj(); const seen = new Set([root]); let f = [root];
  while (f.length) { const n = []; for (const l of f) for (const r of byFrom.get(l) ?? []) if (r.kind === 'structural' && !seen.has(r.to)) { seen.add(r.to); n.push(r.to); } f = n; }
  return seen.size - 1;
};
const jsKHop = (root, k) => {
  const { byFrom, byTo } = jsAdj(); const seen = new Set([root]); let f = [root];
  for (let d = 0; d < k && f.length; d++) { const n = [];
    for (const l of f) { for (const r of byFrom.get(l) ?? []) if (!seen.has(r.to)) { seen.add(r.to); n.push(r.to); }
                         for (const r of byTo.get(l) ?? []) if (!seen.has(r.from)) { seen.add(r.from); n.push(r.from); } } f = n; }
  return seen.size - 1;
};
const jsShortest = (a, b, max = 12) => {
  const { byFrom, byTo } = jsAdj(); const seen = new Set([a]); let f = [a];
  for (let d = 0; d < max && f.length; d++) { const n = [];
    for (const l of f) { for (const r of byFrom.get(l) ?? []) if (!seen.has(r.to)) { if (r.to === b) return d + 1; seen.add(r.to); n.push(r.to); }
                         for (const r of byTo.get(l) ?? []) if (!seen.has(r.from)) { if (r.from === b) return d + 1; seen.add(r.from); n.push(r.from); } } f = n; }
  return -1;
};
const jsDegreeTop = (n) => {
  const deg = new Map();
  for (const r of relations) { deg.set(r.from, (deg.get(r.from) ?? 0) + 1); deg.set(r.to, (deg.get(r.to) ?? 0) + 1); }
  return [...deg.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
};

// ── B: 素朴な再帰 CTE(誤りやすい書き方の対照)──
const SQL_NAIVE_KHOP = `
  WITH RECURSIVE h(lid, depth) AS (
    SELECT ?, 0
    UNION
    SELECT CASE WHEN r.from_lid = h.lid THEN r.to_lid ELSE r.from_lid END, h.depth + 1
    FROM relations r JOIN h ON (r.from_lid = h.lid OR r.to_lid = h.lid)
    WHERE r.cid = ? AND h.depth < ?
  )
  SELECT COUNT(DISTINCT lid) - 1 AS n FROM h`;

// ── C: hop ごとの索引クエリ(本命)──
// 🔑 **無向辺を実体化した表**を持つ。再帰 CTE の OR 結合が index を使えない問題も、
//    JS 側の frontier 制御も、これ 1 枚で解ける。現行 schema に無いので追加が要る。
function buildEdgeTable() {
  db.run(`CREATE TABLE edge (cid TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, kind TEXT NOT NULL)`);
  db.run(`INSERT INTO edge SELECT cid, from_lid, to_lid, kind FROM relations`);
  db.run(`INSERT INTO edge SELECT cid, to_lid, from_lid, kind FROM relations`);
  db.run(`CREATE INDEX edge_a ON edge (cid, a)`);
  db.run(`CREATE INDEX rel_from ON relations (cid, from_lid)`);
  db.run(`CREATE INDEX rel_to ON relations (cid, to_lid)`);
}
function sqlNeighbors(frontier, kindFilter) {
  if (frontier.length === 0) return [];
  const ph = frontier.map(() => '?').join(',');
  const k = kindFilter ? ` AND kind = '${kindFilter}'` : '';
  return db.query(`SELECT DISTINCT b FROM edge WHERE cid = ? AND a IN (${ph})${k}`)
    .all(CID, ...frontier).map((r) => r.b);
}
function sqlChildren(frontier) {
  if (frontier.length === 0) return [];
  const ph = frontier.map(() => '?').join(',');
  return db.query(`SELECT DISTINCT to_lid FROM relations WHERE cid = ? AND kind = 'structural' AND from_lid IN (${ph})`)
    .all(CID, ...frontier).map((r) => r.to_lid);
}
const cDescendants = (root) => {
  const seen = new Set([root]); let f = [root];
  while (f.length) { const n = []; for (const l of sqlChildren(f)) if (!seen.has(l)) { seen.add(l); n.push(l); } f = n; }
  return seen.size - 1;
};
const cKHop = (root, k) => {
  const seen = new Set([root]); let f = [root];
  for (let d = 0; d < k && f.length; d++) { const n = []; for (const l of sqlNeighbors(f)) if (!seen.has(l)) { seen.add(l); n.push(l); } f = n; }
  return seen.size - 1;
};
const cShortest = (a, b, max = 12) => {
  const seen = new Set([a]); let f = [a];
  for (let d = 0; d < max && f.length; d++) { const n = [];
    for (const l of sqlNeighbors(f)) { if (l === b) return d + 1; if (!seen.has(l)) { seen.add(l); n.push(l); } } f = n; }
  return -1;
};
const cDegreeTop = (n) => db.query(`SELECT a AS lid, COUNT(*) AS deg FROM edge WHERE cid = ? GROUP BY a ORDER BY deg DESC, a ASC LIMIT ?`)
  .all(CID, n).map((r) => [r.lid, r.deg]);
const cBacklinks = (lid) => db.query(`SELECT COUNT(*) AS n FROM relations WHERE cid = ? AND to_lid = ?`).get(CID, lid).n;
const cOrphans = () => db.query(`SELECT COUNT(*) AS n FROM entries e WHERE e.cid = ?
  AND NOT EXISTS (SELECT 1 FROM edge x WHERE x.cid = e.cid AND x.a = e.lid)`).get(CID).n;

const root = lids[0], target = lids[N - 1];
const hub = jsDegreeTop(1)[0][0];

console.log(`■ グラフエンジン PoC ── 手持ちの sqlite でどこまで行けるか`);
console.log(`   規模: entries ${N} / relations ${relations.length}(structural ${N - 1} + semantic ${relations.length - N + 1})`);
console.log(`   A=現行 JS(全 relations 常駐) B=素朴な再帰 CTE C=hop ごとの索引クエリ`);
console.log(`   各 ${REPEAT} 回の中央値 / bun:sqlite(ネイティブ)。⚠ 実機は wasm-sqlite で速度定数が違う\n`);

// B は index 無しの現行 schema で測る(素朴実装の実力)
const bK2 = bench(() => db.query(SQL_NAIVE_KHOP).get(root, CID, 2).n, 3);
const bK3 = bench(() => db.query(SQL_NAIVE_KHOP).get(hub, CID, 3).n, 3);

const t0 = performance.now();
buildEdgeTable();
const edgeBuildMs = performance.now() - t0;
const edgeRows = db.query(`SELECT COUNT(*) AS n FROM edge`).get().n;

const rows = [];
function row(name, a, b, c) {
  const okB = b === null ? null : JSON.stringify(a.out) === JSON.stringify(b.out);
  const okC = JSON.stringify(a.out) === JSON.stringify(c.out);
  rows.push({ name, a, b, c, okB, okC });
  const f = (x) => (x === null ? '      —' : `${x.ms.toFixed(2)}`.padStart(8));
  console.log(`   ${name.padEnd(24)} A ${f(a)}ms  B ${f(b)}ms${b === null ? '  ' : okB ? ' ✅' : ' ⛔'}  C ${f(c)}ms${okC ? ' ✅' : ' ⛔'}`);
  if (b && !okB) console.log(`      ⛔ B の答えが違う: A=${JSON.stringify(a.out)} B=${JSON.stringify(b.out)}`);
  if (!okC) console.log(`      ⛔ C の答えが違う: A=${JSON.stringify(a.out)} C=${JSON.stringify(c.out)}`);
}

row('子孫数(structural 木)', bench(() => jsDescendants(root)), null, bench(() => cDescendants(root)));
row('2-hop 近傍', bench(() => jsKHop(root, 2)), bK2, bench(() => cKHop(root, 2)));
row('3-hop 近傍(hub 起点)', bench(() => jsKHop(hub, 3)), bK3, bench(() => cKHop(hub, 3)));
row('最短経路(端 → 端)', bench(() => jsShortest(root, target)), null, bench(() => cShortest(root, target)));
row('次数上位 10', bench(() => jsDegreeTop(10)), null, bench(() => cDegreeTop(10)));
row('backlinks 件数', bench(() => relations.filter((r) => r.to === hub).length), null, bench(() => cBacklinks(hub)));

console.log(`\n   無向辺表の構築: ${edgeBuildMs.toFixed(1)}ms(${edgeRows} 行)── 保存時に維持するなら 1 回きり`);
console.log(`   孤立 entry 数(現行 JS に実装なし): ${bench(() => cOrphans()).out} 件 / ${bench(() => cOrphans()).ms.toFixed(2)}ms`);
console.log(`   プロセス RSS: ${rssMB()} MB`);

console.log(`\n■ 読み方`);
console.log(`   1. **B(素朴な再帰 CTE)は答えを間違える**: UNION が (lid, depth) 行単位で重複排除するため`);
console.log(`      同一ノードが複数深さで残る。COUNT(DISTINCT lid) で辻褄は合うが、探索自体は`);
console.log(`      指数的に膨らむ。さらに ON (from=x OR to=x) の **OR 結合は index が効かない**`);
console.log(`   2. **C(hop ごとの索引クエリ)が実務解**: 無向辺表 + (cid,a) index があれば、`);
console.log(`      各段で frontier 分の 1 クエリ。**メモリに載るのは frontier だけ**`);
console.log(`   3. A は速いが **全 relations が常駐している前提**。§8-4 で削ろうとしているのがその常駐`);
console.log(`      ── A の速さは「既にメモリを払っている」ことの裏返しである`);
db.close();
