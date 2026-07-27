/* eslint-disable */
/**
 * 継続使用(編集セッション)のプロセス RSS 実測 ── wasm-sqlite 設計 P1。
 *
 * > 「**boot 直後とか測ってない?意味ないからね、ソレ**」(user 指示 2026-07-27)
 *
 * boot 窓ではなく、**実際に編集し続けている N 分間**の RSS を測る。
 * 見るもの:
 *   - 編集を重ねたときの RSS の水位(定常が上がり続けないか = リーク検知)
 *   - 編集 churn 中の山(保存 = core record 全量 put が毎回走る現行形式の実像)
 *
 * boot-rss.mjs と同じ計器(chromium プロセスツリーの /proc RSS、強制 GC なし、
 * 固定ポート 45711 ── IDB は origin 単位なのでランダムポートにすると毎回
 * 初回起動になる)。編集操作は edit-main-thread-block.mjs の実 UI 操作と同型。
 *
 * 使い方:
 *   node tests/bench/sustained-use-rss.mjs --fixture=<path> --minutes=5
 *   node tests/bench/sustained-use-rss.mjs --fixture=<path> --minutes=5 --second=1  # seed 済み profile で
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';

const ROOT = process.cwd();
const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const FIXTURE = argOf('fixture', '');
const MINUTES = Number(argOf('minutes', '5'));
const SECOND = argOf('second', '') === '1';
const DIST_DIR = argOf('dist', join(ROOT, 'dist')); // A/B: 対照ビルドの dist を配信
const SQLITE_FLAG = argOf('flag', '') === '1';
const PAGE_URL_SUFFIX = SQLITE_FLAG ? '?pkc-flag=storage.sqlite_backend%3Dtrue' : '';
const CID = 'surss';
const ROW_SEL = '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
};
function serve(fixturePath) {
  const server = http.createServer((req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const f = p === '/__fixture.json' ? fixturePath
        : p.startsWith('/dist/') ? join(DIST_DIR, p.slice(5))
        : join(ROOT, p);
      if (p !== '/__fixture.json' && !f.startsWith(ROOT + sep) && !f.startsWith(DIST_DIR + sep)) { res.writeHead(403); res.end(); return; }
      if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(f).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((r) => server.listen(45713, '127.0.0.1', () => r({
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((x) => server.close(x)),
  })));
}

function treeRss(rootPid) {
  const kids = new Map();
  const info = new Map();
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = readFileSync(`/proc/${d}/stat`, 'utf8');
      const m = stat.match(/^\d+ \(.*\) \S (\d+)/s);
      if (!m) continue;
      const status = readFileSync(`/proc/${d}/status`, 'utf8');
      const rss = Number((status.match(/VmRSS:\s+(\d+) kB/) || [])[1] || 0);
      const cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8');
      const type = cmd.includes('--type=renderer') ? 'renderer' : 'other';
      if (!kids.has(Number(m[1]))) kids.set(Number(m[1]), []);
      kids.get(Number(m[1])).push(Number(d));
      info.set(Number(d), { rssKb: rss, type });
    } catch { /* races */ }
  }
  const out = { total: 0, renderer: 0 };
  const walk = (pid) => {
    const i = info.get(pid);
    if (i) { out.total += i.rssKb; if (i.type === 'renderer') out.renderer += i.rssKb; }
    for (const k of kids.get(pid) || []) walk(k);
  };
  walk(rootPid);
  return out;
}

const GB = (kb) => (kb / 1024 / 1024).toFixed(2);
const MBs = (kb) => (kb / 1024).toFixed(0);

if (!existsSync(FIXTURE)) { console.log('⛔ fixture が無い'); process.exit(1); }
console.log(`■ 継続使用 ${MINUTES} 分 / ${FIXTURE} (${(statSync(FIXTURE).size / 1048576).toFixed(0)} MB) / 強制 GC なし`);

