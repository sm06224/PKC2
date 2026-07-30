/* eslint-disable */
/**
 * **ランチャー 100 件でスクロールを発生させて暴走を再現する**(2026-07-30)。
 *
 * ## 前回の試験は成立していなかった(user 指摘)
 *
 * `launcher-render-loop-probe.mjs` は **8 タイル**しか置いていなかった。
 * user 指摘:「ランチャー登録数が少なすぎる / 100 は登録してください /
 * **ランチャー画面がスクロールを必要としないと試験の前に想定してください。
 * 意味がない試験になってる**」── 正しい。スクロールが起きない画面で
 * 「スクロールに絡む暴走」を探していた。0 件という結果は**無関係**である。
 *
 * ## この probe が固定する前提
 *
 * 1. **タイル 100 件**(= 実運用の桁)
 * 2. **必ずスクロールが要る**ことを assert してから測る
 *    ── `scrollHeight > clientHeight` を満たさなければ試験を**中止**する
 * 3. **asset は store にだけ置き container.assets は空で起動**する
 *    (= lazy/working-set 経路。ここを通さないと `noteAssetMiss` →
 *      再 render の輪に入らない)
 *
 * ## 見るもの
 *
 * - 無操作での render / dispatch / タイル数の振動(= 暴走)
 * - **タイル 1 枚あたりの DOM ノード数**(user 指摘「DOM や装飾が
 *   複雑すぎるのでは?」への実測。100 枚でいくつになるか)
 * - 常駐 asset 数の上下(= working-set thrash)
 *
 * 使い方: node tests/bench/launcher-100-probe.mjs [--tiles=100] [--seconds=6]
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
const SECONDS = Number(argOf('seconds', '6'));
const DIST = argOf('dist', '/home/user/PKC2/dist/pkc2.html');

const html = readFileSync(DIST);
const server = http.createServer((_q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  r.end(html);
});
await new Promise((r) => server.listen(45903, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45903/pkc2.html';

const LAUNCH = {
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
};

async function trial(label, query, tiles) {
  const b = await chromium.launch(LAUNCH);
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });

    await page.goto(URL_);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
    await page.waitForTimeout(700);

    await page.evaluate(async (n) => {
      const T = '2026-07-01T00:00:00.000Z';
      // 32x32 相当の PNG(実アイコンの桁に寄せる ── 1x1 だと working-set の
      // 予算に一切触れず、thrash 経路を素通りしてしまう)。
      const px =
        'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAWklEQVRYw+3XMQ0AIBAEwQNCcIA'
        + 'AHOAAB0hAAg7QQAIS7pKtZpKrLwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
        + 'AAAAAAAAAAAAAAAADwzwWvVQGBhaVFVQAAAABJRU5ErkJggg==';
      const entries = [];
      for (let i = 0; i < n; i += 1) {
        entries.push({
          lid: `app${i}`, title: `アプリケーション ${i}`, archetype: 'attachment',
          body: JSON.stringify({
            // 🔴 3 つとも必須。1 つでも欠けるとタイルが**未登録セクション**へ
            //   落ち、アイコン解決(= `noteAssetMiss` の経路)を通らない。
            //   最初これを外して「アイコン 0 枚」を測っていた。
            mime: 'text/html',
            registered_as_app: true,
            app_icon_asset_key: `icon${i}`,
            asset_key: `html${i}`,
            name: `app${i}.html`, size: 2048,
          }),
          created_at: T, updated_at: T,
        });
      }
      // 🔴 `container.assets` は**空**で保存する。bytes は assets store に
      //   `${cid}:${key}` で置く ── これが lazy / working-set の実配置で、
      //   ここを通さないと demand-fill(miss → 読み込み → 再 render)に入らない。
      const cont = {
        meta: { container_id: 'l100', title: 'l100', created_at: T, updated_at: T, schema_version: 1 },
        entries, relations: [], revisions: [], assets: {},
      };
      const db = await new Promise((res, rej) => { const q = indexedDB.open('pkc2'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      const names = [...db.objectStoreNames];
      if (!names.includes('assets')) throw new Error('assets store が無い(DB version が古い)');
      await new Promise((res, rej) => {
        const t = db.transaction(['containers', 'assets'], 'readwrite');
        t.objectStore('containers').clear();
        t.objectStore('assets').clear();
        t.objectStore('containers').put(cont, 'l100');
        t.objectStore('containers').put('l100', '__default__');
        const a = t.objectStore('assets');
        for (let i = 0; i < n; i += 1) {
          a.put(px, `l100:icon${i}`);
          a.put(px, `l100:html${i}`);
        }
        t.oncomplete = () => res(); t.onerror = () => rej(t.error);
      });
      db.close();
    }, tiles);

    await page.goto(URL_ + query);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });

    const btn = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="launcher"]').first();
    if (await btn.count() === 0) return { label, fatal: 'ランチャーのタブが無い' };
    await btn.click();
    await page.waitForTimeout(1500);

    // 🔴 **試験の前提を assert する** ── スクロールが要らない画面で測っても
    //    意味が無い(前回の失敗)。満たさなければ中止して理由を返す。
    const geom = await page.evaluate(() => {
      const tiles = document.querySelectorAll('[data-pkc-region="launcher-tile-wrap"]');
      const view = document.querySelector('[data-pkc-region="launcher-view"]');
      // ランチャーの実スクローラを探す(view 自身か祖先)。
      let sc = view;
      while (sc && sc.scrollHeight <= sc.clientHeight + 1) sc = sc.parentElement;
      const one = tiles[0];
      return {
        tiles: tiles.length,
        nodesTotal: view ? view.querySelectorAll('*').length : 0,
        nodesPerTile: one ? one.querySelectorAll('*').length + 1 : 0,
        scrollHeight: sc ? Math.round(sc.scrollHeight) : 0,
        clientHeight: sc ? Math.round(sc.clientHeight) : 0,
        scrollable: !!sc,
      };
    });
    if (!geom.scrollable) {
      return { label, fatal: `スクロールが発生していない(タイル ${geom.tiles} 枚)── 試験の前提が崩れている`, geom };
    }
    if (geom.tiles !== tiles) {
      return { label, fatal: `登録タイルが ${geom.tiles} 枚しか出ていない(${tiles} 枚のはず)── fixture が未登録セクションへ落ちている`, geom };
    }

    // 計測開始 ── ここから完全に無操作。
    await page.evaluate(() => {
      const w = window;
      w.__mut = 0; w.__tiles = []; w.__assets = [];
      const root = document.getElementById('pkc-root');
      w.__obs = new MutationObserver((recs) => {
        for (const r of recs) if (r.type === 'childList') w.__mut += 1;
      });
      w.__obs.observe(root, { childList: true, subtree: true });
      w.__tick = setInterval(() => {
        w.__tiles.push(document.querySelectorAll('[data-pkc-region="launcher-tile-wrap"]').length);
        w.__assets.push(document.querySelectorAll('[data-pkc-region="launcher-tile-wrap"] img').length);
      }, 250);
    });
    await page.waitForTimeout(SECONDS * 1000);
    const r = await page.evaluate(() => {
      clearInterval(window.__tick); window.__obs.disconnect();
      const flips = (a) => a.filter((v, i) => i > 0 && v !== a[i - 1]).length;
      const t = window.__tiles; const im = window.__assets;
      return {
        mut: window.__mut,
        tileRange: `${Math.min(...t)}〜${Math.max(...t)}`, tileFlips: flips(t),
        imgRange: `${Math.min(...im)}〜${Math.max(...im)}`, imgFlips: flips(im),
      };
    });
    return { label, geom, ...r, errors: [...new Set(errors)].slice(0, 2) };
  } finally {
    await b.close();
    await new Promise((r) => setTimeout(r, 700));
  }
}

const ARMS = [
  ['既定(全 OFF)', ''],
  ['窓化 ON', '?pkc-flag=center.block_window=true'],
  ['サイドバー窓化 OFF', '?pkc-flag=sidebar.virtual_list=false'],
];

console.log(`■ ランチャー ${TILES} 枚・無操作 ${SECONDS} 秒(スクロール発生を前提に assert)\n`);
for (const [label, q] of ARMS) {
  const r = await trial(label, q, TILES);
  if (r.fatal) {
    console.log(`   ${label}\n      🔴 ${r.fatal}`);
    if (r.geom) console.log(`      (scrollHeight ${r.geom.scrollHeight} / clientHeight ${r.geom.clientHeight})`);
    continue;
  }
  const g = r.geom;
  console.log(`   ${label}`);
  console.log(`      タイル ${g.tiles} 枚 / スクロール ${g.scrollHeight}px(表示 ${g.clientHeight}px)`);
  console.log(`      DOM: 合計 ${g.nodesTotal} ノード、1 枚あたり ${g.nodesPerTile}`);
  console.log(`      無操作 ${SECONDS}s: DOM 変化 ${r.mut} 回、タイル数 ${r.tileRange}(振動 ${r.tileFlips})、`
    + `アイコン ${r.imgRange}(振動 ${r.imgFlips})`);
  if (r.errors.length) console.log(`      🔴 例外: ${r.errors.join(' / ')}`);
  const bad = r.mut > 20 || r.tileFlips > 0 || r.imgFlips > 0;
  console.log(`      ${bad ? '🔴 無操作なのに動いている' : '✅ 静止している'}`);
}
console.log('\n   ⚠ アイコン数が振動していれば working-set の thrash(読んでは捨てる)。');

server.close();
