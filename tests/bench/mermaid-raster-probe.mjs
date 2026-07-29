/* eslint-disable */
/**
 * **C6(mermaid のラスタ表示)は成立するのか**を実機で確かめる probe(2026-07-29)。
 *
 * ## 実装の前に確かめること(設計を選ぶ前提が 2 つある)
 *
 * 1. 🔴 **そもそもラスタ化できるか** ── mermaid の SVG は既定で
 *    `<foreignObject>`(HTML ラベル)を使う。**`<foreignObject>` を含む SVG は
 *    `drawImage` で描けない**(Chromium は白紙 or throw)。含んでいたら、
 *    「ラスタ化する」という設計そのものが成立しない ── 先に知る必要がある。
 * 2. 🔴 **本当にメモリが減るか** ── doc の「mermaid 1 枚 +6.9MB」は
 *    **SVG を DOM に置いた状態**の数字であって、「`<img>` に置き換えたら
 *    その 6.9MB が消える」ことは**測っていない**。`<img>` + decode 済み
 *    bitmap も renderer に載るので、**減らない / 増える**可能性がある。
 *
 * ⚠ 「効果が小さいからやらない」は棄却理由にしない(user 指示③)。
 *    ここで測るのは**効果の有無ではなく、成立するかどうか**である。
 *    数字が出たら §7 の段階表に載せて判断材料にする。
 *
 * ## 測り方
 *
 * 同一ページ内で「SVG のまま」→ 強制 GC → dump、「img へ置換」→ 強制 GC → dump。
 * **JS heap だけでは判定しない**(2026-07-27 の反省)── CDP の memory-infra
 * dump から **allocator 内訳**(v8 / blink_gc / partition_alloc / malloc / skia)
 * を取り、2 系統で読む。
 *
 * 使い方: node tests/bench/mermaid-raster-probe.mjs [--nodes=60]
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
const NODES = Number(argOf('nodes', '60'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, 'dist', p === '/' ? 'pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45887, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45887/pkc2.html';

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

/** そこそこ重い flowchart(既定で htmlLabels = foreignObject を使う形)。 */
function diagram(n) {
  const lines = ['graph TD'];
  for (let i = 0; i < n; i += 1) {
    lines.push(`  N${i}["ノード ${i} のラベル(長め)"] --> N${i + 1}["ノード ${i + 1}"]`);
  }
  return lines.join('\n');
}