const srv = await serve(FIXTURE);
const prof = '/tmp/pw-surss';
if (!SECOND) rmSync(prof, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(prof, {
  executablePath: process.env.SU_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  viewport: { width: 1400, height: 950 },
});
let rootPid = null;
for (const d of readdirSync('/proc')) {
  if (!/^\d+$/.test(d)) continue;
  try {
    const stat = readFileSync(`/proc/${d}/stat`, 'utf8');
    const ppid = Number(stat.match(/^\d+ \(.*\) \S (\d+)/s)[1]);
    const cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8');
    if (ppid === process.pid && cmd.includes('chrome')) { rootPid = Number(d); break; }
  } catch { /* noop */ }
}
if (!rootPid) { console.log('⛔ chrome root pid が見つからない'); process.exit(1); }

const page = await ctx.newPage();
// seed 前の boot は flag を付けない(空 boot で sqlite 側に初期 container が
// 出来ると、seed 後の移行が skip される ── boot-rss.mjs と同じ注意)。
await page.goto(`${srv.origin}/dist/pkc2.html${SECOND ? PAGE_URL_SUFFIX : ''}`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 180000 });
if (!SECOND) {
  await page.evaluate(async ({ url, cid }) => {
    const c = await (await fetch(url)).json();
    c.meta.container_id = cid;
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    const put = (store, pairs) => new Promise((res, rej) => { const t = db.transaction(store, 'readwrite'); const s = t.objectStore(store); for (const [k, v] of pairs) s.put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    await new Promise((res, rej) => { const t = db.transaction(['containers', 'assets'], 'readwrite'); t.objectStore('containers').clear(); t.objectStore('assets').clear(); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    await put('assets', Object.entries(c.assets).map(([k, v]) => [`${cid}:${k}`, v]));
    await put('containers', [[cid, { ...c, assets: {} }], ['__default__', cid]]);
    db.close();
  }, { url: `${srv.origin}/__fixture.json`, cid: CID });
  await page.goto(`${srv.origin}/dist/pkc2.html${PAGE_URL_SUFFIX}`);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 });
}
await page.waitForFunction(`document.querySelectorAll('${ROW_SEL}').length > 10`, null, { timeout: 180000 });
if (SQLITE_FLAG) {
  const si = await page.evaluate('window.__pkc2StorageInfo').catch(() => null);
  console.log(`   storage: ${JSON.stringify(si)}`);
  if (!si || si.sqlite !== true) { console.log('⛔ sqlite backend が成立していない ── この走行は無効'); process.exit(1); }
}

// 編集対象は fixture の text entry から選ぶ(todo 等は editor の形が違い
// `[data-pkc-field="body"]` が textarea にならない ── edit-main-thread-block と同じ作法)
const fixtureJson = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const lids = fixtureJson.entries.filter((e) => e.archetype === 'text').slice(0, 20).map((e) => e.lid);
if (lids.length === 0) { console.log('⛔ text entry が無い'); process.exit(1); }

async function editOnce(lid) {
  await page.locator(`${ROW_SEL}[data-pkc-lid="${lid}"]`).first().click();
  await page.waitForTimeout(120);
  await page.locator('[data-pkc-action="begin-edit"]').first().click();
  await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'editing'`, null, { timeout: 20000 });
  await page.locator('[data-pkc-field="body"]').first().click();
  await page.keyboard.type('x');
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'ready'`, null, { timeout: 20000 });
  await page.waitForTimeout(1500); // 保存 debounce(300ms)を越える
}

const samples = [];
const t0 = Date.now();
let edits = 0;
console.log('   -- 編集ループ開始 --');
while (Date.now() - t0 < MINUTES * 60000) {
  await editOnce(lids[edits % lids.length]);
  edits++;
  const r = treeRss(rootPid);
  samples.push(r);
  if (edits % 5 === 0 || edits === 1) {
    console.log(`   t=${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s  編集 ${String(edits).padStart(3)} 回  総RSS ${GB(r.total)} GB (renderer ${MBs(r.renderer)} MB)`);
  }
}

const first5 = samples.slice(0, 5);
const last5 = samples.slice(-5);
const avg = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
console.log('');
console.log(`■ 結果(${edits} 編集 / ${MINUTES} 分)`);
console.log(`   序盤 5 点平均: 総RSS ${GB(avg(first5, 'total'))} GB / renderer ${MBs(avg(first5, 'renderer'))} MB`);
console.log(`   終盤 5 点平均: 総RSS ${GB(avg(last5, 'total'))} GB / renderer ${MBs(avg(last5, 'renderer'))} MB`);
const growth = avg(last5, 'total') - avg(first5, 'total');
console.log(`   増分: ${(growth / 1024).toFixed(0)} MB(${growth >= 0 ? '+' : ''}${(growth / avg(first5, 'total') * 100).toFixed(1)}%)`);
console.log('');
console.log('⚠ 総RSS は chromium 全プロセスの合算(隔離環境)。実機のタブ単体の見えとは基準が違う。');
console.log('⚠ 向きと水位の比較用。走行をまたいだ絶対値の比較はしない。');
await ctx.close();
await srv.close();
