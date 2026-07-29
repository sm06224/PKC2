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
 * ## 🔴 現状:**この環境では測れない**(原因は特定済み)
 *
 * 3 回「経路が違うのだろう」と当て推量で直して 3 回とも `表示された画像 0 枚`。
 * 4 回目に**推測をやめて画面の中身を dump** したら、一発で分かった:
 *
 *     phase=ready viewMode=null sidebarRows=5 folderRow=1
 *     filerGrid=1 filerCards=4 thumbs=4
 *     gridClass="pkc-filer-grid pkc-filer-grid-contact-sheet" scopeLid="fld"
 *
 * **contact sheet は正しく開いていた。** 導線は最初から合っていた。
 * 0 だったのは `.pkc-filer-card-thumb` の中に `img` が**生成されない**から
 * ── `pickImageAssetForEntry` が null を返し、アイコンの fallback
 * (`pkc-filer-card-thumb-fallback`)になっている。
 *
 * つまり **IDB に inline で入れた `container.assets` が描画時に解決されない**。
 * そして重要なのは、これが**この branch の問題ではない**こと:
 * `tests/smoke/contact-sheet-object-fit-parity.spec.ts` は
 * **main でも dev でも落ちている**(既存 39 件の失敗のひとつ)。
 * 本 probe はその根本原因を独立に再現しただけである。
 *
 * ⇒ **C6-b の計測は、この既存の失敗を先に解くまで成立しない。**
 *    順序は「画像が出ない既存問題の hotfix」→「C6-b の計測」→「実装」。
 *    CLAUDE.md PR 運用 3(既存問題は別 hotfix)に従い、本 branch では触らない。
 *
 * ⚠ **教訓**: 3 回目の空振りの前に dump すべきだった。
 *   「経路が違うのだろう」は仮説であって、確かめずに直し続けたのが誤り。
 *   **観測点が 0 を返したら、次の一手は修正ではなく観察。**
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
    await page.goto(`${URL_}?pkc-flag=sidebar.mode=tree`);
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
      const T0 = '2026-07-01T00:00:00.000Z';
      // 🔴 contact-sheet は **フォルダの frontmatter `display_profile_kind`** で
      //   決まり、中身は **structural relation** でぶら下げる。
      //   root に平置きしても開かない(初稿の 0 枚の原因)。
      const entries = [{
        lid: 'fld', title: '写真フォルダ', archetype: 'folder',
        body: '---\ndisplay_profile_kind: contact-sheet\n---\n',
        created_at: T0, updated_at: T0,
      }];
      const relations = [];
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
          body: JSON.stringify({ mime: 'image/png', asset_key: key, name: `p${i}.png`, size: 100 }),
          created_at: T0, updated_at: T0,
        });
        relations.push({
          id: `r${i}`, from: 'fld', to: `img${i}`, kind: 'structural',
          created_at: T0, updated_at: T0,
        });
      }
      const T = '2026-07-01T00:00:00.000Z';
      const cont = {
        meta: { container_id: 'cs', title: 'cs', created_at: T, updated_at: T, schema_version: 1 },
        entries, relations, revisions: [], assets,
      };
      const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
      await new Promise((res, rej) => {
        const t = db.transaction(['containers', 'assets'], 'readwrite');
        t.objectStore('containers').clear();
        t.objectStore('assets').clear();
        t.objectStore('containers').put(cont, 'cs');
        t.objectStore('containers').put('cs', '__default__');
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
    await page.goto(`${URL_}?pkc-flag=sidebar.mode=tree`);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
    // フォルダを選んで scope に入る → filer タブへ(smoke spec と同じ導線)
    const row = page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item[data-pkc-lid="fld"]').first();
    await row.waitFor({ state: 'visible', timeout: 30000 });
    await row.click();
    await page.waitForTimeout(400);
    await page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]').first().click();
    await page.locator('[data-pkc-region="filer-grid"]').first()
      .waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // 観測点:画像が実際に出ているか(出ていなければこの腕は無効)
    const shown = await page.evaluate(
      () => document.querySelectorAll('.pkc-filer-card-thumb img').length,
    );
    if (shown === 0) {
      // 🔴 **推測で経路を変えない。画面の中身を出す。**
      const dump = await page.evaluate(() => {
        const root = document.getElementById('pkc-root');
        const q = (sel) => document.querySelectorAll(sel).length;
        return {
          phase: root?.getAttribute('data-pkc-phase'),
          viewMode: root?.getAttribute('data-pkc-view-mode'),
          sidebarRows: q('[data-pkc-region="entry-list"] li.pkc-entry-item'),
          folderRow: q('[data-pkc-region="entry-list"] li[data-pkc-lid="fld"]'),
          filerGrid: q('[data-pkc-region="filer-grid"]'),
          filerCards: q('.pkc-filer-card'),
          thumbs: q('.pkc-filer-card-thumb'),
          filerEmpty: document.querySelector('[data-pkc-region="filer-empty"]')?.textContent ?? null,
          gridClass: document.querySelector('[data-pkc-region="filer-grid"]')?.className ?? null,
          scopeLid: document.querySelector('.pkc-filer')?.getAttribute('data-pkc-filer-scope-lid') ?? null,
          entryCount: (() => { try { return document.querySelectorAll('[data-pkc-lid]').length; } catch { return -1; } })(),
        };
      });
      console.log(`   [診断 ${arm}]`, JSON.stringify(dump));
    }
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
