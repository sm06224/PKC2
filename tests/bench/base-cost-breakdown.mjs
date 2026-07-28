/* eslint-disable */
/**
 * ⚠ **この harness は VmRSS しか読まない**(2026-07-28 追記)。
 *
 * VmRSS 合計は chromium の共有ページを**プロセス数ぶん二重計上**する。
 * ここの数字を「基盤コスト」「削減量」として引用すると必ず過大になる ──
 * 実際、この harness の出力から「計器固定費 ~0.5GB」と書いてしまい、
 * user の PWA 実測(200MB 未満)と食い違った(2026-07-28)。
 *
 * **基盤コストや削減量を語るときは `tests/bench/pwa-base-cost.mjs`(PSS/USS)を
 * 使うこと。** こちらはプロセス構成(何のプロセスが何個居るか)を見る用途に限る。
 */
/**
 * L4 の前提計測 ── 「基盤 0.8GB」をプロセス種別に分解する。
 *
 * user 指摘(2026-07-27):「私はその基盤部分が一番でかいと言ってる」。
 * 実際、空アプリの総 RSS 0.89GB に対し renderer の**アプリ計上は 70MB**
 * (renderer-memory-breakdown.mjs)。差は chromium のプロセス群である。
 *
 * 単一 exe(webview 埋め込み)にしたとき何が消えるかは、
 * **「その内訳のうち、どのプロセスが webview では存在しないか」**で決まる。
 * ここを推測で語らないための計器。
 *
 * 出力: browser / renderer / gpu / utility(storage 等)/ zygote / その他の RSS。
 *
 * ⚠ この harness は headless chromium を測る。実機のブラウザ(GUI + 拡張 +
 *   他タブ + spare renderer)はこれより**大きい**。つまりここで出る数字は
 *   「ブラウザ側の下限」であり、exe 版との差は実機ではさらに開く。
 */
import { createRequire } from 'node:module';
const require2 = createRequire('/home/user/PKC2/package.json');
const { chromium } = require2('playwright');
import http from 'node:http';
import { createReadStream, existsSync, statSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';

const ROOT = process.cwd();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const srv = await new Promise((r) => {
  const server = http.createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const f = join(ROOT, p);
    if (!f.startsWith(ROOT + sep) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream' });
    createReadStream(f).pipe(res);
  });
  server.listen(45719, '127.0.0.1', () => r({ origin: 'http://127.0.0.1:45719', close: () => new Promise((x) => server.close(x)) }));
});

/** プロセス種別ごとに RSS を合算(KB)。cmdline の --type= で分類。 */
function treeByType(rootPid) {
  const kids = new Map();
  const info = new Map();
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = readFileSync(`/proc/${d}/stat`, 'utf8');
      const m = stat.match(/^\d+ \(.*\) \S (\d+)/s);
      if (!m) continue;
      const ppid = Number(m[1]);
      const status = readFileSync(`/proc/${d}/status`, 'utf8');
      const rss = Number((status.match(/VmRSS:\s+(\d+) kB/) || [])[1] || 0);
      const cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8');
      let type = 'browser(親)';
      const t = /--type=([a-z-]+)/.exec(cmd);
      if (t) {
        const kind = t[1];
        if (kind === 'renderer') type = 'renderer';
        else if (kind === 'gpu-process') type = 'gpu';
        else if (kind === 'utility') {
          const u = /--utility-sub-type=([^\s-]+)/.exec(cmd);
          type = `utility(${u ? u[1].split('.').pop() : '?'})`;
        } else if (kind === 'zygote') type = 'zygote';
        else type = kind;
      }
      if (!kids.has(ppid)) kids.set(ppid, []);
      kids.get(ppid).push(Number(d));
      info.set(Number(d), { rssKb: rss, type, cmd: cmd.slice(0, 120) });
    } catch { /* races */ }
  }
  const out = new Map();
  let total = 0;
  const walk = (pid) => {
    const i = info.get(pid);
    if (i) {
      total += i.rssKb;
      const cur = out.get(i.type) ?? { kb: 0, n: 0 };
      out.set(i.type, { kb: cur.kb + i.rssKb, n: cur.n + 1 });
    }
    for (const k of kids.get(pid) || []) walk(k);
  };
  walk(rootPid);
  return { total, byType: out };
}

const prof = '/tmp/pw-basecost';
rmSync(prof, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(prof, {
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  viewport: { width: 1400, height: 950 },
});
let rootPid = null;
for (const d of readdirSync('/proc')) {
  if (!/^\d+$/.test(d)) continue;
  try {
    const stat = readFileSync(`/proc/${d}/stat`, 'utf8');
    const ppid = Number(stat.match(/^\d+ \(.*\) \S (\d+)/s)[1]);
    const cmd = readFileSync(`/proc/${d}/cmdline`, 'utf8');
    if (ppid === process.pid && cmd.includes('chrome')) { rootPid = Number(d); break; }
  } catch { /* noop */ }
}
if (!rootPid) { console.log('⛔ chrome root pid が見つからない'); process.exit(1); }

console.log('■ 基盤コストの分解(空アプリ / headless chromium / プロセス種別)');
const blank = treeByType(rootPid);
console.log(`\n【A】about:blank のみ(= ブラウザ基盤そのもの)`);
console.log(`   総RSS ${(blank.total / 1048576).toFixed(2)} GB`);
for (const [k, v] of [...blank.byType.entries()].sort((a, b) => b[1].kb - a[1].kb)) {
  console.log(`     ${k.padEnd(22)} ${(v.kb / 1024).toFixed(0).padStart(6)} MB  (${v.n} プロセス)`);
}

const page = await ctx.newPage();
await page.goto(`${srv.origin}/dist/pkc2.html`);
await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 180000 });
await new Promise((r) => setTimeout(r, 30000));
const loaded = treeByType(rootPid);
console.log(`\n【B】PKC2(空コンテナ)を開いた後`);
console.log(`   総RSS ${(loaded.total / 1048576).toFixed(2)} GB`);
for (const [k, v] of [...loaded.byType.entries()].sort((a, b) => b[1].kb - a[1].kb)) {
  const before = blank.byType.get(k)?.kb ?? 0;
  const d = v.kb - before;
  console.log(`     ${k.padEnd(22)} ${(v.kb / 1024).toFixed(0).padStart(6)} MB  (${v.n} プロセス)  ${d >= 0 ? '+' : ''}${(d / 1024).toFixed(0)} MB`);
}
console.log(`\n【C】読み方`);
console.log(`   A = アプリを開く前から在るコスト = **ブラウザ基盤**`);
console.log(`   B − A = PKC2 が足したぶん`);
console.log(`   単一 exe(webview 埋め込み)で消えうるのは A の中の`);
console.log(`   「タブ基盤 / 拡張 / 予備 renderer / ブラウザ UI」に属するプロセスであり、`);
console.log(`   renderer 本体 + GPU + network は webview でも必要 ── 分解して初めて言える`);
console.log(`\n⚠ headless chromium での計測。実機の GUI ブラウザ(拡張・他タブ・spare renderer 込み)は`);
console.log(`   これより大きい。したがって A は「ブラウザ側の下限」である。`);

await ctx.close();
await srv.close();
