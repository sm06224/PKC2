/* eslint-disable */
/**
 * cytoscape グラフ演算の実ブラウザ実測(2026-07-27)。
 * 🔑 cytoscape は mermaid の依存として**既に bundle 内**にあり、直接 import しても
 *    追加は +1.8KB(実測)── 「新しい依存を足す話ではない」ことの実証。
 * 現行 PKC2 に実装が無い演算(媒介中心性 / PageRank / 連結成分 / 最短経路)を測る。
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync, rmSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
const ROOT = process.cwd();
const argOf = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const FIXTURE = argOf('fixture', '');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const srv = await new Promise((r) => {
  const s = http.createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const f = p === '/__fixture.json' ? FIXTURE : join(ROOT, p);
    if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(f).pipe(res);
  });
  s.listen(45721, '127.0.0.1', () => r({ origin: 'http://127.0.0.1:45721', close: () => new Promise((x) => s.close(x)) }));
});
rmSync('/tmp/pw-cyto', { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext('/tmp/pw-cyto', { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'], viewport: { width: 1400, height: 950 } });
const page = await ctx.newPage();
await page.goto(`${srv.origin}/dist/pkc2.html`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
if (FIXTURE) {
  await page.evaluate(async ({ url }) => {
    const c = await (await fetch(url)).json();
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    await new Promise((res, rej) => { const t = db.transaction(['containers','assets'],'readwrite'); t.objectStore('containers').clear(); t.objectStore('assets').clear(); t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); });
    await new Promise((res, rej) => { const t = db.transaction('containers','readwrite'); const s2=t.objectStore('containers'); s2.put({...c, assets:{}, meta:{...c.meta, container_id:'cyto'}}, 'cyto'); s2.put('cyto','__default__'); t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); });
    db.close();
  }, { url: `${srv.origin}/__fixture.json` });
  await page.goto(`${srv.origin}/dist/pkc2.html`);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 });
}
const heapBefore = await page.evaluate('performance.memory.usedJSHeapSize');
const r = await page.evaluate('window.__pkc2GraphProbe()');
const heapAfter = await page.evaluate('performance.memory.usedJSHeapSize');
console.log('■ cytoscape グラフ演算の実測(既に bundle 内・追加 +1.8KB)');
console.log(`   fixture: ${FIXTURE || '(初期 container)'}`);
console.log(`   nodes ${r.nodes} / edges ${r.edges} / 連結成分 ${r.components} / 最短経路 ${r.shortestPath}`);
console.log(`   ok=${r.ok}${r.error ? ' error=' + r.error : ''}`);
console.log('   所要 ms:', JSON.stringify(r.timings));
console.log(`   JS heap: ${(heapBefore/1048576).toFixed(1)} → ${(heapAfter/1048576).toFixed(1)} MB(destroy 済)`);
console.log(`   次数上位: ${JSON.stringify(r.degreeTop.slice(0,3))}`);
console.log(`   媒介中心性上位: ${JSON.stringify(r.betweennessTop.slice(0,3))}`);
console.log(`   PageRank 上位: ${JSON.stringify(r.pageRankTop.slice(0,3))}`);
await ctx.close(); await srv.close();
process.exit(r.ok ? 0 : 1);
