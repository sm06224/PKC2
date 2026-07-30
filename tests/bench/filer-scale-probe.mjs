/* eslint-disable */
/**
 * **ファイラーを実運用の件数で測る**(2026-07-30、user 指摘)。
 *
 * user 指摘:「ファイラーも同様にエントリ数が足りないと思われる /
 * **そもそも DOM や装飾が複雑すぎるのでは?**」
 *
 * ## 何に答える probe か
 *
 * 1. **1 行あたり何ノード使っているか**(装飾の重さの実測)
 *    ── ランチャーは 8 ノード/枚だった。ファイラーは?
 * 2. **件数を増やしたとき DOM が線形に膨らむか**(= 窓化されていない)
 * 3. **操作が返ってくるまで何 ms か**(行クリック → 選択が画面に出るまで)
 * 4. **スクロールが実際に発生しているか**(前提の assert。
 *    件数が足りない試験を二度とやらない)
 *
 * 🔴 **「重い」を語る前に、どこが重いのかを 1 つずつ分ける。**
 *    DOM ノード数 / 生成時間 / 操作応答は別の量である。
 *
 * 使い方: node tests/bench/filer-scale-probe.mjs [--counts=100,1000,3000]
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
const COUNTS = argOf('counts', '100,1000,3000').split(',').map(Number);
const DIST = argOf('dist', '/home/user/PKC2/dist/pkc2.html');

const html = readFileSync(DIST);
const server = http.createServer((_q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  r.end(html);
});
await new Promise((r) => server.listen(45905, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45905/pkc2.html';

const LAUNCH = {
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
};

async function trial(count) {
  const b = await chromium.launch(LAUNCH);
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL_);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
    await page.waitForTimeout(600);

    await page.evaluate(async (n) => {
      const T = '2026-07-01T00:00:00.000Z';
      const entries = [];
      // フォルダ 1 割 + 中身 ── 平坦な一覧ではなく実際の木構造に寄せる。
      for (let i = 0; i < n; i += 1) {
        const isFolder = i % 10 === 0;
        entries.push({
          lid: `f${i}`,
          title: isFolder ? `フォルダ ${i}` : `ドキュメント ${i} — 少し長めのタイトル`,
          archetype: isFolder ? 'folder' : 'text',
          body: isFolder ? '' : `# 見出し ${i}\n\n本文 ${i}。\n`,
          created_at: T, updated_at: T,
        });
      }
      const relations = [];
      for (let i = 0; i < n; i += 1) {
        if (i % 10 === 0) continue;
        const parent = `f${Math.floor(i / 10) * 10}`;
        relations.push({
          rid: `r${i}`, kind: 'structural', from_lid: parent, to_lid: `f${i}`,
          role: 'contains', created_at: T,
        });
      }
      const cont = {
        meta: { container_id: 'fs', title: 'fs', created_at: T, updated_at: T, schema_version: 1 },
        entries, relations, revisions: [], assets: {},
      };
      const db = await new Promise((res, rej) => { const q = indexedDB.open('pkc2'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      await new Promise((res, rej) => {
        const t = db.transaction(['containers'], 'readwrite');
        const s = t.objectStore('containers'); s.clear();
        s.put(cont, 'fs'); s.put('fs', '__default__');
        t.oncomplete = () => res(); t.onerror = () => rej(t.error);
      });
      db.close();
    }, count);

    await page.goto(URL_);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });

    const btn = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]').first();
    if (await btn.count() === 0) return { count, fatal: 'ファイラーのタブが無い' };
    const t0 = Date.now();
    await btn.click();
    await page.waitForSelector('[data-pkc-region="filer-view"], .pkc-filer-view', { timeout: 30000 });
    await page.waitForTimeout(900);
    const switchMs = Date.now() - t0;

    const geom = await page.evaluate(() => {
      const view = document.querySelector('[data-pkc-region="filer-view"]');
      if (!view) return null;
      // 🔴 **行は `tr.pkc-filer-row` で数える。** `[data-pkc-lid]` で拾うと
      //   各行のチェックボックス `<input data-pkc-lid>` も混ざり **2 倍**に
      //   見える(最初これで「200 件で 400 行」と読み違えた)。
      const rows = view.querySelectorAll('tr.pkc-filer-row');
      // 🔴 スクローラは view の**子孫**(`.pkc-filer-table-wrapper`)。
      //   親を遡ると見つからず「スクロールしていない」と誤読する(実際した)。
      let sc = null;
      for (const el of view.querySelectorAll('*')) {
        if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 100) {
          const o = getComputedStyle(el).overflowY;
          if (o === 'auto' || o === 'scroll') { sc = el; break; }
        }
      }
      const one = rows[0];
      return {
        rows: rows.length,
        nodesTotal: view.querySelectorAll('*').length,
        nodesPerRow: one ? one.querySelectorAll('*').length + 1 : 0,
        scrollH: sc ? Math.round(sc.scrollHeight) : 0,
        clientH: sc ? Math.round(sc.clientHeight) : 0,
        scrollable: !!sc,
        sidebarRows: document.querySelectorAll('[data-pkc-region="entry-list"] [data-pkc-lid]').length,
        sidebarNodes: document.querySelector('[data-pkc-region="entry-list"]')?.querySelectorAll('*').length ?? 0,
      };
    });
    if (!geom) return { count, fatal: 'ファイラーの region が見つからない' };

    // 操作応答:行をクリックしてから **DOM が落ち着くまで**。
    // ⚠ 「選択マークが付くまで」は使えない ── そんな属性は無く、待つと
    //   timeout 値(8s)をそのまま「応答時間」として書いてしまう(実際やった)。
    //   代わりに MutationObserver で「最後の DOM 変化から 200ms 静か」を待つ。
    let clickMs = -1;
    const row = page.locator('[data-pkc-region="filer-view"] tr.pkc-filer-row').nth(3);
    if (await row.count() > 0) {
      await page.evaluate(() => {
        const w = window;
        w.__lastMut = 0;
        w.__o = new MutationObserver(() => { w.__lastMut = performance.now(); });
        w.__o.observe(document.getElementById('pkc-root'), { childList: true, subtree: true });
        w.__clickAt = performance.now();
      });
      await row.click();
      clickMs = await page.evaluate(async () => {
        const w = window;
        const deadline = performance.now() + 5000;
        for (;;) {
          await new Promise((r) => setTimeout(r, 50));
          const quiet = performance.now() - (w.__lastMut || w.__clickAt);
          if (quiet > 200 || performance.now() > deadline) break;
        }
        w.__o.disconnect();
        // 変化が 1 度も無ければ 0(= 反応していない)。
        return w.__lastMut ? Math.round(w.__lastMut - w.__clickAt) : 0;
      });
    }

    return { count, switchMs, clickMs, ...geom };
  } finally {
    await b.close();
    await new Promise((r) => setTimeout(r, 700));
  }
}

console.log('■ ファイラーを件数を変えて測る(DOM の重さ / 応答)\n');
console.log('   件数    行数   スクロール      DOM 合計  1 行あたり  タブ切替  行クリック→静止  サイドバー(行/ノード)');
for (const n of COUNTS) {
  const r = await trial(n);
  if (r.fatal) { console.log(`   ${String(n).padStart(5)}  🔴 ${r.fatal}`); continue; }
  const scroll = r.scrollable ? `${r.scrollH}/${r.clientH}` : '🔴 無し';
  console.log(
    `   ${String(n).padStart(5)} ${String(r.rows).padStart(6)} ${scroll.padStart(13)}`
    + ` ${String(r.nodesTotal).padStart(9)} ${String(r.nodesPerRow).padStart(10)}`
    + ` ${`${r.switchMs}ms`.padStart(9)} ${`${r.clickMs}ms`.padStart(11)}`
    + `   ${r.sidebarRows}/${r.sidebarNodes}`,
  );
}
console.log('\n   ⚠ 「DOM 合計」が件数に比例していれば窓化されていない。');
console.log('   ⚠ スクロール「無し」の行は試験が成立していない ── 件数不足。');

server.close();
