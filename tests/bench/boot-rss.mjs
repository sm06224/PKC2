/* eslint-disable */
/**
 * 起動後のプロセス RSS(タスクマネージャ相当)を時系列で測る計器。
 * user 報告「初回起動後に 1.3GB 以上 / OOM」(2026-07-27)の調査で作成。
 *
 * JS heap ではなく chromium プロセスツリー全体の RSS を /proc から読む。
 * 強制 GC はしない(user の環境にも無い)。IDB 読みの計器つき
 * (assets bucket の get/getAll を件数・バイトで数える)。
 *
 * ⚠ ポートは固定(45711)。IndexedDB は origin 単位なので、ランダムポートに
 *   すると走行のたびに空の IDB になり「毎回が初回起動」になる ── 実際に
 *   このミスで「索引の永続化が効いていない」と誤診した(2026-07-27)。
 *
 * 使い方:
 *   node tests/bench/boot-rss.mjs --fixture=<path> [--seconds=150]
 *   node tests/bench/boot-rss.mjs --fixture=<path> --second=1   # 2 回目起動(seed なし)
 *   --dist=<dir>  … dist を別ディレクトリから配信(main 対照ビルドの A/B 用)
 *   --flag=1      … `?pkc-flag=storage.sqlite_backend=true` を付けて boot(P2 dev 腕)
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';

const ROOT = '/home/user/PKC2';
const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const FIXTURE = argOf('fixture', '');
const SECONDS = Number(argOf('seconds', '150'));
const LABEL = argOf('label', '');
const SECOND = argOf('second', '') === '1'; // 既存 profile で 2 回目起動を測る
const DIST_DIR = argOf('dist', join(ROOT, 'dist')); // A/B: 対照ビルドの dist を配信
const SQLITE_FLAG = argOf('flag', '') === '1';
const PAGE_URL_SUFFIX = SQLITE_FLAG ? '?pkc-flag=storage.sqlite_backend%3Dtrue' : '';
const CID = 'rssbench';
const ROW_SEL = '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
};
function serve(fixturePath) {
  const server = http.createServer((req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      // /dist/* は DIST_DIR から(A/B で対照ビルドを差し込む)、それ以外は ROOT。
      const f = p === '/__fixture.json' ? fixturePath
        : p.startsWith('/dist/') || p.startsWith(`${sep}dist${sep}`) ? join(DIST_DIR, p.slice(5))
        : join(ROOT, p);
      if (p !== '/__fixture.json' && !f.startsWith(ROOT + sep) && !f.startsWith(DIST_DIR + sep)) { res.writeHead(403); res.end(); return; }
      if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(f).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((r) => server.listen(45711, '127.0.0.1', () => r({
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((x) => server.close(x)),
  })));
}

/** chromium ツリーの RSS を種別ごとに合算(KB)。 */
function treeRss(rootPid) {
  const kids = new Map(); // ppid → [pid]
  const info = new Map(); // pid → {rssKb, type}
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = readFileSync(`/proc/${d}/stat`, 'utf8');
      const m = stat.match(/^\d+ \(.*\) \S (\d+)/s);
      if (!m) continue;
      const ppid = Number(m[1]);
      const status = readFileSync(`/proc/${d}/status`, 'utf8');
      const rss = Number((status.match(/VmRSS:\s+(\d+) kB/) || [])[1] || 0);
      const cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8');
      let type = 'other';
      if (cmd.includes('--type=renderer')) type = 'renderer';
      else if (cmd.includes('--type=utility')) type = cmd.includes('storage') ? 'storage' : 'utility';
      else if (cmd.includes('--type=gpu')) type = 'gpu';
      else if (cmd.includes('--type=zygote')) type = 'zygote';
      else if (cmd.includes('chrome')) type = 'browser';
      if (!kids.has(ppid)) kids.set(ppid, []);
      kids.get(ppid).push(Number(d));
      info.set(Number(d), { rssKb: rss, type });
    } catch { /* races */ }
  }
  const out = { total: 0, renderer: 0, browser: 0, storage: 0, utility: 0, gpu: 0, other: 0, zygote: 0 };
  const walk = (pid) => {
    const i = info.get(pid);
    if (i) { out.total += i.rssKb; out[i.type] += i.rssKb; }
    for (const k of kids.get(pid) || []) walk(k);
  };
  walk(rootPid);
  return out;
}

const GB = (kb) => (kb / 1024 / 1024).toFixed(2);
const MBs = (kb) => (kb / 1024).toFixed(0);

if (!existsSync(FIXTURE)) { console.log('⛔ fixture が無い'); process.exit(1); }
console.log(`■ ${LABEL || FIXTURE} (${(statSync(FIXTURE).size / 1048576).toFixed(0)} MB) / ${SECONDS} 秒観測 / 強制 GC なし`);

