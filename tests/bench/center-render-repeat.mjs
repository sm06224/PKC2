/* eslint-disable */
/**
 * **同じ entry をもう一度開いたとき、描画をやり直しているか**を測る(2026-07-28)。
 *
 * ## なぜ要るか
 *
 * user 提起「DOM 再現についても、**参照のみの場合は前回のレンダリング結果を
 * 使いまわせる**はず。つまりファストラインとして圧縮したレンダリング結果を
 * ストレージにキャッシングして、キャッシュヒットに期待するのも十分にアリ
 * ではないでしょうか?」
 *
 * この案の賞金は「**やり直している時間**」そのものである。もし既に memo が
 * 効いていて 2 回目が速いなら、セッション内のキャッシュは買うものが無く、
 * 賞金は**セッションを跨いだとき(cold boot)だけ**になる。逆に 2 回目も
 * 1 回目と同じだけかかるなら、セッション内から効く。
 *
 * **どちらなのかを決めずに設計を選ぶことはできない。**
 *
 * ## 測り方
 *
 * A → B → A → B … と交互に選択する。同じ entry へ戻ったときの
 * 「選択 → center pane の再描画完了」までの main thread 時間を測る。
 *   - 交互にするのは「選択が変わらなければ何もしない」経路を避けるため
 *     (対照群は「何もしない」ではなく「測りたい操作以外を全部同じにしたもの」)
 *   - 時間は `performance.now()` の差ではなく **long task の総和**で取る
 *     ── 体感に効くのはメインスレッドの占有であり、経過時間ではない
 *   - 併せて **描画結果の HTML 長**と **gzip 後の長さ**を出す
 *     (= ストレージにキャッシュする場合の容量見積り)
 *
 * 使い方:
 *   node tests/bench/center-render-repeat.mjs
 *   node tests/bench/center-render-repeat.mjs --cycles=6 --kb=120
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
const CYCLES = Number(argOf('cycles', '6'));
const KB = Number(argOf('kb', '120'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, 'dist', p === '/' ? 'pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45878, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45878/pkc2.html';

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL_);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });

/** 見出し・表・コード・リンク・強調が混ざった現実的な markdown を作る。 */
function makeBody(kb) {
  const block = [
    '## 見出し ${i}',
    '',
    'これは **強調** と `inline code` と [リンク](https://example.com) を含む段落です。',
    'さらに ~~打ち消し~~ と ==ハイライト== も混ぜます。',
    '',
    '| 列 A | 列 B | 列 C |',
    '|---|---|---|',
    '| 値 ${i} | 値 ${i} | 値 ${i} |',
    '| 値 ${i} | 値 ${i} | 値 ${i} |',
    '',
    '```js',
    'const x = ${i};',
    'function f(a, b) { return a + b + x; }',
    '```',
    '',
    '- 箇条書き ${i}-1',
    '- 箇条書き ${i}-2',
    '  - 入れ子 ${i}-2-1',
    '',
    '> 引用 ${i}。ここも **強調** を含みます。',
    '',
  ].join('\n');
  let out = '';
  let i = 0;
  while (out.length < kb * 1024) { out += block.replace(/\$\{i\}/g, String(i)); i += 1; }
  return out;
}

await page.evaluate(async ({ bodyA, bodyB }) => {
  const T = '2026-07-01T00:00:00.000Z';
  const cont = {
    meta: { container_id: 'centerrender', title: 'cr', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'A', title: 'Heavy A', archetype: 'text', body: bodyA, created_at: T, updated_at: T },
      { lid: 'B', title: 'Heavy B', archetype: 'text', body: bodyB, created_at: T, updated_at: T },
    ],
    relations: [], revisions: [], assets: {},
  };
  const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  await new Promise((res, rej) => {
    const t = db.transaction(['containers'], 'readwrite');
    const s = t.objectStore('containers'); s.clear();
    s.put(cont, 'centerrender'); s.put('centerrender', '__default__');
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
  db.close();
}, { bodyA: makeBody(KB), bodyB: makeBody(KB).replace(/見出し/g, '章') });

await page.goto(URL_);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
await page.waitForTimeout(1500);

// long task の総和を測るための observer。
await page.evaluate(() => {
  const w = window;
  w.__lt = 0;
  new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__lt += e.duration; })
    .observe({ entryTypes: ['longtask'] });
});

async function selectAndWait(lid) {
  await page.evaluate(() => { window.__lt = 0; });
  const t0 = Date.now();
  await page.locator(`[data-pkc-region="entry-list"] [data-pkc-lid="${lid}"]`).first().click();
  await page.waitForFunction(
    (l) => document.querySelector('[data-pkc-region="center"]')?.textContent?.includes(l === 'A' ? '見出し 0' : '章 0'),
    lid, { timeout: 30000 },
  ).catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const wall = Date.now() - t0;
  const lt = await page.evaluate(() => window.__lt);
  return { wall, longTaskMs: lt };
}

console.log(`■ 同じ entry を開き直したとき描画をやり直しているか(本文 ${KB}KB × 2 件、A↔B 交互 ${CYCLES} 往復)\n`);
console.log('   回  対象  wall(ms)  longTask(ms)');
const rows = [];
for (let c = 0; c < CYCLES; c += 1) {
  for (const lid of ['A', 'B']) {
    const r = await selectAndWait(lid);
    rows.push({ c, lid, ...r });
    console.log(`   ${String(c).padStart(2)}   ${lid}   ${String(r.wall).padStart(7)} ${r.longTaskMs.toFixed(0).padStart(12)}`);
  }
}

const first = rows.slice(0, 2);
const later = rows.slice(4);
const avg = (xs, k) => xs.reduce((a, x) => a + x[k], 0) / (xs.length || 1);
console.log(`\n   初回 2 回の平均      wall ${avg(first, 'wall').toFixed(0)}ms / longTask ${avg(first, 'longTaskMs').toFixed(0)}ms`);
console.log(`   3 往復目以降の平均    wall ${avg(later, 'wall').toFixed(0)}ms / longTask ${avg(later, 'longTaskMs').toFixed(0)}ms`);
console.log('   → 後者が前者と同程度なら「同じ entry でも毎回描き直している」= キャッシュの賞金がセッション内にある');

// キャッシュ容量の見積り: 描画結果 HTML の生 / gzip 後
const size = await page.evaluate(async () => {
  const el = document.querySelector('[data-pkc-region="center"]');
  const html = el ? el.innerHTML : '';
  const bytes = new TextEncoder().encode(html);
  let gz = -1;
  if (typeof CompressionStream === 'function') {
    const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    gz = (await new Response(cs).arrayBuffer()).byteLength;
  }
  const bodyLen = new TextEncoder().encode(
    document.querySelector('[data-pkc-region="center"]')?.textContent ?? '',
  ).length;
  return { htmlBytes: bytes.length, gzBytes: gz, textBytes: bodyLen };
});
console.log(`\n■ キャッシュ容量の見積り(center pane の innerHTML)`);
console.log(`   生 HTML   ${(size.htmlBytes / 1024).toFixed(1)} KB`);
console.log(`   gzip 後   ${(size.gzBytes / 1024).toFixed(1)} KB  (原文 ${KB}KB に対して ${(size.gzBytes / (KB * 1024) * 100).toFixed(0)}%)`);
console.log('\n   ⚠ longTask は「メインスレッドの占有」。wall は待ち時間で、非同期処理を含む。');
console.log('   ⚠ 差し引きの値は向きと桁のみ信頼する。');

await browser.close();
server.close();
