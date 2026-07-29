/* eslint-disable */
/**
 * **C3(center pane のブロック窓化)が何を買うか**を実測する(2026-07-28)。
 *
 * ## なぜ要るか
 *
 * C3-a の doc には「一部だけ入れると要素数に線形」という**素の innerHTML の
 * 表**しか無い。実際の製品経路には fold / transclusion / card / ✎ 注入 /
 * mermaid hydration が乗るので、そこを通した数字でないと「窓化で何 ms 買った」
 * とは言えない。
 *
 * ## 測り方
 *
 * flag OFF / ON の**同じ本文・同じ viewport**で、
 *   1. 選択 → center pane 描画完了 までの **long task 総和**(体感の指標。
 *      経過時間ではない ── CLAUDE.md「量が多いと体感が悪いは別の主張」)
 *   2. `.pkc-md-rendered` の**要素数**(常駐 DOM の量)
 *   3. **末尾まで読み切る**までの long task 総和(窓化は読み進めるぶんの
 *      コストを後払いにするので、初回だけ見ると嘘になる)
 * を取る。3 が無いと「初回は速いが通読は遅い」を見落とす。
 *
 * ⚠ 対照群は「何もしない」ではなく「測りたい操作以外を全部同じにしたもの」
 *   ── OFF / ON とも同じ手順(reload → 選択 → 末尾までスクロール)を踏む。
 *
 * 使い方:
 *   node tests/bench/center-block-window-gain.mjs
 *   node tests/bench/center-block-window-gain.mjs --kb=240 --repeat=3
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
const KB = Number(argOf('kb', '120'));
const REPEAT = Number(argOf('repeat', '3'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, 'dist', p === '/' ? 'pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45881, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45881/pkc2.html';

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

/** 見出し・表・コード・リスト・引用・details が混ざった現実的な markdown。 */
function makeBody(kb) {
  const block = [
    '## 見出し ${i}', '',
    'これは **強調** と `inline code` と [リンク](https://example.com) を含む段落です。',
    'さらに ~~打ち消し~~ も混ぜます。', '',
    '| 列 A | 列 B | 列 C |', '|---|---|---|',
    '| 値 ${i} | 値 ${i} | 値 ${i} |', '| 値 ${i} | 値 ${i} | 値 ${i} |', '',
    '```js', 'const x = ${i};', 'function f(a, b) { return a + b + x; }', '```', '',
    '- 箇条書き ${i}-1', '- 箇条書き ${i}-2', '  - 入れ子 ${i}-2-1', '',
    '> 引用 ${i}。', '',
    ':::details{summary="ひらく ${i}"}', '折りたたみの中身 ${i}。', ':::', '',
  ].join('\n');
  let out = ''; let i = 0;
  while (out.length < kb * 1024) { out += block.replace(/\$\{i\}/g, String(i)); i += 1; }
  return { text: out, units: i };
}

const { text: BODY, units: UNITS } = makeBody(KB);

await page.goto(URL_);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
await page.waitForTimeout(1200);
await page.evaluate(async (b) => {
  const T = '2026-07-01T00:00:00.000Z';
  const cont = {
    meta: { container_id: 'cbw', title: 'cbw', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'A', title: 'Heavy', archetype: 'text', body: b, created_at: T, updated_at: T },
      { lid: 'Z', title: '軽い', archetype: 'text', body: '短い。', created_at: T, updated_at: T },
    ],
    relations: [], revisions: [], assets: {},
  };
  const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  await new Promise((res, rej) => {
    const t = db.transaction(['containers'], 'readwrite');
    const s = t.objectStore('containers'); s.clear();
    s.put(cont, 'cbw'); s.put('cbw', '__default__');
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
  db.close();
}, BODY);

const installObserver = () => page.evaluate(() => {
  const w = window;
  w.__lt = 0;
  new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__lt += e.duration; })
    .observe({ entryTypes: ['longtask'] });
});

