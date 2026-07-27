/* eslint-disable */
/**
 * 起動時マイグレーションのピークヒープ実測(2026-07-26、user 報告
 * 「実行時メモリが爆発してる」の調査)。
 *
 * ## なぜ要るか
 *
 * #1035 で `persistence.differential_save` を退役させ、split 形式で保存されて
 * いた storage を **次回起動の保存で inline へ書き戻す**ようにした。その経路は
 * `save()` を通る:
 *
 *   1. `putAssets(container)` ── 全 asset を書く
 *   2. `{ ...toWrite, assets: {} }` ── container のコピーを作る
 *   3. IDB の `put` ── container 全体を structuredClone する
 *
 * **添付が多いと、コンテナの数倍が同時にメモリへ載る**のではないか。
 * ⚠ この経路は今まで一度も測られていない ── commit 済 fixture が 5 つとも
 * 実質 asset ゼロ相当で、添付の次元が「ゼロ件 = 測っていない」状態だった
 * (`--asset-kb` で作れるようにしたのが同日の #1038)。
 *
 * ## 対照群(perf-measurement skill:「何もしない」ではなく
 *    「測りたい操作以外を全部同じにしたもの」)
 *
 *   A(control) : **inline 形式**で seed して起動 ── 移行は起きない
 *   B(migrate) : **split 形式**で seed して起動 ── 起動時に移行が走る
 *
 * 同じ fixture・同じビルド・同じ計器で交互に測る。差分が移行のコスト。
 *
 * 使い方:
 *   node tests/bench/migration-heap.mjs --fixture=/path/to/c-assetheavy.json
 */
import { chromium } from 'playwright';
import http from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, rmSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';

const ROOT = process.cwd();
const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const FIXTURE = argOf('fixture', 'bench-fixtures/c-5000.json');
const CID = 'mhbench';
const ROW_SEL = '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

/** repo を配信しつつ、`/__fixture.json` だけ任意の絶対パスへ写す。 */
function serve(fixturePath) {
  const server = http.createServer((req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const f = p === '/__fixture.json' ? fixturePath : join(ROOT, p);
      if (p !== '/__fixture.json' && !f.startsWith(ROOT + sep) && f !== ROOT) {
        res.writeHead(403); res.end(); return;
      }
      if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, {
        'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(f).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((x) => server.close(x)),
  })));
}

const MB = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

const fixtureAbs = FIXTURE.startsWith('/') ? FIXTURE : join(ROOT, FIXTURE);
if (!existsSync(fixtureAbs)) { console.log(`⛔ fixture が無い: ${fixtureAbs}`); process.exit(1); }
console.log(`■ fixture ${fixtureAbs} (${(statSync(fixtureAbs).size / 1024 / 1024).toFixed(1)} MB)`);

const srv = await serve(fixtureAbs);

