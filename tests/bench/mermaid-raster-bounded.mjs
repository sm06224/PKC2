/* eslint-disable */
/**
 * **user 提起(2026-07-29)への実測**:
 *
 *   ① 「GPU と GPU メモリに直接オフロードできないの?」
 *   ② 「ベクタライズを canvas を定めずに無制限にレスポンシブさせるから
 *      メモリを食うんだろ?」
 *
 * ② は診断として正しい可能性が高い。今の C6-a は **図の内在サイズ(260×6310)
 * そのままでラスタ化**しているので、図が大きくなるほど展開後ビットマップが
 * 際限なく育つ。**canvas を定める**(上限画素を決めて縮小して焼く)なら、
 * 図の大きさに依らず常駐は一定になるはずである。
 *
 * ## 🔴 GPU 側を測らずに「オフロードした」と言わない
 *
 * ①を「renderer が減った」だけで良しとすると、**計器の外へコストを移しただけ**
 * になる。同じ誤りをこのセッションで既に 2 回踏んでいる。よって本ハーネスは
 * **プロセス種別ごとの PSS / USS**(renderer / gpu / browser)を `/proc` から読み、
 * **合計でどうなるか**を出す。
 *
 * ## 腕
 *
 * | 腕 | 内容 |
 * |---|---|
 * | svg | 既定(SVG のまま) |
 * | img-full | 内在サイズで PNG 化(C6-a の初稿) |
 * | img-capped | **上限画素まで縮小**して PNG 化、CSS で表示サイズへ拡大 |
 * | canvas | `<canvas>` を DOM に残す(加速 2D canvas = GPU テクスチャを狙う) |
 *
 * 使い方: node tests/bench/mermaid-raster-bounded.mjs [--nodes=60] [--cap=1000000] [--repeat=3]
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, readdirSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const ROOT = '/home/user/PKC2';
const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const NODES = Number(argOf('nodes', '60'));
const CAP = Number(argOf('cap', '1000000'));
const REPEAT = Number(argOf('repeat', '3'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, 'dist', p === '/' ? 'pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45889, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45889/pkc2.html';

/**
 * プロセス種別ごとの PSS / USS(KB)。`base-cost-breakdown.mjs` / `pwa-base-cost.mjs`
 * と同じ読み方 ── **RSS 合計は共有ページを二重計上する**ので使わない。
 */
function processMemory() {
  const out = {};
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    let cmd = '';
    try { cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8').replace(/\0/g, ' '); } catch { continue; }
    if (!/chrome|chromium/i.test(cmd)) continue;
    let type = 'browser';
    const m = /--type=([a-z-]+)/.exec(cmd);
    if (m) type = m[1] === 'gpu-process' ? 'gpu' : m[1];
    let roll = '';
    try { roll = readFileSync(`/proc/${d}/smaps_rollup`, 'utf8'); } catch { continue; }
    const num = (k) => {
      const mm = new RegExp(`^${k}:\\s+(\\d+) kB`, 'm').exec(roll);
      return mm ? Number(mm[1]) : 0;
    };
    const pss = num('Pss');
    const uss = num('Private_Clean') + num('Private_Dirty');
    out[type] = out[type] || { pss: 0, uss: 0, n: 0 };
    out[type].pss += pss; out[type].uss += uss; out[type].n += 1;
  }
  return out;
}

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  // GPU を無効にすると①の検証にならない。既定(有効)のまま測る。
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

function diagram(n) {
  const lines = ['graph TD'];
  for (let i = 0; i < n; i += 1) lines.push(`  N${i}["ノード ${i} のラベル(長め)"] --> N${i + 1}["ノード ${i + 1}"]`);
  return lines.join('\n');
}

