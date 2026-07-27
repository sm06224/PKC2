/* eslint-disable */
/**
 * L3-S5 の賞金測定(2026-07-27)── 窓化 ON / OFF の**対照実験**。
 *
 * 対照群は「窓化 flag だけが違う同一ビルド・同一 fixture・同一操作」。
 * 見るのは B1 の DOM 計器(nodes / layoutObjects / listeners)と JS heap。
 *
 * ⚠ `content-visibility: auto`(PR #183)が既に off-screen の layout/paint を
 *    止めているので、**窓化が買えるのは DOM ノードの常駐と生成コストだけ**。
 *    layout/paint の二重取りはできない ── その前提で数字を読む。
 *
 * 使い方: node tests/bench/sidebar-virtual-gain.mjs [--entries=3000]
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync, rmSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { attachDomCounters, formatOne } from './lib/dom-counters.mjs';

const ROOT = process.cwd();
const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const N = Number(argOf('entries', '3000'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, p === '/' ? '/dist/pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45741, '127.0.0.1', r));

async function run(flagOn) {
  const prof = `/tmp/pw-virtgain-${flagOn ? 'on' : 'off'}`;
  rmSync(prof, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(prof, {
    executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    viewport: { width: 1400, height: 950 },
  });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:45741/');
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
  await page.evaluate(async (n) => {
    const T = '2026-07-01T00:00:00.000Z';
    const c = {
      meta: { container_id: 'vg', title: 'v', created_at: T, updated_at: T, schema_version: 1 },
      entries: Array.from({ length: n }, (_, i) => ({
        lid: `v${String(i).padStart(5, '0')}`, title: `row ${String(i).padStart(5, '0')}`,
        archetype: 'text', body: 'x'.repeat(200), created_at: T, updated_at: T,
      })),
      relations: [], revisions: [], assets: {},
    };
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    await new Promise((res, rej) => { const t = db.transaction('containers', 'readwrite'); const s = t.objectStore('containers'); s.clear(); s.put(c, 'vg'); s.put('vg', '__default__'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    db.close();
  }, N);

  const url = flagOn ? 'http://127.0.0.1:45741/?pkc-flag=sidebar.virtual_list%3Dtrue' : 'http://127.0.0.1:45741/';
  await page.goto(url);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 });
  const counters = await attachDomCounters(ctx, page);

  // 「使っている」状態にする: 行を選び、少しスクロールする(定常の見え)
  await page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item').first().click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(800);

  const s = await counters.read({ gc: true });
  const dom = await page.evaluate(() => {
    const l = document.querySelector('[data-pkc-region="entry-list"]');
    return { rows: l.querySelectorAll('li.pkc-entry-item').length, logical: Number(l.getAttribute('data-pkc-row-count')) };
  });
  await ctx.close();
  return { s, dom };
}

console.log(`■ サイドバー窓化の賞金(entries=${N} / 同一ビルド・flag だけが違う)\n`);
const off = await run(false);
console.log(`   OFF  DOM 行 ${off.dom.rows} / 論理 ${off.dom.logical}`);
console.log(`        ${formatOne(off.s)}`);
const on = await run(true);
console.log(`   ON   DOM 行 ${on.dom.rows} / 論理 ${on.dom.logical}`);
console.log(`        ${formatOne(on.s)}`);

const d = (k) => {
  const a = off.s[k], b = on.s[k];
  if (a === undefined || b === undefined) return '—';
  const diff = b - a;
  return `${Math.round(a).toLocaleString()} → ${Math.round(b).toLocaleString()} (${diff >= 0 ? '+' : '-'}${Math.abs(Math.round(diff)).toLocaleString()})`;
};
console.log('\n   差分(OFF → ON)');
for (const k of ['nodes', 'layoutObjects', 'listeners']) console.log(`     ${k.padEnd(14)} ${d(k)}`);
console.log(`     jsHeapUsed     ${(off.s.jsHeapUsed / 1048576).toFixed(1)} → ${(on.s.jsHeapUsed / 1048576).toFixed(1)} MB`);
console.log('\n⚠ content-visibility が既に off-screen の layout/paint を止めているため、');
console.log('  ここで動くのは **DOM ノードの常駐**であって描画時間ではない。');
server.close();
