/* eslint-disable */
// テキスト/履歴プレーンの実ディスク I/O ベンチ
//  revision snapshot 群(~100MB 相当)を 3 方式で書き、実デバイス書込バイトを比較:
//   P1: per-record(1 revision = 1 record = 1 tx)… 現 v3 案
//   P2: segment pack(1MB チャンクに詰めてから put)
//   P3: segment pack + CompressionStream gzip(ゆるいストリーミング圧縮)
// 計測: wall ms / navigator.storage 使用量 / /proc/diskstats 実書込 MB(sync 済み)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
const require = createRequire('/home/user/PKC2/package.json');
const { chromium } = require('playwright');

function deviceWrittenMB() {
  execSync('sync');
  const stats = fs.readFileSync('/proc/diskstats', 'utf8');
  // vda の sectors written(field 10、512B 単位)
  const line = stats.split('\n').find((l) => /\bvda\b/.test(l));
  const f = line.trim().split(/\s+/);
  return (Number(f[9]) * 512) / 1048576;
}

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.end('<!doctype html><title>io</title>ok');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const CONFIGS = ['P1', 'P2', 'P3'];
const results = [];
for (const config of CONFIGS) {
  // incognito(ephemeral context)は storage がメモリバックになり実ディスク
  // I/O を踏まない — persistent プロファイルで実ディスクを踏ませる
  const profDir = '/tmp/pw-io-prof-' + config;
  fs.rmSync(profDir, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(profDir, { executablePath: '/opt/pw-browsers/chromium' });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  const d0 = deviceWrittenMB();
  const r = await page.evaluate(async (mode) => {
    // ── corpus: 逐次到着する revision snapshot(zstd-probe と同系)──
    const WORDS = 'プロジェクト 会議 メモ 設計 実装 レビュー 課題 対応 完了 保留 検討 資料 リンク 添付 期限 継続 重要 バグ 修正 リリース 手順 環境 設定'.split(' ');
    let seed = 42;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const sentence = () => {
      const n = 5 + Math.floor(rnd() * 10);
      const p = [];
      for (let i = 0; i < n; i++) p.push(WORDS[Math.floor(rnd() * WORDS.length)]);
      return p.join('') + '。';
    };
    const mdBody = () => {
      const out = ['# ' + sentence()];
      for (let p = 0; p < 6; p++) { out.push('## ' + sentence()); for (let s = 0; s < 4; s++) out.push('- ' + sentence()); }
      return out.join('\n');
    };
    const revs = [];
    let body = mdBody();
    for (let i = 0; i < 2000; i++) {
      if (rnd() < 0.7) body += '\n' + sentence();
      else body = body.replace(WORDS[Math.floor(rnd() * WORDS.length)], WORDS[Math.floor(rnd() * WORDS.length)]);
      revs.push(JSON.stringify({ id: 'r' + i, entry_lid: 'e0', snapshot: body, created_at: 'T' }));
      if (body.length > 40000) body = mdBody();
    }
    const rawMB = Math.round(revs.reduce((a, r2) => a + r2.length, 0) * 3 / 1048576 * 10) / 10;

    const db = await new Promise((res, rej) => {
      const rq = indexedDB.open('io-bench', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('revs');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    const put = (key, value) => new Promise((res, rej) => {
      const t = db.transaction('revs', 'readwrite');
      t.objectStore('revs').put(value, key);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    const gzip = async (text) => {
      const cs = new CompressionStream('gzip');
      const wr = cs.writable.getWriter();
      wr.write(new TextEncoder().encode(text));
      wr.close();
      const chunks = [];
      const rd = cs.readable.getReader();
      for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); }
      return new Blob(chunks);
    };

    const t0 = performance.now();
    if (mode === 'P1') {
      // 1 revision = 1 record = 1 tx(編集ごとの自動保存の形)
      for (let i = 0; i < revs.length; i++) await put('r' + i, revs[i]);
    } else {
      // segment pack: 1MB 貯まったら 1 record として put
      const SEG = 1048576;
      let buf = [];
      let bufBytes = 0;
      let seg = 0;
      const flush = async () => {
        if (!buf.length) return;
        const joined = '[' + buf.join(',') + ']';
        await put('seg' + seg++, mode === 'P3' ? await gzip(joined) : joined);
        buf = []; bufBytes = 0;
      };
      for (let i = 0; i < revs.length; i++) {
        buf.push(revs[i]);
        bufBytes += revs[i].length;
        if (bufBytes >= SEG) await flush();
      }
      await flush();
    }
    const wallMs = Math.round(performance.now() - t0);
    const est = await navigator.storage.estimate();
    db.close();
    return { rawMB, wallMs, storedMB: Math.round((est.usage ?? 0) / 1048576 * 10) / 10 };
  }, config);
  // close 前に sync してディスク到達分を確定させる
  await ctx.close();
  const d1 = deviceWrittenMB();
  fs.rmSync('/tmp/pw-io-prof-' + config, { recursive: true, force: true });
  results.push({ config, ...r, deviceWrittenMB: Math.round((d1 - d0) * 10) / 10 });
  console.log(JSON.stringify(results[results.length - 1]));
}
server.close();
