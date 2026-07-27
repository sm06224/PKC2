/* eslint-disable */
/**
 * 1 編集で **メインスレッドが何 ms 止まるか** を測る(2026-07-26)。
 *
 * なぜ書込量と別に要るか ──
 *   put 計器は「アプリが書けと言った量」を測る(25,688 KB / 編集)。
 *   しかし **IDB の書込自体はメインスレッド外**で走る。user が体感するのは
 *   `JSON.stringify` と structured clone の分だけかもしれない。
 *   **「書込量が多い」と「操作が引っかかる」は別の主張**であり、
 *   後者は long task を直接測らないと言えない。
 *
 * 測るもの:
 *   - PerformanceObserver('longtask') が拾う 50ms 超のタスク
 *   - 編集の commit から次の入力までの間に発生した block 時間の合計と最大
 *   - 対照 Y: **同じ操作を CANCEL_EDIT で抜ける**(= 保存が走らない)
 *     ⇒ A − Y が「保存に帰せられる block」
 *
 * ⚠ long task は 50ms 未満を拾わない。細かい引っかかりは
 *   `event timing` / `INP` が要る。ここでは「秒単位で固まるか」を見る。
 *
 * 使い方:
 *   node tests/bench/edit-main-thread-block.mjs
 *   EMB_FIXTURE=bench-fixtures/c-15000-rev.json node tests/bench/edit-main-thread-block.mjs
 */
