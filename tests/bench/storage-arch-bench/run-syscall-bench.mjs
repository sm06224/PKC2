/* eslint-disable */
// 構成別 syscall 回数計測(AV/EDR フック渋滞の予測指標)
// Chromium プロセスツリー全体を strace -f -c で包み、file 系 syscall の
// 回数を構成ごとに集計する。数値は「回数」比較用(strace 下の wall time は
// 大幅に遅くなるため時間比較には使わない)。
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/home/user/PKC2/package.json');
const { chromium } = require('playwright');

const dir = path.dirname(new URL(import.meta.url).pathname);
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const file = path.join(dir, decodeURIComponent(url === '/' ? '/storage-arch-bench.html' : url));
  if (!file.startsWith(dir) || !fs.existsSync(file)) { res.statusCode = 404; res.end('nf'); return; }
  res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const TRACE = 'openat,close,read,pread64,write,pwrite64,fsync,fdatasync,ftruncate,unlinkat,newfstatat,statx';
const SIZE = process.env.TOTAL_MB || '100';
const CONFIGS = (process.env.CONFIGS || 'A,B,C,D,E').split(',');

function makeWrapper(outPath) {
  const wrapperPath = `/tmp/sc-wrapper-${path.basename(outPath, '.txt')}.sh`;
  fs.writeFileSync(
    wrapperPath,
    `#!/bin/sh\nexec /usr/bin/strace -f -qq -c -e trace=${TRACE} -o ${outPath} /opt/pw-browsers/chromium "$@"\n`,
  );
  fs.chmodSync(wrapperPath, 0o755);
  return wrapperPath;
}

function parseCounts(outPath) {
  const text = fs.readFileSync(outPath, 'utf8');
  const counts = {};
  for (const line of text.split('\n')) {
    // "% time seconds usecs/call calls errors syscall" 表の行を拾う
    const m = line.trim().match(/^[\d.]+\s+[\d.]+\s+\d+\s+(\d+)\s+(?:\d+\s+)?([a-z_0-9]+)$/);
    if (m) counts[m[2]] = Number(m[1]);
  }
  return counts;
}

const results = [];
for (const config of CONFIGS) {
  const out = `/tmp/sc-${config}.txt`;
  fs.rmSync(out, { force: true });
  const profDir = `/tmp/pw-sc-prof-${config}`;
  fs.rmSync(profDir, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(profDir, {
    executablePath: makeWrapper(out),
    args: ['--js-flags=--expose-gc'],
    timeout: 120000,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message.slice(0, 150)));
  await page.goto(`http://127.0.0.1:${port}/storage-arch-bench.html?autorun=1&config=${config}&size=${SIZE}`);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 1200000 });
  const rows = await page.evaluate(() => window.__results);
  await ctx.close();
  // strace の summary は全プロセス終了後に書かれる
  for (let i = 0; i < 50 && !fs.existsSync(out); i++) await new Promise((r) => setTimeout(r, 200));
  await new Promise((r) => setTimeout(r, 1000));
  const counts = parseCounts(out);
  const io = ['openat', 'read', 'pread64', 'write', 'pwrite64', 'fsync', 'fdatasync'];
  const ioTotal = io.reduce((a, k) => a + (counts[k] ?? 0), 0);
  results.push({ config, benchRow: rows?.[0]?.name, counts, ioTotal });
  console.log(JSON.stringify({ config, ioTotal, counts }));
  fs.rmSync(profDir, { recursive: true, force: true });
}
server.close();
