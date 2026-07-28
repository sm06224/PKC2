/* eslint-disable */
/**
 * PWA 相当構成の**基盤コスト**を PSS / USS で測り直す(2026-07-28)。
 *
 * ## なぜ書き直したか(自分の誤りの訂正)
 *
 * `storage-wasm-sqlite-design-2026-07.md:327` に
 * 「計器固定費(browser/GPU/zygote **~0.5GB**)」と書いていたが、これは
 * **VmRSS の単純合計**である。chromium は 6+ プロセスでバイナリと共有
 * ライブラリを共有しているので、VmRSS 合計は同じ物理ページを**何度も数える**。
 *
 * しかも私は別の doc(CLAUDE.md / L4 設計 doc)に
 * 「**VmRSS 合計から倍率・削減量を書かない**」と自分で書いていた。
 * 規律を書いておきながら、別の doc で破っていた ── user 指摘 2026-07-28
 * 「PWA 化されたベース、本来のブラウザと安全機構の取り分は 200MB に届きません
 *  (M365 Copilot PWA の実測)。あなたの 500MB という数字はどこから?」。
 *
 * ## この harness が出すもの
 *
 * - **PSS**(Proportional Set Size): 共有ページをプロセス数で按分。
 *   「このアプリ 1 つを増やしたときにシステムが余分に払う量」に一番近い
 * - **USS**(Private_Clean + Private_Dirty): そのプロセス固有のページだけ。
 *   「このプロセスを殺したら確実に返る量」の下限
 * - VmRSS 合計も**参考として**併記するが、**判断には使わない**
 *
 * ## 構成(user の計測条件に寄せる)
 *
 * - `--app=<url>` の **PWA/app ウィンドウ**(タブ UI なし)
 * - 新規プロファイル・拡張なし
 * - Xvfb 上の **headed**(headless は合成器やフォント周りの常駐が違う)
 *
 * 使い方:
 *   xvfb-run -a node tests/bench/pwa-base-cost.mjs
 *   xvfb-run -a node tests/bench/pwa-base-cost.mjs --settle=30
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const ROOT = process.cwd();
const argOf = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const SETTLE_S = Number(argOf('settle', '20'));
/** IDB へ流し込む fixture(省略時は空アプリ)。「載せた状態」の app 取り分を見る。 */
const FIXTURE = argOf('fixture', '');
/** URL flag(例 `sidebar.virtual_list%3Dtrue`)。対照群を flag だけで作る。 */
const URL_FLAGS = argOf('url-flags', '');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const f = join(ROOT, p === '/' ? '/dist/pkc2.html' : p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(45811, '127.0.0.1', r));

/** プロセスツリーを辿って PSS / USS / RSS をプロセス種別ごとに集計する。 */
function measureTree(rootPid) {
  const kids = new Map();
  const rows = [];
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    const pid = Number(d);
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      if (!kids.has(ppid)) kids.set(ppid, []);
      kids.get(ppid).push(pid);
    } catch { /* 消えた */ }
  }
  const walk = (pid) => {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
      const roll = readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8');
      const num = (k) => Number((roll.match(new RegExp(`^${k}:\\s+(\\d+) kB`, 'm')) || [])[1] || 0);
      const type = (/--type=([a-zA-Z-]+)/.exec(cmd) || [])[1] ?? 'browser';
      rows.push({
        pid, type,
        rss: num('Rss'),
        pss: num('Pss'),
        uss: num('Private_Clean') + num('Private_Dirty'),
      });
    } catch { /* 権限 or 消えた */ }
    for (const c of kids.get(pid) ?? []) walk(c);
  };
  walk(rootPid);
  return rows;
}

const MB = (kb) => (kb / 1024).toFixed(1);

function report(label, rows) {
  const byType = new Map();
  for (const r of rows) {
    const cur = byType.get(r.type) ?? { n: 0, rss: 0, pss: 0, uss: 0 };
    cur.n++; cur.rss += r.rss; cur.pss += r.pss; cur.uss += r.uss;
    byType.set(r.type, cur);
  }
  const tot = rows.reduce((a, r) => ({ rss: a.rss + r.rss, pss: a.pss + r.pss, uss: a.uss + r.uss }), { rss: 0, pss: 0, uss: 0 });
  console.log(`\n■ ${label}  (${rows.length} プロセス)`);
  console.log('   種別              数    PSS       USS       RSS(参考)');
  for (const [type, v] of [...byType.entries()].sort((a, b) => b[1].pss - a[1].pss)) {
    console.log(`   ${type.padEnd(16)} ${String(v.n).padStart(2)}  ${MB(v.pss).padStart(7)}MB ${MB(v.uss).padStart(7)}MB ${MB(v.rss).padStart(8)}MB`);
  }
  console.log(`   ${'合計'.padEnd(15)} ${String(rows.length).padStart(2)}  ${MB(tot.pss).padStart(7)}MB ${MB(tot.uss).padStart(7)}MB ${MB(tot.rss).padStart(8)}MB`);
  return tot;
}

