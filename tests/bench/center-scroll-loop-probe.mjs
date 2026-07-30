/* eslint-disable */
/**
 * **「スクロールするとトップに戻る」を実操作で再現する**(user 実機報告 2026-07-29)。
 *
 * 症状:「スクロールする → 描画範囲生成 → スクロールがトップに戻る → スクロールする」
 * が無限に続き、center pane が使えない。ファイラーも巻き添え。
 *
 * ## 🔴 なぜ smoke を素通りしたか
 *
 * `center-block-render-parity.spec.ts` の「scroll が飛ばない」は
 * **`scrollTop = N` を 1 回代入して 300ms 待つ**だけだった。user は
 * **ホイールを何度も回す**。連続入力でしか出ないループを、1 回の代入で
 * 見ていたので通ってしまった。
 * ⇒ 本 probe は `page.mouse.wheel` を**連打**し、scrollTop の軌跡を記録する。
 *
 * ## 見るもの
 *
 * - ホイールを N 回回した後の scrollTop の**軌跡**(単調に増えるべき)
 * - **0 に戻った回数**(1 回でもあれば再現)
 * - 併せて `scrollHeight` の変動(窓の描き替えで縮んでいないか)
 *
 * 使い方: node tests/bench/center-scroll-loop-probe.mjs [--wheels=20]
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
const WHEELS = Number(argOf('wheels', '20'));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, 'dist', p === '/' ? 'pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45895, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:45895/pkc2.html';

function longBody(sections = 60) {
  let out = '';
  for (let i = 0; i < sections; i += 1) {
    out += `## 見出し ${i}\n\n段落 **強調** ${i} と \`inline code\`。\n\n`
      + `| 列 A | 列 B |\n|---|---|\n| 値 ${i} | 値 ${i} |\n\n`
      + '```js\n' + `const x = ${i};\n` + '```\n\n'
      + `- 箇条 ${i}-1\n- 箇条 ${i}-2\n\n> 引用 ${i}\n\n`;
  }
  return out;
}

const LAUNCH = {
  executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
};

async function trial(label, query) {
  const b = await chromium.launch(LAUNCH);
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL_);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
    await page.waitForTimeout(700);
    await page.evaluate(async (body) => {
      const T = '2026-07-01T00:00:00.000Z';
      const cont = {
        meta: { container_id: 'sl', title: 'sl', created_at: T, updated_at: T, schema_version: 1 },
        entries: [{ lid: 'L', title: '長い本文', archetype: 'text', body, created_at: T, updated_at: T }],
        relations: [], revisions: [], assets: {},
      };
      const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
      await new Promise((res, rej) => {
        const t = db.transaction(['containers'], 'readwrite');
        const s = t.objectStore('containers'); s.clear();
        s.put(cont, 'sl'); s.put('sl', '__default__');
        t.oncomplete = () => res(); t.onerror = () => rej(t.error);
      });
      db.close();
    }, longBody());

    await page.goto(URL_ + query);
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 60000 });
    await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="L"]').first().click();
    await page.locator('.pkc-center-content .pkc-md-rendered').first()
      .waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1200);

    // center pane の中央へマウスを置いてからホイールを回す(= 実操作)
    const box = await page.locator('.pkc-center-content').first().boundingBox();
    if (!box) return { label, error: 'center pane が無い' };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const track = [];
    for (let i = 0; i < WHEELS; i += 1) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(120);
      const st = await page.evaluate(() => {
        const s = document.querySelector('.pkc-center-content');
        return s ? { top: Math.round(s.scrollTop), h: Math.round(s.scrollHeight) } : null;
      });
      if (st) track.push(st);
    }
    let resets = 0; let backwards = 0;
    for (let i = 1; i < track.length; i += 1) {
      if (track[i].top === 0 && track[i - 1].top > 0) resets += 1;
      if (track[i].top < track[i - 1].top - 5) backwards += 1;
    }
    const heights = [...new Set(track.map((t) => t.h))];
    return {
      label,
      first: track[0]?.top, last: track[track.length - 1]?.top,
      max: Math.max(...track.map((t) => t.top)),
      resets, backwards,
      heightRange: `${Math.min(...heights)}〜${Math.max(...heights)}`,
      track: track.map((t) => t.top),
    };
  } finally {
    await b.close();
    await new Promise((r) => setTimeout(r, 700));
  }
}

const ARMS = [
  ['既定(窓化 OFF)', ''],
  ['窓化 ON', '?pkc-flag=center.block_window=true'],
  ['窓化 + cache ON', '?pkc-flag=center.block_window=true&pkc-flag=center.render_cache=true'],
];

console.log(`■ ホイール ${WHEELS} 回で scrollTop がどう動くか(実操作)\n`);
console.log('   腕                  最終 top   最大 top   0 復帰   逆行   scrollHeight');
for (const [label, q] of ARMS) {
  const r = await trial(label, q);
  if (r.error) { console.log(`   ${label.padEnd(18)} 🔴 ${r.error}`); continue; }
  console.log(
    `   ${label.padEnd(18)} ${String(r.last).padStart(8)} ${String(r.max).padStart(10)} `
    + `${String(r.resets).padStart(7)} ${String(r.backwards).padStart(6)}   ${r.heightRange}`
    + `${r.resets > 0 || r.backwards > 0 ? '  🔴 再現' : ''}`,
  );
  if (r.resets > 0 || r.backwards > 0) console.log(`      軌跡: ${r.track.join(' → ')}`);
}
console.log('\n   ⚠ 正常なら top は単調増加、0 復帰も逆行も 0 回。');

server.close();
