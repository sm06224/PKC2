/* eslint-disable */
/**
 * 行 memo の常駐メモリ実測(2026-07-26、user 報告「実行時メモリが爆発してる」)。
 *
 * ## 何を測るか
 *
 * `renderer.ts` の `entryRowMemo` / `treeRowMemo` は
 * `WeakMap<Entry, { li: HTMLElement, ... }>` で、**Entry が生きている限り
 * 行の DOM ツリーを保持する**。#1031 で「container 参照が変わったら memo を
 * 全部捨てる」を撤去したため、**一度でも描画された行の DOM が、画面から
 * 外れても解放されなくなった**のではないか ── を確認する。
 *
 * 手順:検索クエリを次々に変えて **毎回違う部分集合だけを描画**させ、
 * 各サイクル後に forced GC → `JSHeapUsedSize` を測る。
 *   - memo が working set に収まっていれば heap は横ばい
 *   - 描画済み行を溜め込んでいれば heap は**単調増加して戻らない**
 *
 * ⚠ 対照群について:本ハーネスは **同一ビルド内の時間変化**(サイクル間の
 * 単調増加)を見る。修正の効果を主張するときは、**同じハーネスで修正前後**を
 * 走らせて比較すること(走行をまたいだ絶対値は比較しない ──
 * `.claude/skills/perf-measurement/SKILL.md` 罠 ⑧)。
 *
 * 使い方: node tests/bench/row-memo-heap.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, rmSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';

const ROOT = process.cwd();
const FIXTURE = process.env.RMH_FIXTURE ?? 'bench-fixtures/c-5000.json';
const CYCLES = Number(process.env.RMH_CYCLES ?? 8);
const CID = 'rmhbench';
const ROW_SEL = '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveRepo() {
  const server = http.createServer((req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const f = join(ROOT, p);
      if (!f.startsWith(ROOT + sep) && f !== ROOT) { res.writeHead(403); res.end(); return; }
      if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, {
        'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(f).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((x) => server.close(x)),
  })));
}

const MB = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

if (!existsSync(join(ROOT, FIXTURE))) {
  console.log(`⛔ fixture が無い: ${FIXTURE}`);
  process.exit(1);
}
const raw = readFileSync(join(ROOT, FIXTURE), 'utf8');

const srv = await serveRepo();
const prof = '/tmp/pw-rmh';
rmSync(prof, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(prof, {
  executablePath: process.env.RMH_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  viewport: { width: 1400, height: 950 },
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.enable');

const heap = async () => {
  // forced GC を 2 回。1 回では detached DOM の回収が間に合わないことがある。
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(250);
  const m = await cdp.send('Performance.getMetrics');
  return m.metrics.find((x) => x.name === 'JSHeapUsedSize').value;
};

await page.goto(`${srv.origin}/dist/pkc2.html`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 180000 });

// fixture を IDB へ流し込んで再起動
await page.evaluate(async ({ raw: r, cid }) => {
  const c = JSON.parse(r); c.meta.container_id = cid;
  const db = await new Promise((res, rej) => {
    const rq = indexedDB.open('pkc2');
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
  await new Promise((res, rej) => {
    const t = db.transaction('containers', 'readwrite');
    const s = t.objectStore('containers');
    s.clear(); s.put(c, cid); s.put(cid, '__default__');
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
  db.close();
}, { raw, cid: CID });

await page.goto(`${srv.origin}/dist/pkc2.html`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 });
await page.waitForFunction(`document.querySelectorAll('${ROW_SEL}').length > 50`, null, { timeout: 180000 });
await page.waitForTimeout(1500);

const search = page.locator('[data-pkc-field="search"]').first();
const rows = async () => page.evaluate(`document.querySelectorAll('${ROW_SEL}').length`);

const base = await heap();
console.log(`■ fixture ${FIXTURE} / ${CYCLES} サイクル`);
console.log(`   baseline(boot 直後・全行描画): ${MB(base)} / 行 ${await rows()}`);
console.log('');

// 毎サイクル違う部分集合を描画させる(= memo に新しい行が積まれる)
const samples = [];
for (let i = 0; i < CYCLES; i++) {
  const q = ["Folder","Note","Text","Log","Todo","a","e","o"][i % 8] + (i > 7 ? String(i) : "");
  await search.fill(q);
  await page.waitForTimeout(400);
  const narrowed = await rows();
  await search.fill('');
  await page.waitForTimeout(400);
  const h = await heap();
  samples.push(h);
  const d = h - base;
  console.log(`   cycle ${String(i + 1).padStart(2)}  q="${q}"  絞込 ${String(narrowed).padStart(5)} 行  heap ${MB(h)}  (baseline 比 ${d >= 0 ? '+' : ''}${MB(d)})`);
}

await ctx.close();
await srv.close();

const last = samples[samples.length - 1];
const growth = last - base;
const perCycle = growth / CYCLES;
console.log('');
console.log(`■ 結果`);
console.log(`   baseline → 最終: ${MB(base)} → ${MB(last)}  (増分 ${MB(growth)} / 1 サイクルあたり ${MB(perCycle)})`);
const monotonic = samples.every((v, i) => i === 0 || v >= samples[i - 1] * 0.98);
console.log(`   単調増加(2% の揺れを許容): ${monotonic ? 'はい ⚠ 溜め込みの疑い' : 'いいえ(横ばい)'}`);
console.log('');
console.log('⚠ この数字は同一ビルド内の時間変化。修正の効果を言うなら同じハーネスで修正前後を測ること。');