import { createRequire } from 'node:module';
import { createReadStream, existsSync, statSync, readFileSync, rmSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import http from 'node:http';

const require = createRequire('/home/user/PKC2/package.json');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const FIXTURE = process.env.EMB_FIXTURE || 'bench-fixtures/c-5000-rev.json';
const EDITS = Number(process.env.EMB_EDITS || 5);
// A/B(P2): EMB_DIST=<dir> で対照ビルドの dist を配信、EMB_FLAG=1 で
// `?pkc-flag=storage.sqlite_backend=true` を付けて boot(dev 腕)。
const DIST_DIR = process.env.EMB_DIST || join(ROOT, 'dist');
const FLAGQ = process.env.EMB_FLAG === '1' ? '?pkc-flag=storage.sqlite_backend%3Dtrue' : '';
const CID = 'embbench';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function serveRepo() {
  const server = http.createServer((req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const f = p.startsWith('/dist/') ? join(DIST_DIR, p.slice(5)) : join(ROOT, p);
      if (!f.startsWith(ROOT + sep) && !f.startsWith(DIST_DIR + sep) && f !== ROOT) { res.writeHead(403); res.end(); return; }
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

/** long task を拾い続ける観測者 + boot 完了フック。 */
const INSTRUMENT = `
(() => {
  const tasks = [];
  window.__emb = { tasks };
  window.__embStart = () => { tasks.length = 0; };
  window.__embStop = () => tasks.slice();
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) tasks.push({ start: e.startTime, dur: e.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch { window.__embNoLongtask = true; }

  let pkc;
  Object.defineProperty(window, 'PKC', {
    configurable: true, get() { return pkc; },
    set(v) {
      pkc = v;
      if (v && typeof v === 'object' && !v.__embT) {
        Object.defineProperty(v, '__embT', { value: true });
        let ready = v.bootReady;
        const arm = (p) => { if (p && p.then) p.then(() => { window.__embBoot = performance.now(); }); };
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

/** 1 編集。`commit` が false なら CANCEL_EDIT で抜ける(= 保存が走らない対照)。 */
async function editOnce(page, lid, commit) {
  await page.locator(`${ROW_SEL}[data-pkc-lid="${lid}"]`).first().click();
  await page.waitForTimeout(120);
  await page.locator('[data-pkc-action="begin-edit"]').first().click();
  await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'editing'`, null, { timeout: 20000 });
  await page.locator('[data-pkc-field="body"]').first().click();
  await page.keyboard.type('x');
  const action = commit ? 'commit-edit' : 'cancel-edit';
  await page.locator(`[data-pkc-action="${action}"]`).first().click();
  await page.waitForFunction(`document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'ready'`, null, { timeout: 20000 });
  // 保存 debounce(300ms)を十分に越えて待つ ── block はこの窓に出る
  await page.waitForTimeout(1500);
}

const ARMS = [
  { key: 'Y', label: '対照(同操作・保存なし)', commit: false },
  { key: 'A', label: '既定(保存あり)', commit: true },
];

const srv = await serveRepo();
const LIDS = textLidsOf(FIXTURE);
const fx = JSON.parse(readFileSync(join(ROOT, FIXTURE), 'utf8'));
const raw = readFileSync(join(ROOT, FIXTURE), 'utf8');
console.log(`fixture: ${FIXTURE} — N=${fx.entries.length} / M=${fx.revisions.length} / ${(statSync(join(ROOT, FIXTURE)).size / 1048576).toFixed(1)} MB`);
console.log(`測るもの: 1 編集で **メインスレッドが止まる時間**(long task = 50ms 超)`);
console.log(`対照 Y は同じ操作を CANCEL_EDIT で抜ける ── A − Y が保存に帰せられる分\n`);

const out = [];
for (const arm of ARMS) {
  const prof = `/tmp/pw-emb-${arm.key}`;
  rmSync(prof, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(prof, {
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    viewport: { width: 1280, height: 900 },
  });
  await ctx.addInitScript(INSTRUMENT);
  const page = await ctx.newPage();
  await page.goto(`${srv.origin}/dist/pkc2.html`);
  await page.waitForFunction('typeof window.__embBoot === "number"', null, { timeout: 180000 });
  await page.waitForTimeout(1000);
  await page.evaluate(async ({ raw, cid }) => {
    const c = JSON.parse(raw); c.meta.container_id = cid;
    const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    await new Promise((res, rej) => { const t = db.transaction('containers', 'readwrite'); const s = t.objectStore('containers'); s.clear(); s.put(c, cid); s.put(cid, '__default__'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    db.close();
  }, { raw, cid: CID });

  await page.goto(`${srv.origin}/dist/pkc2.html${FLAGQ}`);
  await page.waitForFunction('typeof window.__embBoot === "number"', null, { timeout: 300000 });
  await page.waitForFunction(`document.querySelectorAll('${ROW_SEL}').length > 50`, null, { timeout: 120000 });
  if (FLAGQ) {
    const si = await page.evaluate('window.__pkc2StorageInfo').catch(() => null);
    console.log(`   storage: ${JSON.stringify(si)}`);
    if (!si || si.sqlite !== true) { console.log('⛔ sqlite backend が成立していない ── この走行は無効'); await ctx.close(); await srv.close(); process.exit(1); }
  }
  if (await page.evaluate('window.__embNoLongtask === true')) {
    console.log('⛔ longtask observer が使えない環境 — この計測は成立しない');
    await ctx.close(); await srv.close(); process.exit(1);
  }

  // 1 回目は形式の収束などが混ざるので捨てる
  await editOnce(page, LIDS[0], arm.commit);
  await page.evaluate('window.__embStart()');
  for (let i = 0; i < EDITS; i++) await editOnce(page, LIDS[(i + 1) % LIDS.length], arm.commit);
  const tasks = await page.evaluate('window.__embStop()');
  await ctx.close();

  const total = tasks.reduce((a, t) => a + t.dur, 0);
  const max = tasks.reduce((a, t) => Math.max(a, t.dur), 0);
  out.push({ arm, tasks, total, max });
  console.log(`■ ${arm.key} ${arm.label}`);
  console.log(`   long task ${tasks.length} 件 / 合計 ${total.toFixed(0)} ms / 最大 ${max.toFixed(0)} ms`);
  console.log(`   1 編集あたり: 合計 ${(total / EDITS).toFixed(0)} ms`);
  if (tasks.length) {
    const top = [...tasks].sort((a, b) => b.dur - a.dur).slice(0, 5);
    console.log(`   長い順: ${top.map((t) => `${t.dur.toFixed(0)}ms`).join(' / ')}`);
  }
  console.log('');
}

await srv.close();

const Y = out.find((o) => o.arm.key === 'Y');
const A = out.find((o) => o.arm.key === 'A');
console.log('─'.repeat(70));
console.log(`保存に帰せられるメインスレッド停止(A − Y、1 編集あたり):`);
console.log(`  **${((A.total - Y.total) / EDITS).toFixed(0)} ms**`);
console.log('');
console.log('読み方:');
console.log('  数十 ms なら「書込量は多いが体感には出ていない」= 形式変更の優先度は低い');
console.log('  数百 ms 以上なら「編集のたびに固まる」= 形式変更に踏み込む根拠になる');
console.log('');
console.log('⚠ long task は 50ms 未満を拾わない。細かい引っかかりは別途 INP が要る。');

// ── 無効判定 ────────────────────────────────────────
if (A.total === 0 && Y.total === 0) {
  console.log('\n⚠ 両腕とも long task ゼロ — 操作が届いていない可能性がある');
  console.log('⛔ この実行の数字を結論に使ってはならない');
  process.exitCode = 1;
}
