/* eslint-disable */
/**
 * **C4(描画結果キャッシュ)が何を買うか**を実測する(2026-07-28)。
 *
 * ## 賞金の在処
 *
 * `center-render-repeat.mjs` で「同じ entry を開き直しても毎回まるごと
 * 描き直している」(再利用ゼロ)ことが分かっている。C4 はそこを取りに行く。
 * よって測るのは**初回描画ではなく開き直し**である ── 初回は必ず miss なので、
 * 初回だけ見ると「効果なし」と誤読する。
 *
 * ## 測り方
 *
 * A → B → A → B … と交互に選択し、**3 往復目以降**の long task 総和を取る。
 *   - 交互にするのは「選択が変わらなければ何もしない」経路を避けるため
 *     (対照群は「何もしない」ではなく「測りたい操作以外を全部同じにしたもの」)
 *   - 構成は 3 つ: 既定 / cache のみ / cache + 窓化
 *     ── 窓化と重ねたときに**上積みがあるか**を見る(片方だけだと分からない)
 *   - hit 率は `window.__pkc2RenderCache()` から取る。**hit していないのに
 *     速くなった**なら別の理由なので、数字を採用してはいけない
 *
 * 使い方:
 *   node tests/bench/center-render-cache-gain.mjs
 *   node tests/bench/center-render-cache-gain.mjs --cycles=6 --kb=120
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
await new Promise((r) => server.listen(45884, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45884/pkc2.html';

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

function makeBody(kb, headWord) {
  const block = [
    `## ${headWord} \${i}`, '',
    'これは **強調** と `inline code` と [リンク](https://example.com) を含む段落です。', '',
    '| 列 A | 列 B |', '|---|---|', '| 値 ${i} | 値 ${i} |', '',
    '```js', 'const x = ${i};', '```', '',
    '- 箇条 ${i}-1', '- 箇条 ${i}-2', '',
    '> 引用 ${i}。', '',
  ].join('\n');
  let out = ''; let i = 0;
  while (out.length < kb * 1024) { out += block.replace(/\$\{i\}/g, String(i)); i += 1; }
  return out;
}

await page.goto(URL_);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
await page.waitForTimeout(1200);
await page.evaluate(async ({ a, b }) => {
  const T = '2026-07-01T00:00:00.000Z';
  const cont = {
    meta: { container_id: 'crc', title: 'crc', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'A', title: 'Heavy A', archetype: 'text', body: a, created_at: T, updated_at: T },
      { lid: 'B', title: 'Heavy B', archetype: 'text', body: b, created_at: T, updated_at: T },
    ],
    relations: [], revisions: [], assets: {},
  };
  const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  await new Promise((res, rej) => {
    const t = db.transaction(['containers'], 'readwrite');
    const s = t.objectStore('containers'); s.clear();
    s.put(cont, 'crc'); s.put('crc', '__default__');
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
  db.close();
}, { a: makeBody(KB, '見出し'), b: makeBody(KB, '章') });

async function trial(url) {
  await page.goto(url);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const w = window;
    w.__lt = 0;
    new PerformanceObserver((list) => { for (const e of list.getEntries()) w.__lt += e.duration; })
      .observe({ entryTypes: ['longtask'] });
  });

  const rows = [];
  for (let c = 0; c < CYCLES; c += 1) {
    for (const lid of ['A', 'B']) {
      await page.evaluate(() => { window.__lt = 0; });
      await page.locator(`[data-pkc-region="entry-list"] [data-pkc-lid="${lid}"]`).first().click();
      await page.waitForFunction(
        (l) => document.querySelector('[data-pkc-region="center"]')?.textContent
          ?.includes(l === 'A' ? '見出し 0' : '章 0'),
        lid, { timeout: 30000 },
      ).catch(() => {});
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.waitForTimeout(120);
      rows.push({ c, lid, lt: await page.evaluate(() => window.__lt) });
    }
  }
  const stats = await page.evaluate(
    () => (typeof window.__pkc2RenderCache === 'function' ? window.__pkc2RenderCache() : null),
  );
  const later = rows.slice(4);
  const avg = later.reduce((a, x) => a + x.lt, 0) / (later.length || 1);
  const first = rows.slice(0, 2).reduce((a, x) => a + x.lt, 0) / 2;
  return { first, later: avg, stats };
}

// 🔴 **窓化のみ**を必ず入れる。これが無いと、窓化の効果を cache の手柄として
//    報告してしまう(対照群は「何もしない」ではなく「測りたい操作以外を
//    全部同じにしたもの」── CLAUDE.md の計測規律)。
const CASES = [
  ['既定', URL_],
  ['cache のみ', `${URL_}?pkc-flag=center.render_cache=true`],
  ['窓化のみ', `${URL_}?pkc-flag=center.block_window=true`],
  ['cache + 窓化', `${URL_}?pkc-flag=center.render_cache=true&pkc-flag=center.block_window=true`],
];

console.log(`■ C4 描画結果キャッシュの効果(本文 ${KB}KB × 2 件、A↔B 交互 ${CYCLES} 往復)`);
console.log('   時間は経過時間ではなく long task 総和。**開き直し**(3 往復目以降)が賞金。\n');
console.log('   構成            初回 2 回(ms)   3 往復目以降(ms)   hit / miss');
const out = {};
for (const [label, url] of CASES) {
  const r = await trial(url);
  out[label] = r;
  const s = r.stats;
  console.log(
    `   ${label.padEnd(14)} ${r.first.toFixed(0).padStart(12)} ${r.later.toFixed(0).padStart(17)}`
    + `   ${s ? `${s.hits} / ${s.misses}` : '(計器なし)'}`,
  );
}

const base = out['既定'].later;
const pct = (v) => (base === 0 ? 'n/a' : `${(((v - base) / base) * 100).toFixed(0)}%`);
console.log(`\n   既定比 ── cache のみ ${pct(out['cache のみ'].later)}`
  + ` / 窓化のみ ${pct(out['窓化のみ'].later)} / cache + 窓化 ${pct(out['cache + 窓化'].later)}`);
const w = out['窓化のみ'].later;
const wc = out['cache + 窓化'].later;
console.log(`   🔴 **cache の取り分** = 窓化のみ ${w.toFixed(0)}ms → cache 併用 ${wc.toFixed(0)}ms`
  + ` (${w === 0 ? 'n/a' : `${(((wc - w) / w) * 100).toFixed(0)}%`})`);
console.log('\n   ⚠ hit が 0 なのに速くなっていたら、それは cache の効果ではない ── 採用しないこと');

await browser.close();
server.close();
