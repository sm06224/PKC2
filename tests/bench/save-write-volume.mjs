/* eslint-disable */
/**
 * 保存 1 回で「アプリが何をストレージに書かせているか」を直接測る(2026-07-26)。
 *
 * なぜ storage-write-io.mjs と別に要るのか:
 *   あちらは `/proc/diskstats` の実デバイス書込を測る。実際のコストとしては正しいが、
 *   ブラウザ自身の書込(1 操作あたり 1〜2MB)が混じるため対照群の差し引きが要り、
 *   **倍率は信頼できない**ところまでしか分解できなかった
 *   (docs/development/storage-write-io-bench-2026-07-25.md §2-b)。
 *
 *   本ベンチは `IDBObjectStore.put/delete` をページ内で包んで
 *   **key ごとの書込バイト数**を積む。ブラウザのオーバーヘッドは 1 バイトも入らない。
 *   「毎保存で O(N+M) を書いている」という主張は**この計器でしか検証できない**。
 *
 * 測るもの: 1 編集 = 1 保存サイクルにつき
 *   - put された key の一覧と、それぞれのバイト数
 *   - N(entries)/ M(revisions)に比例する項がどれか
 *
 * 使い方(Linux 前提ではない — diskstats を使わないので任意の OS で動く):
 *   node tests/bench/save-write-volume.mjs
 *   SWV_FIXTURE=bench-fixtures/c-5000-rev.json SWV_EDITS=3 node tests/bench/save-write-volume.mjs
 *
 * ⚠ 実行中に `npm run build:bundle` / `build:release` を回さないこと
 *   (vite が dist/ を作り直すため走行中のブラウザが落ちる)。
 */
import { createRequire } from 'node:module';
import { createReadStream, existsSync, statSync, readFileSync, rmSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import http from 'node:http';

const require = createRequire('/home/user/PKC2/package.json');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const FIXTURE = process.env.SWV_FIXTURE || 'bench-fixtures/c-5000-rev.json';
const EDITS = Number(process.env.SWV_EDITS || 3);
const CID = 'swvbench';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function serveRepo() {
  const server = http.createServer((req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const f = join(ROOT, p);
      if (!f.startsWith(ROOT + sep) && f !== ROOT) { res.writeHead(403); res.end(); return; }
      if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(f).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((x) => server.close(x)),
  })));
}

/**
 * ページ内の計器。put / delete を包んで「key → バイト数」を積む。
 *
 * バイト数は `JSON.stringify(value).length`(Blob は `.size`)で近似する。
 * IDB の実表現(structured clone)とは一致しないが、**腕をまたいで同じ尺度**であり、
 * 「どの key が N・M に比例するか」を見るには十分。絶対値の主張には使わない。
 */
const INSTRUMENT = `
(() => {
  const S = { recording: false, ops: [] };
  window.__swv = S;
  window.__swvStart = () => { S.recording = true; S.ops = []; };
  window.__swvStop = () => { S.recording = false; return S.ops; };

  const sizeOf = (v) => {
    try {
      if (v == null) return 0;
      if (typeof v === 'string') return v.length;
      if (typeof Blob !== 'undefined' && v instanceof Blob) return v.size;
      return JSON.stringify(v).length;
    } catch { return -1; }
  };

  const wrap = (method, kind) => {
    const orig = IDBObjectStore.prototype[method];
    if (!orig) return;
    IDBObjectStore.prototype[method] = function (...args) {
      if (S.recording) {
        try {
          // put(value, key) / delete(key)
          const key = kind === 'delete' ? args[0] : args[1];
          const bytes = kind === 'delete' ? 0 : sizeOf(args[0]);
          S.ops.push({ kind, store: this.name, key: String(key ?? '(inline)'), bytes, t: Math.round(performance.now()) });
        } catch { /* 計器が本体を壊さない */ }
      }
      return orig.apply(this, args);
    };
  };
  wrap('put', 'put');
  wrap('add', 'put');
  wrap('delete', 'delete');

  let pkc;
  Object.defineProperty(window, 'PKC', {
    configurable: true, get() { return pkc; },
    set(v) {
      pkc = v;
      if (v && typeof v === 'object' && !v.__swvT) {
        Object.defineProperty(v, '__swvT', { value: true });
        let ready = v.bootReady;
        const arm = (p) => { if (p && p.then) p.then(() => { window.__swvBoot = performance.now(); }); };
        Object.defineProperty(v, 'bootReady', { configurable: true, get() { return ready; }, set(p) { ready = p; arm(p); } });
        arm(ready);
      }
    },
  });
})();`;