/** container を IDB へ seed する。split=true なら差分保存形式で置く。 */
const SEED = async ({ url, cid, split }) => {
  const c = await (await fetch(url)).json();
  c.meta.container_id = cid;
  const db = await new Promise((res, rej) => {
    const rq = indexedDB.open('pkc2');
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
  const put = (store, pairs) => new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const [k, v] of pairs) s.put(v, k);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
  await new Promise((res, rej) => {
    const t = db.transaction(['containers', 'assets'], 'readwrite');
    t.objectStore('containers').clear(); t.objectStore('assets').clear();
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
  // assets は常に別 bucket(形式に関係なく同じ)
  await put('assets', Object.entries(c.assets).map(([k, v]) => [`${cid}:${k}`, v]));
  if (split) {
    // 差分保存(split)形式:core は marker のみ、実体は per-entry record
    await put('containers', c.entries.map((e) => [`__entry__:${cid}:${e.lid}`, e]));
    await put('containers', (c.revisions ?? []).map((r) => [`__rev__:${cid}:${r.id}`, r]));
    await put('containers', [
      [cid, {
        ...c, entries: [], revisions: [], assets: {},
        __pkc_split__: {
          entryOrder: c.entries.map((e) => e.lid),
          revOrder: (c.revisions ?? []).map((r) => r.id),
        },
      }],
      ['__default__', cid],
    ]);
  } else {
    await put('containers', [[cid, { ...c, assets: {} }], ['__default__', cid]]);
  }
  db.close();
};

async function arm(label, split) {
  const prof = `/tmp/pw-mh-${split ? 'B' : 'A'}`;
  rmSync(prof, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(prof, {
    executablePath: process.env.MH_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    viewport: { width: 1400, height: 950 },
  });
  // 🔴 ピーク heap は **分散が効果より大きい**(2026-07-26 に実測で判明:
  //    同一コードの control 腕が 157.3 → 286.3 MB と 130MB 動いた)。
  //    決定的な観測点として **assets bucket への put 回数とバイト数**を数える。
  //    こちらは GC タイミングに依存しない。
  await ctx.addInitScript(() => {
    const w = /** @type {any} */ (window);
    const size = (v) => {
      if (typeof v === 'string') return v.length;
      if (v && typeof v.size === 'number') return v.size;
      if (v) { try { return JSON.stringify(v).length; } catch { return 0; } }
      return 0;
    };
    w.__putTally = { assets: { n: 0, bytes: 0 }, containers: { n: 0, bytes: 0 } };
    // 読出も数える ── 「起動で全 asset を読んでいないか」の決定的な観測点。
    w.__getTally = { assets: { n: 0, bytes: 0 }, containers: { n: 0, bytes: 0 } };
    w.__stacks = [];
    w.__resetTally = () => {
      w.__stacks.length = 0;
      for (const t of [w.__putTally, w.__getTally]) {
        for (const k of Object.keys(t)) { t[k].n = 0; t[k].bytes = 0; }
      }
    };
    const origPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      try {
        const t = w.__putTally[this.name];
        if (t) { t.n += 1; t.bytes += size(value); }
      } catch { /* noop */ }
      return origPut.call(this, value, key);
    };
    for (const m of ['get', 'getAll']) {
      const orig = IDBObjectStore.prototype[m];
      IDBObjectStore.prototype[m] = function (...args) {
        const req = orig.apply(this, args);
        const store = this.name;
        const stk = store === 'assets' ? (new Error().stack || '') : '';
        try {
          req.addEventListener('success', () => {
            const t = w.__getTally[store];
            if (!t) return;
            const r = req.result;
            if (Array.isArray(r)) { t.n += r.length; for (const v of r) t.bytes += size(v); }
            else if (r !== undefined) { t.n += 1; t.bytes += size(r); }
            if (store === 'assets' && w.__stacks.length < 400) w.__stacks.push(stk);
          });
        } catch { /* noop */ }
        return req;
      };
    }
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');
  const used = async () => {
    const m = await cdp.send('Performance.getMetrics');
    return m.metrics.find((x) => x.name === 'JSHeapUsedSize').value;
  };
  const settled = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(300);
    return used();
  };

  await page.goto(`${srv.origin}/dist/pkc2.html`);
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 180000 });
  await page.evaluate(SEED, { url: `${srv.origin}/__fixture.json`, cid: CID, split });

  // ⚠ seed ページ(52MB の JSON parse + 全 asset 書込)の分が混ざらないよう、
  //    計測対象の起動の直前で tally を 0 に戻す。
  await page.evaluate('window.__resetTally && window.__resetTally()');

  // 起動 → (B なら)移行が走る。ピークを拾うため短間隔でサンプリング。
  let peak = 0;
  const t = setInterval(() => { used().then((v) => { if (v > peak) peak = v; }).catch(() => {}); }, 120);
  await page.goto(`${srv.origin}/dist/pkc2.html`); // ← ここからが計測対象の起動
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 });
  await page.waitForFunction(`document.querySelectorAll('${ROW_SEL}').length > 10`, null, { timeout: 180000 });
  await page.waitForTimeout(6000); // debounce 保存 + 移行の完了を待つ
  clearInterval(t);
  const after = await settled();
  // seed は初回ページで済ませているので、この tally は **起動だけ**の書込。
  const tally = await page.evaluate('window.__putTally');
  const reads = await page.evaluate('window.__getTally');
  const stacks = await page.evaluate('window.__stacks || []');
  const byFrame = new Map();
  for (const st of stacks) {
    const line = String(st).split('\n').slice(1).find((l) => !/IDBObjectStore|migration-heap|<anonymous>:/.test(l)) || '(unknown)';
    const k = line.trim().slice(0, 120);
    byFrame.set(k, (byFrame.get(k) || 0) + 1);
  }

  // 実際に inline へ移行できたか(B の成否確認)
  const shape = await page.evaluate(async (cid) => {
    const db = await new Promise((res, rej) => {
      const rq = indexedDB.open('pkc2');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
    const core = await new Promise((res, rej) => {
      const r = db.transaction('containers').objectStore('containers').get(cid);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const keys = await new Promise((res, rej) => {
      const r = db.transaction('containers').objectStore('containers').getAllKeys();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    db.close();
    return {
      split: core && core.__pkc_split__ !== undefined,
      entries: core ? (core.entries || []).length : -1,
      sidecars: keys.filter((k) => String(k).startsWith('__entry__:')).length,
    };
  }, CID);

  await ctx.close();
  console.log(`■ ${label}`);
  console.log(`   🔑 起動中の asset 読出: ${reads.assets.n} 件 / ${MB(reads.assets.bytes)}  ← 決定的`);
  for (const [frame, n] of [...byFrame.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`      ${String(n).padStart(4)} 件  ${frame}`);
  }
  console.log(`   🔑 起動中の asset 書込: ${tally.assets.n} 回 / ${MB(tally.assets.bytes)}  ← 決定的`);
  console.log(`      containers 書込:    ${tally.containers.n} 回 / ${MB(tally.containers.bytes)}`);
  console.log(`   ピーク heap ${MB(peak)} / 収束後 ${MB(after)}  ⚠ ピークは分散大・参考値`);
  console.log(`   storage: split=${shape.split} / core entries=${shape.entries} / __entry__ record=${shape.sidecars}`);
  return { peak, after, shape, tally, reads };
}

const A = await arm('A(control)inline で seed ── 移行なし', false);
const B = await arm('B(migrate)split で seed ── 起動時に inline へ移行', true);
await srv.close();

console.log('');
console.log('■ 差(B − A = 移行のコスト)');
console.log(`   🔑 asset 読出  ${A.reads.assets.n} 件 / ${MB(A.reads.assets.bytes)}  →  ${B.reads.assets.n} 件 / ${MB(B.reads.assets.bytes)}`);
console.log(`   🔑 asset 書込  ${A.tally.assets.n} 回 / ${MB(A.tally.assets.bytes)}  →  ${B.tally.assets.n} 回 / ${MB(B.tally.assets.bytes)}`);
console.log(`      containers  ${A.tally.containers.n} 回 / ${MB(A.tally.containers.bytes)}  →  ${B.tally.containers.n} 回 / ${MB(B.tally.containers.bytes)}`);
console.log(`   ピーク heap   ${MB(A.peak)} → ${MB(B.peak)}  ⚠ 分散が大きく、単独では結論に使えない`);
console.log(`   収束後 heap   ${MB(A.after)} → ${MB(B.after)}`);
console.log('');
if (B.shape.split) {
  console.log('⛔ B が inline へ移行できていない ── この計測は成立していない(移行前に測っている)');
}
console.log('⚠ ピークはサンプリング(120ms 間隔)なので取りこぼしうる。下限として読む。');
