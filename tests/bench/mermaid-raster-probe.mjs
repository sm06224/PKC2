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

// ② 実際に描いてみる。**3 通り試す**(2026-07-29、user 経由の他エージェント
//    調査を受けて)。原因の診断(foreignObject)は一致したが、
//    「Blob URL ではなく **Data URL** なら通る」という主張は未検証なので、
//    **変数を 1 つずつ変えて**確かめる:
//      (a) Blob URL / foreignObject あり  ← 最初に測った形
//      (b) **Data URL** / foreignObject あり  ← 主張の直接検証
//      (c) Data URL / **foreignObject を除去**  ← `htmlLabels:false` の近似
//    (c) が通れば「foreignObject が原因」が確定し、A 案の実現可能性が立つ。
async function tryRaster(page, mode) {
  return page.evaluate(async (m) => {
    const svg = document.querySelector('.pkc-mermaid-rendered svg');
    if (!svg) return { mode: m, ok: false, reason: 'no svg' };
    const r = svg.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const clone = svg.cloneNode(true);
    clone.setAttribute('width', String(Math.max(1, Math.round(r.width))));
    clone.setAttribute('height', String(Math.max(1, Math.round(r.height))));
    if (m === 'data-nofo') {
      // foreignObject を落とす(中の文字は消えるが、汚染の原因切り分けが目的)
      for (const fo of Array.from(clone.querySelectorAll('foreignObject'))) fo.remove();
    }
    const xml = new XMLSerializer().serializeToString(clone);
    const url = m === 'blob'
      ? URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0, cv.width, cv.height);
      let nonBlank = 0; let sampled = 0;
      let readErr = '';
      try {
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 0; i < d.length; i += 4 * 97) {
          sampled += 1;
          if (d[i + 3] !== 0 && !(d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250)) nonBlank += 1;
        }
      } catch (e) { readErr = String(e && e.message ? e.message : e); }
      let pngBytes = -1; let exportErr = '';
      try {
        const blob = await new Promise((res, rej) => {
          try { cv.toBlob((b) => res(b)); } catch (e) { rej(e); }
        });
        pngBytes = blob ? blob.size : -1;
      } catch (e) { exportErr = String(e && e.message ? e.message : e); }
      return {
        mode: m, ok: !readErr && !exportErr, readErr, exportErr,
        nonBlank, sampled, pngBytes, canvasW: cv.width, canvasH: cv.height,
      };
    } catch (e) {
      return { mode: m, ok: false, reason: String(e && e.message ? e.message : e) };
    } finally {
      if (m === 'blob') URL.revokeObjectURL(url);
    }
  }, mode);
}

console.log('\n【② 実際に描けたか(3 通り)】');
for (const [label, mode] of [
  ['(a) Blob URL / foreignObject あり', 'blob'],
  ['(b) Data URL / foreignObject あり', 'data'],
  ['(c) Data URL / foreignObject 除去', 'data-nofo'],
]) {
  const res = await tryRaster(page, mode);
  if (res.reason) { console.log(`   ${label.padEnd(36)} 🔴 ${res.reason}`); continue; }
  const ratio = res.sampled ? (res.nonBlank / res.sampled) : 0;
  const verdict = res.ok
    ? `✅ 通る  PNG ${(res.pngBytes / 1024).toFixed(1)} KB / 非白 ${(ratio * 100).toFixed(1)}%`
    : `🔴 遮断  ${(res.readErr || res.exportErr).slice(0, 60)}`;
  console.log(`   ${label.padEnd(36)} ${verdict}`);
}
console.log('   ⚠ (c) は foreignObject を落としているので**文字が消えている**。');
console.log('     見たいのは「汚染の原因が foreignObject か」であって見た目ではない。');