const ROW_SEL = '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]';

function textLidsOf(p) {
  const c = JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
  return c.entries.filter((e) => e.archetype === 'text').map((e) => e.lid);
}

async function editOnce(page, lid) {
  await page.locator(`${ROW_SEL}[data-pkc-lid="${lid}"]`).first().click();
  await page.waitForTimeout(120);
  await page.locator('[data-pkc-action="begin-edit"]').first().click();
  await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'editing'`, null, { timeout: 20000 });
  await page.locator('[data-pkc-field="body"]').first().click();
  await page.keyboard.type('x');
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'ready'`, null, { timeout: 20000 });
}

const ARMS = [
  // ⚠ 「編集していないのに保存が走るか」を直接見る腕。
  //    UI 設定の正本は container の `__settings__`(ui-prefs.ts:8)なので、
  //    選択するだけで SETTINGS_CHANGED → コンテナ全体保存が起きうる。
  //    推測で実装しないための確認用。
  { key: 'S', label: '選択のみ(編集しない)', selectOnly: true, flags: { 'persistence.differential_save': 0, 'persistence.lazy_entry_bodies': 0 } },
  { key: 'A', label: '既定(inline save)', flags: { 'persistence.differential_save': 0, 'persistence.lazy_entry_bodies': 0 } },
  { key: 'B', label: '差分保存(split v1)', flags: { 'persistence.differential_save': 1, 'persistence.lazy_entry_bodies': 0 } },
  { key: 'C', label: '差分保存+lazy(layout 5)', flags: { 'persistence.differential_save': 1, 'persistence.lazy_entry_bodies': 1 } },
];

/** key を「役割」に丸める。個別 key ではなく**項**を見たいので。 */
function classify(op) {
  const k = op.key;
  if (k === '__default__') return '__default__ ポインタ';
  if (k.startsWith('__entry__:')) return '__entry__:(per-entry record)';
  if (k.startsWith('__rev__:')) return '__rev__:(per-revision record)';
  if (k.startsWith('__body__:')) return '__body__:(per-body record)';
  if (op.store === 'segments' && k.includes(':rev:')) return 'segments rev pack';
  if (op.store === 'segments' && k.includes(':body:')) return 'segments body pack';
  if (op.store === 'assets') return 'assets';
  if (k.startsWith('__workspace')) return 'workspace レコード';
  return `core record(${k})`;
}

const srv = await serveRepo();
const LIDS = textLidsOf(FIXTURE);
const fx = JSON.parse(readFileSync(join(ROOT, FIXTURE), 'utf8'));
const N = fx.entries.length, M = fx.revisions.length;
console.log(`fixture: ${FIXTURE} — N(entries)=${N} / M(revisions)=${M} / ${(statSync(join(ROOT, FIXTURE)).size / 1048576).toFixed(1)} MB`);
console.log(`1 編集 = エントリ選択 → 編集 → 1 文字 → 確定。編集 ${EDITS} 回の平均を出す。\n`);

const raw = readFileSync(join(ROOT, FIXTURE), 'utf8');
const summary = [];

