/* eslint-disable */
/**
 * 「編集を重ねると保存領域がどれだけ育つか」を、**レコードを全件読み戻して**測る(2026-07-26)。
 *
 * なぜ storage-write-io.mjs と別に要るのか:
 *   あちらの使用量は `navigator.storage.estimate()`。これは **IndexedDB 自身の
 *   未回収領域(LevelDB の未 compaction 分)を含む**ため、
 *   「アプリが残しているデータ」と「IDB がまだ捨てていないゴミ」を区別できない。
 *
 *   layout 5(segments)には
 *     > 既存 lid は segment 間を移動しない … **旧コピーは compaction まで残る**
 *   と実装コメントがある(idb-store.ts, appendBodySegments)。
 *   **これが本当に永続的な肥大なのか、IDB の GC 遅れなのか**を分けるには、
 *   estimate() ではなく **生きている record の実バイト数**を数えるしかない。
 *
 * 測るもの: 同一セッションで編集を重ねながら、節目ごとに
 *   - store(containers / segments / assets)別の **生存 record 数と合計バイト数**
 *   - 役割別(core / __entry__: / __rev__: / __order__: / rev pack / body pack)の内訳
 *
 * ⚠ **単位が混ざることの明示**:
 *   containers の値はオブジェクトなので `JSON.stringify(v).length`(文字数)、
 *   segments の値は gzip Blob なので `.size`(バイト)で数える。
 *   したがって **腕をまたいだ絶対値の比較には使えない**(A は非圧縮の文字数、
 *   C は圧縮後のバイト数)。本計器が答えるのは
 *   **「同じ腕の中で、編集回数に対して増えるか」**という 1 点だけである。
 *
 * 使い方:
 *   node tests/bench/storage-footprint.mjs
 *   SFP_FIXTURE=bench-fixtures/c-1000-rev.json SFP_MARKS=1,4,16,64 node tests/bench/storage-footprint.mjs
 *
 * ⚠ 実行中に `npm run build:bundle` / `build:release` を回さないこと。
 */
import { createRequire } from 'node:module';
import { createReadStream, existsSync, statSync, readFileSync, rmSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import http from 'node:http';

const require = createRequire('/home/user/PKC2/package.json');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const FIXTURE = process.env.SFP_FIXTURE || 'bench-fixtures/c-1000-rev.json';
const MARKS = (process.env.SFP_MARKS || '1,4,16,64').split(',').map(Number).filter((n) => n > 0);
const CID = 'sfpbench';

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

/** boot 完了を拾う仕掛け(他ハーネスと同じ)。 */
const BOOT_HOOK = `
(() => {
  let pkc;
  Object.defineProperty(window, 'PKC', {
    configurable: true, get() { return pkc; },
    set(v) {
      pkc = v;
      if (v && typeof v === 'object' && !v.__sfpT) {
        Object.defineProperty(v, '__sfpT', { value: true });
        let ready = v.bootReady;
        const arm = (p) => { if (p && p.then) p.then(() => { window.__sfpBoot = performance.now(); }); };
        Object.defineProperty(v, 'bootReady', { configurable: true, get() { return ready; }, set(p) { ready = p; arm(p); } });
        arm(ready);
      }
    },
  });
})();`;

/**
 * 生存 record を全件走査してバイト数を積む。**estimate() は使わない。**
 * store 名はアプリの実装に合わせて拾う(存在しない store は skip)。
 */
const PROBE = `(async () => {
  const db = await new Promise((res, rej) => {
    const rq = indexedDB.open('pkc2');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  const sizeOf = (v) => {
    if (v == null) return 0;
    if (typeof v === 'string') return v.length;
    if (typeof Blob !== 'undefined' && v instanceof Blob) return v.size;
    if (v instanceof ArrayBuffer) return v.byteLength;
    if (ArrayBuffer.isView(v)) return v.byteLength;
    try { return JSON.stringify(v).length; } catch { return -1; }
  };
  const role = (store, key) => {
    const k = String(key);
    if (store !== 'containers') {
      if (k.includes(':rev:')) return 'segments rev pack';
      if (k.includes(':body:')) return 'segments body pack';
      return store;
    }
    if (k === '__default__') return '__default__';
    if (k.startsWith('__entry__:')) return '__entry__:';
    if (k.startsWith('__rev__:')) return '__rev__:';
    if (k.startsWith('__body__:')) return '__body__:';
    if (k.startsWith('__order__:')) return '__order__:';
    if (k.startsWith('__rel__:')) return '__rel__:';
    if (k.startsWith('__assetmeta__:')) return '__assetmeta__:';
    if (k.startsWith('workspace')) return 'workspace';
    return 'core record';
  };
  // quota 側(= IDB の未回収領域を**含む**)も同時に拾う。
  // 生存データと並べて初めて「アプリの蓄積か、IDB の GC 遅れか」が分かる。
  let quotaMB = -1;
  try {
    const est = await navigator.storage.estimate();
    quotaMB = (est && typeof est.usage === 'number') ? est.usage / 1048576 : -1;
  } catch { /* 取れない環境では -1 */ }
  const out = { stores: {}, roles: {}, total: 0, records: 0, quotaMB };
  const names = Array.from(db.objectStoreNames);
  for (const name of names) {
    const tx = db.transaction(name, 'readonly');
    const st = tx.objectStore(name);
    const [keys, values] = await Promise.all([
      new Promise((res, rej) => { const r = st.getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
      new Promise((res, rej) => { const r = st.getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }),
    ]);
    let bytes = 0;
    for (let i = 0; i < keys.length; i++) {
      const b = Math.max(0, sizeOf(values[i]));
      bytes += b;
      const rk = role(name, keys[i]);
      const cur = out.roles[rk] || { bytes: 0, records: 0 };
      cur.bytes += b; cur.records++;
      out.roles[rk] = cur;
    }
    out.stores[name] = { records: keys.length, bytes };
    out.total += bytes;
    out.records += keys.length;
  }
  db.close();
  return out;
})()`;

const ROW_SEL = '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]';

function textLidsOf(p) {
  const c = JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
  return c.entries.filter((e) => e.archetype === 'text').map((e) => e.lid);
}

async function editOnce(page, lid) {
  await page.locator(`${ROW_SEL}[data-pkc-lid="${lid}"]`).first().click();
  await page.waitForTimeout(80);
  await page.locator('[data-pkc-action="begin-edit"]').first().click();
  await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'editing'`, null, { timeout: 20000 });
  await page.locator('[data-pkc-field="body"]').first().click();
  await page.keyboard.type('x');
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'ready'`, null, { timeout: 20000 });
  await page.waitForTimeout(700); // 保存 debounce(300ms)を越える
}