/** 1 試行: reload → A を選択(初回描画)→ 末尾まで読み切る。 */
async function trial(url) {
  await page.goto(url);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
  await page.waitForTimeout(800);
  await installObserver();

  // ① 初回描画
  await page.evaluate(() => { window.__lt = 0; });
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="A"]').first().click();
  await page.waitForSelector('.pkc-md-rendered', { timeout: 30000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(400);
  const openLt = await page.evaluate(() => window.__lt);
  const elems = await page.evaluate(
    () => document.querySelector('.pkc-md-rendered')?.querySelectorAll('*').length ?? 0,
  );

  // ② 末尾まで読み切る(窓化は後払いなので、ここを測らないと片手落ち)
  await page.evaluate(() => { window.__lt = 0; });
  const last = `見出し ${UNITS - 1}`;
  let reached = false;
  for (let i = 0; i < 200; i += 1) {
    reached = await page.evaluate(
      (t) => (document.querySelector('.pkc-md-rendered')?.textContent ?? '').includes(t),
      last,
    );
    if (reached) break;
    const moved = await page.evaluate(() => {
      const s = document.querySelector('.pkc-center-content');
      if (!s) return false;
      const before = s.scrollTop;
      s.scrollTop += s.clientHeight;
      return s.scrollTop > before;
    });
    await page.waitForTimeout(50);
    if (!moved && i > 3) break;
  }
  await page.waitForTimeout(300);
  const readLt = await page.evaluate(() => window.__lt);
  const elemsEnd = await page.evaluate(
    () => document.querySelector('.pkc-md-rendered')?.querySelectorAll('*').length ?? 0,
  );
  return { openLt, elems, readLt, elemsEnd, reached };
}

const CASES = [
  ['OFF(従来)', URL_],
  ['ON (窓化)', `${URL_}?pkc-flag=center.block_window=true`],
];

console.log(`■ C3 ブロック窓化の効果(本文 ${KB}KB = ${UNITS} 節、viewport 1400x900、${REPEAT} 回)\n`);
console.log('   構成          初回描画 longTask(ms)   常駐要素   通読 longTask(ms)   通読後要素   末尾到達');
const result = {};
for (const [label, url] of CASES) {
  const runs = [];
  for (let r = 0; r < REPEAT; r += 1) runs.push(await trial(url));
  const avg = (k) => runs.reduce((a, x) => a + x[k], 0) / runs.length;
  result[label] = { openLt: avg('openLt'), elems: avg('elems'), readLt: avg('readLt'), elemsEnd: avg('elemsEnd') };
  console.log(
    `   ${label.padEnd(12)} ${avg('openLt').toFixed(0).padStart(14)} ${avg('elems').toFixed(0).padStart(10)}`
    + ` ${avg('readLt').toFixed(0).padStart(17)} ${avg('elemsEnd').toFixed(0).padStart(12)}`
    + `   ${runs.every((x) => x.reached) ? 'yes' : '🔴 NO'}`,
  );
}

const off = result['OFF(従来)'];
const on = result['ON (窓化)'];
const pct = (a, b) => (b === 0 ? 'n/a' : `${(((a - b) / b) * 100).toFixed(0)}%`);
console.log(`\n   初回描画の long task   ${pct(on.openLt, off.openLt)}(ON ${on.openLt.toFixed(0)}ms / OFF ${off.openLt.toFixed(0)}ms)`);
console.log(`   常駐要素数             ${pct(on.elems, off.elems)}(ON ${on.elems.toFixed(0)} / OFF ${off.elems.toFixed(0)})`);
console.log(`   通読の long task       ${pct(on.readLt, off.readLt)}(ON ${on.readLt.toFixed(0)}ms / OFF ${off.readLt.toFixed(0)}ms)`);
console.log('\n   ⚠ 通読 long task が大幅増なら「初回は速いが読むと重い」── 窓化の後払いが体感を割っている');

await browser.close();
server.close();
