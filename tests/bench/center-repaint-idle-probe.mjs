/* eslint-disable */
/**
 * **無操作なのに窓が描き替わり続けていないか**を数える(2026-07-29)。
 *
 * user 実機報告の 2 件目 ──「HTML をロードして一部表示して消えて、また
 * 表示されてを繰り返します」── は **描き替えループ**の症状である。
 * 疑っている経路:
 *
 *   paintWindow → `BLOCK_WINDOW_PAINTED` → main.ts が inline preview を挿入
 *   → 高さが変わる → ブラウザが scroll を撃つ → onScroll → sync
 *   → paintWindow(`innerHTML=''` で preview が**消える**)→ …
 *
 * 「消えて、また表示されて」は preview の破棄と再挿入そのものに見える。
 * 総高が呼吸していた頃は scroll イベントが出続けるので、この輪が回りやすい。
 *
 * ## 測り方
 *
 * inline media を含む長い本文を開き、**1 回だけ**スクロールしてから
 * **完全に無操作**で N 秒待ち、その間の `BLOCK_WINDOW_PAINTED` を数える。
 * 正常なら 0(スクロール直後の収束ぶんを除く)。
 *
 * ⚠ **修正前後で比べる**。`--dist=<path>` で別の pkc2.html を serve できるので、
 *   `git show <sha>:dist/pkc2.html` を書き出して同じ手順で測る。
 *
 * 使い方: node tests/bench/center-repaint-idle-probe.mjs [--seconds=5] [--dist=dist/pkc2.html]
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
const SECONDS = Number(argOf('seconds', '5'));
const DIST = argOf('dist', '/home/user/PKC2/dist/pkc2.html');

const html = readFileSync(DIST);
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
});
await new Promise((r) => server.listen(45899, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45899/pkc2.html';

/** inline media(音声)を混ぜた長い本文 ── preview 挿入経路を必ず通す。 */
function bodyWithMedia(sections = 60) {
  let out = '';
  for (let i = 0; i < sections; i += 1) {
    out += `## 見出し ${i}\n\n段落 ${i}。\n\n`
      + `| 列 A | 列 B |\n|---|---|\n| 値 ${i} | 値 ${i} |\n\n`
      + '```js\n' + `const x = ${i};\n` + '```\n\n';
    if (i % 5 === 0) out += `![[snd${i % 3}]]\n\n`;
    out += `- 箇条 ${i}\n\n> 引用 ${i}\n\n`;
  }
  return out;
}

const LAUNCH = {
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
};

const b = await chromium.launch(LAUNCH);
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 140)));

await page.goto(URL_);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
await page.waitForTimeout(700);
await page.evaluate(async (body) => {
  const T = '2026-07-01T00:00:00.000Z';
  // 1x1 の無音 wav(base64)── preview の <audio> を作らせるためだけの中身。
  const wav = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
  const assets = { snd0: wav, snd1: wav, snd2: wav };
  const entries = [{ lid: 'L', title: '長い本文', archetype: 'text', body, created_at: T, updated_at: T }];
  for (let i = 0; i < 3; i += 1) {
    entries.push({
      lid: `snd${i}`, title: `snd${i}`, archetype: 'attachment',
      body: JSON.stringify({ mime: 'audio/wav', asset_key: `snd${i}`, name: `s${i}.wav`, size: 44 }),
      created_at: T, updated_at: T,
    });
  }
  const cont = {
    meta: { container_id: 'rp', title: 'rp', created_at: T, updated_at: T, schema_version: 1 },
    entries, relations: [], revisions: [], assets,
  };
  const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  await new Promise((res, rej) => {
    const t = db.transaction(['containers'], 'readwrite');
    const s = t.objectStore('containers'); s.clear();
    s.put(cont, 'rp'); s.put('rp', '__default__');
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
  db.close();
}, bodyWithMedia());

await page.goto(`${URL_}?pkc-flag=center.block_window=true`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="L"]').first().click();
await page.locator('.pkc-center-content .pkc-md-rendered').first().waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(1500);

// 1 回だけスクロールする(= 輪の点火)。以後は完全に無操作。
const box = await page.locator('.pkc-center-content').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, 1200);
await page.waitForTimeout(600); // 収束ぶんは数えない

await page.evaluate(() => {
  const w = window;
  w.__paints = 0; w.__scrolls = 0; w.__media = [];
  document.addEventListener('pkc:block-window-painted', () => { w.__paints += 1; }, true);
  const sc = document.querySelector('.pkc-center-content');
  sc?.addEventListener('scroll', () => { w.__scrolls += 1; }, { passive: true, capture: true });
  w.__mediaTick = setInterval(() => {
    w.__media.push(document.querySelectorAll('.pkc-center-content audio, .pkc-center-content video, .pkc-center-content object').length);
  }, 250);
});
await page.waitForTimeout(SECONDS * 1000);
const r = await page.evaluate(() => {
  clearInterval(window.__mediaTick);
  const m = window.__media;
  return {
    paints: window.__paints, scrolls: window.__scrolls,
    mediaMin: Math.min(...m), mediaMax: Math.max(...m),
    mediaFlips: m.filter((v, i) => i > 0 && v !== m[i - 1]).length,
  };
});

console.log(`■ 無操作 ${SECONDS} 秒間(dist: ${DIST})\n`);
console.log(`   窓の描き替え(BLOCK_WINDOW_PAINTED) : ${r.paints}`);
console.log(`   scroll イベント                     : ${r.scrolls}`);
console.log(`   inline media 個数                   : ${r.mediaMin}〜${r.mediaMax}(変化 ${r.mediaFlips} 回)`);
if (errors.length) console.log(`   🔴 例外: ${[...new Set(errors)].slice(0, 3).join(' / ')}`);
console.log(
  r.paints === 0 && r.mediaFlips === 0
    ? '\n   ✅ 無操作では何も起きていない。'
    : `\n   🔴 無操作なのに動いている ──「表示して消えて、また表示されて」の正体。`,
);

await b.close();
server.close();