const ARMS = [
  { key: 'A', label: '既定(inline)', flags: { 'persistence.differential_save': 0, 'persistence.lazy_entry_bodies': 0 } },
  { key: 'B', label: '差分保存(split v1)', flags: { 'persistence.differential_save': 1, 'persistence.lazy_entry_bodies': 0 } },
  { key: 'C', label: '差分保存+lazy(layout 5)', flags: { 'persistence.differential_save': 1, 'persistence.lazy_entry_bodies': 1 } },
];

const srv = await serveRepo();
const LIDS = textLidsOf(FIXTURE);
const fx = JSON.parse(readFileSync(join(ROOT, FIXTURE), 'utf8'));
const raw = readFileSync(join(ROOT, FIXTURE), 'utf8');
console.log(`fixture: ${FIXTURE} — N=${fx.entries.length} / M=${fx.revisions.length} / ${(statSync(join(ROOT, FIXTURE)).size / 1048576).toFixed(1)} MB`);
console.log(`編集の節目: ${MARKS.join(', ')} 回。各節目で **生存 record を全件読み戻して** バイト数を積む。`);
console.log(`⚠ containers は JSON 文字数 / segments は gzip バイト数。**腕をまたいだ絶対値比較には使えない**。`);
console.log(`   本計器が答えるのは「同じ腕の中で編集回数に対して増えるか」の 1 点。\n`);

const MAX = Math.max(...MARKS);
const series = [];