await page.goto(URL_);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
await page.waitForTimeout(1200);
await page.evaluate(async (src) => {
  const T = '2026-07-01T00:00:00.000Z';
  const body = '# 図\n\n```mermaid\n' + src + '\n```\n';
  const cont = {
    meta: { container_id: 'mraster', title: 'mr', created_at: T, updated_at: T, schema_version: 1 },
    entries: [{ lid: 'M', title: 'Mermaid', archetype: 'text', body, created_at: T, updated_at: T }],
    relations: [], revisions: [], assets: {},
  };
  const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  await new Promise((res, rej) => {
    const t = db.transaction(['containers'], 'readwrite');
    const s = t.objectStore('containers'); s.clear();
    s.put(cont, 'mraster'); s.put('mraster', '__default__');
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
  db.close();
}, diagram(NODES));

await page.goto(URL_);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="M"]').first().click();
await page.waitForFunction(
  () => document.querySelector('.pkc-mermaid-rendered svg') !== null,
  null, { timeout: 60000 },
).catch(() => {});
await page.waitForTimeout(800);

// ── ① 成立するか ────────────────────────────────────────────
const shape = await page.evaluate(() => {
  const svg = document.querySelector('.pkc-mermaid-rendered svg');
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  return {
    elements: svg.querySelectorAll('*').length,
    foreignObjects: svg.querySelectorAll('foreignObject').length,
    images: svg.querySelectorAll('image').length,
    serializedBytes: new TextEncoder().encode(new XMLSerializer().serializeToString(svg)).length,
    cssW: Math.round(r.width), cssH: Math.round(r.height),
    dpr: window.devicePixelRatio,
  };
});
console.log(`■ C6 probe:mermaid のラスタ表示は成立するか(ノード ${NODES})\n`);
if (!shape) { console.log('⛔ mermaid が描画されていない ── probe 無効'); await browser.close(); server.close(); process.exit(1); }
console.log('【① SVG の形】');
console.log(`   要素数            ${shape.elements}`);
console.log(`   foreignObject     ${shape.foreignObjects}  ${shape.foreignObjects > 0 ? '🔴 ← これがあると drawImage で描けない' : '(無し)'}`);
console.log(`   <image>           ${shape.images}`);
console.log(`   直列化サイズ      ${(shape.serializedBytes / 1024).toFixed(1)} KB`);
console.log(`   表示サイズ        ${shape.cssW}×${shape.cssH} css px (dpr ${shape.dpr})`);

// 実際に描いてみる(成立性は「理屈」ではなく「描けたか」で判定する)
const raster = await page.evaluate(async () => {
  const svg = document.querySelector('.pkc-mermaid-rendered svg');
  if (!svg) return { ok: false, reason: 'no svg' };
  const r = svg.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const clone = svg.cloneNode(true);
  clone.setAttribute('width', String(Math.max(1, Math.round(r.width))));
  clone.setAttribute('height', String(Math.max(1, Math.round(r.height))));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, cv.width, cv.height);
    // 🔴 白紙判定:描けたつもりで真っ白、が最悪(silent fail)。画素を見る。
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let nonBlank = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      if (d[i + 3] !== 0 && !(d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250)) nonBlank += 1;
    }
    let pngBytes = -1;
    try {
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      pngBytes = blob ? blob.size : -1;
    } catch (e) { pngBytes = -2; }
    return {
      ok: true, nonBlankSamples: nonBlank, sampled: Math.floor(d.length / (4 * 97)),
      pngBytes, canvasW: cv.width, canvasH: cv.height,
    };
  } catch (e) {
    return { ok: false, reason: String(e && e.message ? e.message : e) };
  } finally {
    URL.revokeObjectURL(url);
  }
});
console.log('\n【② 実際に描けたか】');
if (!raster.ok) {
  console.log(`   🔴 描けない: ${raster.reason}`);
} else {
  const ratio = raster.sampled ? (raster.nonBlankSamples / raster.sampled) : 0;
  console.log(`   canvas            ${raster.canvasW}×${raster.canvasH}`);
  console.log(`   PNG               ${(raster.pngBytes / 1024).toFixed(1)} KB`);
  console.log(`   非白画素の割合    ${(ratio * 100).toFixed(1)}%  ${ratio < 0.005 ? '🔴 ← ほぼ白紙。描けたつもりで中身が無い' : '(中身あり)'}`);
}

// ── ③ **今日の** mermaid 1 枚のコスト ───────────────────────
//
// 🔴 doc の C6 の賞金「mermaid 1 枚 −6.9MB」は、`pendingRoots` が detach 済み
//    DOM を強参照で溜めていた頃の数字である。**その漏れは 2026-07-27 に修正済み**
//    なので、賞金がまだ残っているかを測り直さないと C6 の判断ができない。
//    対照群は「何も描かない」ではなく「同じ本文を ```mermaid-norender ``` で
//    出したもの」── 図以外を全部同じにする。
async function breakdown() {
  await cdp.send('HeapProfiler.enable').catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await page.waitForTimeout(500);
  const js = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : -1));
  const allocators = {};
  try {
    const chunks = [];
    const onData = (e) => chunks.push(...(e.value || []));
    cdp.on('Tracing.dataCollected', onData);
    await cdp.send('Tracing.start', {
      traceConfig: {
        includedCategories: ['disabled-by-default-memory-infra'],
        memoryDumpConfig: { triggers: [{ mode: 'detailed', periodic_interval_ms: 100 }] },
      },
      transferMode: 'ReportEvents',
    });
    await page.waitForTimeout(600);
    const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.end');
    await done;
    cdp.off('Tracing.dataCollected', onData);
    for (const ev of chunks) {
      if (ev.name !== 'periodic_interval' || !ev.args?.dumps?.allocators) continue;
      if (ev.ph !== 'v') continue;
      for (const [k, v] of Object.entries(ev.args.dumps.allocators)) {
        // ⚠ **16 進文字列である**。`Number(hex, 16)` は radix を無視して
        //   `1.9e+254 MB` のような無意味な値を返す(この probe で実際に出した)。
        //   `renderer-memory-breakdown.mjs` と同じく `parseInt(v, 16)` を使う。
        const size = parseInt(String(v?.attrs?.effective_size?.value ?? v?.attrs?.size?.value ?? '0'), 16) || 0;
        if (size <= 0) continue;
        const top = k.split('/')[0];
        allocators[top] = Math.max(allocators[top] ?? 0, size);
      }
    }
  } catch { /* 取れなければ空 */ }
  return { jsHeap: js, allocators };
}

