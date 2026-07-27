/* eslint-disable */
/**
 * §8-4: 空アプリで renderer が ~356MB(JS heap 18MB)の内訳を分解する計器。
 *
 * CDP tracing の memory-infra dump(detailed)から、renderer プロセスの
 * allocator 別サイズ(v8 の code/heap、blink_gc、partition_alloc(DOM)、
 * cc(compositor)、malloc、…)を取り出す。
 *
 * 何を決める計器か(user 提起 2026-07-27「まだ 1GB は大きく見える。
 * wasm で畳める部分を畳むことも選択肢にしたい」):
 *   - v8 code/parse 系が大きい → 単一 HTML 内遅延評価(重量 dep を文字列で
 *     持ち初回使用時に評価)が効く
 *   - partition_alloc / blink_gc(DOM)や cc が大きい → sidebar 仮想化が効く
 *
 * 使い方: node tests/bench/renderer-memory-breakdown.mjs [--fixture=<path>]
 * (fixture 省略時は空アプリ = 起動直後の初期 container)
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync, rmSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';

const ROOT = process.cwd();
const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const FIXTURE = argOf('fixture', '');
const FLAGQ = argOf('flag', '') === '1' ? '?pkc-flag=storage.sqlite_backend%3Dtrue' : '';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const srv = await new Promise((r) => {
  const server = http.createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const f = p === '/__fixture.json' && FIXTURE ? FIXTURE : join(ROOT, p);
    if (p !== '/__fixture.json' && !f.startsWith(ROOT + sep)) { res.writeHead(403); res.end(); return; }
    if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(f).pipe(res);
  });
  server.listen(45716, '127.0.0.1', () => r({ origin: `http://127.0.0.1:45716`, close: () => new Promise((x) => server.close(x)) }));
});

const prof = '/tmp/pw-membreak';
rmSync(prof, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(prof, {
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  viewport: { width: 1400, height: 950 },
});
const page = await ctx.newPage();
await page.goto(`${srv.origin}/dist/pkc2.html`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 180000 });
if (FIXTURE) {
  await page.evaluate(async ({ url }) => {
    const c = await (await fetch(url)).json();
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    await new Promise((res, rej) => { const t = db.transaction(['containers', 'assets'], 'readwrite'); t.objectStore('containers').clear(); t.objectStore('assets').clear(); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    const put = (store, pairs) => new Promise((res, rej) => { const t = db.transaction(store, 'readwrite'); const s = t.objectStore(store); for (const [k, v] of pairs) s.put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    await put('assets', Object.entries(c.assets).map(([k, v]) => [`membreak:${k}`, v]));
    await put('containers', [['membreak', { ...c, assets: {}, meta: { ...c.meta, container_id: 'membreak' } }], ['__default__', 'membreak']]);
    db.close();
  }, { url: `${srv.origin}/__fixture.json` });
  await page.goto(`${srv.origin}/dist/pkc2.html${FLAGQ}`);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 });
  // **2 回目 boot を計測対象にする**: 初回は索引構築(JSON 経路)/ 一括移行
  // (sqlite 経路)の残渣が乗り、定常の内訳にならない(2026-07-27 実測:
  // 移行直後 15s の dump は v8/workers 147MB・partition_alloc 277MB を示した)。
  await page.goto(`${srv.origin}/dist/pkc2.html${FLAGQ}`);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 });
  if (FLAGQ) console.log(`   storage: ${JSON.stringify(await page.evaluate('window.__pkc2StorageInfo'))}`);
}
// 定常化を待つ(GC / lazy 初期化が落ち着く窓 ── boot-rss 実測で settle は ~30s)
await page.waitForTimeout(35000);

// memory-infra の detailed dump を 1 回取る
const cdp = await ctx.newCDPSession(page);
const chunks = [];
cdp.on('Tracing.dataCollected', (e) => { if (e.value) chunks.push(...e.value); });
const done = new Promise((r) => cdp.on('Tracing.tracingComplete', r));
await cdp.send('Tracing.start', {
  traceConfig: {
    includedCategories: ['disabled-by-default-memory-infra'],
    memoryDumpConfig: { triggers: [{ mode: 'detailed', periodic_interval_ms: 1000 }] },
  },
  transferMode: 'ReportEvents',
});
await page.waitForTimeout(3500);
await cdp.send('Tracing.end');
await done;

// dump event から allocator sizes を集計(renderer = pid ごと、最大の v8 を持つ pid を採用)
const dumps = chunks.filter((e) => e.name === 'periodic_interval' && e.args && e.args.dumps && e.args.dumps.allocators);
if (dumps.length === 0) { console.log('⛔ memory dump が取れなかった'); await ctx.close(); await srv.close(); process.exit(1); }
const byPid = new Map();
for (const d of dumps) {
  const cur = byPid.get(d.pid);
  if (!cur || d.ts > cur.ts) byPid.set(d.pid, d);
}
const MB = (b) => (b / 1048576).toFixed(1);
function sizeOf(allocators, key) {
  const a = allocators[key];
  if (!a || !a.attrs || !a.attrs.effective_size) return 0;
  const v = a.attrs.effective_size;
  return parseInt(v.value, 16) || 0;
}
function topLevel(allocators) {
  // 'v8' や 'malloc' などの第1階層だけを合計対象にする(子は含まれる)
  const out = {};
  for (const key of Object.keys(allocators)) {
    if (key.includes('/')) continue;
    out[key] = sizeOf(allocators, key);
  }
  return out;
}
console.log(`■ §8-4 renderer メモリ内訳(memory-infra detailed dump / effective_size)`);
console.log(`   fixture: ${FIXTURE || '(空アプリ)'}`);
for (const [pid, d] of [...byPid.entries()].sort((a, b) => b[1].ts - a[1].ts)) {
  const alloc = d.args.dumps.allocators;
  const top = topLevel(alloc);
  const total = Object.values(top).reduce((a, b) => a + b, 0);
  if (total < 20 * 1048576) continue; // 小さいプロセスは省略
  console.log(`\n   pid ${pid} — 合計 ${MB(total)} MB`);
  for (const [k, v] of Object.entries(top).sort((a, b) => b[1] - a[1])) {
    if (v < 1048576) continue;
    console.log(`     ${k.padEnd(18)} ${MB(v).padStart(8)} MB`);
  }
  // v8 の内訳(code / heap)を深掘り
  for (const key of Object.keys(alloc)) {
    if (/^v8\/[^/]+$/.test(key) || /^v8\/isolate[^/]*\/[^/]+$/.test(key)) {
      const v = sizeOf(alloc, key);
      if (v > 2 * 1048576) console.log(`       ${key.padEnd(30)} ${MB(v).padStart(8)} MB`);
    }
  }
}
await ctx.close();
await srv.close();
