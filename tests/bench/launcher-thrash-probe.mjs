/* eslint-disable */
/**
 * **working-set の thrash(読んでは捨てる)を狙って再現する**(2026-07-30)。
 *
 * user 報告:「ランチャーが暴走 / HTML をロードして一部表示して消えて、また
 * 表示されてを繰り返す / **sqlite がオンの時に発生する**」。
 *
 * ## ここまでで潰した可能性(いずれも再現せず)
 *
 * - タイル 8 枚 → **試験が成立していなかった**(スクロール無し)
 * - タイル 100 枚 + スクロール、idb / sqlite 両方 → 無操作で静止
 * - boot の窓を navigation から観測 → ready は 1 回、収束
 *
 * ## 残っていた未検証の変数:**asset の大きさ**
 *
 * ここまでの fixture はアイコンが ~100 バイトだった。実運用の HTML アプリは
 * 桁が違う。`asset-working-set.ts` を読むと thrash の条件が書いてある:
 *
 *   - 常駐 bytes が `budgetBytes`(既定 **48MB**)を超えると evict する
 *   - ただし **`needed` に入っているキーは evict しない**
 *   - `needed` = 「選択中 entry の依存」+「直前の render で miss したキー」
 *
 * つまり **`needed` が狭い refresh**(= entry を選ぶ)が挟まると、ランチャーの
 * 100 個のアイコンは *evict 可能* になる。捨てた直後に launcher を描くと
 * 100 個 miss → 読み直し → また予算超過 → 次の refresh で捨てる …
 * = **読んでは捨てるの往復**。画面では「アイコンが出て、消えて、また出る」。
 *
 * sqlite だと悪化しうる理由:読み出しが worker RPC(非同期・1 件ずつ)なので、
 * 往復 1 周が長い = 目に見える時間ずっと出たり消えたりする。
 *
 * ## 測り方
 *
 * アイコンを大きくして**合計を予算超えにし**、ランチャーを開いたうえで
 * **entry を選ぶ**(= 狭い needed の refresh を起こす)。その後は無操作で
 * アイコン数の時系列を見る。振動すれば再現。
 *
 * 使い方: node tests/bench/launcher-thrash-probe.mjs [--tiles=100] [--kb=600]
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { readFileSync } from 'node:fs';

const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const TILES = Number(argOf('tiles', '100'));
const KB = Number(argOf('kb', '600'));
const SECONDS = Number(argOf('seconds', '10'));
const DIST = argOf('dist', '/home/user/PKC2/dist/pkc2.html');

const html = readFileSync(DIST);
const server = http.createServer((_q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  r.end(html);
});
await new Promise((r) => server.listen(45911, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45911/pkc2.html';

const LAUNCH = {
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
};

async function run(label, query) {
  const b = await chromium.launch(LAUNCH);
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 130)));

    await page.goto(URL_ + query);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 90000 });
    await page.waitForTimeout(900);
    const engine = await page.evaluate(() => globalThis.__pkc2StorageEngine ?? null);
    if (query.includes('sqlite_backend=true') && engine?.kind !== 'wasm-sqlite') {
      return { label, fatal: `sqlite を要求したのに ${engine?.kind} で動いている` };
    }

    const seeded = await page.evaluate(async ({ n, kb }) => {
      const T = '2026-07-01T00:00:00.000Z';
      // 有効な PNG のあとに巨大な base64 を足しても画像として壊れるので、
      // **アイコンは小さい実 PNG**、**本体 HTML を大きく**する。
      // working-set の予算は本体側で超えさせる ── 実運用と同じ形
      // (アプリの中身が重く、アイコンは軽い)。
      // 🔴 **PNG を手書きの base64 定数で持たない。** この probe で実際に
      //   踏んだ ── 埋め草の `A` の個数を打ち間違えて長さが 4 の倍数で
      //   なくなり、idb は素通り(復号しない)/ sqlite だけ `atob` で落ちる、
      //   という「片方の backend でだけ壊れる fixture」になった。
      //   canvas から作れば常に妥当。
      const px = (() => {
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const g = c.getContext('2d');
        g.fillStyle = '#4488cc'; g.fillRect(0, 0, 32, 32);
        return c.toDataURL('image/png').split(',')[1];
      })();
      // 🔴 **必ず妥当な base64 にする。** sqlite backend は保存時に `atob` で
      //   復号するので、適当な繰り返し文字列だと `InvalidCharacterError` で
      //   落ちる(実際 idb だけ通って sqlite で落ちた ── 片方だけ通る
      //   fixture は「片方を測っていない」のと同じ)。
      const big = btoa('x'.repeat(Math.floor((kb * 1024 * 3) / 4)));
      const entries = [];
      for (let i = 0; i < n; i += 1) {
        entries.push({
          lid: `app${i}`, title: `アプリケーション ${i}`, archetype: 'attachment',
          body: JSON.stringify({
            mime: 'text/html', registered_as_app: true,
            app_icon_asset_key: `icon${i}`, asset_key: `html${i}`,
            name: `app${i}.html`, size: kb * 1024,
          }),
          created_at: T, updated_at: T,
        });
      }
      entries.push({
        lid: 'doc', title: 'ふつうのノート', archetype: 'text',
        body: '# ノート\n\n本文。\n', created_at: T, updated_at: T,
      });
      const cont = {
        meta: { container_id: 'th', title: 'th', created_at: T, updated_at: T, schema_version: 1 },
        entries, relations: [], revisions: [], assets: {},
      };
      const store = window.__pkc2StoreDebug;
      await store.clearAll();
      await store.save(cont);
      await store.setDefaultContainer('th');
      for (let i = 0; i < n; i += 1) {
        await store.saveAsset('th', `icon${i}`, px);
        await store.saveAsset('th', `html${i}`, big);
      }
      return { totalMB: Math.round((n * kb) / 1024) };
    }, { n: TILES, kb: KB });

    await page.goto(URL_ + query);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 90000 });
    const btn = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="launcher"]').first();
    if (await btn.count() === 0) return { label, fatal: 'ランチャーのタブが無い' };
    await btn.click();
    await page.waitForTimeout(1800);

    const pre = await page.evaluate(() => ({
      tiles: document.querySelectorAll('[data-pkc-region="launcher-tile-wrap"]').length,
      imgs: document.querySelectorAll('[data-pkc-region="launcher-tile-wrap"] img').length,
    }));
    if (pre.tiles !== TILES) return { label, fatal: `タイルが ${pre.tiles} 枚しか出ていない` };
    // 🔴 **点火の前にアイコンが出ていること**を確かめる ── 出ていない状態から
    //    測ると「振動なし」が「もともと何も無い」を意味してしまう(実際
    //    idb の腕がアイコン 0 枚のまま「静止」と出た)。
    if (pre.imgs === 0) {
      return { label, fatal: `点火前にアイコンが 1 枚も出ていない(タイル ${pre.tiles} 枚)── 振動の有無を判定できない` };
    }

    // 🔴 **狭い needed の refresh を起こす** ── ここが仮説の点火。
    //    entry を選ぶと `selectionDeps()` だけが needed になり、
    //    ランチャーのアイコン群が evict 可能になる。
    const row = page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="doc"]').first();
    const fired = await row.count() > 0;
    if (fired) await row.click();
    await page.waitForTimeout(400);
    // ランチャーに戻す(選択で detail に行っていても)
    if (await btn.count() > 0) await btn.click();

    // ここから無操作で観測。
    await page.evaluate(() => {
      const w = window;
      w.__s = [];
      w.__iv = setInterval(() => {
        w.__s.push({
          imgs: document.querySelectorAll('[data-pkc-region="launcher-tile-wrap"] img').length,
          tiles: document.querySelectorAll('[data-pkc-region="launcher-tile-wrap"]').length,
          resident: Object.keys(window.__pkc2StoreDebug ? {} : {}).length,
        });
      }, 200);
    });
    await page.waitForTimeout(SECONDS * 1000);
    const r = await page.evaluate(() => {
      clearInterval(window.__iv);
      const s = window.__s;
      const flips = (k) => s.filter((v, i) => i > 0 && v[k] !== s[i - 1][k]).length;
      const rng = (k) => `${Math.min(...s.map((x) => x[k]))}〜${Math.max(...s.map((x) => x[k]))}`;
      return { imgs: rng('imgs'), imgFlips: flips('imgs'), tiles: rng('tiles'), tileFlips: flips('tiles') };
    });
    return { label, engine, seeded, fired, ...r, errors: [...new Set(errors)].slice(0, 2) };
  } finally {
    await b.close();
    await new Promise((r) => setTimeout(r, 800));
  }
}

console.log(`■ working-set thrash 狙い(タイル ${TILES} 枚 × 本体 ${KB}KB、予算 48MB)\n`);
for (const [label, q] of [['idb', ''], ['🔴 sqlite', '?pkc-flag=storage.sqlite_backend=true']]) {
  const r = await run(label, q);
  if (r.fatal) { console.log(`   ${label}: 🔴 ${r.fatal}\n`); continue; }
  console.log(`   ${label}  [${r.engine?.kind}]  asset 合計 ${r.seeded.totalMB}MB / 予算 48MB`);
  console.log(`      選択イベント発火: ${r.fired ? 'ok' : '🔴 撃てず'}`);
  console.log(`      アイコン ${r.imgs}(振動 ${r.imgFlips})  タイル ${r.tiles}(振動 ${r.tileFlips})`);
  if (r.errors.length) console.log(`      🔴 例外: ${r.errors.join(' / ')}`);
  console.log(`      ${r.imgFlips > 2 || r.tileFlips > 2 ? '🔴 thrash 再現' : '✅ 静止'}\n`);
}

server.close();
