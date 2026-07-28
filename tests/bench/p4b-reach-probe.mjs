/* eslint-disable */
/**
 * P4b(本文の LRU 追い出し)が **既定の user に届いているか**を実機で確かめる。
 *
 * 疑い: `mountBodyWorkingSet` は `bodiesDeferred === true` のときだけ呼ばれ、
 * `bodiesDeferred = (__pkc_layout__ >= 2)` は退役した `lazy_entry_bodies` が
 * 書いた形式でしか立たない。既定(IDB inline)なら false → P4b は載らない。
 *
 * 判定は計器 `window.__pkc2BodyWorkingSet` の有無で行う
 * (body-working-set.ts が mount 時に生やす)。
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const ROOT = process.cwd();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, 'dist', p === '/' ? 'pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45881, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:45881/pkc2.html';

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

/** 本文が重い container を seed して、2 回目起動での計器の有無を見る。 */
async function probe(label, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });

  await page.evaluate(async () => {
    const T = '2026-07-01T00:00:00.000Z';
    const big = 'あ'.repeat(20000); // 20k 文字 × 500 件 = 1,000 万文字(上限 200 万を確実に超える)
    const cont = {
      meta: { container_id: 'p4breach', title: 'p', created_at: T, updated_at: T, schema_version: 1 },
      entries: Array.from({ length: 500 }, (_, i) => ({
        lid: `e${String(i).padStart(4, '0')}`, title: `E${i}`, archetype: 'text',
        body: `# ${i}\n\n${big}`, created_at: T, updated_at: T,
      })),
      relations: [], revisions: [], assets: {},
    };
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    await new Promise((res, rej) => {
      const t = db.transaction(['containers'], 'readwrite');
      const s = t.objectStore('containers'); s.clear();
      s.put(cont, 'p4breach'); s.put('p4breach', '__default__');
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
    db.close();
  });

  await page.goto(url);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 });
  await page.waitForTimeout(8000); // idle backfill / 追い出しが走る余地を与える

  const r = await page.evaluate(() => {
    const w = window;
    const ws = w.__pkc2BodyWorkingSet;
    // 実際に本文が heap に載っているかを、DOM ではなく state 側で見る。
    const layout = 'unknown';
    return {
      workingSetMounted: !!ws,
      residentChars: ws ? ws.residentChars() : null,
      pendingCount: ws ? ws.pendingCount() : null,
      layout,
    };
  });

  // storage 側の record 形式も読む(bodiesDeferred の根拠)
  const rec = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    const v = await new Promise((res) => {
      const t = db.transaction(['containers'], 'readonly');
      const rq = t.objectStore('containers').get('p4breach');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
    });
    db.close();
    if (!v) return { present: false };
    return {
      present: true,
      layout: v.__pkc_layout__ ?? null,
      split: v.__pkc_split__ ?? null,
      entryCount: Array.isArray(v.entries) ? v.entries.length : null,
      firstBodyLen: Array.isArray(v.entries) && v.entries[0] ? String(v.entries[0].body ?? '').length : null,
    };
  });

  console.log(`\n■ ${label}`);
  console.log(`   body working set が mount されたか : ${r.workingSetMounted ? '✅ YES' : '🔴 NO'}`);
  if (r.workingSetMounted) {
    console.log(`   常駐文字数                        : ${r.residentChars?.toLocaleString()} 文字`);
    console.log(`   未読の件数                        : ${r.pendingCount}`);
  }
  console.log(`   storage record: __pkc_layout__=${rec.layout} / __pkc_split__=${rec.split} / entries=${rec.entryCount} / entries[0].body 長=${rec.firstBodyLen?.toLocaleString()}`);

  await ctx.close();
  return { ...r, rec };
}

console.log('■ P4b(本文 LRU 追い出し)は既定の user に届いているか');
console.log('   fixture: 20,000 文字 × 500 件 = 1,000 万文字(上限 200 万を 5 倍超過)');

await probe('既定(flag なし = IDB inline)', BASE);
await probe('sqlite backend を明示 ON', `${BASE}?pkc-flag=storage.sqlite_backend%3Dtrue`);

await browser.close();
server.close();
