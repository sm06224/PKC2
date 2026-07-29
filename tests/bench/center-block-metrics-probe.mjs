/* eslint-disable */
/**
 * **窓化の scrollHeight が呼吸する原因を metrics の内側から見る**(2026-07-29)。
 *
 * `center-scroll-loop-probe.mjs` は症状(scrollHeight 8417〜11131)を出したが、
 * **なぜ縮むか**は外から見えない。host 要素に生えている `__pkcBlockCtx` を
 * 直接覗いて、ホイール 1 回ごとに
 *
 *   - `estimate`(未測定ブロックに使う推定高)
 *   - 実測済みブロック数 / 全ブロック数
 *   - `totalHeight`(= min-height に敷く値 = scrollHeight の床)
 *   - 実測値の平均 / 中央値
 *
 * を記録する。**推測で直さない** ── どの項が動いて総高が縮むのかを見てから直す。
 *
 * 使い方: node tests/bench/center-block-metrics-probe.mjs [--wheels=20]
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
const WHEELS = Number(argOf('wheels', '20'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, 'dist', p === '/' ? 'pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45897, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45897/pkc2.html';

function longBody(sections = 60) {
  let out = '';
  for (let i = 0; i < sections; i += 1) {
    out += `## 見出し ${i}\n\n段落 **強調** ${i} と \`inline code\`。\n\n`
      + `| 列 A | 列 B |\n|---|---|\n| 値 ${i} | 値 ${i} |\n\n`
      + '```js\n' + `const x = ${i};\n` + '```\n\n'
      + `- 箇条 ${i}-1\n- 箇条 ${i}-2\n\n> 引用 ${i}\n\n`;
  }
  return out;
}

const LAUNCH = {
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
};

/** ページ内で metrics を要約する(ctx の形に依存するので 1 箇所に閉じる)。 */
const SNAPSHOT = () => {
  const host = document.querySelector('[data-pkc-block-window]');
  const sc = document.querySelector('.pkc-center-content');
  if (!host || !sc) return null;
  const ctx = host.__pkcBlockCtx;
  if (!ctx) return { noCtx: true, scrollTop: Math.round(sc.scrollTop), scrollHeight: Math.round(sc.scrollHeight) };
  const m = ctx.metrics;
  const known = m.heights.filter((h) => h !== null);
  const sorted = [...known].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < m.count; i += 1) {
    total += m.hidden.has(i) ? 0 : (m.heights[i] ?? m.estimate);
  }
  const sum = known.reduce((a, b) => a + b, 0);
  return {
    scrollTop: Math.round(sc.scrollTop),
    scrollHeight: Math.round(sc.scrollHeight),
    count: m.count,
    measured: known.length,
    estimate: Math.round(m.estimate * 10) / 10,
    mean: known.length ? Math.round((sum / known.length) * 10) / 10 : 0,
    median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    total: Math.round(total),
    range: `${ctx.range.start}-${ctx.range.end}`,
    minHeight: host.style.minHeight,
  };
};

const b = await chromium.launch(LAUNCH);
const ctx0 = await b.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx0.newPage();
await page.goto(URL_);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
await page.waitForTimeout(700);
await page.evaluate(async (body) => {
  const T = '2026-07-01T00:00:00.000Z';
  const cont = {
    meta: { container_id: 'sl', title: 'sl', created_at: T, updated_at: T, schema_version: 1 },
    entries: [{ lid: 'L', title: '長い本文', archetype: 'text', body, created_at: T, updated_at: T }],
    relations: [], revisions: [], assets: {},
  };
  const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  await new Promise((res, rej) => {
    const t = db.transaction(['containers'], 'readwrite');
    const s = t.objectStore('containers'); s.clear();
    s.put(cont, 'sl'); s.put('sl', '__default__');
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
  db.close();
}, longBody());

await page.goto(`${URL_}?pkc-flag=center.block_window=true`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="L"]').first().click();
await page.locator('.pkc-center-content .pkc-md-rendered').first().waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(1200);

const box = await page.locator('.pkc-center-content').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

console.log('■ 窓化 ON:ホイール 1 回ごとの metrics 内訳\n');
console.log('   #  scrollTop  scrollH   窓        測定/全   estimate    平均   中央値   total(推定総高)');
const rows = [];
rows.push(await page.evaluate(SNAPSHOT));
for (let i = 0; i < WHEELS; i += 1) {
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(140);
  rows.push(await page.evaluate(SNAPSHOT));
}
rows.forEach((r, i) => {
  if (!r || r.noCtx) { console.log(`   ${String(i).padStart(2)}  (ctx 無し)`); return; }
  console.log(
    `   ${String(i).padStart(2)} ${String(r.scrollTop).padStart(9)} ${String(r.scrollHeight).padStart(8)}`
    + `   ${r.range.padEnd(8)} ${`${r.measured}/${r.count}`.padStart(8)}`
    + ` ${String(r.estimate).padStart(8)} ${String(r.mean).padStart(7)} ${String(r.median).padStart(7)}`
    + ` ${String(r.total).padStart(8)}`,
  );
});

// 真値: 窓化を切って全部描いたときの scrollHeight
const truth = await page.evaluate(() => {
  const host = document.querySelector('[data-pkc-block-window]');
  const sc = document.querySelector('.pkc-center-content');
  if (!host || !sc) return null;
  const ctx = host.__pkcBlockCtx;
  host.style.minHeight = '';
  host.innerHTML = '';
  for (const b of ctx.blocks) host.insertAdjacentHTML('beforeend', b);
  return Math.round(sc.scrollHeight);
});
console.log(`\n   真値(全ブロックを素で入れたときの scrollHeight): ${truth}`);
console.log('   ⚠ total が真値へ単調に寄るのが正しい。行き来しているなら推定の引き直しが犯人。');

await b.close();
server.close();
