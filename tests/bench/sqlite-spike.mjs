/* eslint-disable */
/**
 * P2 spike 実証: 静的 bundle した sqlite3.wasm が単一 HTML から
 * fetch なしで動くか。`window.__pkc2SqliteProbe()`(main.ts の遅延 hook)を
 * 実ブラウザで叩き、:memory: の CREATE/INSERT/SELECT 往復を確認する。
 * あわせて probe 前後の JS heap を出す(遅延初期化のコスト観測)。
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';

const ROOT = process.cwd();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const srv = await new Promise((r) => {
  const server = http.createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const f = join(ROOT, p);
    if (!f.startsWith(ROOT + sep) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream' });
    createReadStream(f).pipe(res);
  });
  server.listen(0, '127.0.0.1', () => r({ origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((x) => server.close(x)) }));
});

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
const netRequests = [];
page.on('request', (rq) => { if (!rq.url().startsWith(srv.origin)) netRequests.push(rq.url()); });
await page.goto(`${srv.origin}/dist/pkc2.html`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });

const heapBefore = await page.evaluate('performance.memory.usedJSHeapSize');
const result = await page.evaluate('window.__pkc2SqliteProbe()');
const heapAfter = await page.evaluate('performance.memory.usedJSHeapSize');
const persist = await page.evaluate('window.__pkc2SqlitePersistProbe()');
console.log('■ sqlite3.wasm 静的 bundle 実証(単一 HTML / fetch なし)');
console.log(`   probe: ${JSON.stringify(result)}`);
console.log(`   JS heap: probe 前 ${(heapBefore / 1048576).toFixed(1)} MB → 後 ${(heapAfter / 1048576).toFixed(1)} MB(遅延初期化コスト +${((heapAfter - heapBefore) / 1048576).toFixed(1)} MB)`);
console.log(`   外部ネットワーク要求: ${netRequests.length} 件${netRequests.length ? ' ⛔ ' + netRequests.join(', ') : '(なし = 静的)'}`);
console.log('■ §8-1 永続化 VFS の実機確認');
console.log(`   crossOriginIsolated: ${persist.coi} / 'opfs' VFS 登録: ${persist.opfsVfsRegistered}`);
console.log(`   SAHPool(main thread): ${JSON.stringify(persist.sahpool)}`);
await browser.close();
await srv.close();
process.exit(result && result.ok ? 0 : 1);
