/* eslint-disable */
// C11 §4.5 ④-3(doc DoD): フォルダ sink(FSA/OPFS createWritable →
// close 反映)の実ディスク書込ベンチ。
//
// folder-sink.ts と同じ書き込み形 — 完全な Backup ZIP 相当の単一 Blob を
// staging へ書いて close で commit — を実サイズ(50/100/300MB)で反復し、
// 次を計測する:
//   - wall ms / write(体感: debounce 保存 1 回のコスト)
//   - /proc/diskstats 実デバイス書込 MB(sync 済み)→ 書込増幅
//     (staging swap の二重書きがどの程度か)
//
// 実行: node tests/bench/storage-arch-bench/sink-bench.mjs
//   (persistent プロファイル必須 — incognito は storage がメモリバックで
//    実 I/O を踏まない。2026-07-22 の計測バグ教訓)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
const require = createRequire('/home/user/PKC2/package.json');
const { chromium } = require('playwright');

function deviceWrittenMB() {
  execSync('sync');
  const stats = fs.readFileSync('/proc/diskstats', 'utf8');
  const line = stats.split('\n').find((l) => /\bvda\b/.test(l));
  const f = line.trim().split(/\s+/);
  return (Number(f[9]) * 512) / 1048576;
}

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end('<!doctype html><title>sink</title>ok');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const SIZES_MB = (process.env.SIZES_MB || '50,100,300').split(',').map(Number);
const ITER = Number(process.env.ITER || 3);

const results = [];
for (const sizeMB of SIZES_MB) {
  const profDir = '/tmp/pw-sink-prof-' + sizeMB;
  fs.rmSync(profDir, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(profDir, { executablePath: '/opt/pw-browsers/chromium' });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  const d0 = deviceWrittenMB();
  const r = await page.evaluate(async ({ sizeMB, iter }) => {
    // ZIP 相当の非圧縮バイナリ Blob(crypto 乱数 — 圧縮で消えない実サイズ。
    // LCG パターンが圧縮された 2026-07-22 の計測バグ教訓)
    const chunks = [];
    const chunk = new Uint8Array(1 << 20);
    for (let i = 0; i < sizeMB; i++) {
      // getRandomValues は 64KB 上限なので分割
      for (let o = 0; o < chunk.length; o += 65536) {
        crypto.getRandomValues(chunk.subarray(o, o + 65536));
      }
      chunks.push(chunk.slice());
    }
    const blob = new Blob(chunks);
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('sink-bench', { create: true });
    const walls = [];
    for (let i = 0; i < iter; i++) {
      const t0 = performance.now();
      // folder-sink.ts と同一の書き込み形(staging → close commit)
      const fh = await dir.getFileHandle('pkc2-autosave.pkc2.zip', { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      walls.push(Math.round(performance.now() - t0));
    }
    return { walls };
  }, { sizeMB, iter: ITER });
  // プロファイル削除前に sync してから計測(close 前 sync の教訓)
  const d1 = deviceWrittenMB();
  await ctx.close();
  fs.rmSync(profDir, { recursive: true, force: true });
  const writtenMB = Math.round((d1 - d0) * 10) / 10;
  const logicalMB = sizeMB * ITER;
  results.push({
    sizeMB,
    iter: ITER,
    wallMsPerWrite: r.walls,
    diskWrittenMB: writtenMB,
    logicalMB,
    amplification: Math.round((writtenMB / logicalMB) * 100) / 100,
  });
  console.log(JSON.stringify(results[results.length - 1]));
}
server.close();
console.log('\n== summary ==');
for (const row of results) {
  console.log(
    `${row.sizeMB}MB x${row.iter}: wall ${row.wallMsPerWrite.join('/')}ms, ` +
    `disk ${row.diskWrittenMB}MB (logical ${row.logicalMB}MB, amp ${row.amplification}x)`,
  );
}
