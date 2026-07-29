/* eslint-disable */
/**
 * **ランチャーが再描画を繰り返す**(user 実機報告 2026-07-29)を再現し、
 * 原因が既定 ON の 3 flag なのかを切り分ける probe。
 *
 * 症状:「HTML をロードして一部表示して消えて、また表示されてを繰り返す」
 * = **render ループ**。
 *
 * ## 切り分けの腕
 *
 * | 腕 | 内容 |
 * |---|---|
 * | 既定 | 3 flag とも ON(この branch の既定) |
 * | 窓化 OFF | `center.block_window=false` |
 * | cache OFF | `center.render_cache=false` |
 * | サイドバー OFF | `sidebar.virtual_list=false` |
 * | 全部 OFF | 3 本とも false(= main 相当の描き方) |
 *
 * 🔴 **「全部 OFF でも回る」なら私の変更が原因ではない。** そこを先に確かめる
 *    ── 犯人を決め打ちして直し始めない。
 *
 * ## 測り方
 *
 * `#pkc-root` の childList 変化を MutationObserver で数える。安定していれば
 * boot 直後に数回で止まる。ループしていれば秒あたり何十回も出続ける。
 * **console のエラーも拾う**(ループの引き金が例外のことがある)。
 *
 * ## 🔴 現状:**この fixture では再現しない**(2026-07-29 初回実行)
 *
 * 5 腕とも 5 秒間の DOM 変化 **0 回**、console エラーも無し。
 * つまり「image icon の attachment を並べただけのランチャー」では起きない。
 *
 * user の報告文「**HTML をロードして**一部表示して消えて、また表示されて」が
 * 効いている可能性が高い ── ランチャーの **HTML アプリ**(iframe / srcdoc の
 * attachment、あるいは PKC 拡張)が絡む経路と読める。本 fixture は
 * image icon しか置いていないので、そこを通っていない。
 *
 * **次にやること**は fixture を当てること。推測で直し始めない
 * (contact-sheet probe で 3 回空振りした反省)。要る情報:
 *   - ランチャーに並んでいるのは何か(HTML アプリ / 画像 / 拡張)
 *   - 「全部 OFF」の URL でも再現するか(= 既定 ON の 3 本が原因か)
 *   - console にエラーが出ているか
 *
 * 使い方: node tests/bench/launcher-render-loop-probe.mjs [--seconds=6]
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
const SECONDS = Number(argOf('seconds', '6'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, 'dist', p === '/' ? 'pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45893, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45893/pkc2.html';

const LAUNCH = {
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
};

/** ランチャーに出す app(image icon 付き attachment)を作る。 */
async function seed(page) {
  await page.evaluate(async () => {
    const T = '2026-07-01T00:00:00.000Z';
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAACGzN7XAAAAGUlEQVQYV2P8z8DwnwEJMDExMDD8Z2BgAACk7gIB1GgUyAAAAABJRU5ErkJggg==';
    const entries = [];
    const assets = {};
    for (let i = 0; i < 8; i += 1) {
      assets[`icon${i}`] = png;
      entries.push({
        lid: `app${i}`, title: `アプリ ${i}`, archetype: 'attachment',
        body: JSON.stringify({ mime: 'image/png', asset_key: `icon${i}`, name: `a${i}.png`, size: 100 }),
        created_at: T, updated_at: T,
      });
    }
    entries.push({
      lid: 'note', title: 'ふつうのノート', archetype: 'text',
      body: '# ノート\n\n本文です。\n', created_at: T, updated_at: T,
    });
    const cont = {
      meta: { container_id: 'lnc', title: 'lnc', created_at: T, updated_at: T, schema_version: 1 },
      entries, relations: [], revisions: [], assets,
    };
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    await new Promise((res, rej) => {
      const t = db.transaction(['containers', 'assets'], 'readwrite');
      t.objectStore('containers').clear();
      t.objectStore('assets').clear();
      t.objectStore('containers').put(cont, 'lnc');
      t.objectStore('containers').put('lnc', '__default__');
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
    db.close();
  });
}

async function trial(label, query) {
  const b = await chromium.launch(LAUNCH);
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });

    await page.goto(URL_);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
    await page.waitForTimeout(600);
    await seed(page);

    await page.goto(URL_ + query);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
    // ランチャーへ切り替え
    const btn = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="launcher"]').first();
    let opened = false;
    if (await btn.count() > 0) { await btn.click(); opened = true; }
    await page.waitForTimeout(800);

    // ここから計測開始 ── boot 直後の正常な描画は数えない
    await page.evaluate(() => {
      const w = window;
      w.__mut = 0;
      const root = document.getElementById('pkc-root');
      if (!root) return;
      w.__obs = new MutationObserver((recs) => {
        for (const r of recs) if (r.type === 'childList') w.__mut += 1;
      });
      w.__obs.observe(root, { childList: true, subtree: true });
    });
    await page.waitForTimeout(SECONDS * 1000);
    const mut = await page.evaluate(() => window.__mut ?? -1);
    const tiles = await page.evaluate(
      () => document.querySelectorAll('[data-pkc-region="launcher"] *, .pkc-launcher-tile').length,
    );
    return { label, opened, mut, perSec: mut / SECONDS, tiles, errors: [...new Set(errors)].slice(0, 3) };
  } finally {
    await b.close();
    await new Promise((r) => setTimeout(r, 800));
  }
}

const ARMS = [
  ['既定(3 本 ON)', ''],
  ['窓化 OFF', '?pkc-flag=center.block_window=false'],
  ['cache OFF', '?pkc-flag=center.render_cache=false'],
  ['サイドバー OFF', '?pkc-flag=sidebar.virtual_list=false'],
  ['全部 OFF', '?pkc-flag=center.block_window=false&pkc-flag=center.render_cache=false&pkc-flag=sidebar.virtual_list=false'],
];

console.log(`■ ランチャーの再描画ループ切り分け(${SECONDS} 秒間の DOM 変化)\n`);
console.log('   腕                  launcher   DOM 変化   毎秒     エラー');
for (const [label, q] of ARMS) {
  const r = await trial(label, q);
  console.log(
    `   ${label.padEnd(18)} ${(r.opened ? 'ok' : '🔴 未開封').padEnd(10)} ${String(r.mut).padStart(8)} `
    + `${r.perSec.toFixed(1).padStart(7)}   ${r.errors.length ? r.errors[0] : '-'}`,
  );
}
console.log('\n   🔴 「全部 OFF」でも毎秒の変化が多いなら、既定 ON の 3 本は原因ではない。');
console.log('   ⚠ 安定していれば計測窓の DOM 変化はほぼ 0 になるはず。');

server.close();