await page.goto(URL_);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
await page.waitForTimeout(1000);
await page.evaluate(async (src) => {
  const T = '2026-07-01T00:00:00.000Z';
  const cont = {
    meta: { container_id: 'mrb', title: 'mrb', created_at: T, updated_at: T, schema_version: 1 },
    entries: [{ lid: 'M', title: 'Mermaid', archetype: 'text', body: '# 図\n\n```mermaid\n' + src + '\n```\n', created_at: T, updated_at: T }],
    relations: [], revisions: [], assets: {},
  };
  const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  await new Promise((res, rej) => {
    const t = db.transaction(['containers'], 'readwrite');
    const s = t.objectStore('containers'); s.clear();
    s.put(cont, 'mrb'); s.put('mrb', '__default__');
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
  db.close();
}, diagram(NODES));

/** 1 試行:reload → 図を開く → 指定の腕へ変換 → 落ち着かせて計測。 */
async function trial(arm, cap) {
  await page.goto(URL_);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="M"]').first().click();
  await page.waitForFunction(
    () => document.querySelector('.pkc-mermaid-rendered svg') !== null,
    null, { timeout: 60000 },
  ).catch(() => {});
  await page.waitForTimeout(1200);

  const info = await page.evaluate(async ({ a, c }) => {
    const wrap = document.querySelector('.pkc-mermaid-rendered');
    const svg = wrap?.querySelector('svg');
    if (!wrap || !svg) return { ok: false };
    const r = svg.getBoundingClientRect();
    const cssW = Math.round(r.width); const cssH = Math.round(r.height);
    if (a === 'svg') return { ok: true, cssW, cssH, rasterW: 0, rasterH: 0, kind: 'svg' };

    // 上限画素まで縮小する倍率(img-full / canvas は 1 倍)
    const area = cssW * cssH;
    const scale = a === 'img-capped' && area > c ? Math.sqrt(c / area) : 1;
    const rw = Math.max(1, Math.round(cssW * scale));
    const rh = Math.max(1, Math.round(cssH * scale));

    const clone = svg.cloneNode(true);
    clone.setAttribute('width', String(cssW));
    clone.setAttribute('height', String(cssH));
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode();

    const cv = document.createElement('canvas');
    cv.width = rw; cv.height = rh;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, rw, rh);

    if (a === 'canvas') {
      // canvas をそのまま DOM に残す ── 加速 2D canvas なら backing store は
      // GPU テクスチャになる(はず)。それを renderer / gpu の両方で確かめる。
      cv.style.width = `${cssW}px`;
      cv.style.height = `${cssH}px`;
      svg.replaceWith(cv);
      return { ok: true, cssW, cssH, rasterW: rw, rasterH: rh, kind: 'canvas' };
    }
    const blob = await new Promise((res) => { try { cv.toBlob(res, 'image/png'); } catch { res(null); } });
    if (!blob) return { ok: false };
    const out = new Image();
    out.src = URL.createObjectURL(blob);
    out.style.width = `${cssW}px`;   // 表示サイズは常に内在サイズ(見た目を揃える)
    out.style.height = `${cssH}px`;
    await out.decode();
    svg.replaceWith(out);
    return { ok: true, cssW, cssH, rasterW: rw, rasterH: rh, kind: 'img', pngBytes: blob.size };
  }, { a: arm, c: cap });

  // 合成が落ち着くまで待ってから読む(GPU 側は遅れて確保される)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(2500);
  return { info, mem: processMemory() };
}

const ARMS = ['svg', 'img-full', 'img-capped', 'canvas'];
console.log(`■ mermaid ラスタの常駐:GPU まで含めて測る(ノード ${NODES} / 上限 ${(CAP / 1e6).toFixed(1)}M 画素 / ${REPEAT} 回)\n`);
console.log('   ⚠ RSS 合計は使わない(共有ページの二重計上)。PSS と USS で読む。\n');

const results = {};
for (const arm of ARMS) {
  const runs = [];
  for (let i = 0; i < REPEAT; i += 1) runs.push(await trial(arm, CAP));
  results[arm] = runs;
}

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const first = results.svg[0].info;
console.log(`   図の表示サイズ ${first.cssW}×${first.cssH}(${(first.cssW * first.cssH / 1e6).toFixed(2)}M 画素)\n`);
console.log('   腕            ラスタ寸法        renderer USS   gpu USS   合計 USS   合計 PSS');
for (const arm of ARMS) {
  const runs = results[arm];
  const ok = runs.every((r) => r.info.ok);
  const inf = runs[runs.length - 1].info;
  const rend = med(runs.map((r) => (r.mem.renderer?.uss ?? 0) / 1024));
  const gpu = med(runs.map((r) => (r.mem.gpu?.uss ?? 0) / 1024));
  const totU = med(runs.map((r) => Object.values(r.mem).reduce((a, x) => a + x.uss, 0) / 1024));
  const totP = med(runs.map((r) => Object.values(r.mem).reduce((a, x) => a + x.pss, 0) / 1024));
  const dims = arm === 'svg' ? '—' : `${inf.rasterW}×${inf.rasterH}`;
  console.log(
    `   ${arm.padEnd(12)} ${dims.padEnd(16)} ${rend.toFixed(1).padStart(10)} MB `
    + `${gpu.toFixed(1).padStart(9)} MB ${totU.toFixed(1).padStart(9)} MB ${totP.toFixed(1).padStart(10)} MB`
    + `${ok ? '' : '  🔴 変換失敗'}`,
  );
}
const base = med(results.svg.map((r) => Object.values(r.mem).reduce((a, x) => a + x.uss, 0) / 1024));
console.log('\n   svg を基準にした合計 USS の差:');
for (const arm of ARMS.slice(1)) {
  const v = med(results[arm].map((r) => Object.values(r.mem).reduce((a, x) => a + x.uss, 0) / 1024));
  console.log(`     ${arm.padEnd(12)} ${(v - base).toFixed(1).padStart(7)} MB`);
}
console.log('\n   ⚠ 「renderer が減った」だけで良しとしない。**合計**で見る。');
console.log('   ⚠ 3 回の中央値。プロセス常駐は数 MB ぶれるので、その幅より小さい差は未確定。');

await browser.close();
server.close();