// 🔴 **「通った」と「中身が正しい」は別**。PNG のバイト数が違うだけでは
//    「(b) にラベルの文字が描けている」証明にならない。(b) と (c) を
//    画素で比べ、**差分が foreignObject のラベル領域に出ている**ことを見る。
const diff = await page.evaluate(async () => {
  const svg = document.querySelector('.pkc-mermaid-rendered svg');
  if (!svg) return null;
  const r = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  async function draw(strip) {
    const clone = svg.cloneNode(true);
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    if (strip) for (const fo of Array.from(clone.querySelectorAll('foreignObject'))) fo.remove();
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    return g.getImageData(0, 0, w, h).data;
  }
  const withFo = await draw(false);
  const noFo = await draw(true);
  let differing = 0;
  const total = withFo.length / 4;
  for (let i = 0; i < withFo.length; i += 4) {
    if (Math.abs(withFo[i] - noFo[i]) > 16
      || Math.abs(withFo[i + 1] - noFo[i + 1]) > 16
      || Math.abs(withFo[i + 2] - noFo[i + 2]) > 16) differing += 1;
  }
  return { differing, total, w, h };
});
if (diff) {
  const pct = (diff.differing / diff.total) * 100;
  console.log(`   (b) と (c) の画素差   ${pct.toFixed(2)}%  `
    + `${pct < 0.05 ? '🔴 ← ほぼ同じ = ラベルが描けていない疑い' : '✅ foreignObject の中身が描けている'}`);
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
// ── ④ 製品経路(flag ON)── **3 回叩いて並べる**(2026-07-29 の反省)
//
// 🔴 cc は実行間で ±1.2MB ぶれる。**1 回の測定で「増えた」と書いてはいけない**
//    (`perf-measurement` skill の「反復は同じコマンドを 3 回」を自分で破った)。
// 🔴 さらに**図の形を 2 種類**測る。仮説は「`<img>` は図**全体**の展開後
//    ビットマップを持つが、SVG は compositor が**見えているタイルだけ**
//    ラスタする」── これが正しければ **cc の増分は図の画素面積に比例**し、
//    画面に収まる図では増えないはずである。機構を切り分けずに
//    「ラスタ化は損」と一般化しない。
console.log('\n【④ 製品経路: center.mermaid_raster(3 回 × 図の形 2 種)】');
async function openWith(query) {
  await page.goto(URL_ + query);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="M"]').first().click();
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const wrap = document.querySelector('.pkc-mermaid-rendered');
    const img = wrap?.querySelector('img[data-pkc-mermaid-raster]') ?? null;
    const svg = wrap?.querySelector('svg') ?? null;
    const box = (img || svg)?.getBoundingClientRect();
    return {
      svg: !!svg, img: !!img,
      w: box ? Math.round(box.width) : 0, h: box ? Math.round(box.height) : 0,
      domElements: document.querySelectorAll('.pkc-md-rendered *').length,
    };
  });
}
async function seedShape(src) {
  await page.goto(URL_);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
  await page.waitForTimeout(600);
  await page.evaluate(async (d) => {
    const T = '2026-07-01T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'mraster', title: 'mr', created_at: T, updated_at: T, schema_version: 1 },
      entries: [{ lid: 'M', title: 'Mermaid', archetype: 'text', body: '# 図\n\n```mermaid\n' + d + '\n```\n', created_at: T, updated_at: T }],
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
  }, src);
}
/** 横に広がる = 画面に収まりやすい形(縦長の対照)。 */
function wideDiagram(n) {
  const lines = ['graph LR'];
  for (let i = 0; i < n; i += 1) lines.push(`  N${i}["ノード ${i}"] --> N${i + 1}["ノード ${i + 1}"]`);
  return lines.join('\n');
}
const SHAPES = [
  ['縦長 (graph TD)', diagram(NODES)],
  ['横長 (graph LR)', wideDiagram(NODES)],
];
const REPEATS = 3;
for (const [shapeName, src] of SHAPES) {
  await seedShape(src);
  const rows = [];
  for (let r = 0; r < REPEATS; r += 1) {
    const v0 = await openWith('');
    const m0 = await breakdown();
    const v1 = await openWith('?pkc-flag=center.mermaid_raster%3Dtrue');
    const m1 = await breakdown();
    rows.push({ v0, m0, v1, m1 });
  }
  const last = rows[rows.length - 1];
  const px = last.v1.w * last.v1.h;
  console.log(`\n   ── ${shapeName}:表示 ${last.v1.w}×${last.v1.h} = ${(px / 1e6).toFixed(2)}M 画素`
    + ` / 展開後 ≒ ${(px * 4 / 1048576).toFixed(1)} MB`);
  console.log(`      本文 DOM 要素   既定 ${last.v0.domElements} → raster ${last.v1.domElements}`
    + `  (置換 ${last.v1.img ? 'OK' : '🔴 されていない'})`);
  for (const k of ['blink_gc', 'cc', 'partition_alloc', 'malloc']) {
    const diffs = rows.map((x) => ((x.m1.allocators[k] ?? 0) - (x.m0.allocators[k] ?? 0)) / 1048576);
    const sorted = [...diffs].sort((a, b) => a - b);
    console.log(`      ${k.padEnd(16)} 差 ${diffs.map((d) => d.toFixed(1).padStart(6)).join(' /')}`
      + `   中央値 ${sorted[1].toFixed(1)} MB`);
  }
  const jsd = rows.map((x) => (x.m1.jsHeap - x.m0.jsHeap) / 1048576);
  console.log(`      ${'JS heap'.padEnd(16)} 差 ${jsd.map((d) => d.toFixed(1).padStart(6)).join(' /')}`);
}
console.log('\n   ⚠ 3 回の差を並べて中央値で読む。1 回の値で「増えた / 減った」を書かない。');
console.log('   ⚠ 縦長で増えて横長で増えないなら、機構は「img は図全体を展開して持つ」で確定。');

console.log('\n   ⚠ JS heap 単独で「減った / 減らない」を言わない(2026-07-27 の反省)。');
console.log('   ⚠ 差が誤差の範囲なら「効果なし」ではなく**未確定** ── 計測タスクとして残す。');
console.log('   ⚠ norender 側は mermaid module 自体を読み込まないので、差には');
console.log('     「module の評価コスト」も混ざる。図そのものの取り分ではない。');

await browser.close();
server.close();