for (const arm of ARMS) {
  const prof = `/tmp/pw-sfp-${arm.key}`;
  rmSync(prof, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(prof, {
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    viewport: { width: 1280, height: 900 },
  });
  await ctx.addInitScript(BOOT_HOOK);
  const page = await ctx.newPage();
  await page.goto(`${srv.origin}/dist/pkc2.html`);
  await page.waitForFunction('typeof window.__sfpBoot === "number"', null, { timeout: 180000 });
  await page.waitForTimeout(800);
  await page.evaluate(async ({ raw, cid }) => {
    const c = JSON.parse(raw); c.meta.container_id = cid;
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    await new Promise((res, rej) => { const t = db.transaction('containers', 'readwrite'); const s = t.objectStore('containers'); s.clear(); s.put(c, cid); s.put(cid, '__default__'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    db.close();
  }, { raw, cid: CID });

  const qs = Object.entries(arm.flags).map(([k, v]) => `pkc-flag=${k}=${v}`).join('&');
  await page.goto(`${srv.origin}/dist/pkc2.html?${qs}`);
  await page.waitForFunction('typeof window.__sfpBoot === "number"', null, { timeout: 300000 });
  await page.waitForFunction(`document.querySelectorAll('${ROW_SEL}').length > 20`, null, { timeout: 120000 });

  // 形式変換(1 回きり)を先に済ませる。以後の増分が「定常の蓄積」。
  await editOnce(page, LIDS[0]);
  await page.waitForTimeout(2500);
  const base = await page.evaluate(PROBE);

  const points = [];
  let done = 0;
  for (const mark of MARKS) {
    while (done < mark) {
      await editOnce(page, LIDS[(done + 1) % LIDS.length]);
      done++;
    }
    await page.waitForTimeout(2500);
    points.push({ mark, probe: await page.evaluate(PROBE) });
  }
  await ctx.close();

  console.log(`■ ${arm.key} ${arm.label}`);
  console.log(`   変換直後(基準): 生存 ${(base.total / 1048576).toFixed(2)} MB / ${base.records} record`
    + ` | quota ${base.quotaMB.toFixed(2)} MB`);
  for (const p of points) {
    const d = p.probe.total - base.total;
    const dq = p.probe.quotaMB - base.quotaMB;
    console.log(`   ${String(p.mark).padStart(3)} 編集後: 生存 ${(p.probe.total / 1048576).toFixed(2)} MB / ${String(p.probe.records).padStart(6)} record`
      + `   基準比 ${d >= 0 ? '+' : ''}${(d / 1024).toFixed(0)} KB (${(d / 1024 / p.mark).toFixed(1)} KB/編集)`
      + ` | quota ${p.probe.quotaMB.toFixed(2)} MB  ${dq >= 0 ? '+' : ''}${(dq * 1024).toFixed(0)} KB (${(dq * 1024 / p.mark).toFixed(1)} KB/編集)`);
  }
  const last = points[points.length - 1].probe;
  const rows = Object.entries(last.roles).sort((a, b) => b[1].bytes - a[1].bytes);
  console.log(`   最終内訳(${MARKS[MARKS.length - 1]} 編集後):`);
  for (const [r, v] of rows) {
    if (v.bytes < 1024) continue;
    console.log(`     ${(v.bytes / 1024).toFixed(0).padStart(9)} KB  ${String(v.records).padStart(6)} record  ${r}`);
  }
  console.log('');
  series.push({ arm, base, points });
}

await srv.close();

console.log('─'.repeat(76));
console.log('編集を重ねたときの **生存データの伸び**(基準 = 形式変換直後):');
console.log('');
const head = ['腕'.padEnd(28), ...MARKS.map((m) => `${m} 編集`.padStart(12))].join('');
console.log(head);
for (const s of series) {
  const cells = s.points.map((p) => `${((p.probe.total - s.base.total) / 1024).toFixed(0)} KB`.padStart(12));
  console.log(`${(s.arm.key + ' ' + s.arm.label).padEnd(28)}${cells.join('')}`);
}
console.log('');

// ── 無効判定 ──────────────────────────────────────────
// perf-measurement §5「ハーネス自身に無効判定を埋める」。
const invalid = [];
for (const s of series) {
  if (s.base.total <= 0) invalid.push(`${s.arm.key} の基準が 0 バイト — probe が record を拾えていない`);
  if (s.base.records <= 1) invalid.push(`${s.arm.key} の基準 record 数が ${s.base.records} — seed か変換が効いていない`);
  const last = s.points[s.points.length - 1];
  if (last.probe.total < s.base.total * 0.5) {
    invalid.push(`${s.arm.key} が基準の半分未満に縮んだ — 途中でデータが消えている可能性`);
  }
}
// A(inline)は「編集で伸びない」ことが構造から分かっている対照。
// A が伸びているなら、それは計器かワークロードの側の問題(revision の増加分を
// 差し引けていない等)であり、C の伸びを layout 5 のせいにしてはいけない。
const A = series.find((s) => s.arm.key === 'A');
if (A) {
  const growth = A.points[A.points.length - 1];
  const perEdit = (growth.probe.total - A.base.total) / 1024 / growth.mark;
  console.log(`対照 A(inline)の伸び: ${perEdit.toFixed(1)} KB/編集`);
  console.log(`  ← これは **revision が 1 件増える分**(全 layout 共通)。`);
  console.log(`     他の腕の伸びは、この値を超えた分だけが「その形式固有の蓄積」。`);
}
if (invalid.length) {
  console.log('');
  for (const m of invalid) console.log(`⚠ ${m}`);
  console.log('⛔ 上の警告がある限り、この実行の数字を結論に使ってはならない。');
  process.exitCode = 1;
}