for (const arm of ARMS) {
  const prof = `/tmp/pw-swv-${arm.key}`;
  rmSync(prof, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(prof, {
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    viewport: { width: 1280, height: 900 },
  });
  await ctx.addInitScript(INSTRUMENT);
  const page = await ctx.newPage();

  await page.goto(`${srv.origin}/dist/pkc2.html`);
  await page.waitForFunction('typeof window.__swvBoot === "number"', null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  await page.evaluate(async ({ raw, cid }) => {
    const c = JSON.parse(raw); c.meta.container_id = cid;
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    await new Promise((res, rej) => { const t = db.transaction('containers', 'readwrite'); const s = t.objectStore('containers'); s.clear(); s.put(c, cid); s.put(cid, '__default__'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  }, { raw, cid: CID });

  const qs = Object.entries(arm.flags).map(([k, v]) => `pkc-flag=${k}=${v}`).join('&');
  await page.goto(`${srv.origin}/dist/pkc2.html?${qs}`);
  await page.waitForFunction('typeof window.__swvBoot === "number"', null, { timeout: 300000 });
  await page.waitForFunction(`document.querySelectorAll('${ROW_SEL}').length > 50`, null, { timeout: 120000 });

  // 変換保存(1 回きり)は計測に含めない。目的は**定常の 1 編集**の内訳。
  await editOnce(page, LIDS[0]);
  await page.waitForTimeout(4000);

  await page.evaluate('window.__swvStart()');
  for (let i = 0; i < EDITS; i++) {
    if (arm.selectOnly) {
      await page.locator(`${ROW_SEL}[data-pkc-lid="${LIDS[(i + 1) % LIDS.length]}"]`).first().click();
      await page.waitForTimeout(300);
    } else {
      await editOnce(page, LIDS[(i + 1) % LIDS.length]);
    }
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(3000);
  const ops = await page.evaluate('window.__swvStop()');
  await ctx.close();

  // 役割ごとに集計
  const byRole = new Map();
  for (const op of ops) {
    const role = classify(op);
    const cur = byRole.get(role) || { puts: 0, deletes: 0, bytes: 0 };
    if (op.kind === 'delete') cur.deletes++; else { cur.puts++; cur.bytes += Math.max(0, op.bytes); }
    byRole.set(role, cur);
  }
  // 1 編集で保存が何回走っているかを見るため、core record の put 時刻を出す
  const coreTimes = ops.filter((o) => o.kind === 'put' && classify(o).startsWith('core record')).map((o) => o.t);
  const totalBytes = [...byRole.values()].reduce((a, r) => a + r.bytes, 0);
  const totalPuts = [...byRole.values()].reduce((a, r) => a + r.puts, 0);

  const unit = arm.selectOnly ? '選択' : '編集';
  console.log(`■ ${arm.key} ${arm.label}  — ${EDITS} ${unit}で put ${totalPuts} 回 / ${(totalBytes / 1048576).toFixed(2)} MB`);
  console.log(`   1 ${unit}あたり: put ${(totalPuts / EDITS).toFixed(1)} 回 / **${(totalBytes / EDITS / 1024).toFixed(0)} KB**`);
  const rows = [...byRole.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
  for (const [role, r] of rows) {
    if (r.bytes === 0 && r.deletes === 0) continue;
    const perEdit = r.bytes / EDITS;
    console.log(`     ${(perEdit / 1024).toFixed(0).padStart(8)} KB/編集  put ${(r.puts / EDITS).toFixed(1).padStart(5)} 回  ${role}`
      + (r.deletes ? `  (delete ${(r.deletes / EDITS).toFixed(1)} 回)` : ''));
  }
  if (coreTimes.length > 1) {
    const gaps = coreTimes.slice(1).map((t, i) => t - coreTimes[i]);
    console.log(`     core record の put 間隔(ms): ${gaps.join(' / ')}`);
    console.log(`     → 300ms 前後の間隔があれば「1 編集で保存が 2 回走っている」`);
  }
  console.log('');
  summary.push({ arm, perEditKB: totalBytes / EDITS / 1024, rows });
}

await srv.close();

console.log('─'.repeat(76));
console.log(`N=${N} / M=${M} に対する 1 編集あたりの書込量:`);
for (const s of summary) console.log(`  ${s.arm.key} ${s.arm.label.padEnd(26)} ${s.perEditKB.toFixed(0).padStart(8)} KB`);
console.log('');
console.log('この計器はブラウザのオーバーヘッドを含まない。「アプリが書けと言った量」そのもの。');
console.log('N・M に比例する項があれば、上の内訳でその役割の行が支配的に出る。');
