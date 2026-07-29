/* eslint-disable */
/**
 * **contact sheet のサムネイルは原寸を decode しているのか**を測る(C6-b、2026-07-29)。
 *
 * `renderer.ts:7769` は `img.src = dataUrl` に**原寸の画像**を入れ、表示は CSS の
 * `--filer-thumb-px`(既定 ~160px)で縮めている。ブラウザは**表示サイズではなく
 * 内在サイズで decode する**ので、4000×3000 の写真 1 枚で 48MB の展開後
 * ビットマップになる。100 枚並べれば桁が変わる ── というのが仮説。
 *
 * ## mermaid(C6-a)とは状況が違う
 *
 * mermaid では「SVG は見えているタイルだけ焼く」という**失うと損な機構**があった。
 * `<img>` にそれは無い ── 既にラスタであり、**表示より多く decode している分は
 * 純粋な無駄**である。だから縮小は効くはず。**「はず」を測る。**
 *
 * ## 腕
 *
 * | 腕 | 内容 |
 * |---|---|
 * | full | 現行(原寸 data URL を `<img>` に入れて CSS で縮小) |
 * | thumb | 表示サイズ × dpr へ**縮小した PNG** を入れる |
 *
 * 🔴 1 試行 = 1 ブラウザ、腕は交互、最初と最後に同じ腕を置いてドリフトを出す
 *    (C6-a で「1 ブラウザで順に回して累積を見ていた」失敗を踏んだため)。
 *
 * ## 🔴 現状:**未完成**。contact sheet を開く経路がまだ当たっていない
 *
 * 2 回試して 2 回とも `表示された画像 0 枚` = **腕が無効**のまま。
 * `?pkc-filer=contact-sheet` も `__pkc2Dispatch` も view-mode ボタンの実クリックも
 * 効いていない。**この状態の数字は使ってはいけない**(renderer USS の差 28.8MB は
 * 画像の decode ではなく asset バイト列の差でしかない)。
 *
 * 観測点(`shown === 0` なら「この腕は無効」と印字)がそれを検出している。
 * **次にやること**は数字を増やすことではなく、**contact sheet を開く正しい導線を
 * 特定すること**:
 *   - `tests/smoke/contact-sheet-object-fit-parity.spec.ts` が実際に開けている
 *     ので、その seed と操作をそのまま持ってくる(推測しない)
 *   - profile の auto-detect(画像 7 割)が effective になる条件も要確認
 *
 * ⚠ **当て推量で経路を変えて数字だけ眺める、を繰り返さない。**
 *   本セッションで最も高くついた失敗がそれだった。
 *
 * 使い方: node tests/bench/contact-sheet-thumb-probe.mjs [--images=40] [--px=1600] [--repeat=2]
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
const IMAGES = Number(argOf('images', '40'));
const PX = Number(argOf('px', '1600'));      // 元画像の 1 辺
const THUMB = Number(argOf('thumb', '160')); // 表示サイズ(--filer-thumb-px 相当)
const REPEAT = Number(argOf('repeat', '2'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, 'dist', p === '/' ? 'pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45891, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45891/pkc2.html';

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
    out[type] = out[type] || { pss: 0, uss: 0 };
    out[type].pss += num('Pss');
    out[type].uss += num('Private_Clean') + num('Private_Dirty');
  }
  return out;
}

const LAUNCH = {
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
};

/** 1 試行 = 1 ブラウザ。`arm` は 'full' | 'thumb'。 */
async function trial(arm) {
  const b = await chromium.launch(LAUNCH);
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL_);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
    await page.waitForTimeout(800);

    // 画像は**ページ内で生成**する(外部 fixture を持ち込まない)。
    // ノイズ入りにして PNG が潰れないようにする ── 単色だと圧縮が効きすぎて
    // 「decode 量」の議論にならない。
    const info = await page.evaluate(async ({ n, px, thumb, mode }) => {
      function makePng(size, seed) {
        const cv = document.createElement('canvas');
        cv.width = size; cv.height = size;
        const g = cv.getContext('2d');
        const img = g.createImageData(size, size);
        let s = seed >>> 0;
        for (let i = 0; i < img.data.length; i += 4) {
          s = (s * 1664525 + 1013904223) >>> 0;
          img.data[i] = s & 255;
          img.data[i + 1] = (s >> 8) & 255;
          img.data[i + 2] = (s >> 16) & 255;
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        return cv.toDataURL('image/png');
      }
      async function downscale(dataUrl, side) {
        const im = new Image();
        im.src = dataUrl;
        await im.decode();
        const cv = document.createElement('canvas');
        cv.width = side; cv.height = side;
        cv.getContext('2d').drawImage(im, 0, 0, side, side);
        return cv.toDataURL('image/png');
      }
      const assets = {};
      const entries = [];
      let fullBytes = 0; let usedBytes = 0;
      for (let i = 0; i < n; i += 1) {
        const orig = makePng(px, i + 1);
        fullBytes += orig.length;
        const use = mode === 'thumb'
          ? await downscale(orig, Math.round(thumb * (window.devicePixelRatio || 1)))
          : orig;
        usedBytes += use.length;
        const key = `k${i}`;
        assets[key] = use.slice(use.indexOf(',') + 1);
        entries.push({
          lid: `img${i}`, title: `写真 ${i}`, archetype: 'attachment',
          body: JSON.stringify({ mime: 'image/png', asset_key: key, name: `p${i}.png` }),
          created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
        });
      }
      const T = '2026-07-01T00:00:00.000Z';
      const cont = {
        meta: { container_id: 'cs', title: 'cs', created_at: T, updated_at: T, schema_version: 1 },
        entries, relations: [], revisions: [], assets,
      };
      const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
      await new Promise((res, rej) => {
        const t = db.transaction(['containers'], 'readwrite');
        const s = t.objectStore('containers'); s.clear();
        s.put(cont, 'cs'); s.put('cs', '__default__');
        t.oncomplete = () => res(); t.onerror = () => rej(t.error);
      });
      db.close();
      return { fullBytes, usedBytes };
    }, { n: IMAGES, px: PX, thumb: THUMB, mode: arm });

    // filer の contact-sheet を開く。
    // ⚠ 初稿は `?pkc-filer=contact-sheet` と `__pkc2Dispatch` を**当て推量**で
    //   使い、画像 0 枚のまま数字を出しかけた(ガードで検出)。
    //   実際の導線は **view-mode ボタンを実クリック**である。
    //   profile は auto-detect(画像が 7 割以上なら contact-sheet)なので、
    //   全件画像の fixture なら自動で contact-sheet になる。
    await page.goto(URL_);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
    await page.waitForTimeout(600);
    const btn = page.locator('[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]').first();
    if (await btn.count() > 0) {
      await btn.click();
    } else {
      // ボタンが見つからない構成では keymap(Alt+4 = filer)へ落ちる
      await page.keyboard.press('Alt+4');
    }
    await page.waitForTimeout(1200);
    // 観測点:画像が実際に出ているか(出ていなければこの腕は無効)
    const shown = await page.evaluate(
      () => document.querySelectorAll('.pkc-filer-card-thumb img').length,
    );
    await page.waitForTimeout(2500);
    return { info, shown, mem: processMemory() };
  } finally {
    await b.close();
    await new Promise((r) => setTimeout(r, 1200));
  }
}

