/* eslint-disable */
/**
 * **entry メタ配列そのものの常駐コスト**を N でスケールさせて測る(2026-07-28)。
 *
 * ## なぜ要るか
 *
 * user 提起「メモリにインデックスする分は常は少なくていい。実体化にかかる部分や
 * ソーティングのみに関わるインデックスを持てばいい」に対して、
 * **今それがいくらなのか**を答えるための計器。
 *
 * P4b(本文の LRU 追い出し)と S6(サイドバー窓化)で
 *   - 本文は上限つき常駐
 *   - DOM 行は可視ぶんだけ
 * になったが、**`AppState.container.entries` の配列そのもの**は
 * 依然として **全 N 件が heap に載っている**(Invariant 4「Container is source
 * of truth」)。1 件あたり lid/title/archetype/created_at/updated_at/ord…の
 * 文字列とオブジェクトヘッダが乗るので、N に比例して増える。
 *
 * 「窓の外の行の title を heap から落とす」設計が割に合うかは、
 * **この傾き(1 entry あたり何バイト)** が決める。傾きが分からないまま
 * 設計を選ぶことはできない。
 *
 * ## 測り方
 *
 * - 同一ビルド・同一手順で N だけ変える(対照群は「測りたい次元以外を全部同じに」)
 * - 本文は**空**で seed する ── 本文の常駐は P4b の管轄で、ここで測りたいのは
 *   **メタ配列の傾き**。本文を混ぜると何を測ったのか分からなくなる
 * - CDP `Performance.getMetrics` の JSHeapUsedSize を、**強制 GC の後**に読む
 *   (`HeapProfiler.collectGarbage`)。GC しないと世代の残骸で傾きが埋もれる
 * - 各 N で 3 回測って中央値。**単一計器なので「効果なし」の判定には使わない**
 *   (CLAUDE.md の規律:メモリの主張は最低 2 系統)。ここは**傾きの桁**を知るのが目的
 *
 * 使い方:
 *   node tests/bench/entry-meta-residency.mjs
 *   node tests/bench/entry-meta-residency.mjs --sizes=1000,10000,50000 --reps=3
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const ROOT = '/home/user/PKC2';
const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const SIZES = argOf('sizes', '1000,10000,50000').split(',').map(Number);
const REPS = Number(argOf('reps', '3'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, 'dist', p === '/' ? 'pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45877, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45877/pkc2.html';

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

async function measure(n) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(URL_);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });

  await page.evaluate(async (count) => {
    const T = '2026-07-01T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'metaresidency', title: 'meta', created_at: T, updated_at: T, schema_version: 1 },
      // 本文は空 ── ここで測るのは**メタ配列の傾き**であって本文常駐ではない。
      entries: Array.from({ length: count }, (_, i) => ({
        lid: `m${String(i).padStart(6, '0')}`,
        title: `Entry ${String(i).padStart(6, '0')} — 見出しの長さは実データに寄せる`,
        archetype: 'text', body: '', created_at: T, updated_at: T,
      })),
      relations: [], revisions: [], assets: {},
    };
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    await new Promise((res, rej) => {
      const t = db.transaction(['containers'], 'readwrite');
      const s = t.objectStore('containers'); s.clear();
      s.put(cont, 'metaresidency'); s.put('metaresidency', '__default__');
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
    db.close();
  }, n);

  // 2 回目起動を測る(初回は移行/索引構築の残渣が乗る)。
  await page.goto(URL_);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 });
  await page.waitForFunction(
    (c) => document.querySelector('[data-pkc-region="entry-list"]')?.getAttribute('data-pkc-row-count') === String(c),
    n, { timeout: 300000 },
  ).catch(() => {});
  await page.waitForTimeout(4000);

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(800);
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(400);

  const { metrics } = await cdp.send('Performance.getMetrics');
  const get = (k) => metrics.find((m) => m.name === k)?.value ?? 0;
  const out = {
    heapMB: get('JSHeapUsedSize') / 1024 / 1024,
    nodes: get('Nodes'),
    listeners: get('JSEventListeners'),
    domRows: await page.evaluate(
      () => document.querySelectorAll('[data-pkc-region="entry-list"] li.pkc-entry-item').length,
    ),
  };
  await ctx.close();
  return out;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

console.log('■ entry メタ配列の常駐コスト(本文は空・強制 GC 後・2 回目起動)');
console.log(`   N = ${SIZES.join(', ')} / 各 ${REPS} 回の中央値\n`);
console.log('   N        JS heap    DOM 行   nodes    listeners');

const rows = [];
for (const n of SIZES) {
  const reps = [];
  for (let i = 0; i < REPS; i += 1) reps.push(await measure(n));
  const r = {
    n,
    heapMB: median(reps.map((x) => x.heapMB)),
    nodes: median(reps.map((x) => x.nodes)),
    listeners: median(reps.map((x) => x.listeners)),
    domRows: median(reps.map((x) => x.domRows)),
  };
  rows.push(r);
  console.log(
    `   ${String(n).padStart(6)}  ${r.heapMB.toFixed(1).padStart(8)}MB ${String(r.domRows).padStart(7)} ${String(r.nodes).padStart(8)} ${String(r.listeners).padStart(10)}`,
  );
}

if (rows.length >= 2) {
  const a = rows[0], b = rows[rows.length - 1];
  const slope = ((b.heapMB - a.heapMB) * 1024 * 1024) / (b.n - a.n);
  console.log(`\n   傾き: 1 entry あたり **${slope.toFixed(0)} バイト**(N=${a.n} → ${b.n} の差分から)`);
  console.log(`   → 10 万 entry なら ${((slope * 100000) / 1024 / 1024).toFixed(0)}MB がメタ配列だけで常駐する`);
  console.log('\n   ⚠ 差し引きで出た値なので**向きと桁**のみ信頼する(倍率は書かない)。');
  console.log('   ⚠ JS heap 単独の値。メモリの結論を出すなら renderer-memory-breakdown.mjs と併用すること。');
}

await browser.close();
server.close();
