/* eslint-disable */
/**
 * core record を丸ごと gzip した場合の **CPU 代金** を実ブラウザで測る。
 *
 * 静的分解では「25,668 → 3,578 KB(7.2 倍)」だが、これは **サイズだけ**の話で、
 * 毎保存にかかる圧縮 CPU を測っていない。保存は debounce 300ms の裏で走るので、
 * ここが数百 ms かかるなら「書込は減ったが操作が引っかかる」に化ける。
 *
 * 測るもの(同一ページ内・同一データ):
 *   - CompressionStream('gzip') の所要 ms と 出力バイト
 *   - DecompressionStream('gzip') の所要 ms(= boot 側の代金)
 *   - 対照: JSON.stringify のみ(現行の保存が払っている分)
 *
 * 使い方: node <this> [fixture]
 */
import { createRequire } from 'node:module';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import http from 'node:http';

const require = createRequire('/home/user/PKC2/package.json');
const { chromium } = require('playwright');
const ROOT = '/home/user/PKC2';
const FIXTURE = process.argv[2] || 'bench-fixtures/c-5000-rev.json';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
function serve() {
  const s = http.createServer((rq, rs) => {
    try {
      const p = normalize(decodeURIComponent(new URL(rq.url, 'http://x').pathname));
      const f = join(ROOT, p);
      if (!f.startsWith(ROOT + sep)) { rs.writeHead(403); rs.end(); return; }
      if (!existsSync(f) || !statSync(f).isFile()) { rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(f).pipe(rs);
    } catch (e) { rs.writeHead(500); rs.end(String(e)); }
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r({
    origin: `http://127.0.0.1:${s.address().port}`, close: () => new Promise((x) => s.close(x)),
  })));
}

const srv = await serve();
const bytes = statSync(join(ROOT, FIXTURE)).size;
console.log(`fixture: ${FIXTURE} (${(bytes / 1048576).toFixed(1)} MB)`);
console.log('測るもの: core record を丸ごと gzip したときの CPU(圧縮 = 毎保存 / 伸長 = 毎 boot)\n');

const ctx = await chromium.launchPersistentContext('/tmp/pw-gzip', {
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await ctx.newPage();
// fetch を同一 origin で使うため、サーバ配下の実ファイルへ遷移する
// (about:blank だと fetch が CORS で落ちる / setContent はナビゲーションと競合する)
await page.goto(`${srv.origin}/dist/pkc2.html`, { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async (url) => {
  const raw = await (await fetch(url)).text();
  const obj = JSON.parse(raw);
  const runs = [];
  // 3 回まわして中央値をとる(1 回目は JIT ウォームアップを含む)
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const json = JSON.stringify(obj);
    const tStringify = performance.now();
    const blob = await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream('gzip')),
    ).blob();
    const tGzip = performance.now();
    const back = await new Response(
      blob.stream().pipeThrough(new DecompressionStream('gzip')),
    ).text();
    const tGunzip = performance.now();
    const parsed = JSON.parse(back);
    const tParse = performance.now();
    runs.push({
      stringifyMs: tStringify - t0,
      gzipMs: tGzip - tStringify,
      gunzipMs: tGunzip - tGzip,
      parseMs: tParse - tGunzip,
      rawKB: json.length / 1024,
      gzKB: blob.size / 1024,
      ok: parsed.entries.length === obj.entries.length,
    });
  }
  const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
  return {
    stringifyMs: med('stringifyMs'), gzipMs: med('gzipMs'),
    gunzipMs: med('gunzipMs'), parseMs: med('parseMs'),
    rawKB: runs[0].rawKB, gzKB: runs[0].gzKB, ok: runs.every((r) => r.ok),
  };
}, `${srv.origin}/${FIXTURE}`);

await ctx.close();
await srv.close();

const r = result;
console.log(`  round-trip 正当性: ${r.ok ? '✅ 一致' : '⛔ 不一致 — この数字は使えない'}`);
console.log(`  サイズ            ${r.rawKB.toFixed(0)} KB → ${r.gzKB.toFixed(0)} KB (${(r.rawKB / r.gzKB).toFixed(1)} 倍)`);
console.log('');
console.log(`  保存側(毎編集):`);
console.log(`    JSON.stringify  ${r.stringifyMs.toFixed(0).padStart(5)} ms  ← 現行も払っている`);
console.log(`    gzip            ${r.gzipMs.toFixed(0).padStart(5)} ms  ← **追加で払う分**`);
console.log('');
console.log(`  読出側(毎 boot):`);
console.log(`    gunzip          ${r.gunzipMs.toFixed(0).padStart(5)} ms  ← **追加で払う分**`);
console.log(`    JSON.parse      ${r.parseMs.toFixed(0).padStart(5)} ms  ← 現行も払っている`);
console.log('');
console.log('⚠ これは CPU のみ。IDB の structured clone / 実書込は含まない。');
console.log('  「圧縮で減る書込」と「増える CPU」を並べて判断するための数字。');
if (!r.ok) process.exitCode = 1;