console.log(`■ contact sheet のサムネイル(${IMAGES} 枚 × ${PX}×${PX} → 表示 ${THUMB}px、${REPEAT} 回)\n`);
const ARMS = ['full', 'thumb'];
const res = Object.fromEntries(ARMS.map((a) => [a, []]));
for (let i = 0; i < REPEAT; i += 1) for (const a of ARMS) res[a].push(await trial(a));
const drift = await trial('full');

const med = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
console.log('   腕      表示された画像   asset 総バイト   renderer USS   合計 USS');
for (const a of ARMS) {
  const r = res[a];
  const shown = r[r.length - 1].shown;
  const bytes = r[r.length - 1].info.usedBytes;
  const rend = med(r.map((x) => (x.mem.renderer?.uss ?? 0) / 1024));
  const tot = med(r.map((x) => Object.values(x.mem).reduce((s, v) => s + v.uss, 0) / 1024));
  console.log(
    `   ${a.padEnd(7)} ${String(shown).padStart(12)} ${(bytes / 1048576).toFixed(1).padStart(14)} MB `
    + `${rend.toFixed(1).padStart(11)} MB ${tot.toFixed(1).padStart(9)} MB`
    + `${shown === 0 ? '  🔴 画像が出ていない ── この腕は無効' : ''}`,
  );
}
const rf = med(res.full.map((x) => (x.mem.renderer?.uss ?? 0) / 1024));
const rt = med(res.thumb.map((x) => (x.mem.renderer?.uss ?? 0) / 1024));
const d0 = Object.values(res.full[0].mem).reduce((s, v) => s + v.uss, 0) / 1024;
const d1 = Object.values(drift.mem).reduce((s, v) => s + v.uss, 0) / 1024;
console.log(`\n   renderer USS の差(thumb − full): ${(rt - rf).toFixed(1)} MB`);
console.log(`   ドリフト(同じ full 腕を最初と最後): ${Math.abs(d1 - d0).toFixed(1)} MB`);
console.log('   🔴 この幅より小さい差は未確定として扱う。');

await server.close();