async function run(label, url, isApp = false) {
  const prof = `/tmp/pw-pwabase-${label}`;
  rmSync(prof, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(prof, {
    executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    headless: false,                       // PWA は headed。合成器の常駐が違う
    args: [
      '--no-sandbox',
      `--app=${url}`,                      // PWA/app ウィンドウ(タブ UI 無し)
      '--disable-extensions',
      '--no-first-run',
    ],
    viewport: null,
  });
  // app ウィンドウは既にページを持っている
  const page = ctx.pages()[0] ?? await ctx.newPage();
  if (isApp) {
    await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 180000 }).catch(() => {});
    if (FIXTURE) {
      // fixture を IDB へ入れて **2 回目起動**を測る(初回は索引構築の残渣が乗る)。
      const raw = readFileSync(FIXTURE, 'utf8');
      await page.evaluate(async (r) => {
        const c = JSON.parse(r); c.meta.container_id = 'pwabase';
        const db = await new Promise((res, rej) => { const rq = indexedDB.open('pkc2'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
        await new Promise((res, rej) => { const t = db.transaction('containers', 'readwrite'); const s2 = t.objectStore('containers'); s2.clear(); s2.put(c, 'pwabase'); s2.put('pwabase', '__default__'); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
        db.close();
      }, raw);
      await page.goto(url);
      await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 }).catch(() => {});
      await page.goto(url);
      await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 300000 }).catch(() => {});
    }
  }
  await page.waitForTimeout(SETTLE_S * 1000);

  const browserPid = ctx.browser()?.process?.()?.pid
    ?? Number(readFileSync('/proc/self/stat', 'utf8').split(' ')[0]);
  // launchPersistentContext は browser() が null のことがあるので、
  // chrome プロセスを cmdline から探す。
  let rootPid = null;
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8').replace(/\0/g, ' ');
      if (cmd.includes('chrome-linux/chrome') && cmd.includes(prof) && !cmd.includes('--type=')) {
        rootPid = Number(d); break;
      }
    } catch { /* skip */ }
  }
  if (!rootPid) { console.log('⛔ chrome の root pid が見つからない'); await ctx.close(); return null; }

  const rows = measureTree(rootPid);
  const tot = report(label, rows);
  await ctx.close();
  return tot;
}

console.log('■ PWA 相当(--app / headed / 拡張なし / 新規プロファイル)の基盤コスト');
console.log(`   settle ${SETTLE_S}s / 指標: PSS(按分)・USS(固有)・RSS は参考のみ`);

const base = await run('about-blank', 'about:blank');
const appUrl = `http://127.0.0.1:45811/${URL_FLAGS ? `?pkc-flag=${URL_FLAGS}` : ''}`;
const app = await run(
  `pkc2(${FIXTURE ? FIXTURE.split('/').pop() : '空'}${URL_FLAGS ? ` / ${decodeURIComponent(URL_FLAGS)}` : ''})`,
  appUrl, true,
);

if (base && app) {
  console.log('\n■ 差分(PKC2 を開いたことで増える分)');
  console.log(`   PSS  ${MB(base.pss)}MB → ${MB(app.pss)}MB  (+${MB(app.pss - base.pss)}MB)`);
  console.log(`   USS  ${MB(base.uss)}MB → ${MB(app.uss)}MB  (+${MB(app.uss - base.uss)}MB)`);
  console.log(`   RSS  ${MB(base.rss)}MB → ${MB(app.rss)}MB  (+${MB(app.rss - base.rss)}MB) ← 参考。共有ページを二重計上する`);
}
console.log('\n⚠ RSS 合計で「基盤 0.5GB」と書いていたのは誤り(2026-07-28 訂正)。');
console.log('  同じ物理ページを 6 プロセスぶん数えた値であり、実際の占有ではない。');
server.close();