const srv = await serve(FIXTURE);
const prof = '/tmp/pw-rss';
if (!SECOND) rmSync(prof, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(prof, {
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  viewport: { width: 1400, height: 950 },
});
// IDB 読み計器: assets bucket の get/getAll を store 名ごとに数える
await ctx.addInitScript(() => {
  const w = window;
  const size = (v) => (typeof v === 'string' ? v.length : (v && typeof v.size === 'number' ? v.size : 0));
  w.__reads = { assets: { n: 0, bytes: 0 }, containers: { n: 0, bytes: 0 } };
  for (const m of ['get', 'getAll']) {
    const orig = IDBObjectStore.prototype[m];
    IDBObjectStore.prototype[m] = function (...args) {
      const req = orig.apply(this, args);
      const store = this.name;
      req.addEventListener('success', () => {
        const t = w.__reads[store];
        if (!t) return;
        const r = req.result;
        if (Array.isArray(r)) { t.n += r.length; for (const v of r) t.bytes += size(v); }
        else if (r !== undefined) { t.n += 1; t.bytes += size(r); }
      });
      return req;
    };
  }
});
const browserProc = ctx.browser()?.process?.() ?? null;
// launchPersistentContext: process() は BrowserContext には無い。playwright の
// chromium プロセスは本 node の子として起動される — 子プロセスから chrome を探す。
let rootPid = browserProc?.pid ?? null;
if (!rootPid) {
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = readFileSync(`/proc/${d}/stat`, 'utf8');
      const ppid = Number(stat.match(/^\d+ \(.*\) \S (\d+)/s)[1]);
      const cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8');
      if (ppid === process.pid && cmd.includes('chrome')) { rootPid = Number(d); break; }
    } catch { /* noop */ }
  }
}
if (!rootPid) { console.log('⛔ chrome root pid が見つからない'); process.exit(1); }

const PAGE_MARK='x';
const page = await ctx.newPage();
page.on('console', (m) => { const t = m.text(); if (t.includes('[DIAG]')) console.log('   ' + t); });
// seed 用の最初の boot は flag を付けない ── flag 付きで空 boot すると
// 初期 container が sqlite 側に作られ、seed 後の再 boot で「sqlite に
// データあり」と判定されて移行が skip される(= fixture が見えない)。
await page.goto(`${srv.origin}/dist/pkc2.html${SECOND ? PAGE_URL_SUFFIX : ''}`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 180000 });
if (!SECOND) await page.evaluate(async ({ url, cid }) => {
  const c = await (await fetch(url)).json();
  c.meta.container_id = cid;
  const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  const put = (store, pairs) => new Promise((res, rej) => { const t = db.transaction(store, 'readwrite'); const s = t.objectStore(store); for (const [k, v] of pairs) s.put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  await new Promise((res, rej) => { const t = db.transaction(['containers', 'assets'], 'readwrite'); t.objectStore('containers').clear(); t.objectStore('assets').clear(); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  await put('assets', Object.entries(c.assets).map(([k, v]) => [`${cid}:${k}`, v]));
  await put('containers', [[cid, { ...c, assets: {} }], ['__default__', cid]]);
  db.close();
}, { url: `${srv.origin}/__fixture.json`, cid: CID });

// 計測対象の起動(user の「初回起動」相当)
console.log('   -- 起動 --');
const tBoot = Date.now();
await page.goto(`${srv.origin}/dist/pkc2.html${PAGE_URL_SUFFIX}`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 });
const readyMs = Date.now() - tBoot;
await page.waitForFunction(`document.querySelectorAll('${ROW_SEL}').length > 10`, null, { timeout: 180000 });
const listMs = Date.now() - tBoot;
console.log(`   boot: ready ${readyMs}ms / 一覧表示 ${listMs}ms`);
if (SQLITE_FLAG) {
  const si = await page.evaluate('window.__pkc2StorageInfo').catch(() => null);
  console.log(`   storage: ${JSON.stringify(si)}`);
  if (!si || si.sqlite !== true) { console.log('⛔ sqlite backend が成立していない ── この走行は無効'); }
}

let peak = { total: 0 };
const t0 = Date.now();
for (let s = 0; s < SECONDS; s += 5) {
  const r = treeRss(rootPid);
  if (r.total > peak.total) peak = r;
  const heap = await page.evaluate('performance.memory ? performance.memory.usedJSHeapSize : 0').catch(() => 0);
  const reads = await page.evaluate('window.__reads').catch(() => null);
  const d = await page.evaluate('({m: window.__dMeta|0, w: window.__dWS|0, dr: window.__dDrain|0, pw: window.__dPrewarm|0})').catch(() => null);
  const rd = (reads ? ` | asset読 ${reads.assets.n}件/${(reads.assets.bytes / 1048576).toFixed(0)}MB` : '') + (d ? ` | meta ${d.m} ws ${d.w} drain ${d.dr} prewarm ${d.pw}` : '');
  console.log(`   t=${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s  総RSS ${GB(r.total)} GB (renderer ${MBs(r.renderer)})  JSheap ${(heap / 1048576).toFixed(0)} MB${rd}`);
  await new Promise((r2) => setTimeout(r2, 5000));
}
const fin = treeRss(rootPid);
const est = await page.evaluate('navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : null').catch(() => null);
console.log('');
console.log(`■ 結果: ピーク総RSS ${GB(peak.total)} GB(renderer ${MBs(peak.renderer)} MB)/ 最終 ${GB(fin.total)} GB(renderer ${MBs(fin.renderer)} MB)`);
if (est && est.usage) console.log(`   storage usage: ${(est.usage / 1048576).toFixed(0)} MB(IDB + OPFS 合算の origin 使用量)`);
await ctx.close();
await srv.close();
