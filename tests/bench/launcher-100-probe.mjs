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

    // 🔴 **seed も測定と同じ flag で開く。** flag 無しで開いて seed すると
    //   idb の store に書くことになり、sqlite の腕はそのデータを見られない。
    await page.goto(URL_ + query);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
    await page.waitForTimeout(900);

    // 🔴 **この腕が本当にそのエンジンで動いているかを先に確かめる。**
    //   flag を立てても `file://` や OPFS 不可の環境では**黙って idb へ
    //   落ちる**(2026-07-28 実測、commit 3f19821a)。確かめずに測ると
    //   「sqlite でも同じでした」という**嘘の結論**になる。
    const engine = await page.evaluate(() => globalThis.__pkc2StorageEngine ?? null);
    const wantSqlite = query.includes('storage.sqlite_backend=true');
    if (wantSqlite && engine?.kind !== 'wasm-sqlite') {
      return {
        label,
        fatal: `sqlite を要求したのに ${engine?.kind ?? '(不明)'} で動いている`
          + `${engine?.requestedButUnavailable ? ` ── ${engine.requestedButUnavailable}` : ''}`,
      };
    }

    // 🔴 **seed は「動いている store」経由で書く**(2026-07-30)。
    //   IndexedDB を直に叩く seed は **idb backend 専用**である ── sqlite は
    //   OPFS(SAHPool)に置くので、直書きしたデータは sqlite 側からは
    //   存在しない。最初これで sqlite の腕を回して「差が無い」と読んでいたが、
    //   その腕は**そもそも sqlite のデータを見ていなかった**。
    //   `__pkc2StoreDebug` は main.ts が公開している実 store なので、
    //   どの backend が有効でもそこへ書ける。
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
      const store = window.__pkc2StoreDebug;
      if (!store) throw new Error('__pkc2StoreDebug が無い(seed 経路が使えない)');
      await store.clearAll();
      await store.save(cont);
      await store.setDefaultContainer('l100');
      for (let i = 0; i < n; i += 1) {
        await store.saveAsset('l100', `icon${i}`, px);
        await store.saveAsset('l100', `html${i}`, px);
      }
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
      // 仮説の観測点:container が読み直されるたび working-set は破棄される
      // (`asset-working-set.ts` が CONTAINER_LOADED で cache.clear())。
      // それが繰り返されていれば「アイコンが消えてまた出る」になる。
      w.__loads = 0;
      w.__ev = (e) => { w.__loads += 1; };
      document.addEventListener('pkc:container-loaded', w.__ev, true);
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
    return { label, geom, engine, ...r, errors: [...new Set(errors)].slice(0, 2) };
  } finally {
    await b.close();
    await new Promise((r) => setTimeout(r, 700));
  }
}

// 🔴 user 報告 2026-07-30:「**フラグとして sqlite がオンの時に発生する**」。
//   条件が絞れたので、腕を storage backend の対比に張り替える。
const ARMS = [
  ['idb(既定)', ''],
  ['🔴 sqlite backend', '?pkc-flag=storage.sqlite_backend=true'],
  ['sqlite + 窓化', '?pkc-flag=storage.sqlite_backend=true&pkc-flag=center.block_window=true'],
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
  console.log(`      エンジン: ${r.engine?.kind ?? '(不明)'}`
    + `${r.engine?.vfs ? ` / vfs=${r.engine.vfs}` : ''}`
    + `${r.engine?.version ? ` / sqlite ${r.engine.version}` : ''}`
    + `${r.engine?.persistent === false ? '  ⚠ 揮発' : ''}`);
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
