/* eslint-disable */
// syscall プロファイル: 頻度(時系列)・タイミング(フェーズ帰属)・影響の分布
// strace -f -ttt -T の per-call 記録を、worker のフェーズマーカー(epoch ms)と
// 突き合わせて集計する。
import { createRequire } from 'node:module';
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

const TRACE = 'openat,close,read,pread64,write,pwrite64,fsync,fdatasync,ftruncate,unlinkat';
const SIZE = process.env.TOTAL_MB || '100';
const CONFIGS = (process.env.CONFIGS || 'A,B,C,D,E').split(',');

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}
const ms = (s) => Math.round(s * 100000) / 100; // sec → ms(小数2桁)

for (const config of CONFIGS) {
  const raw = `/tmp/scp-${config}.raw`;
  fs.rmSync(raw, { force: true });
  const wrapper = `/tmp/scp-wrapper-${config}.sh`;
  fs.writeFileSync(wrapper, `#!/bin/sh\nexec /usr/bin/strace -f -qq -ttt -T -e trace=${TRACE} -o ${raw} /opt/pw-browsers/chromium "$@"\n`);
  fs.chmodSync(wrapper, 0o755);
  const profDir = `/tmp/pw-scp-prof-${config}`;
  fs.rmSync(profDir, { recursive: true, force: true });

  const ctx = await chromium.launchPersistentContext(profDir, { executablePath: wrapper, timeout: 120000 });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/storage-arch-bench.html?autorun=1&config=${config}&size=${SIZE}`);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 1200000 });
  const row = (await page.evaluate(() => window.__results))?.[0] ?? {};
  await ctx.close();
  for (let i = 0; i < 50 && !fs.existsSync(raw); i++) await new Promise((r) => setTimeout(r, 200));
  await new Promise((r) => setTimeout(r, 1500));

  // ── parse: "PID  1690000000.123456 name(... <0.000123>" / resumed 行 ──
  const calls = []; // {t(epoch sec), name, dur(sec)}
  const durRe = /<(\d+\.\d+)>\s*$/;
  for (const line of fs.readFileSync(raw, 'utf8').split('\n')) {
    const dm = line.match(durRe);
    if (!dm) continue;
    const tm = line.match(/^\s*\d+\s+(\d+\.\d+)\s+(.*)$/);
    if (!tm) continue;
    const bodyM = tm[2].match(/^(?:<\.\.\.\s+(\w+)\s+resumed>|(\w+)\()/);
    if (!bodyM) continue;
    calls.push({ t: Number(tm[1]), name: bodyM[1] ?? bodyM[2], dur: Number(dm[1]) });
  }

  // ── フェーズ帰属(marks は epoch ms)──
  const marks = row.marks ?? [];
  const bound = (a, b) => {
    const s = marks.find((m) => m.name === a)?.t;
    const e = marks.find((m) => m.name === b)?.t;
    return s && e ? [s / 1000, e / 1000] : null;
  };
  const phases = {
    ingest: bound('ingest:start', 'ingest:end'),
    cold: bound('cold:start', 'cold:end'),
    'reads(read1+read10)': bound('reads:start', 'reads:end'),
    'append(以降)': (() => {
      const s = marks.find((m) => m.name === 'reads:end')?.t;
      const e = marks.find((m) => m.name === 'append:end')?.t;
      return s && e ? [s / 1000, e / 1000] : null;
    })(),
  };

  const out = { config, benchRow: { ingestMs: row.ingestMs, coldStartMs: row.coldStartMs, read1Ms: row.read1Ms, read10Ms: row.read10Ms, append10Ms: row.append10Ms }, phases: {}, latencyByOp: {}, burst: {} };
  for (const [pname, b] of Object.entries(phases)) {
    if (!b) continue;
    const inPhase = calls.filter((c) => c.t >= b[0] && c.t <= b[1]);
    const durs = inPhase.map((c) => c.dur).sort((x, y) => x - y);
    const wallSec = Math.max(0.001, b[1] - b[0]);
    out.phases[pname] = {
      wallMs: Math.round(wallSec * 1000),
      calls: inPhase.length,
      callsPerSec: Math.round(inPhase.length / wallSec),
      sumSyscallMs: Math.round(durs.reduce((a2, d) => a2 + d, 0) * 1000),
      p95Ms: ms(pct(durs, 0.95)),
      p99Ms: ms(pct(durs, 0.99)),
      maxMs: ms(pct(durs, 1)),
    };
  }
  // op 別レイテンシ分布(全体)
  const byOp = {};
  for (const c of calls) (byOp[c.name] ??= []).push(c.dur);
  for (const [op, ds] of Object.entries(byOp)) {
    ds.sort((x, y) => x - y);
    out.latencyByOp[op] = { calls: ds.length, p50Ms: ms(pct(ds, 0.5)), p95Ms: ms(pct(ds, 0.95)), p99Ms: ms(pct(ds, 0.99)), maxMs: ms(pct(ds, 1)), sumMs: Math.round(ds.reduce((a2, d) => a2 + d, 0) * 1000) };
  }
  // 頻度の時系列(100ms ビン)→ ピークとバースト性を要約
  if (calls.length) {
    const t0 = Math.min(...calls.map((c) => c.t));
    const bins = new Map();
    for (const c of calls) {
      const k = Math.floor((c.t - t0) * 10);
      bins.set(k, (bins.get(k) ?? 0) + 1);
    }
    const rates = [...bins.values()].sort((x, y) => x - y);
    out.burst = {
      activeBins100ms: rates.length,
      medianPer100ms: pct(rates, 0.5),
      p95Per100ms: pct(rates, 0.95),
      peakPer100ms: pct(rates, 1),
    };
  }
  console.log(JSON.stringify(out));
  fs.rmSync(profDir, { recursive: true, force: true });
  fs.rmSync(raw, { force: true });
}
server.close();