async function seedAndOpen(fence) {
  await page.goto(URL_);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(async ({ src, fenceName }) => {
    const T = '2026-07-01T00:00:00.000Z';
    const body = '# 図\n\n```' + fenceName + '\n' + src + '\n```\n';
    const cont = {
      meta: { container_id: 'mraster', title: 'mr', created_at: T, updated_at: T, schema_version: 1 },
      entries: [{ lid: 'M', title: 'Mermaid', archetype: 'text', body, created_at: T, updated_at: T }],
      relations: [], revisions: [], assets: {},
    };
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    await new Promise((res, rej) => {
      const t = db.transaction(['containers'], 'readwrite');
      const s = t.objectStore('containers'); s.clear();
      s.put(cont, 'mraster'); s.put('mraster', '__default__');
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
    db.close();
  }, { src: diagram(NODES), fenceName: fence });
  await page.goto(URL_);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="M"]').first().click();
  if (fence === 'mermaid') {
    await page.waitForFunction(
      () => document.querySelector('.pkc-mermaid-rendered svg') !== null,
      null, { timeout: 60000 },
    ).catch(() => {});
  }
  await page.waitForTimeout(1500);
  return page.evaluate(() => document.querySelectorAll('.pkc-mermaid-rendered svg').length);
}

console.log('\n【③ 今日の mermaid 1 枚のコスト(対照群 = 同じ本文の norender fence)】');
const offSvg = await seedAndOpen('mermaid-norender');
const off = await breakdown();
const onSvg = await seedAndOpen('mermaid');
const on = await breakdown();
console.log(`   描画された SVG    norender ${offSvg} 枚 / mermaid ${onSvg} 枚`
  + `${onSvg === 0 ? '  🔴 描けていない ── この腕は無効' : ''}`);
console.log('   allocator          norender        描画あり          差');
for (const k of ['v8', 'blink_gc', 'partition_alloc', 'malloc', 'skia', 'cc']) {
  const b = off.allocators[k] ?? 0;
  const a = on.allocators[k] ?? 0;
  if (b === 0 && a === 0) continue;
  console.log(
    `   ${k.padEnd(17)} ${(b / 1048576).toFixed(1).padStart(9)} MB ${(a / 1048576).toFixed(1).padStart(11)} MB `
    + `${((a - b) / 1048576).toFixed(1).padStart(8)} MB`,
  );
}
console.log(
  `   ${'JS heap'.padEnd(17)} ${(off.jsHeap / 1048576).toFixed(1).padStart(9)} MB `
  + `${(on.jsHeap / 1048576).toFixed(1).padStart(11)} MB ${((on.jsHeap - off.jsHeap) / 1048576).toFixed(1).padStart(8)} MB`,
);
console.log('\n   ⚠ JS heap 単独で「減った / 減らない」を言わない(2026-07-27 の反省)。');
console.log('   ⚠ 差が誤差の範囲なら「効果なし」ではなく**未確定** ── 計測タスクとして残す。');
console.log('   ⚠ norender 側は mermaid module 自体を読み込まないので、差には');
console.log('     「module の評価コスト」も混ざる。図そのものの取り分ではない。');

await browser.close();
server.close();
