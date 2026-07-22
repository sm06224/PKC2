/* eslint-disable */
// storage-arch-bench.html を headless Chromium で駆動して結果を回収
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/home/user/PKC2/package.json');
const { chromium } = require('playwright');

const dir = path.dirname(new URL(import.meta.url).pathname);
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = path.join(dir, decodeURIComponent(url === '/' ? '/storage-arch-bench.html' : url));
  if (!file.startsWith(dir) || !fs.existsSync(file)) { res.statusCode = 404; res.end('nf'); return; }
  res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const totalMB = Number(process.env.TOTAL_MB || 300);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
await page.goto(`http://127.0.0.1:${port}/`);
await page.selectOption('#size', String(totalMB));
await page.click('#run');
await page.waitForFunction(() => window.__done === true, null, { timeout: 1200000 });
const results = await page.evaluate(() => window.__results);
const logText = await page.evaluate(() => document.getElementById('log').textContent);
console.log(logText);
console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();
